const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/track');

ws.on('open', function open() {
  console.log('connected');
});

ws.on('message', function incoming(data) {
  const str = data.toString();
  console.log("Raw payload size:", str.length);
  const msg = JSON.parse(str);
  console.log("Msg Type:", msg.type);
  if (msg.type === "snapshot") {
    console.log("Is array?", Array.isArray(msg.data));
    console.log("Array length:", msg.data ? msg.data.length : 0);
    if (msg.data && msg.data.length > 0) {
        console.log("First item:", msg.data[0]);
        console.log("Type of first item:", typeof msg.data[0]);
    }
    process.exit(0);
  }
});
