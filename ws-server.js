// index.js
import { WebSocketServer } from 'ws';
import { Worker } from 'node:worker_threads';
import { loadMapFromFile, saveMapToFile } from './dataframe-fs.js';
import fs from 'fs';

import { Map as GaiaMap, Layer, Area, Quadtree, serializeMap, deserializeMapCompact, serializeMapCompact, serializeLayerCompact, deserializeLayerCompact } from './dataframe.js';

const PORT = 48829;
const ZERO_AREA_THRESHOLD = 1e-9;
const wss = new WebSocketServer({
  port: PORT,
  host: '0.0.0.0',
  maxPayload: 512 * 1024 * 1024,
});

const HEARTBEAT_INTERVAL_MS = 30_000;

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.CLOSING || ws.readyState === ws.CLOSED) {
      continue;
    }
    if (ws.isAlive === false) {
      console.warn('Terminating unresponsive client');
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    try {
      ws.ping();
    } catch (error) {
      console.warn('Failed to ping client', error);
      ws.terminate();
    }
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  quadtreeWorker.terminate().catch(error => {
    console.warn('Failed to terminate quadtree worker', error);
  });
});

let map;
if (fs.existsSync('map.gaia')) {
  map = loadMapFromFile('map.gaia');
} else {
  map = new GaiaMap("Gaia", new Layer(null, new Quadtree(0), null, [0, 0], [1, 1], "Root Layer"));
}

const clients = new Set();
const compactClients = new Set();
const clientState = new Map();
const snapshots = [];

const quadtreeWorker = new Worker(new URL('./workers/quadtreeWorker.js', import.meta.url), {
  type: 'module',
});

let nextWorkerRequestId = 1;
const pendingQuadtreeRequests = new Map();
let quadtreeTaskChain = Promise.resolve();

quadtreeWorker.on('message', message => {
  const { id, ...result } = message;
  const pending = pendingQuadtreeRequests.get(id);
  if (!pending) {
    console.warn('Received worker response with unknown id', id);
    return;
  }
  pendingQuadtreeRequests.delete(id);
  pending.resolve(result);
});

quadtreeWorker.on('error', error => {
  console.error('Quadtree worker error', error);
  for (const pending of pendingQuadtreeRequests.values()) {
    pending.reject(error);
  }
  pendingQuadtreeRequests.clear();
});

quadtreeWorker.on('exit', code => {
  if (code === 0) return;
  const error = new Error(`Quadtree worker exited with code ${code}`);
  console.error(error);
  for (const pending of pendingQuadtreeRequests.values()) {
    pending.reject(error);
  }
  pendingQuadtreeRequests.clear();
});

function runQuadtreeTask(type, payload) {
  return new Promise((resolve, reject) => {
    const id = nextWorkerRequestId++;
    pendingQuadtreeRequests.set(id, { resolve, reject });
    try {
      quadtreeWorker.postMessage({ id, type, payload });
    } catch (error) {
      pendingQuadtreeRequests.delete(id);
      reject(error);
    }
  });
}

function enqueueQuadtreeTask(type, payload) {
  const task = quadtreeTaskChain.then(() => runQuadtreeTask(type, payload));
  quadtreeTaskChain = task.catch(() => {});
  return task;
}

