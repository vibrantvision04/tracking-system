const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/track');

ws.on('message', function incoming(data) {
  const str = data.toString();
  const msg = JSON.parse(str);
  if (msg.type === "snapshot") {
    const coords = new Set();
    msg.data.forEach(p => {
        coords.add(`${p.lat},${p.lng}`);
    });
    console.log("Total unique coordinates:", coords.size);
    process.exit(0);
  }
});
