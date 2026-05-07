const https = require('https');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjE2NywiaWF0IjoxNzc4MTQzMzkyLCJleHAiOjE3NzgyMjk3OTJ9.JrJeEEvCZgh5PwCbEOF8S6yTAZY67ezqeuRSQYG7swk';

const options = {
  hostname: 'iswm-jaipur-heritage-api.acceldash.com',
  path: '/api/v1/all_vehicles/',
  headers: {
    'Authorization': 'Bearer ' + token
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        console.log("Root Keys:", Object.keys(json));
        if (json.data) console.log("Data Keys:", Object.keys(json.data));
        if (Array.isArray(json)) console.log("It's an array, length:", json.length);
    } catch (e) {
        console.log("Not JSON or Parse Error");
    }
  });
});
