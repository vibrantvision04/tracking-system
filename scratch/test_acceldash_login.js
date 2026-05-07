const https = require('https');

const loginData = JSON.stringify({
  email: 'superadmin@jaipurheritage.swm',
  password: 'BA@Jaipur25#'
});

const req = https.request('https://iswm-jaipur-heritage-api.acceldash.com/api/v1/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('BODY:', data));
});

req.write(loginData);
req.end();
