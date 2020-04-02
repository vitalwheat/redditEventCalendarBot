const data = require('./config.json');
const fetch = require('node-fetch');
// The string to search for in the body of the reddit post
const eventString = "\\[Event\\]";
let url = "https://www.reddit.com/r/patest/new/.json";
//wat dis
let settings = {
  method: "Get"
};

//sqlite setup
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('./calendarBot.db');
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='redditPost'", function(error, tableName) {
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
      checkIfProcessed(element.data, db, );
    });
    // do something with JSON
  });

db.close;

//Checks if post has been processed previously
//Takes Reddit unique identifier
function checkIfProcessed(postData, db) {
  db.get("SELECT name FROM redditPost WHERE name='" + postData.name + "' AND processed='1'", function(error, postId) {
    if (!postId) {
      // Post has not been processed, call a function to process it
      console.log("Found a new post: '" + postData.title + "' - Processing...");
      checkIfEvent(postData, db);
    }
  });
}

// Processes a new post, checking if the post is an event
function checkIfEvent(postData, db) {
  // Check if the body of the post contains '[Event]'
  if (postData.selftext.includes(eventString)) {
    console.log(postData.title + " is an event...");
    processEvent(postData, db);
  } else {
    db.run("INSERT INTO redditPost (name, processed) VALUES ('" + postData.name + "', '1')");
  }

}



// Process a confirmed event
function processEvent(postData, db) {

}
