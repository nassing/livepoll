const uuid = require('uuid');
const crypto = require('crypto');

const db = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: process.env.DB_PATH || "./db"
  },
  useNullAsDefault: true,
  // A single connection serializes every query and transaction: this is what makes
  // "check the vote rules, then insert the vote" atomic in castVote().
  pool: { min: 1, max: 1 }
});

// No 0/O/1/I to avoid confusion when a code is typed by hand
const POLL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const POLL_CODE_LENGTH = 6;

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

async function getUserId(userUuid, trx = db) {
  if (!userUuid) {
    return null;
  }

  const user = await trx('users').where({ uuid: userUuid }).select('id').first();

  return user?.id ?? null;
}

async function checkUser(userUuid) {
  return (await getUserId(userUuid)) !== null;
}

function generatePollCode() {
  let code = '';
  for (let i = 0; i < POLL_CODE_LENGTH; i++) {
    code += POLL_CODE_ALPHABET[crypto.randomInt(POLL_CODE_ALPHABET.length)];
  }
  return code;
}

async function createPoll(poll, userUuid) {
  return db.transaction(async trx => {
    const userId = await getUserId(userUuid, trx);

    let pollUuid;
    do {
      pollUuid = generatePollCode();
    } while (await trx('polls').where({ uuid: pollUuid }).first());

    const [pollId] = await trx('polls').insert({ uuid: pollUuid, user_id: userId, question_text: poll.question, multiple_choice: poll.multipleChoice, multiple_vote: poll.multipleVote, change_vote: poll.changeVote });

    const answers = poll.answers.map(answer => { return { uuid: uuid.v4().toUpperCase(), answer_text: answer, poll_id: pollId } });
    await trx('answers').insert(answers);

    return pollUuid;
  });
}

// Returns null when the poll does not exist
async function getPoll(pollUuid) {
  let poll = await db('polls').where({ uuid: pollUuid }).select('id', 'question_text', 'multiple_choice', 'multiple_vote', 'change_vote').first();

  if (!poll) {
    return null;
  }

  const answers = await db('answers').where({ poll_id: poll.id }).select('id', 'uuid', 'answer_text');

  const votes = await db('users_answers')
    .join('answers', 'answers.id', 'users_answers.answer_id')
    .where('users_answers.poll_id', poll.id)
    .select('users_answers.uuid as uuid', 'answers.uuid as answerUuid');

  answers.forEach(answer => delete answer.id);

  poll.votes = votes;
  poll.answers = answers;
  poll.uuid = pollUuid;
  delete poll.id;

  return poll;
}

// Answer uuids the user has currently voted for in a poll
async function getUserAnswerUuids(userId, pollId, trx = db) {
  if (!userId) {
    return [];
  }

  const rows = await trx('users_answers')
    .join('answers', 'answers.id', 'users_answers.answer_id')
    .where({ 'users_answers.user_id': userId, 'users_answers.poll_id': pollId })
    .select('answers.uuid as answerUuid');

  return rows.map(row => row.answerUuid);
}

async function getUserAnswerUuidsByPoll(userUuid, pollUuid) {
  const userId = await getUserId(userUuid);
  const poll = await db('polls').where({ uuid: pollUuid }).select('id').first();

  if (!userId || !poll) {
    return [];
  }

  return getUserAnswerUuids(userId, poll.id);
}

async function getUserPolls(userUuid) {
  const userId = await getUserId(userUuid);

  if (!userId) {
    return [];
  }

  return db('polls').where({ user_id: userId }).select('uuid', 'question_text');
}

/*
 * Applies the poll rules and records the vote, atomically.
 *
 * Rules:
 *  - multiple_vote:   anything goes, the same answer can be voted several times
 *  - multiple_choice: one vote per answer, several answers allowed
 *  - otherwise:       a single answer
 *  - change_vote:     voting for another answer replaces the previous one (single answer),
 *                     voting again for a voted answer removes it (multiple choice)
 *
 * Returns null when the answer does not exist, otherwise
 * { accepted, pollUuid, added: [{uuid, answerUuid}], removed: [voteUuid], myAnswers: [answerUuid] }
 */
async function castVote(userUuid, answerUuid) {
  return db.transaction(async trx => {
    const answer = await trx('answers').where({ uuid: answerUuid }).select('id', 'poll_id').first();

    if (!answer) {
      return null;
    }

    const poll = await trx('polls').where({ id: answer.poll_id }).select('id', 'uuid', 'multiple_choice', 'multiple_vote', 'change_vote').first();
    const userId = await getUserId(userUuid, trx);

    const previousVotes = await trx('users_answers')
      .where({ user_id: userId, poll_id: poll.id })
      .select('uuid', 'answer_id');

    const result = { accepted: false, pollUuid: poll.uuid, added: [], removed: [] };
    let toRemove = [];
    let toAdd = false;

    if (poll.multiple_vote || previousVotes.length === 0) {
      toAdd = true;
    } else if (poll.multiple_choice) {
      const sameAnswerVotes = previousVotes.filter(vote => vote.answer_id === answer.id);

      if (sameAnswerVotes.length === 0) {
        toAdd = true;
      } else if (poll.change_vote) {
        toRemove = sameAnswerVotes;
      }
    } else if (poll.change_vote && !previousVotes.some(vote => vote.answer_id === answer.id)) {
      toRemove = previousVotes;
      toAdd = true;
    }

    if (toRemove.length > 0) {
      await trx('users_answers').whereIn('uuid', toRemove.map(vote => vote.uuid)).delete();
      result.removed = toRemove.map(vote => vote.uuid);
      result.accepted = true;
    }

    if (toAdd) {
      const voteUuid = uuid.v4().toUpperCase();
      await trx('users_answers').insert({ uuid: voteUuid, user_id: userId, answer_id: answer.id, poll_id: poll.id });
      result.added.push({ uuid: voteUuid, answerUuid: answerUuid });
      result.accepted = true;
    }

    result.myAnswers = await getUserAnswerUuids(userId, poll.id, trx);

    return result;
  });
}

module.exports = { init, createUser, checkUser, createPoll, getPoll, getUserAnswerUuidsByPoll, getUserPolls, castVote };
