const approveMessage = "This event has been approved and should show on our calendar soon";
const denyMessage = "This event post does not follow our event guidelines. For more information, contact the mod team at r/joinsquad"

const data = require('./config.json');
const fetch = require('node-fetch');
let url = "https://www.reddit.com/r/patest/new/.json";
//wat dis
let settings = {
  method: "Get"
};
const eventMentioned = "[event]";
const approvedEvent = "!approve";
const deniedEvent = "!deny";
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
    db.run('CREATE TABLE redditPost(name text, processed int, modMailId text)');
  }
});
//end of sqlite setup

// Loop main function
main();
setInterval(main, 10000);




// Main execution loop
function main() {
  console.log("Running a loop");
  fetch(url, settings)
    .then(res => res.json())
    .then((json) => {
      json.data.children.forEach((element) => {
        checkIfProcessed(element.data, db, r);
      })
      //check for replies
      checkModMailUpdate();

    });


}



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

// Check if the reddit thread shows as an event
function checkIfEvent(redditData, db, r) {
  if (redditData.title.toLowerCase().includes(eventMentioned)) {
    sendModMailAlert(redditData, db, r);
    console.log(redditData.title);
  } else {
    db.run("INSERT INTO redditPost (name, processed) VALUES ('" + redditData.name + "', '1')");
  }
}
// Sends message to modmail alerting of event post
function sendModMailAlert(redditData, db, r) {
  r.createModmailDiscussion({
    body: 'Please check this event post at ' + redditData.url,
    subject: redditData.title + ' | New Event Post',
    srName: 'patest'
  }).then(saveModMailId.bind(null, redditData.name));


}

// Save message id to database
function saveModMailId(name, modMailId) {
  var rawJson = JSON.stringify(modMailId);
  var parsedJson = JSON.parse(rawJson);
  db.run("INSERT INTO redditPost (name, processed, modMailId) VALUES ('" + name + "','1', '" + parsedJson.id + "')");
}

// Check database for modmail conversations that have been approved/rejected and process
function checkModMailUpdate() {
  db.all("SELECT name, modMailId FROM redditPost WHERE modMailId IS NOT NULL", function (error, modMailId) {
    modMailId.forEach((row) => {
      r.getNewModmailConversation(row.modMailId).fetch().then(checkForApproval.bind(null, row.name));
    });
  });


}

function checkForApproval(threadName, modMailConversation) {

  var rawJson = JSON.stringify(modMailConversation);
  var parsedJson = JSON.parse(rawJson);
  parsedJson.messages.forEach((row) => {
    if (row.bodyMarkdown.toLowerCase().includes(approvedEvent)) {
      db.run("UPDATE redditPost SET modMailId = NULL WHERE name = '" + threadName + "'");
      approveEvent(threadName);

    }
    if (row.bodyMarkdown.toLowerCase().includes(deniedEvent)) {
      db.run("UPDATE redditPost SET modMailId = NULL WHERE name = '" + threadName + "'");
      denyEvent(threadName);

    }
  });

}


function denyEvent(threadName) {
  r.getSubmission(threadName).reply(denyMessage);
}

function approveEvent(threadName) {
  r.getSubmission(threadName).reply(approveMessage);
}