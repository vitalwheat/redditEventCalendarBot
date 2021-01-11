const fs = require('fs');
const readline = require('readline');
const {
  google
} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Calendar API.
  authorize(JSON.parse(content), authComplete);
});

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
  username: data.redditUserName,
  password: data.redditPassword,
  userAgent: data.userAgent,
  clientId: data.clientId,
  clientSecret: data.clientSecret
});

// Check if ./calendarBot.db exists
var firstRun = false;
if (!fs.existsSync('./calendarBot.db')) {
  firstRun = true;
  console.log('Detected first run');
  console.log(firstRun);
}

//sqlite setup
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('./calendarBot.db');
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='redditPost'", function (error, tableName) {
  if (!tableName) {
    db.run('CREATE TABLE redditPost(name text, processed int, modMailId text, greetingId text)');
  }
});
//end of sqlite setup

// Loop main function
main();
setInterval(main, 10000);

// Main execution loop
function main() {
  fetch(url, settings)
    .then(res => res.json())
    .then((json) => {
      json.data.children.forEach((element) => {
        // Check if this is the first run
        // If so, do not process the first posts found
        if (firstRun == true) {
          db.run("INSERT INTO redditPost (name, processed) VALUES ('" + element.data.name + "', '1')");
        } else {
          checkIfProcessed(element.data, db, r);
        }
      })
      //check for replies
      checkModMailUpdate();

      // End first run mode
    }).then(function () {
      firstRun = false;
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
    replyToEventHost(redditData);
    r.getSubmission(redditData.name).remove({
      spam: true
    }).then(function (error) {
      console.log(error);
    });
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
  r.getSubmission(threadName).reply(data.denyMessage);
  //deleteGreetingMessage(threadName);
  r.getSubmission(threadName).lock();



}

function approveEvent(threadName) {
  r.getSubmission(threadName).reply(data.approveMessage);
  //deleteGreetingMessage(threadName);
  r.getSubmission(threadName).approve();
  sendToCalendar(threadName);
}

function replyToEventHost(redditData) {
  r.getSubmission(redditData.name).reply(data.greetingMessage).then(function (returnData) {

    db.run("UPDATE redditPost SET greetingId = '" + returnData.name + "' WHERE name = '" + redditData.name + "'");

  });

}

// This function is not currently working - the comment is not deleted
function deleteGreetingMessage(name) {

  db.get("SELECT greetingId FROM redditPost WHERE name='" + name + "'", function (error, commentId) {
    console.log(error);
    console.log(commentId);
    r.getComment(commentId).body.then(console.log);

  });

}

function updateSideBar() {
  r.getSubreddit('patest').editSettings({
    description: 'This is a test sidebar update'
  })
}


function sendToCalendar(name) {

  r.getSubmission(name).fetch().then((postData) => {

    // Split the post into sections by pipe
    var bodyArray = postData.selftext.split("|")

    // bodyArray[1] will have the date/time. Split into sections
    var eventDate = bodyArray[1].split(" ");

    // eventDate will not have the date, time and timezone split into an array a 0,1,2 respectivley 
    var dateArray = eventDate[0].split("-");
    var timeArray = eventDate[1].split(":");

    var eventDateTimeString = dateArray[0] + "-" + dateArray[1] + "-" + dateArray[2] + "T" + timeArray[0] + ":" + timeArray[1] + ":00";

    var event = {
      'summary': bodyArray[3],
      'description': postData.selftext,
      'start': {
        'dateTime': eventDateTimeString,
        'timeZone': 'UTC',
      },
      'end': {
        'dateTime': eventDateTimeString,
        'timeZone': 'UTC',
      },


    };

    requestCreateGoogleCalendarEvent(event)

  });


}

function requestCreateGoogleCalendarEvent(event) {
  // Load client secrets from a local file.
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Calendar API.
    authorize(JSON.parse(content), createGoogleCalendarEvent.bind(null, event));
  });
}

function createGoogleCalendarEvent(event, auth) {

  const calendar = google.calendar({
    version: 'v3',
    auth
  });



  calendar.events.insert({
    auth: auth,
    calendarId: data.calendarId,
    resource: event,
  }, function (err, event) {
    if (err) {
      console.log('There was an error contacting the Calendar service: ' + err);
      return;
    }
    console.log('Event created');
  });
}


/**
*
Create an OAuth2 client with the given credentials, and then execute the
  *
  given callback
function.*@param {
  Object
}
credentials The authorization client credentials.*@param {
  function
}
callback The callback to call with the authorized client.*/

function authorize(credentials, callback) {
  const {
    client_secret,
    client_id,
    redirect_uris
  } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function authComplete() {
  console.log("Google calendar authorization confirmed");
}