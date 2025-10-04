// index.js
import { WebSocketServer } from 'ws';
import { loadMapFromFile } from './dataframe-fs.js';
import fs from 'fs';

import { Map, Layer, Area, Quadtree, serializeMap } from './dataframe.js';

const PORT = 48829;
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

let map;
if (fs.existsSync('map.gaia')) {
  map = loadMapFromFile('map.gaia');
} else {
  map = new Map("Gaia", new Layer(null, new Quadtree(0), null, [0, 0], [1, 1], "Root Layer"));
}

const clients = new Set();
let saveCounter = 1000;
const snapshots = [];
async function handleMessage(ws, message) {
  saveCounter--;
  if (saveCounter <= 0) {
    saveCounter = 1000 * clients.size + 1000;
    fs.writeFile('map.gaia', JSON.stringify(serializeMap(map)), (err) => {
      if (err) {
        console.error('Auto-save error:', err);
      }
    });
    console.log('💾 Map auto-saved');
  }

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
      if (clientWs !== ws)
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

  const LINE_RE = /^LINE:(\d+):([0-9\-\.]+),([0-9\-\.]+):([0-9\-\.]+),([0-9\-\.]+):(\d+),([0-9\.]+)$/;
  const lineMatch = message.match(LINE_RE);
  if (lineMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(lineMatch[1]);
    const x1 = parseFloat(lineMatch[2]);
    const y1 = parseFloat(lineMatch[3]);
    const x2 = parseFloat(lineMatch[4]);
    const y2 = parseFloat(lineMatch[5]);
    const color = parseInt(lineMatch[6]);
    const brushSize = parseFloat(lineMatch[7]);

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

    const newLayer = new Layer(null, new Quadtree(0), parentLayer, [0, 0], [1, 1], layerName);
    parentLayer.children.push(newLayer);
    ws.send(`OK`);

    const broadcastMessage = `NEWL:${parentLayerId}:${newLayer.id}:${layerName}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const DELETELAYER_RE = /^DELL:(\d+)$/;
  const deleteLayerMatch = message.match(DELETELAYER_RE);
  if (deleteLayerMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(deleteLayerMatch[1]);

    if (layerId === map.layer.id) {
      ws.send('ERR Cannot delete root layer');
      return;
    }

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    if (!layer.parent) {
      ws.send('ERR Layer has no parent');
      return;
    }

    layer.parent.children = layer.parent.children.filter(child => child.id !== layerId);
    ws.send(`OK`);

    const broadcastMessage = `DELL:${layerId}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const DELETEAREA_RE = /^DELA:(\d+)$/;
  const deleteAreaMatch = message.match(DELETEAREA_RE);
  if (deleteAreaMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const areaId = parseInt(deleteAreaMatch[1]);

    if (areaId === 0) {
      ws.send('ERR Cannot delete root area');
      return;
    }

    const area = map.findArea(areaId);
    if (!area) {
      ws.send('ERR Invalid area ID');
      return;
    }

    if (!(area.parent instanceof Layer)) {
      area.parent = map.findLayer(area.parent);
    }
    const layer = area.parent;
    if (!layer) {
      ws.send('ERR Parent layer not found');
      return;
    }

    layer.removeArea(areaId);
    ws.send(`OK`);

    const broadcastMessage = `DELA:${areaId}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const SETAREACOLOR_RE = /^SEAC:(\d+):#([0-9a-fA-F]{6})$/;
  const setAreaColorMatch = message.match(SETAREACOLOR_RE);
  if (setAreaColorMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const areaId = parseInt(setAreaColorMatch[1]);
    const newColor = `#${setAreaColorMatch[2]}`;

    if (areaId === 0) {
      ws.send('ERR Cannot recolor root area');
      return;
    }

    const area = map.findArea(areaId);
    if (!area) {
      ws.send('ERR Invalid area ID');
      return;
    }

    area.color = newColor;
    ws.send(`OK`);

    const broadcastMessage = `SEAC:${areaId}:${newColor}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const SETLAYERNAME_RE = /^SELN:(\d+):(.+)$/;
  const setLayerNameMatch = message.match(SETLAYERNAME_RE);
  if (setLayerNameMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(setLayerNameMatch[1]);
    const newName = setLayerNameMatch[2].trim();

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    layer.name = newName;
    ws.send(`OK`);

    const broadcastMessage = `SELN:${layerId}:${newName}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const SETAREANAME_RE = /^SEAN:(\d+):(.+)$/;
  const setAreaNameMatch = message.match(SETAREANAME_RE);
  if (setAreaNameMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const areaId = parseInt(setAreaNameMatch[1]);
    const newName = setAreaNameMatch[2].trim();

    if (areaId === 0) {
      ws.send('ERR Cannot rename root area');
      return;
    }

    const area = map.findArea(areaId);
    if (!area) {
      ws.send('ERR Invalid area ID');
      return;
    }

    area.name = newName;
    ws.send(`OK`);

    const broadcastMessage = `SEAN:${areaId}:${newName}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  // fillrect
  const RECT_RE = /^RECT:(\d+):([0-9\-]+),([0-9\-]+):([0-9\-]+),([0-9\-]+):(\d+)$/;
  const rectMatch = message.match(RECT_RE);
  if (rectMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(rectMatch[1]);
    const x1 = parseInt(rectMatch[2]);
    const y1 = parseInt(rectMatch[3]);
    const x2 = parseInt(rectMatch[4]);
    const y2 = parseInt(rectMatch[5]);
    const color = parseInt(rectMatch[6]);

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

    layer.quadtree.drawRect(x1, y1, x2, y2, color, undefined, bounds);

    const broadcastMessage = `RECT:${layerId}:${x1},${y1}:${x2},${y2}:${color}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    ws.send('OK');

    return;
  }

  const FILLPOLY_RE = /^POLY:(\d+):((?:[0-9\-]+,[0-9\-]+,?)+):(\d+)$/;
  const fillPolyMatch = message.match(FILLPOLY_RE);
  if (fillPolyMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(fillPolyMatch[1]);
    const pointsStr = fillPolyMatch[2];
    const color = parseInt(fillPolyMatch[3]);

    const points = pointsStr.split(',').map(v => parseInt(v));
    if (points.length < 6 || points.length % 2 !== 0) {
      ws.send('ERR Invalid polygon points');
      return;
    }
    const newPoints = [];
    for (let i = 0; i < points.length; i += 2) {
      newPoints.push([points[i], points[i + 1]]);
    }
    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    for (const [x, y] of newPoints) {
      layer.expandTo(x, y);
    }
    const [px, py] = layer.pos ?? [0, 0];
    const [sx, sy] = layer.size ?? [1, 1];
    const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy };

    layer.quadtree.drawPolygon(newPoints, color, undefined, bounds);

    const broadcastMessage = `POLY:${layerId}:${pointsStr}:${color}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    ws.send('OK');

    return;
  }

  const LAYERORDER_RE = /^LYOD:(\d+):(\d+)$/;
  const layerOrderMatch = message.match(LAYERORDER_RE);
  if (layerOrderMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(layerOrderMatch[1]);
    const newIndex = parseInt(layerOrderMatch[2]);

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    if (!layer.parent) {
      ws.send('ERR Layer has no parent');
      return;
    }

    const siblings = layer.parent.children;
    const currentIndex = siblings.findIndex(child => child.id === layerId);
    if (currentIndex === -1) {
      ws.send('ERR Layer not found in parent');
      return;
    }

    siblings.splice(currentIndex, 1);
    siblings.splice(newIndex, 0, layer);

    ws.send(`OK`);

    const broadcastMessage = `LYOD:${layerId}:${newIndex}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const SNAPSHOT_RE = /^SNAP$/;
  if (message.match(SNAPSHOT_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const snapshot = JSON.stringify(serializeMap(map));
    snapshots.push(snapshot);
    ws.send(`OK Snapshot taken`);
    while (snapshots.length > 200) {
      snapshots.shift();
    }
    return;
  }

  const UNDO_RE = /^UNDO$/;
  if (message.match(UNDO_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    if (snapshots.length === 0) {
      ws.send('ERR No snapshots available');
      return;
    }
    const snapshot = snapshots.pop();
    map = Map.fromJSON(JSON.parse(snapshot));
    const broadcastMessage = `MAP:${JSON.stringify(serializeMap(map))}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    ws.send('OK Undo applied');
    return;
  }

  // If no command matched
  ws.send(`ERR:Unknown command: ${message}`);
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
      console.log(`❌ Client disconnected: ${clientIP}`);
      clients.delete(ws);

      // Notify other clients about disconnection
      const username = [...clients].find(([clientWs]) => clientWs === ws)?.[1];
      if (username) {
        const broadcastMessage = `DISCONNECT:${username}`;
        for (const [clientWs] of clients) {
          clientWs.send(broadcastMessage);
        }
      }
    }
  });
});
