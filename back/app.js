//---------------- Libraries --------------------------//

const express = require("express");
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const ws = require('ws');
const assert = require('assert');
const uuid = require('uuid');

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

//---------------- Logic --------------------------//

async function checkVoteValid(userUuid, answerUuid) {
  const poll = await db.getPollByAnswerUuid(answerUuid);

  if (!poll) {
    return null;
  }

  console.log('poll', poll);

  if (poll.multiple_vote) {
    return true;
  }

  const userAnswers = await db.getUserAnswersByUserAndPoll(userUuid, poll.uuid);

  console.log('userAnswers', userAnswers);

  if (userAnswers.length === 0) {
    return true;
  }

  if (poll.multiple_choice) {
    return !(answerUuid in userAnswers.map(a => a.answer_uuid));
  }

  if (poll.change_vote) {
    // Remove previous vote
    assert(userAnswers.length === 1);

    await db.removeVote(userAnswers[0].uuid);

    return true;
  }

  return false;
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

  res.send(poll);
}));

app.get('/api/my-polls', asyncHandler(async function(req, res) {
  const userUuid = await getUserUuid(req, res);

  const polls = await db.getUserPolls(userUuid);

  res.send(polls);
}));


//---------------- websockets --------------------------//

const unsentVotesQueue = [];

const unsavedVotesQueue = [];

// 1. Receive votes (handled by http)
app.post('/api/vote', asyncHandler(async function(req, res) {
  const answerUuid = req.body?.answers;

  if (typeof answerUuid !== 'string') {
    res.status(400).send({ error: 'Missing answer' });
    return;
  }

  const userUuid = await getUserUuid(req, res);
  const valid = await checkVoteValid(userUuid, answerUuid);

  if (valid === null) {
    res.status(404).send({ error: 'Answer not found' });
    return;
  }

  if (!valid) {
    res.send();
    console.log('invalid vote');

    return;
  }
  console.log('valid vote');

  // The vote gets its final uuid now, so that viewers and database agree on it
  unsentVotesQueue.push({uuid: uuid.v4().toUpperCase(), answerUuid: answerUuid, userUuid: userUuid});

  res.send();
}));

// 2. Send votes (by batches, every second)
// Only vote and answer uuids are sent: never the user uuid, which is the session cookie.
function broadcastVotes(votes) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(votes);
  }});
}

setInterval(async function() {
  if (unsentVotesQueue.length > 0) {
    const votes = unsentVotesQueue.splice(0, 10);

    unsavedVotesQueue.push(...votes);

    broadcastVotes(JSON.stringify(votes.map(vote => ({ uuid: vote.uuid, answerUuid: vote.answerUuid }))));
  }
}, 300);


// 3. Save votes in database (by batches, every 1.5 seconds)
setInterval(async function() {
  if (unsavedVotesQueue.length > 0) {
    const votes = unsavedVotesQueue.splice(0, 30);

    await db.vote(votes);
  }
}, 500);


//---------------- Close ws (don't touch) --------------------------//

//Kick inactive users
class heartbeat {
  constructor() {
    clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {
      this.terminate();
    }, 30000 + 1000);
  }
}

wss.on('connection', function connection(ws) {
  console.log('connected');
});

wss.on('error', console.error);
wss.on('open', heartbeat);
wss.on('ping', heartbeat);
wss.on('close', function clear() {
  clearTimeout(this.pingTimeout);
})


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
