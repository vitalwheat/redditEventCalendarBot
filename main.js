const data = require('./config.json');
const fetch = require('node-fetch');
let url = "https://www.reddit.com/r/patest/new/.json";
//wat dis
let settings = {
  method: "Get"
};

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
      var alreadyProcessed = await checkIfProcessed(element.data.name, db);
      console.log(alreadyProcessed);
      if (alreadyProcessed == false) {
        console.log("hello?");
        var processedPostResult = processPost(element.data, db);
      }
    })
    // do something with JSON
  });

db.close;

//Checks if post has been processed previously
//Takes Reddit unique identifier 
//Returns true if post has been added to database
//Returns true if post has NOT been added to database
function checkIfProcessed(name, db) {
  db.get("SELECT name FROM redditPost WHERE name='" + name + "' AND processed='1'", function (error, postId) {
    if (postId) {
      return true;
    } else {
      console.log("returning false");
      return false;
    }
  });
}

function processPost(redditPost, db) {
  console.log(redditPost);
}