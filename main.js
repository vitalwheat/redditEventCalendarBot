const data = require('./config.json');
const fetch = require('node-fetch');
let url = "https://www.reddit.com/r/patest/new/.json";
//wat dis
let settings = {
  method: "Get"
};
const eventMentioned = "[event]";
const snoowrap = require('snoowrap');
const r = new snoowrap({
  username: data.userName,
  password: data.password,
  userAgent: data.userAgent,
  clientId: data.clientId,
  clientSecret: data.clientSecret
});

//sqlite setup
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('./calendarBot.db');
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='redditPost'", function (error, tableName) {
  if (!tableName) {
    db.run('CREATE TABLE redditPost(name text, processed int)');
  }
});
//end of sqlite setup

//wat dis
fetch(url, settings)
  .then(res => res.json())
  .then((json) => {
    json.data.children.forEach((element) => {
      checkIfProcessed(element.data, db, r);
    })
    // do something with JSON
  });

db.close;

//Checks if post has been processed previously
//Takes Reddit unique identifier 
//Returns true if post has been added to database
//Returns true if post has NOT been added to database
function checkIfProcessed(redditData, db, r) {
  db.get("SELECT name FROM redditPost WHERE name='" + redditData.name + "' AND processed='1'", function (error, postId) {
    if (!postId) {
      console.log("Processing post");
      checkIfEvent(redditData, db, r);
    }
  });
}

function checkIfEvent(redditData, db, r) {
  if (redditData.title.toLowerCase().includes(eventMentioned)) {
    sendModMailAlert(redditData, db, r);
    console.log(redditData.title);
  } else {
    db.run("INSERT INTO redditPost (name, processed) VALUES ('" + redditData.name + "', '1')");
  }
}
//Sends message to modmail alerting of event post
function sendModMailAlert(redditData, db, r) {
  r.createModmailDiscussion({
    body: 'test body',
    subject: 'test subject',
    srName: 'patest'
  }).then(saveModMailId);

  //r.getSubmission('2np694').author.name.then(console.log);
}

//save message id to database
function saveModMailId(modMailId) {
  var rawJson = JSON.stringify(modMailId);
  var parsedJson = JSON.parse(rawJson);
  console.log(parsedJson.id);
}