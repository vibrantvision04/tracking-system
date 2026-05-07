const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/track');

ws.on('message', function incoming(data) {
  const str = data.toString();
  const msg = JSON.parse(str);
  if (msg.type === "snapshot") {
    const imeis = new Set();
    msg.data.forEach(p => {
        imeis.add(p.imei);
    });
    console.log("Total unique IMEIs:", imeis.size);
    process.exit(0);
  }
});
