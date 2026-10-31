//---------------- Libraries --------------------------//

const express = require("express");
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const ws = require('ws');

//---------------- Local Libraries --------------------------//

const db = require("./db.js");

//---------------- App Config --------------------------//

const PORT = process.env.PORT || 6678;
const FRONT_DIST = process.env.FRONT_DIST || path.join(__dirname, '../front/dist');

const MAX_QUESTION_LENGTH = 200;
const MAX_ANSWER_LENGTH = 100;
const MAX_ANSWERS = 20;

const app = express();

app.use(cors())
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));

const server = createServer(app);

const wss = new ws.Server({ server });

// Express 4 does not catch errors thrown by async handlers: without this an exception
// becomes an unhandled rejection, which kills the whole Node process.
function asyncHandler(handler) {
  return function(req, res, next) {
    handler(req, res, next).catch(next);
  };
}

//---------------- Database --------------------------//

const dbReady = db.init();

//---------------- User & Cookie --------------------------//

const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

// Returns the user of the request, creating one if needed
async function getUserUuid(req, res) {  
  let userUuid = req.cookies.userUuid;

  if (!(await db.checkUser(userUuid))) {
    userUuid = await db.createUser();
  }

  // Refreshed on every write so that active users never lose their polls
  res.cookie('userUuid', userUuid, { maxAge: COOKIE_MAX_AGE, httpOnly: true, sameSite: 'lax' });

  return userUuid;
}

// Read-only variant: does not create a user for anonymous visitors
function getExistingUserUuid(req) {
  return req.cookies.userUuid ?? null;
}

//---------------- Validation --------------------------//

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

// Returns the normalized poll, or null if the body is invalid
function parsePoll(body) {
  if (!body || !isNonEmptyString(body.question, MAX_QUESTION_LENGTH)) {
    return null;
  }

  if (!Array.isArray(body.answers) || body.answers.length < 2 || body.answers.length > MAX_ANSWERS) {
    return null;
  }

  if (!body.answers.every(answer => isNonEmptyString(answer, MAX_ANSWER_LENGTH))) {
    return null;
  }

  return {
    question: body.question.trim(),
    answers: body.answers.map(answer => answer.trim()),
    multipleChoice: !!body.multipleChoice,
    multipleVote: !!body.multipleVote,
    changeVote: !!body.changeVote,
  };
}

//---------------- Routes --------------------------//

app.use('/api', asyncHandler(async function(req, res, next) {
  await dbReady;
  next();
}));

app.post('/api/poll', asyncHandler(async function(req, res) {
  const poll = parsePoll(req.body);

  if (!poll) {
    res.status(400).send({ error: `A poll needs a question and between 2 and ${MAX_ANSWERS} non-empty answers` });
    return;
  }

  const userUuid = await getUserUuid(req, res);
  const pollUuid = await db.createPoll(poll, userUuid);

  res.send({pollUuid: pollUuid});
}));

app.get('/api/poll/:pollUuid', asyncHandler(async function(req, res) {
  const pollUuid = req.params.pollUuid.toUpperCase();
  const poll = await db.getPoll(pollUuid);

  if (!poll) {
    res.status(404).send({ error: 'Poll not found' });
    return;
  }

  poll.myAnswers = await db.getUserAnswerUuidsByPoll(getExistingUserUuid(req), pollUuid);

  res.send(poll);
}));

app.get('/api/my-polls', asyncHandler(async function(req, res) {
  const polls = await db.getUserPolls(getExistingUserUuid(req));

  res.send(polls);
}));


//---------------- websockets --------------------------//

// pollUuid -> { votes: [{uuid, answerUuid}], removed: [voteUuid] }
const pendingBroadcasts = new Map();

function queueBroadcast(pollUuid, added, removed) {
  if (!pendingBroadcasts.has(pollUuid)) {
    pendingBroadcasts.set(pollUuid, { votes: [], removed: [] });
  }

  const pending = pendingBroadcasts.get(pollUuid);
  pending.votes.push(...added);
  pending.removed.push(...removed);
}

// 1. Receive votes (handled by http), checked and saved right away
app.post('/api/vote', asyncHandler(async function(req, res) {
  const answerUuid = req.body?.answers;

  if (typeof answerUuid !== 'string') {
    res.status(400).send({ error: 'Missing answer' });
    return;
  }

  const userUuid = await getUserUuid(req, res);
  const result = await db.castVote(userUuid, answerUuid);

  if (!result) {
    res.status(404).send({ error: 'Answer not found' });
    return;
  }

  if (!result.accepted) {
    res.status(409).send({ error: 'Vote not allowed by the poll rules', myAnswers: result.myAnswers });
    return;
  }

  queueBroadcast(result.pollUuid, result.added, result.removed);

  res.send({ myAnswers: result.myAnswers });
}));

// 2. Send votes to the viewers of each poll (by batches, every 300ms)
// Only vote and answer uuids are sent: never the user uuid, which is the session cookie.
setInterval(function() {
  if (pendingBroadcasts.size === 0) {
    return;
  }

  const batches = new Map(pendingBroadcasts);
  pendingBroadcasts.clear();

  wss.clients.forEach(client => {
    const batch = batches.get(client.pollUuid);

    if (batch && client.readyState === ws.OPEN) {
      client.send(JSON.stringify(batch));
    }
  });
}, 300);


//---------------- Connection & heartbeat --------------------------//

// Clients subscribe to one poll: ws(s)://host/api?poll=XXXXXX
wss.on('connection', function connection(socket, req) {
  const params = new URL(req.url, 'http://localhost').searchParams;

  socket.pollUuid = (params.get('poll') ?? '').toUpperCase();
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('error', console.error);
});

// Kick connections that did not answer the previous ping
const heartbeat = setInterval(function() {
  wss.clients.forEach(socket => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }

    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

wss.on('error', console.error);
wss.on('close', function() {
  clearInterval(heartbeat);
});


//---------------- Front (production build) --------------------------//

// Serves `npm run build` output when present, so the Vite dev server never has to be exposed
if (fs.existsSync(FRONT_DIST)) {
  app.use(express.static(FRONT_DIST));

  app.get(/^(?!\/api\/).*/, function(req, res) {
    res.sendFile(path.join(FRONT_DIST, 'index.html'));
  });
}

//---------------- Errors --------------------------//

app.use(function(err, req, res, next) {
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error(err);
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status).send({ error: err.expose ? err.message : 'Internal error' });
});


server.listen(PORT);
