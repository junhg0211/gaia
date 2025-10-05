const MAX_BASE_TEXTURE_SIZE = 4096
const DETAIL_RATIO_THRESHOLD = 1.05
const MIN_DETAIL_SCREEN_SIZE = 0.75

function canCreateCanvas() {
  if (typeof OffscreenCanvas !== 'undefined') return true
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') return true
  return false
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return null
}

function getLayerBounds(layer) {
  if (layer && typeof layer.getBounds === 'function') {
    return layer.getBounds()
  }
  const [px = 0, py = 0] = layer?.pos ?? [0, 0]
  const [sx = 1, sy = 1] = layer?.size ?? [1, 1]
  return { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
}

function computeAreaSignature(layer) {
  if (!layer?.areas) return ''
  return layer.areas.map(area => `${area.id}:${area.color}`).join('|')
}

function buildAreaColorMap(layer) {
  const map = new Map()
  if (!layer?.areas) return map
  for (const area of layer.areas) {
    map.set(area.id, area.color)
  }
  return map
}

function renderTreeToCanvas(node, canvas, ctx, bounds, areaColors) {
  if (!canvas || !ctx || !node) return
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  if (width <= 0 || height <= 0) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (typeof ctx.imageSmoothingEnabled === 'boolean') {
    ctx.imageSmoothingEnabled = false
  }

  const scaleX = canvas.width / width
  const scaleY = canvas.height / height

  const drawNode = (current, nodeBounds) => {
    if (!current) return

    if (current.isLeaf()) {
      if (current.value === 0) return
      const color = areaColors.get(current.value)
      if (!color || color === 'transparent') return
      const minX = (nodeBounds.minX - bounds.minX) * scaleX
      const minY = (nodeBounds.minY - bounds.minY) * scaleY
      const nodeWidth = (nodeBounds.maxX - nodeBounds.minX) * scaleX
      const nodeHeight = (nodeBounds.maxY - nodeBounds.minY) * scaleY
      ctx.fillStyle = color
      ctx.fillRect(minX, minY, nodeWidth, nodeHeight)
      return
    }

    const midX = (nodeBounds.minX + nodeBounds.maxX) / 2
    const midY = (nodeBounds.minY + nodeBounds.maxY) / 2
    const childBounds = [
      { minX: nodeBounds.minX, minY: nodeBounds.minY, maxX: midX, maxY: midY },
      { minX: midX, minY: nodeBounds.minY, maxX: nodeBounds.maxX, maxY: midY },
      { minX: nodeBounds.minX, minY: midY, maxX: midX, maxY: nodeBounds.maxY },
      { minX: midX, minY: midY, maxX: nodeBounds.maxX, maxY: nodeBounds.maxY },
    ]

    for (let i = 0; i < 4; i += 1) {
      const child = current.getChild(i)
      if (!child) continue
      drawNode(child, childBounds[i])
    }
  }

  drawNode(node, bounds)
}

function renderQuadtreeToCanvas(layer, canvas, ctx, bounds, areaColors) {
  if (!layer?.quadtree) return
  renderTreeToCanvas(layer.quadtree, canvas, ctx, bounds, areaColors)
}

function ensureLayerCache(layer, cacheStore) {
  if (!layer) return null
  let cache = cacheStore.get(layer)
  if (!cache) {
    cache = {
      baseCanvas: null,
      baseCtx: null,
      baseVersion: -1,
      areaSignature: '',
      boundsSignature: '',
      basePixelsPerUnitX: 0,
      basePixelsPerUnitY: 0,
      bounds: null,
      areaColors: new Map(),
    }
    cacheStore.set(layer, cache)
  }

  const bounds = getLayerBounds(layer)
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  if (width <= 0 || height <= 0) {
    cache.baseCanvas = null
    cache.baseCtx = null
    cache.bounds = bounds
    cache.basePixelsPerUnitX = 0
    cache.basePixelsPerUnitY = 0
    cache.baseVersion = layer?.quadtree?.version ?? 0
    cache.areaSignature = computeAreaSignature(layer)
    cache.boundsSignature = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`
    return cache
  }

  const areaSignature = computeAreaSignature(layer)
  const boundsSignature = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`
  const quadtreeVersion = layer?.quadtree?.version ?? 0
  const pixelsPerUnit = Math.min(
    MAX_BASE_TEXTURE_SIZE / width,
    MAX_BASE_TEXTURE_SIZE / height,
  )
  const canvasWidth = Math.max(1, Math.round(width * pixelsPerUnit))
  const canvasHeight = Math.max(1, Math.round(height * pixelsPerUnit))

  const needsCanvas = !cache.baseCanvas || cache.baseCanvas.width !== canvasWidth || cache.baseCanvas.height !== canvasHeight
  const needsContent = needsCanvas || cache.baseVersion !== quadtreeVersion || cache.areaSignature !== areaSignature || cache.boundsSignature !== boundsSignature

  if (needsCanvas) {
    const canvas = createCanvas(canvasWidth, canvasHeight)
    if (!canvas) {
      cache.baseCanvas = null
      cache.baseCtx = null
      return cache
    }
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    cache.baseCanvas = canvas
    cache.baseCtx = canvas.getContext('2d')
  } else if (cache.baseCanvas) {
    if (cache.baseCanvas.width !== canvasWidth) cache.baseCanvas.width = canvasWidth
    if (cache.baseCanvas.height !== canvasHeight) cache.baseCanvas.height = canvasHeight
    if (cache.baseCtx && typeof cache.baseCtx.imageSmoothingEnabled === 'boolean') {
      cache.baseCtx.imageSmoothingEnabled = false
    }
  }

  if (needsContent && cache.baseCanvas && cache.baseCtx) {
    cache.areaColors = buildAreaColorMap(layer)
    renderQuadtreeToCanvas(layer, cache.baseCanvas, cache.baseCtx, bounds, cache.areaColors)
    cache.baseVersion = quadtreeVersion
    cache.areaSignature = areaSignature
    cache.boundsSignature = boundsSignature
    cache.bounds = bounds
    cache.basePixelsPerUnitX = cache.baseCanvas.width / width
    cache.basePixelsPerUnitY = cache.baseCanvas.height / height
  } else if (!cache.bounds || needsCanvas) {
    cache.bounds = bounds
    cache.basePixelsPerUnitX = cache.baseCanvas ? cache.baseCanvas.width / width : 0
    cache.basePixelsPerUnitY = cache.baseCanvas ? cache.baseCanvas.height / height : 0
  }

  return cache
}

function drawNodeAdaptive({
  node,
  bounds,
  ctx,
  canvas,
  camera,
  areaColors,
  maxDepth = 64,
}) {
  if (!node || !ctx || !canvas) return

  const sx1 = camera.toScreenX(bounds.minX)
  const sx2 = camera.toScreenX(bounds.maxX)
  const sy1 = camera.toScreenY(bounds.minY)
  const sy2 = camera.toScreenY(bounds.maxY)

  const rawMinX = Math.min(sx1, sx2)
  const rawMaxX = Math.max(sx1, sx2)
  const rawMinY = Math.min(sy1, sy2)
  const rawMaxY = Math.max(sy1, sy2)

  const x = Math.floor(rawMinX)
  const y = Math.floor(rawMinY)
  const width = Math.ceil(rawMaxX) - x
  const height = Math.ceil(rawMaxY) - y

  if (width <= 0 || height <= 0) return

  if (x >= canvas.width || y >= canvas.height || x + width <= 0 || y + height <= 0) {
    return
  }

  const screenTooSmall = width <= MIN_DETAIL_SCREEN_SIZE && height <= MIN_DETAIL_SCREEN_SIZE
  const shouldStop = node.isLeaf() || screenTooSmall || maxDepth <= 0

  if (shouldStop) {
    if (node.value === 0) return
    const color = areaColors.get(node.value)
    if (!color || color === 'transparent') return
    ctx.fillStyle = color
    ctx.fillRect(x, y, width, height)
    return
  }

  const midX = (bounds.minX + bounds.maxX) / 2
  const midY = (bounds.minY + bounds.maxY) / 2
  const childBounds = [
    { minX: bounds.minX, minY: bounds.minY, maxX: midX, maxY: midY },
    { minX: midX, minY: bounds.minY, maxX: bounds.maxX, maxY: midY },
    { minX: bounds.minX, minY: midY, maxX: midX, maxY: bounds.maxY },
    { minX: midX, minY: midY, maxX: bounds.maxX, maxY: bounds.maxY },
  ]

  for (let i = 0; i < 4; i += 1) {
    const child = node.getChild(i)
    if (!child) continue
    drawNodeAdaptive({
      node: child,
      bounds: childBounds[i],
      ctx,
      canvas,
      camera,
      areaColors,
      maxDepth: maxDepth - 1,
    })
  }
}

function drawLayerDirect(layer, ctx, canvas, camera, depth = 11) {
  if (!layer) return
  const areaColors = buildAreaColorMap(layer)
  const bounds = getLayerBounds(layer)
  const effectiveDepth = Math.max(depth, 24)

  if (layer.visible) {
    drawNodeAdaptive({
      node: layer.quadtree,
      bounds,
      ctx,
      canvas,
      camera,
      areaColors,
      maxDepth: effectiveDepth,
    })
  }

  const reversedLayers = [...layer.children].reverse()
  for (const child of reversedLayers) {
    drawLayerDirect(child, ctx, canvas, camera, effectiveDepth)
  }
}

export function createMapRenderer() {
  const cacheEnabled = canCreateCanvas()
  const layerCache = new WeakMap()

  function drawLayerCached(layer, ctx, canvas, camera, depth = 11) {
    if (!layer) return

    const cache = ensureLayerCache(layer, layerCache)
    const bounds = cache?.bounds ?? getLayerBounds(layer)
    const effectiveDepth = Math.max(depth, 24)

    if (!cache || !cache.baseCanvas || !cache.baseCtx) {
      drawLayerDirect(layer, ctx, canvas, camera, effectiveDepth)
      return
    }

    if (layer.visible) {
      const screenX = camera.toScreenX(bounds.minX)
      const screenY = camera.toScreenY(bounds.minY)
      const screenWidth = (bounds.maxX - bounds.minX) * camera.zoom
      const screenHeight = (bounds.maxY - bounds.minY) * camera.zoom

      if (typeof ctx.imageSmoothingEnabled === 'boolean') {
        ctx.imageSmoothingEnabled = false
      }
      const basePixelsPerUnitX = cache.basePixelsPerUnitX || 0
      const basePixelsPerUnitY = cache.basePixelsPerUnitY || 0
      const needDetail = (
        camera.zoom > basePixelsPerUnitX * DETAIL_RATIO_THRESHOLD ||
        camera.zoom > basePixelsPerUnitY * DETAIL_RATIO_THRESHOLD
      ) && cache.areaColors?.size

      if (!needDetail) {
        ctx.drawImage(cache.baseCanvas, screenX, screenY, screenWidth, screenHeight)
      }

      if (needDetail) {
        drawNodeAdaptive({
          node: layer.quadtree,
          bounds,
          ctx,
          canvas,
          camera,
          areaColors: cache.areaColors,
          maxDepth: effectiveDepth,
        })
      } else if (!needDetail && cache.baseCanvas) {
        // Base texture already drawn above; nothing else to do.
      }
    }

    const reversedLayers = [...layer.children].reverse()
    for (const child of reversedLayers) {
      drawLayerCached(child, ctx, canvas, camera, effectiveDepth)
    }
  }

  return {
    draw(map, ctx, canvas, camera, depth = 11) {
      if (!map || !ctx || !canvas || !camera) return
      if (!cacheEnabled) {
        drawLayerDirect(map.layer, ctx, canvas, camera, depth)
        return
      }
      drawLayerCached(map.layer, ctx, canvas, camera, depth)
    },
  }
}