function adoptMapFromWorker(nextMap) {
  if (!nextMap) {
    throw new Error('Worker returned empty map payload');
  }
  map = deserializeMapCompact(nextMap);
}
async function handleMessage(ws, message) {
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
      clientState.set(ws, { openFillAttempts: 0, lastOpenAttempt: 0, cooldownUntil: 0 });
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

    await saveMapToFile(map, 'map.gaia');

    ws.send('OK Map saved');
    return;
  }

  const LOADALL_RE = /^LOADALL$/;
  if (message.match(LOADALL_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const compactPayload = JSON.stringify(serializeMapCompact(map));
    const fallbackPayload = JSON.stringify(serializeMap(map));
    for (const [clientWs] of clients) {
      if (compactClients.has(clientWs)) {
        clientWs.send(`MAPC:${compactPayload}`);
      } else {
        clientWs.send(`MAP:${fallbackPayload}`);
      }
    }
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

  const LOAD_COMPACT_RE = /^LOADC$/;
  if (message.match(LOAD_COMPACT_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    compactClients.add(ws);
    ws.send(`MAPC:${JSON.stringify(serializeMapCompact(map))}`);
    return;
  }

  const LOAD_LAYER_RE = /^LOAD_LAYER:(\d+)$/;
  const loadLayerMatch = message.match(LOAD_LAYER_RE);
  if (loadLayerMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    compactClients.add(ws);

    const layerId = Number(loadLayerMatch[1]);
    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    const payload = {
      parentId: layer.parent ? layer.parent.id : null,
      layer: serializeLayerCompact(layer),
    };

    ws.send(`LAYER:${JSON.stringify(payload)}`);
    return;
  }

  const SET_LAYER_RE = /^SET_LAYER:(\d+):(.+)$/;
  const setLayerMatch = message.match(SET_LAYER_RE);
  if (setLayerMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }

    const layerId = Number(setLayerMatch[1]);
    const existingLayer = map.findLayer(layerId);
    if (!existingLayer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    compactClients.add(ws);

    let payload;
    try {
      payload = JSON.parse(setLayerMatch[2]);
    } catch (error) {
      ws.send('ERR Invalid layer payload');
      return;
    }

    if (!payload || typeof payload !== 'object' || !payload.layer) {
      ws.send('ERR Missing layer payload');
      return;
    }

    let nextLayer;
    try {
      nextLayer = deserializeLayerCompact(payload.layer, null);
    } catch (error) {
      console.error('Failed to deserialize layer payload', error);
      ws.send('ERR Unable to deserialize layer');
      return;
    }

    const parentId = payload.parentId ?? (existingLayer.parent ? existingLayer.parent.id : null);
    const replaced = map.replaceLayer(nextLayer, parentId);
    if (!replaced) {
      ws.send('ERR Failed to replace layer');
      return;
    }

    const updatedLayer = map.findLayer(layerId);
    const layerPayload = JSON.stringify({ parentId, layer: serializeLayerCompact(updatedLayer) });
    const mapFallback = JSON.stringify(serializeMap(map));

    for (const [clientWs] of clients) {
      if (compactClients.has(clientWs)) {
        clientWs.send(`LAYER:${layerPayload}`);
      } else {
        clientWs.send(`MAP:${mapFallback}`);
      }
    }

    ws.send('OK');
    return;
  }

  const LINE_RE = /^LINE:(\d+):([0-9\-\.]+),([0-9\-\.]+):([0-9\-\.]+),([0-9\-\.]+):(\d+),([0-9\.]+):([0-9\.]+)$/;
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
    const precision = parseFloat(lineMatch[8]);

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }
    const broadcastMessage = `LINE:${layerId}:${x1},${y1}:${x2},${y2}:${color},${brushSize}:${precision}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }

    enqueueQuadtreeTask('line', {
      map: serializeMapCompact(map),
      layerId,
      x1,
      y1,
      x2,
      y2,
      color,
      brushSize,
      precision,
    })
      .then(lineResult => {
        if (!lineResult || lineResult.status !== 'ok') {
          const errorMessage = lineResult?.message ?? 'Unable to process line command';
          ws.send(`ERR ${errorMessage}`);
          return;
        }

        try {
          adoptMapFromWorker(lineResult.map);
        } catch (error) {
          console.error('Failed to adopt map after line operation', error);
          ws.send('ERR Failed to update map after line operation');
          return;
        }

        ws.send('OK');
      })
      .catch(error => {
        console.error('Failed to process line operation', error);
        ws.send('ERR Worker failure while processing line');
      });

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

    const newArea = new Area(null, `#${color}`, layer, areaName);
    newArea.parent = layer;
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

  const DELETE_ZERO_AREA_RE = /^DELZ$/;
  if (message.match(DELETE_ZERO_AREA_RE)) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }

    map.layer.calculateAllAreas();

    const zeroAreas = [];
    const collectZeroAreas = (layer) => {
      for (const area of layer.areas) {
        if (area.id === 0) continue;
        const areaValue = Number.isFinite(area.area) ? area.area : 0;
        if (areaValue <= ZERO_AREA_THRESHOLD) {
          zeroAreas.push({ id: area.id, layer });
        }
      }
      for (const child of layer.children) {
        collectZeroAreas(child);
      }
    };

    collectZeroAreas(map.layer);

    if (zeroAreas.length === 0) {
      ws.send('OK No zero-area regions found');
      return;
    }

    const removedIds = [];
    for (const { id, layer } of zeroAreas) {
      let targetLayer = layer;
      if (!(targetLayer instanceof Layer)) {
        targetLayer = map.findLayer(layer.id);
      }
      if (!targetLayer) continue;
      targetLayer.removeArea(id);
      removedIds.push(id);
    }

    map.layer.calculateAllAreas();

    ws.send(`OK Removed ${removedIds.length} zero-area regions`);

    for (const removedId of removedIds) {
      const broadcastMessage = `DELA:${removedId}`;
      for (const [clientWs] of clients) {
        clientWs.send(broadcastMessage);
      }
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

  const RECT_RE = /^RECT:(\d+):([0-9\-\.]+),([0-9\-\.]+):([0-9\-\.]+),([0-9\-\.]+):(\d+):([0-9\.]+)(-?)$/;
  const rectMatch = message.match(RECT_RE);
  if (rectMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(rectMatch[1]);
    const x1 = parseFloat(rectMatch[2]);
    const y1 = parseFloat(rectMatch[3]);
    const x2 = parseFloat(rectMatch[4]);
    const y2 = parseFloat(rectMatch[5]);
    const color = parseInt(rectMatch[6]);
    const precision = parseFloat(rectMatch[7]);
    const boardcasting = rectMatch[8] !== '-';

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }
    if (boardcasting) {
      const broadcastMessage = `RECT:${layerId}:${x1},${y1}:${x2},${y2}:${color}:${precision}`;
      for (const [clientWs] of clients) {
        clientWs.send(broadcastMessage);
      }
    }

    enqueueQuadtreeTask('rect', {
      map: serializeMapCompact(map),
      layerId,
      x1,
      y1,
      x2,
      y2,
      color,
      precision,
    })
      .then(rectResult => {
        if (!rectResult || rectResult.status !== 'ok') {
          const errorMessage = rectResult?.message ?? 'Unable to process rect command';
          ws.send(`ERR ${errorMessage}`);
          return;
        }

        try {
          adoptMapFromWorker(rectResult.map);
        } catch (error) {
          console.error('Failed to adopt map after rect operation', error);
          ws.send('ERR Failed to update map after rect operation');
          return;
        }

        if (boardcasting) {
          ws.send('OK');
        }
      })
      .catch(error => {
        console.error('Failed to process rect operation', error);
        ws.send('ERR Worker failure while processing rect');
      });

    return;
  }

  const FILL_RE = /^FILL:(\d+):([0-9\-\.]+),([0-9\-\.]+):(\d+):([0-9\.]+)$/;
  const fillMatch = message.match(FILL_RE);
  if (fillMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }

    const layerId = parseInt(fillMatch[1]);
    const x = parseFloat(fillMatch[2]);
    const y = parseFloat(fillMatch[3]);
    const color = parseInt(fillMatch[4]);
    const precision = Math.max(1e-6, parseFloat(fillMatch[5]) || 1);

    const area = map.findArea(color);
    if (!area) {
      ws.send('ERR Invalid area ID');
      return;
    }

    const requestedLayer = Number.isFinite(layerId) ? map.findLayer(layerId) : null;

    let inferredLayer = area.parent ?? requestedLayer;
    if (typeof inferredLayer === 'number') {
      const resolved = map.findLayer(inferredLayer);
      if (resolved) {
        inferredLayer = resolved;
        area.parent = resolved;
      }
    }

    if (!inferredLayer) {
      ws.send('ERR Area does not belong to any layer');
      return;
    }

    const layer = inferredLayer;
    if (requestedLayer && requestedLayer.id !== layer.id) {
      console.warn(`Paint bucket layer mismatch: requested ${requestedLayer.id}, using ${layer.id}`);
    }

    const getClientState = typeof clientState.get === 'function' ? clientState.get.bind(clientState) : null;
    const setClientState = typeof clientState.set === 'function' ? clientState.set.bind(clientState) : null;

    let state = getClientState ? getClientState(ws) : null;
    if (!state) {
      state = { openFillAttempts: 0, lastOpenAttempt: 0, cooldownUntil: 0 };
      if (setClientState) setClientState(ws, state);
    }

    const now = Date.now();
    if (state.cooldownUntil && now < state.cooldownUntil) {
      ws.send('ERR Paint bucket temporarily disabled after repeated open space attempts');
      return;
    }

    const targetLayerId = layer.id;
    const broadcastMessage = `FILL:${targetLayerId}:${x},${y}:${color}:${precision}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }

    enqueueQuadtreeTask('fill', {
      map: serializeMapCompact(map),
      layerId: targetLayerId,
      x,
      y,
      color,
      precision,
      options: { maxCells: 200000 },
    })
      .then(fillResult => {
        if (!fillResult || fillResult.status !== 'ok') {
          const reason = fillResult?.reason;
          if (reason === 'open_space') {
            state.openFillAttempts = (state.openFillAttempts || 0) + 1;
            state.lastOpenAttempt = now;
            if (state.openFillAttempts >= 3) {
              state.cooldownUntil = now + 3000;
              state.openFillAttempts = 0;
            }
            if (setClientState) setClientState(ws, state);
            ws.send('ERR Paint bucket works only inside existing regions');
            return;
          }

          if (reason === 'limit_exceeded') {
            ws.send('ERR Fill area too large; zoom in or refine the region');
            return;
          }

          if (reason === 'invalid_precision') {
            ws.send('ERR Invalid precision for fill operation');
            return;
          }

          if (reason === 'out_of_bounds') {
            ws.send('ERR Fill point outside of layer bounds');
            return;
          }

          if (reason === 'no_target') {
            ws.send('ERR Nothing to fill at target location');
            return;
          }

          if (reason === 'already_filled') {
            state.openFillAttempts = 0;
            state.cooldownUntil = 0;
            if (setClientState) setClientState(ws, state);
            ws.send('OK Fill skipped (already target color)');
            return;
          }

          const errorMessage = fillResult?.message ?? 'Unable to process fill command';
          ws.send(`ERR ${errorMessage}`);
          return;
        }

        try {
          adoptMapFromWorker(fillResult.map);
        } catch (error) {
          console.error('Failed to adopt map after fill operation', error);
          ws.send('ERR Failed to update map after fill operation');
          return;
        }

        state.openFillAttempts = 0;
        state.cooldownUntil = 0;
        if (setClientState) setClientState(ws, state);

        ws.send('OK');
      })
      .catch(error => {
        console.error('Failed to process fill operation', error);
        ws.send('ERR Worker failure while processing fill');
      });
    return;
  }

  const FILLPOLY_RE = /^POLY:(\d+):((?:[0-9\-\.]+,[0-9\-\.]+,?)+):(\d+):([0-9\.]+)$/;
  const fillPolyMatch = message.match(FILLPOLY_RE);
  if (fillPolyMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(fillPolyMatch[1]);
    const pointsStr = fillPolyMatch[2];
    const color = parseInt(fillPolyMatch[3]);
    const precision = parseFloat(fillPolyMatch[4]);

    const points = pointsStr.split(',').map(v => parseFloat(v));
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
    const broadcastMessage = `POLY:${layerId}:${pointsStr}:${color}:${precision}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }

    enqueueQuadtreeTask('poly', {
      map: serializeMapCompact(map),
      layerId,
      points: newPoints,
      color,
      precision,
    })
      .then(polyResult => {
        if (!polyResult || polyResult.status !== 'ok') {
          const errorMessage = polyResult?.message ?? 'Unable to process polygon command';
          ws.send(`ERR ${errorMessage}`);
          return;
        }

        try {
          adoptMapFromWorker(polyResult.map);
        } catch (error) {
          console.error('Failed to adopt map after polygon operation', error);
          ws.send('ERR Failed to update map after polygon operation');
          return;
        }

        ws.send('OK');
      })
      .catch(error => {
        console.error('Failed to process polygon operation', error);
        ws.send('ERR Worker failure while processing polygon');
      });

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
    const snapshot = JSON.stringify(serializeMapCompact(map));
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
    const got = deserializeMapCompact(JSON.parse(snapshots.pop()));
    if (!got) {
      ws.send('ERR Failed to restore snapshot');
      return;
    }
    map = got;
    const compactPayload = JSON.stringify(serializeMapCompact(map));
    const fallbackPayload = JSON.stringify(serializeMap(map));
    for (const [clientWs] of clients) {
      if (compactClients.has(clientWs)) {
        clientWs.send(`MAPC:${compactPayload}`);
      } else {
        clientWs.send(`MAP:${fallbackPayload}`);
      }
    }
    ws.send('OK Undo applied');
    return;
  }

  const MERGE_RE = /^MERG:(\d+):(\d+),(\d+)$/;
  const mergeMatch = message.match(MERGE_RE);
  if (mergeMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const layerId = parseInt(mergeMatch[1]);
    const areaId1 = parseInt(mergeMatch[2]);
    const areaId2 = parseInt(mergeMatch[3]);

    if (areaId1 === 0 || areaId2 === 0) {
      ws.send('ERR Cannot merge root area');
      return;
    }

    const layer = map.findLayer(layerId);
    if (!layer) {
      ws.send('ERR Invalid layer ID');
      return;
    }

    const area1 = map.findArea(areaId1);
    const area2 = map.findArea(areaId2);
    if (!area1 || !area2) {
      ws.send('ERR Invalid area ID(s)');
      return;
    }
    if (area1.parent !== layer && area2.parent !== layer) {
      ws.send('ERR Areas do not belong to the specified layer');
      return;
    }

    layer.mergeAreas([areaId1, areaId2]);
    ws.send(`OK`);

    const broadcastMessage = `MERG:${layerId}:${areaId1},${areaId2}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const ADDCLIP_RE = /^ADDCLIP:(.+):(.+)$/;
  const addClipMatch = message.match(ADDCLIP_RE);
  if (addClipMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const area = addClipMatch[1].trim();
    const clipArea = addClipMatch[2].trim();

    if (!area || !clipArea) {
      ws.send('ERR Invalid area or clipArea');
      return;
    }

    const targetArea = map.findArea(parseInt(area));
    if (!targetArea) {
      ws.send('ERR Area not found');
      return;
    }

    if (targetArea.clipAreas.includes(parseInt(clipArea))) {
      ws.send('ERR Clip area already exists');
      return;
    }

    targetArea.clipAreas.push(parseInt(clipArea));
    ws.send(`OK Added clip area`);

    const broadcastMessage = `ADDCLIP:${area}:${clipArea}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const REMOVECLIP_RE = /^REMCLIP:(.+):(.+)$/;
  const removeClipMatch = message.match(REMOVECLIP_RE);
  if (removeClipMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const area = removeClipMatch[1].trim();
    const clipArea = removeClipMatch[2].trim();

    if (!area || !clipArea) {
      ws.send('ERR Invalid area or clipArea');
      return;
    }

    const targetArea = map.findArea(parseInt(area));
    if (!targetArea) {
      ws.send('ERR Area not found');
      return;
    }

    const clipAreaInt = parseInt(clipArea);
    const index = targetArea.clipAreas.indexOf(clipAreaInt);
    if (index === -1) {
      ws.send('ERR Clip area not found');
      return;
    }
    targetArea.clipAreas.splice(index, 1);
    ws.send(`OK Removed clip area`);

    const broadcastMessage = `REMCLIP:${area}:${clipArea}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const AREAPOINT_RE = /^APNT:(\d+):([0-9\-\.]+),([0-9\-\.]+)$/;
  const areaPointMatch = message.match(AREAPOINT_RE);
  if (areaPointMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const areaId = parseInt(areaPointMatch[1]);
    const x = parseFloat(areaPointMatch[2]);
    const y = parseFloat(areaPointMatch[3]);

    if (areaId === 0) {
      ws.send('ERR Cannot modify root area');
      return;
    }

    const area = map.findArea(areaId);
    if (!area) {
      ws.send('ERR Invalid area ID');
      return;
    }

    area.areaPoint = [x, y];
    ws.send(`OK`);
    const broadcastMessage = `APNT:${areaId}:${x},${y}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
    return;
  }

  const AREARESETPOINT_RE = /^AREARESETP:(\d+)$/;
  const areaResetPointMatch = message.match(AREARESETPOINT_RE);
  if (areaResetPointMatch) {
    if (![...clients].some(([clientWs]) => clientWs === ws)) {
      ws.send('ERR Not logged in');
      return;
    }
    const areaId = parseInt(areaResetPointMatch[1]);

    if (areaId === 0) {
      ws.send('ERR Cannot modify root area');
      return;
    }

    const area = map.findArea(areaId);
    if (!area) {
      ws.send('ERR Invalid area ID');
      return;
    }

    area.areaPoint = null;
    ws.send(`OK`);
    const broadcastMessage = `AREARESETP:${areaId}`;
    for (const [clientWs] of clients) {
      clientWs.send(broadcastMessage);
    }
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

  if (ws._socket && typeof ws._socket.setKeepAlive === 'function') {
    ws._socket.setKeepAlive(true, HEARTBEAT_INTERVAL_MS);
  }
  if (ws._socket && typeof ws._socket.setTimeout === 'function') {
    ws._socket.setTimeout(0);
  }

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('error', (error) => {
    console.warn('WebSocket client error', error);
  });

  // 메시지 수신 처리
  ws.on('message', (data) => {
    ws.isAlive = true;
    try {
      const message = data.toString();
      handleMessage(ws, message);
    } catch (err) {
      console.error('Message handling error:', err);
    }
  });

  // 연결 종료 이벤트
  ws.on('close', () => {
    compactClients.delete(ws);
    if (typeof clientState.delete === 'function') {
      clientState.delete(ws);
    }
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
