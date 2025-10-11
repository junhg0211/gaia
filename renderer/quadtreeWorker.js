import {
  deserializeMapCompact,
  serializeMapCompact,
  buildClipContext,
} from '../dataframe.js'

function respond(id, payload) {
  self.postMessage({ id, ...payload })
}

function ensureLayer(map, layerId) {
  const layer = map.findLayer(layerId)
  if (!layer) {
    throw new Error('Invalid layer ID')
  }
  return layer
}

function ensureArea(map, areaId) {
  if (areaId === 0) return null
  const area = map.findArea(areaId)
  if (!area) {
    throw new Error('Invalid area ID')
  }
  return area
}

function computeBounds(layer) {
  const [px, py] = layer.pos ?? [0, 0]
  const [sx, sy] = layer.size ?? [1, 1]
  return { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
}

function safeDepth(layer, precision) {
  const [sx] = layer.size ?? [1, 1]
  const safePrecision = typeof precision === 'number' && precision > 0 ? precision : sx
  return Math.log2(sx / safePrecision)
}

function handleLine(payload) {
  const { map: mapData, layerId, x1, y1, x2, y2, color, brushSize, precision } = payload
  const map = deserializeMapCompact(mapData)
  const layer = ensureLayer(map, layerId)

  layer.expandTo(x1, y1)
  layer.expandTo(x2, y2)
  const bounds = computeBounds(layer)
  const depth = safeDepth(layer, precision)
  const targetArea = color !== 0 ? map.findArea(color) : null
  const clipContext = buildClipContext(map, layer, targetArea?.clipAreas ?? [])
  layer.quadtree.drawLine(x1, y1, x2, y2, brushSize, color, depth, bounds, clipContext)
  layer.cleanup()
  layer.calculateAreas()

  return serializeMapCompact(map)
}

function handleRect(payload) {
  const { map: mapData, layerId, x1, y1, x2, y2, color, precision } = payload
  const map = deserializeMapCompact(mapData)
  const layer = ensureLayer(map, layerId)

  layer.expandTo(x1, y1)
  layer.expandTo(x2, y2)
  const bounds = computeBounds(layer)
  const depth = safeDepth(layer, precision)
  const targetArea = color !== 0 ? map.findArea(color) : null
  const clipContext = buildClipContext(map, layer, targetArea?.clipAreas ?? [])
  layer.quadtree.drawRect(
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
    color,
    depth,
    bounds,
    clipContext,
  )
  layer.cleanup()
  layer.calculateAreas()

  return serializeMapCompact(map)
}

function handlePoly(payload) {
  const { map: mapData, layerId, points, color, precision } = payload
  const map = deserializeMapCompact(mapData)
  const layer = ensureLayer(map, layerId)

  for (const [x, y] of points) {
    layer.expandTo(x, y)
  }
  const bounds = computeBounds(layer)
  const depth = safeDepth(layer, precision)
  const targetArea = color !== 0 ? map.findArea(color) : null
  const clipContext = buildClipContext(map, layer, targetArea?.clipAreas ?? [])
  layer.quadtree.drawPolygon(points, color, depth, bounds, undefined, clipContext)
  layer.cleanup()
  layer.calculateAreas()

  return serializeMapCompact(map)
}

function handleFill(payload) {
  const { map: mapData, layerId, x, y, color, precision, options } = payload
  const map = deserializeMapCompact(mapData)
  const layer = ensureLayer(map, layerId)
  ensureArea(map, color)

  const result = layer.floodFill(x, y, color, precision, options ?? {})
  if (result.reason) {
    return { status: 'error', reason: result.reason, result }
  }
  layer.cleanup()
  layer.calculateAreas()
  return { status: 'ok', map: serializeMapCompact(map), result }
}

const handlers = {
  line: handleLine,
  rect: handleRect,
  poly: handlePoly,
  fill: handleFill,
}

self.onmessage = (event) => {
  const { id, type, payload } = event.data ?? {}
  const handler = handlers[type]
  if (!handler) {
    respond(id, { status: 'error', message: `Unknown task type: ${type}` })
    return
  }

  try {
    const outcome = handler(payload)
    if (type === 'fill') {
      if (outcome.status === 'ok') {
        respond(id, { status: 'ok', map: outcome.map, result: outcome.result })
      } else {
        respond(id, outcome)
      }
    } else {
      respond(id, { status: 'ok', map: outcome })
    }
  } catch (error) {
    respond(id, { status: 'error', message: error?.message ?? String(error) })
  }
}
