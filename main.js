const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const snoowrap = require('snoowrap');
const config = require('./config.json');

const eventMentioned = "[event]";
const approvedEvent = "!approve";
const deniedEvent = "!deny";

// Database setup
let db;
try {
  db = setupDatabase('calendarBot.db');
} catch (error) {
  console.error(`Failed to setup database`, error);
  // Something went wrong while setting up the database! Without our db
  // we cannot proceed further so let's abort our nodejs process right away
  process.abort();
}

// Reddit API setup
const reddit = new snoowrap({
  username: config.userName,
  password: config.password,
  userAgent: config.userAgent,
  clientId: config.clientId,
  clientSecret: config.clientSecret
});

// Loop main function
main().then(() => {
  setInterval(main, 10000);
});




/**
 * Main execution loop
 */
async function main() {
  console.log("Running a loop");

  // Fetch reddit posts
  let posts;
  try {
    const response = await fetch(config.subredditUrl, {
      method: "Get"
    });
    const json = response.json();
    posts = json.data.children;
  } catch (error) {
    console.error(error);
    return;
  }

  // Process each post in parallel
  const promises = posts.map(async (element) => {
    const redditPost = element.data;
    const isProcessed = await checkIfProcessed(redditPost);
    if (isProcessed) {
      return;
    }

    // Mark this non-event post as processed
    if (! checkIfEvent(redditPost)) {
      db.run(`
        INSERT INTO redditPost (name, processed) VALUES (
          '${redditPost.name}',
          '1'
        )
      `);
      return;
    }

    console.log("Processing event");
    try {
      await sendModMailAlert(redditPost);
      await replyToEventHost(redditPost);
      await reddit.getSubmission(redditPost.name).remove({
        spam: true
      });
    } catch(error) {
      console.error(error);
    }
  });
  // Since we have a list of all our promises, we can wait until all promises
  // are completed before moving on with "checkModMailUpdate"
  await Promise.all(promises);

  //check for replies
  checkModMailUpdate();
}



/**
 * Checks if post has been processed previously
 * Takes Reddit unique identifier
 * Returns true if post has been added to database
 * Returns true if post has NOT been added to database
 *
 * @param {Object} redditData
 * @return {Promise<boolean>}
 */
function checkIfProcessed(redditData) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT name
      FROM redditPost
      WHERE name = '${redditData.name}'
      AND processed = '1'
  `, (error, postId) => {
      if (error) {
        return reject(error);
      }
      return resolve(postId !== undefined);
    });
  });
}

/**
 * Check if the reddit thread shows as an event
 *
 * @param {Object} redditData
 * @return {boolean}
 */
function checkIfEvent(redditData) {
  return redditData.title.toLowerCase().includes(eventMentioned)
}

/**
 * Sends message to modmail alerting of event post and saves its id in database
 *
 * @param {Object} redditData
 * @return {Promise<void>}
 */
async function sendModMailAlert(redditData) {
  const modmailConversation = await reddit.createModmailDiscussion({
    body: `Please check this event post at ${redditData.url}`,
    subject: `${redditData.title} | New Event Post`,
    srName: 'patest'
  });
  await db.run(`
    INSERT INTO redditPost (name, processed, modMailId) VALUES (
      '${redditData.name}',
      '1',
      '${modmailConversation.id}'
    )
  `);
}

/**
 * Check database for modmail conversations that have been approved/rejected and process
 */
function checkModMailUpdate() {
  db.all(`
    SELECT name, modMailId
    FROM redditPost
    WHERE modMailId IS NOT NULL
  `, (error, modMailId) => {
    modMailId.forEach((row) => {
      reddit.getNewModmailConversation(row.modMailId).then((modmailConversation) => {
        checkForApproval(row.name, modmailConversation);
      });
    });
  });
}

/**
 *
 * @param {String} threadName
 * @param {Object} modmailConversation
 */
function checkForApproval(threadName, modmailConversation) {
  const query = `
    UPDATE redditPost
    SET modMailId = NULL
    WHERE name = '${threadName}'
  `;

  modmailConversation.messages.forEach((row) => {
    if (row.bodyMarkdown.toLowerCase().includes(approvedEvent)) {
      db.run(query);
      approveEvent(threadName);
    }
    if (row.bodyMarkdown.toLowerCase().includes(deniedEvent)) {
      db.run(query);
      denyEvent(threadName);
    }
  });
}

/**
 *
 * @param {String} threadName
 */
function denyEvent(threadName) {
  reddit.getSubmission(threadName).reply(config.denyMessage);
  //deleteGreetingMessage(threadName);
  reddit.getSubmission(threadName).lock();
}

/**
 *
 * @param {String} threadName
 */
function approveEvent(threadName) {
  reddit.getSubmission(threadName).reply(config.approveMessage);
  //deleteGreetingMessage(threadName);
  reddit.getSubmission(threadName).approve();
}

/**
 * Sends a greeting message to the event post
 *
 * @param {Object} redditData
 * @return {Promise<void>}
 */
async function replyToEventHost(redditData) {
  const reply = await reddit.getSubmission(redditData.name).reply(config.greetingMessage);

  await db.run(`
    UPDATE redditPost
    SET greetingId = '${reply.name}'
    WHERE name = '${redditData.name}'
  `);
}

/**
 * This function is not currently working - the comment is not deleted
 *
 * @param {String} name
 */
function deleteGreetingMessage(name) {
  db.get(`
    SELECT greetingId
    FROM redditPost
    WHERE name = '${name}'
  `, (error, commentId) => {
    console.log(error);
    console.log(commentId);
    reddit.getComment(commentId).body.then(console.log);
  });
}

/**
 * Setup the database and the tables used by our app
 *
 * @param {String} filename The filename of our database
 * @return {sqlite3} The DB object to we'll be using
 * @throws {Error} Throws exception if something went wrong while setting up our database
 */
function setupDatabase(filename) {
  const db = new sqlite3.Database(`${__dirname}/${filename}`);

  // Catches all errors from our DB instance and logs them
  db.on('error', (error) => {
    console.error('Database error', error);
  });

  // Simplified table creation : creates the "redditPost" table
  // if and only if it doesn't exist already
  return db.run(`CREATE TABLE IF NOT EXISTS redditPost (
      name text,
      processed int,
      modMailId text,
      greetingId text
  )`, {}, (error) => {
    if (error) {
      // The error will be catched by a try/catch where we'll call
      // this "setupDatabase" function
      throw error;
    }
  });
}
