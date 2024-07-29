//---------------- Libraries --------------------------//

const express = require("express");
const { createServer } = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const ws = require('ws');
const assert = require('assert');

//---------------- Local Libraries --------------------------//

const db = require("./db.js");

//---------------- App Config --------------------------//

const app = express();

app.use(cors())
app.use(cookieParser());
app.use(express.json());

const server = createServer(app);

const wss = new ws.Server({ server });

//---------------- Database --------------------------//

db.init();

//---------------- User & Cookie --------------------------//

async function getUserUuid(req, res) {  
  let userUuid = req.cookies.userUuid;

  if (!(await db.checkUser(userUuid))) {
    userUuid = await db.createUser();

    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 1);

    //res.cookie('userUuid', userUuid, { httpOnly: true, expires: expirationDate, domain: '.nassing.tk', sameSite: 'None', secure: 'true', partitionKey: '' });
    res.cookie('userUuid', userUuid, { expires: expirationDate });
  }

  return userUuid;
}

//---------------- Logic --------------------------//

async function checkVoteValid(userUuid, answerUuid) {
  const poll = await db.getPollByAnswerUuid(answerUuid);

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

app.post('/api/poll', async function(req, res) {
  const userUuid = await getUserUuid(req, res);
  const poll = req.body;
  const pollUuid = await db.createPoll(poll, userUuid);

  res.send({pollUuid: pollUuid});
});

app.get('/api/poll/:pollUuid', async function(req, res) {
  const pollUuid = req.params.pollUuid.toUpperCase();
  const poll = await db.getPoll(pollUuid);

  res.send(poll);
});

app.get('/api/my-polls', async function(req, res) {
  const userUuid = await getUserUuid(req, res);

  const polls = await db.getUserPolls(userUuid);

  res.send(polls);
});


//---------------- websockets --------------------------//

const unsentVotesQueue = [];

const unsavedVotesQueue = [];

// 1. Receive votes (handled by http)
app.post('/api/vote', async function(req, res) {
  const userUuid = await getUserUuid(req, res);

  const answerUuid = req.body.answers;

  if (!await checkVoteValid(userUuid, answerUuid)) {
    res.send();
    console.log('invalid vote');

    return;
  }
  console.log('valid vote');

  unsentVotesQueue.push({answerUuid: answerUuid, userUuid: userUuid});

  res.send();
});

// 2. Send votes (by batches, every second)
function broadcastVotes(votes) {
  console.log('votes', votes);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(votes);
  }});
}

setInterval(async function() {
  if (unsentVotesQueue.length > 0) {
    const votes = unsentVotesQueue.splice(0, 10);

    unsavedVotesQueue.push(...votes);

    broadcastVotes(JSON.stringify(votes));
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


server.listen(6678);