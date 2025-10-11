import { parentPort } from 'node:worker_threads';
import {
  deserializeMapCompact,
  serializeMapCompact,
  buildClipContext,
} from '../dataframe.js';

function respond(id, payload) {
  parentPort.postMessage({ id, ...payload });
}

function ensureLayer(map, layerId) {
  const layer = map.findLayer(layerId);
  if (!layer) {
    throw new Error('Invalid layer ID');
  }
  return layer;
}

function ensureArea(map, areaId) {
  const area = map.findArea(areaId);
  if (!area) {
    throw new Error('Invalid area ID');
  }
  return area;
}

async function handleLine(id, payload) {
  const { map: mapData, layerId, x1, y1, x2, y2, color, brushSize, precision } = payload;
  const map = deserializeMapCompact(mapData);
  const layer = ensureLayer(map, layerId);

  layer.expandTo(x1, y1);
  layer.expandTo(x2, y2);
  const [px, py] = layer.pos ?? [0, 0];
  const [sx, sy] = layer.size ?? [1, 1];
  const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy };
  const safePrecision = typeof precision === 'number' && precision > 0 ? precision : sx;
  const depth = Math.log2(sx / safePrecision);
  const targetArea = map.findArea(color);
  const clipContext = buildClipContext(map, layer, targetArea?.clipAreas ?? []);

  layer.quadtree.drawLine(x1, y1, x2, y2, brushSize, color, depth, bounds, clipContext);
  layer.cleanup();

  respond(id, { status: 'ok', map: serializeMapCompact(map) });
}

async function handleRect(id, payload) {
  const { map: mapData, layerId, x1, y1, x2, y2, color, precision } = payload;
  const map = deserializeMapCompact(mapData);
  const layer = ensureLayer(map, layerId);

  layer.expandTo(x1, y1);
  layer.expandTo(x2, y2);
  const [px, py] = layer.pos ?? [0, 0];
  const [sx, sy] = layer.size ?? [1, 1];
  const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy };
  const safePrecision = typeof precision === 'number' && precision > 0 ? precision : sx;
  const depth = Math.log2(sx / safePrecision);
  const targetArea = map.findArea(color);
  const clipContext = buildClipContext(map, layer, targetArea?.clipAreas ?? []);

  layer.quadtree.drawRect(x1, y1, x2, y2, color, depth, bounds, clipContext);
  layer.cleanup();

  respond(id, { status: 'ok', map: serializeMapCompact(map) });
}

async function handlePoly(id, payload) {
  const { map: mapData, layerId, points, color, precision } = payload;
  const map = deserializeMapCompact(mapData);
  const layer = ensureLayer(map, layerId);
  const newPoints = points.map(([x, y]) => [x, y]);

  for (const [x, y] of newPoints) {
    layer.expandTo(x, y);
  }
  const [px, py] = layer.pos ?? [0, 0];
  const [sx, sy] = layer.size ?? [1, 1];
  const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy };
  const safePrecision = typeof precision === 'number' && precision > 0 ? precision : sx;
  const depth = Math.log2(sx / safePrecision);
  const targetArea = map.findArea(color);
  const clipContext = buildClipContext(map, layer, targetArea?.clipAreas ?? []);

  layer.quadtree.drawPolygon(newPoints, color, depth, bounds, undefined, clipContext);
  layer.cleanup();

  respond(id, { status: 'ok', map: serializeMapCompact(map) });
}

async function handleFill(id, payload) {
  const { map: mapData, layerId, x, y, color, precision, options } = payload;
  const map = deserializeMapCompact(mapData);
  const layer = ensureLayer(map, layerId);
  ensureArea(map, color);

  const result = layer.floodFill(x, y, color, precision, options ?? {});
  if (result.reason) {
    respond(id, { status: 'error', reason: result.reason, result });
    return;
  }

  respond(id, { status: 'ok', map: serializeMapCompact(map), result });
}

const handlers = {
  line: handleLine,
  rect: handleRect,
  poly: handlePoly,
  fill: handleFill,
};

parentPort.on('message', async message => {
  const { id, type, payload } = message;
  const handler = handlers[type];
  if (!handler) {
    respond(id, { status: 'error', message: `Unknown task type: ${type}` });
    return;
  }

  try {
    await handler(id, payload);
  } catch (error) {
    respond(id, { status: 'error', message: error?.message ?? String(error) });
  }
});
