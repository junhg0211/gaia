// index.js
import { WebSocketServer } from 'ws';
import { Map } from './dataframe.js';
import { loadMapFromFile } from './dataframe-fs.js';
import fs from 'fs';

import { serializeMap } from './dataframe.js';

const PORT = 48829;
const wss = new WebSocketServer({ port: PORT });

let map;
if (fs.existsSync('map.json')) {
  map = loadMapFromFile('map.json');
} else {
  map = new Map();
}

const clients = new Set();
function handleMessage(ws, message) {
  console.log(`Handling message: ${message}`);

  const ECHO_RE = /^ECHO:(.*)$/;
  const echoMatch = message.match(ECHO_RE);
  if (echoMatch) {
    const echoMessage = echoMatch[1].trim();
    ws.send(`ECHO_RESPONSE: ${echoMessage}`);
    return;
  }

  const LOGIN_RE = /^LOGIN:([a-zA-Z0-9_]+):(.*)$/;
  const loginMatch = message.match(LOGIN_RE);
  if (loginMatch) {
    const password = loginMatch[1];
    const username = loginMatch[2].trim();
    if (password === 'secret') {
      clients.add([ws, username]);
      ws.send(`OK`);
    } else {
      ws.send('ERR Invalid password');
    }
    return;
  }

  const CURSORS_RE = /^CURSOR:(\d+),(\d+)$/;
  const cursorMatch = message.match(CURSORS_RE);
  if (cursorMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const x = cursorMatch[1];
    const y = cursorMatch[2];
    const username = [...clients].find(([clientWs]) => clientWs === ws)[1];
    const broadcastMessage = `CURSOR:${username},${x},${y}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const SAVE_RE = /^SAVE$/;
  if (message.match(SAVE_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    // Here you would implement actual saving logic
    ws.send('OK Map saved');
    return;
  }

  const LOAD_RE = /^LOAD$/;
  if (message.match(LOAD_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    ws.send(`MAP:${serializeMap(map)}`);
    return;
  }

  ws.send(`ERR Unknown command: ${message}`);
}

console.log(`🌐 WebSocket LAN server running on ws://localhost:${PORT}`);

// 클라이언트 연결 이벤트
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔗 Client connected: ${clientIP}`);

  // 메시지 수신 처리
  ws.on('message', (data) => {
    try {
      const message = data.toString();
      handleMessage(ws, message);
    } catch (err) {
      console.error('Message handling error:', err);
    }
  });

  // 연결 종료 이벤트
  ws.on('close', () => {
    if (clients.has(ws)) {
      clients.delete(ws);
    }
  });
});
