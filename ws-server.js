// index.js
import { WebSocketServer } from 'ws';
import { loadMapFromFile } from './dataframe-fs.js';
import fs from 'fs';

import { Map, Layer, Area, Quadtree, serializeMap } from './dataframe.js';

const PORT = 48829;
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

let map;
if (fs.existsSync('map.json')) {
  map = loadMapFromFile('map.json');
} else {
  map = new Map("Gaia", new Layer(null, new Quadtree(0), null, [0, 0], [1, 1], "Root Layer"));
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

  const CURSORS_RE = /^CURSOR:([0-9\-]+),([0-9\-]+)$/;
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
    ws.send(`MAP:${JSON.stringify(serializeMap(map))}`);
    return;
  }

  const LINE_RE = /^LINE:(\d+):([0-9\-]+),([0-9\-]+):([0-9\-]+),([0-9\-]+):(\d+),(\d+)$/;
  const lineMatch = message.match(LINE_RE);
  if (lineMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(lineMatch[1]);
    const x1 = parseInt(lineMatch[2]);
    const y1 = parseInt(lineMatch[3]);
    const x2 = parseInt(lineMatch[4]);
    const y2 = parseInt(lineMatch[5]);
    const color = parseInt(lineMatch[6]);
    const brushSize = parseInt(lineMatch[7]);

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    layer.expandTo(x1, y1);
    layer.expandTo(x2, y2);
    const [px, py] = layer.pos ?? [0, 0];
    const [sx, sy] = layer.size ?? [1, 1];
    const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy };

    layer.quadtree.drawLine(x1, y1, x2, y2, brushSize, color, undefined, bounds);
    console.log(layer.quadtree);

    const broadcastMessage = `LINE:${layerId}:${x1},${y1}:${x2},${y2}:${color},${brushSize}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    ws.send('OK');

    return;
  }

  const NEWAREA_RE = /^NEWA:(\d+):(.+):#([0-9a-fA-F]{6})$/;
  const newAreaMatch = message.match(NEWAREA_RE);
  if (newAreaMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(newAreaMatch[1]);
    const areaName = newAreaMatch[2].trim();
    const color = newAreaMatch[3];

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    const newArea = new Area(null, `#${color}`, layerId, areaName);
    layer.areas.push(newArea);
    ws.send(`OK`);

    const broadcastMessage = `NEWA:${layerId}:${newArea.id}:${areaName}:#${color}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const NEWLAYER_RE = /^NEWL:(\d+):(.+)$/;
  const newLayerMatch = message.match(NEWLAYER_RE);
  if (newLayerMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const parentLayerId = parseInt(newLayerMatch[1]);
    const layerName = newLayerMatch[2].trim();

    const parentLayer = map.findLayer(parentLayerId);
    if (!parentLayer) {
      ws.send('ERR Invalid parent layer ID');
      return;
    }

    const newLayer = new Layer(null, new Quadtree(null), parentLayer, [0, 0], [1, 1], layerName);
    parentLayer.children.push(newLayer);
    ws.send(`OK`);

    const broadcastMessage = `NEWL:${parentLayerId}:${newLayer.id}:${layerName}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
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
