# redditEventCalendarBot
Pulls event information from a subreddit post and adds to Google calendar

# Installation Instructions
1. Clone the repository 
2. npm install
3. Move config.json.sample to config.json and change preferences
4. 'run npx reddit-oauth-helper' to get an auth token. Set redditAuthToken to be the 'refreshtoken' that is returned
5. run node main.js