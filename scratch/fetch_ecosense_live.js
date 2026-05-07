const https = require('https');

const options = {
  hostname: 'app.ecosense-enviro.com',
  port: 443,
  path: '/api/vehicles?minifiedFor=monitoring',
  method: 'GET',
  headers: {
    'accept': 'application/json',
    'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3MDUwZjdkMzUyYmIyN2JiMjJjZmRhMSIsImlhdCI6MTc3ODA5NTIzOCwiZXhwIjozNTU2MTk0MDc2fQ.FwVXkYsAERYEz2jSHFf3CGS9I6Osnh70vlH7oz4q8Oc',
    'projectid': '6637a7e0f5d60976b6a7b2c4'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (d) => {
    data += d;
  });
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log("Total vehicles:", json.data ? json.data.length : 0);
    if (json.data && json.data.length > 0) {
        console.log("First vehicle:", Object.keys(json.data[0]));
        
        let movingCount = 0;
        let diffCoords = new Set();
        json.data.forEach(v => {
            if (v.lastSpeed > 0) movingCount++;
            if (v.lastLocation) diffCoords.add(`${v.lastLocation.latitude},${v.lastLocation.longitude}`);
        });
        console.log("Moving vehicles:", movingCount);
        console.log("Unique coordinates:", diffCoords.size);
    }
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.end();
