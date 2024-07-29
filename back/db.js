const uuid = require('uuid');

const db = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: "./db"
  }
});

async function init() {
  const usersTableExist = await db.schema.hasTable('users');
  if (!usersTableExist) {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('uuid').notNullable().unique();
    })
  }
  
  const pollTableExist = await db.schema.hasTable('polls');
  if (!pollTableExist) {
    await db.schema.createTable('polls', (table) => {
      table.increments('id').primary();
      table.string('uuid').notNullable().unique();
      table.string('user_id').notNullable().references('id').inTable('users');
      table.string('question_text').notNullable();
      table.integer('multiple_choice').notNullable();
      table.integer('multiple_vote').notNullable();
      table.integer('change_vote').notNullable();
    })
  }
    
  const answerTableExist = await db.schema.hasTable('answers');
  if (!answerTableExist) {
    await db.schema.createTable('answers', (table) => {
      table.increments('id').primary();
      table.string('uuid').notNullable().unique();
      table.string('answer_text').notNullable();
      table.integer('poll_id').notNullable().references('id').inTable('polls');
    })
  }
    
  const usersAnswersTableExist = await db.schema.hasTable('users_answers');
  if (!usersAnswersTableExist) {
    await db.schema.createTable('users_answers', (table) => {
      table.increments('id').primary();
      table.string('uuid').notNullable().unique();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.integer('answer_id').notNullable().references('id').inTable('answers');
      table.integer('poll_id').notNullable().references('id').inTable('polls');
    })
  }
}

async function createUser() {
  const userUuid = uuid.v4().toUpperCase();

  await db('users').insert({ uuid: userUuid });

  return userUuid;
}

async function checkUser(userUuid) {
  if (!userUuid) {
    return false;
  }

  const user = await db('users').where({ uuid: userUuid }).select('id').first();

  return !!user;
}

async function createPoll(poll, userUuid) {
  const userId = (await db('users').where({ uuid: userUuid }).select('id').first()).id;

  const pollUuid = uuid.v4().slice(0, 6).toUpperCase();
  await db('polls').insert({ uuid: pollUuid, user_id: userId, question_text: poll.question, multiple_choice: poll.multipleChoice, multiple_vote: poll.multipleVote, change_vote: poll.changeVote });
  
  const pollId = (await db('polls').where({ uuid: pollUuid }).select('id').first()).id;
  const answers = poll.answers.map(answer => { return { uuid: uuid.v4().toUpperCase(), answer_text: answer, poll_id: pollId } });
  
  await db('answers').insert(answers);

  return pollUuid;
}

async function getPoll(pollUuid) {
  let poll = await db('polls').where({ uuid: pollUuid }).select('id', 'question_text', 'multiple_choice', 'multiple_vote', 'change_vote').first();
  const answers = (await db('answers').where({ poll_id: poll.id }).select('id', 'uuid', 'answer_text'));
  
  const answers_ids = answers.map(answer => answer.id);

  const votes_uuids = await db('users_answers').whereIn('answer_id', answers_ids).select('answer_id', 'uuid');
    
  poll.votes = [];

  answers.forEach(answer => {
    const answer_votes = votes_uuids.filter(vote => vote.answer_id === answer.id);

    answer_votes.forEach((vote) => {
      poll.votes.push({uuid: vote.uuid, answerUuid: answer.uuid});
    });

    delete answer.id;
  });
  
  poll.answers = answers;
  poll.uuid = pollUuid;
  delete poll.id;

  return poll;
}

async function getPollByAnswerUuid(answerUuid) {
  const pollId = (await db('answers').where({ uuid: answerUuid }).select('poll_id').first()).poll_id;
  const poll = await db('polls').where({ id: pollId }).select('id', 'uuid', 'question_text', 'multiple_choice', 'multiple_vote', 'change_vote').first();

  return poll;
}

async function getUserAnswersByUserAndPoll(userUuid, pollUuid) {
  const userId = (await db('users').where({ uuid: userUuid }).select('id').first()).id;
  const pollId = (await db('polls').where({ uuid: pollUuid }).select('id').first()).id;

  const user_answers = (await db('users_answers').where({ user_id: userId, poll_id: pollId }).select('uuid', 'answer_id'));

  const answers_ids = user_answers.map(answer => answer.answer_id);
  const answers = await db('answers').whereIn('id', answers_ids).select('id', 'uuid');

  user_answers.forEach(user_answer => {
    user_answer.answer_uuid = answers.find(answer => answer.id === user_answer.answer_id).uuid;
    delete user_answer.answer_id;
  });

  return user_answers;
}

async function getUserPolls(userUuid) {
  const userId = (await db('users').where({ uuid: userUuid }).select('id').first()).id;
  const polls = await db('polls').where({ user_id: userId }).select('uuid', 'question_text');

  return polls;
}

async function removeVote(voteUuid) {
  console.log('removing vote', voteUuid);
  console.log('answer id', await db('users_answers').where({ uuid: voteUuid }).select('answer_id').first());
  await db('users_answers').delete().where({ uuid: voteUuid });
}

async function vote(votes) {
  // {answerUuid: answerUuid, userUuid: userUuid}

  const answers = await db('answers').whereIn('uuid', votes.map(vote => vote.answerUuid)).select('uuid', 'id', 'poll_id');
  const users = await db('users').whereIn('uuid', votes.map(vote => vote.userUuid)).select('uuid', 'id');

  votes.forEach(vote => {
    const answer = answers?.find(answer => answer.uuid === vote.answerUuid) ?? null;
    
    vote.answer_id = answer?.id ?? null;
    vote.poll_id = answer?.poll_id ?? null;
    vote.user_id = users?.find(user => user.uuid === vote.userUuid)?.id ?? null;
    vote.uuid = uuid.v4().toUpperCase();

    if(!vote.answer_id || !vote.poll_id || !vote.user_id) {
      vote.toBeRemoved = true;
    }

    delete vote.answerUuid;
    delete vote.userUuid;
  });

  votes = votes.filter(vote => !vote.toBeRemoved);

  //ToDo: les checks
  //const poll_options = await db('polls').where({ id: pollId }).select('multiple_choice', 'multiple_vote', 'change_vote').first();
  
  if(votes.length > 0) {
    await db('users_answers').insert(votes);
  }

  return true;
}

module.exports = { init, createUser, checkUser, createPoll, getPoll, getPollByAnswerUuid, getUserAnswersByUserAndPoll, getUserPolls, removeVote, vote };