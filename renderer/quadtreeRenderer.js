const MAX_TEXTURE_SIZE = 8192
const DETAIL_RATIO = 1.08
const MIN_SCREEN_PIXELS = 0.75

function supportsCanvas() {
  if (typeof OffscreenCanvas !== 'undefined') return true
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') return true
  return false
}

function makeCanvas(width, height) {
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

function readLayerBounds(layer) {
  if (layer && typeof layer.getBounds === 'function') {
    return layer.getBounds()
  }
  const [px = 0, py = 0] = Array.isArray(layer?.pos) ? layer.pos : [0, 0]
  const [sx = 1, sy = 1] = Array.isArray(layer?.size) ? layer.size : [1, 1]
  return { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
}

function areaSignature(layer) {
  if (!Array.isArray(layer?.areas)) return ''
  const parts = layer.areas
    .slice()
    .sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0))
    .map(area => `${area.id}:${area.color}`)
  return parts.join(';')
}

function colorLookup(layer) {
  const lookup = new Map()
  if (!Array.isArray(layer?.areas)) return lookup
  for (const area of layer.areas) {
    lookup.set(area.id, area.color)
  }
  return lookup
}

function measureDepth(root) {
  if (!root) return 0
  let maxDepth = 0
  const stack = [{ node: root, depth: 0 }]
  while (stack.length) {
    const { node, depth } = stack.pop()
    if (!node) continue
    if (depth > maxDepth) maxDepth = depth
    if (!node.isLeaf?.() && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) stack.push({ node: child, depth: depth + 1 })
      }
    }
  }
  return maxDepth
}

function paintNodeToImage(node, minX, minY, maxX, maxY, ctx, colors, scaleX, scaleY, originX, originY) {
  if (!node || !ctx) return
  if (node.isLeaf?.() || !Array.isArray(node.children)) {
    if (node.value === 0) return
    const color = colors.get(node.value)
    if (!color || color === 'transparent') return
    const x = (minX - originX) * scaleX
    const y = (minY - originY) * scaleY
    const width = (maxX - minX) * scaleX
    const height = (maxY - minY) * scaleY
    ctx.fillStyle = color
    ctx.fillRect(x, y, width, height)
    return
  }

  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2

  paintNodeToImage(node.children[0], minX, minY, midX, midY, ctx, colors, scaleX, scaleY, originX, originY)
  paintNodeToImage(node.children[1], midX, minY, maxX, midY, ctx, colors, scaleX, scaleY, originX, originY)
  paintNodeToImage(node.children[2], minX, midY, midX, maxY, ctx, colors, scaleX, scaleY, originX, originY)
  paintNodeToImage(node.children[3], midX, midY, maxX, maxY, ctx, colors, scaleX, scaleY, originX, originY)
}

function paintNodeToScreen(node, minX, minY, maxX, maxY, ctx, camera, colors, remainingDepth, canvasWidth, canvasHeight) {
  if (!node || !ctx || !camera) return

  const x1 = camera.toScreenX(minX)
  const x2 = camera.toScreenX(maxX)
  const y1 = camera.toScreenY(minY)
  const y2 = camera.toScreenY(maxY)

  const left = Math.min(x1, x2)
  const right = Math.max(x1, x2)
  const top = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)

  const width = right - left
  const height = bottom - top

  if (width <= 0 || height <= 0) return
  if (right < 0 || bottom < 0 || left > canvasWidth || top > canvasHeight) return

  const shouldStop = node.isLeaf?.() ||
    !Array.isArray(node.children) ||
    remainingDepth <= 0 ||
    (width <= MIN_SCREEN_PIXELS && height <= MIN_SCREEN_PIXELS)

  if (shouldStop) {
    if (node.value === 0) return
    const color = colors.get(node.value)
    if (!color || color === 'transparent') return
    ctx.fillStyle = color
    ctx.fillRect(left, top, width, height)
    return
  }

  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2

  paintNodeToScreen(node.children[0], minX, minY, midX, midY, ctx, camera, colors, remainingDepth - 1, canvasWidth, canvasHeight)
  paintNodeToScreen(node.children[1], midX, minY, maxX, midY, ctx, camera, colors, remainingDepth - 1, canvasWidth, canvasHeight)
  paintNodeToScreen(node.children[2], minX, midY, midX, maxY, ctx, camera, colors, remainingDepth - 1, canvasWidth, canvasHeight)
  paintNodeToScreen(node.children[3], midX, midY, maxX, maxY, ctx, camera, colors, remainingDepth - 1, canvasWidth, canvasHeight)
}

function ensureLayerTexture(layer, store) {
  if (!layer) return null
  let cache = store.get(layer)
  if (!cache) {
    cache = {
      canvas: null,
      ctx: null,
      version: -1,
      boundsSignature: '',
      areaSignature: '',
      bounds: readLayerBounds(layer),
      pixelsPerUnitX: 0,
      pixelsPerUnitY: 0,
      colors: new Map(),
      depth: 0,
    }
    store.set(layer, cache)
  }

  const bounds = readLayerBounds(layer)
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  const nextAreaSignature = areaSignature(layer)
  const nextBoundsSignature = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`
  const nextVersion = layer?.quadtree?.version ?? 0

  if (width <= 0 || height <= 0 || !layer?.quadtree) {
    cache.canvas = null
    cache.ctx = null
    cache.pixelsPerUnitX = 0
    cache.pixelsPerUnitY = 0
    cache.colors = colorLookup(layer)
    cache.depth = measureDepth(layer?.quadtree)
    cache.version = nextVersion
    cache.bounds = bounds
    cache.boundsSignature = nextBoundsSignature
    cache.areaSignature = nextAreaSignature
    return cache
  }

  const pixelsPerUnit = Math.min(
    MAX_TEXTURE_SIZE / Math.max(width, Number.EPSILON),
    MAX_TEXTURE_SIZE / Math.max(height, Number.EPSILON),
  )
  const canvasWidth = Math.max(1, Math.round(width * pixelsPerUnit))
  const canvasHeight = Math.max(1, Math.round(height * pixelsPerUnit))

  const needsCanvas = !cache.canvas ||
    cache.canvas.width !== canvasWidth ||
    cache.canvas.height !== canvasHeight
  const needsContent = needsCanvas ||
    cache.version !== nextVersion ||
    cache.boundsSignature !== nextBoundsSignature ||
    cache.areaSignature !== nextAreaSignature

  if (needsCanvas) {
    const canvas = makeCanvas(canvasWidth, canvasHeight)
    if (!canvas) {
      cache.canvas = null
      cache.ctx = null
      cache.pixelsPerUnitX = 0
      cache.pixelsPerUnitY = 0
      cache.depth = measureDepth(layer?.quadtree)
      return cache
    }
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    cache.canvas = canvas
    cache.ctx = canvas.getContext('2d')
  }

  if (!cache.ctx) {
    cache.canvas = null
    return cache
  }

  if (typeof cache.ctx.imageSmoothingEnabled === 'boolean') {
    cache.ctx.imageSmoothingEnabled = false
  }

  if (needsContent) {
    cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height)
    cache.colors = colorLookup(layer)
    cache.depth = measureDepth(layer.quadtree)
    paintNodeToImage(
      layer.quadtree,
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
      cache.ctx,
      cache.colors,
      cache.canvas.width / Math.max(width, Number.EPSILON),
      cache.canvas.height / Math.max(height, Number.EPSILON),
      bounds.minX,
      bounds.minY,
    )
    cache.version = nextVersion
    cache.boundsSignature = nextBoundsSignature
    cache.areaSignature = nextAreaSignature
    cache.bounds = bounds
    cache.pixelsPerUnitX = cache.canvas.width / Math.max(width, Number.EPSILON)
    cache.pixelsPerUnitY = cache.canvas.height / Math.max(height, Number.EPSILON)
  }

  return cache
}

function drawLayer(layer, ctx, canvas, camera, depthHint, store, useCache) {
  if (!layer) return

  const canvasWidth = (typeof canvas?.clientWidth === 'number' && canvas.clientWidth > 0)
    ? canvas.clientWidth
    : (canvas?.width ?? 0)
  const canvasHeight = (typeof canvas?.clientHeight === 'number' && canvas.clientHeight > 0)
    ? canvas.clientHeight
    : (canvas?.height ?? 0)

  const cache = useCache ? ensureLayerTexture(layer, store) : null
  const bounds = cache?.bounds ?? readLayerBounds(layer)
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const hasTree = !!layer?.quadtree

  const treeDepth = cache?.depth ?? (hasTree ? measureDepth(layer.quadtree) : 0)
  const effectiveDepth = Math.max(depthHint, treeDepth + 1)

  const colors = cache?.colors ?? colorLookup(layer)

  if (layer.visible && hasTree && width > 0 && height > 0) {
    ctx.save()
    ctx.globalAlpha = layer.opacity ?? 1

    const screenX = camera.toScreenX(bounds.minX)
    const screenY = camera.toScreenY(bounds.minY)
    const screenWidth = width * camera.zoom
    const screenHeight = height * camera.zoom

    if (typeof ctx.imageSmoothingEnabled === 'boolean') {
      ctx.imageSmoothingEnabled = false
    }

    let drewBase = false
    if (useCache && cache?.canvas && cache?.ctx) {
      ctx.drawImage(cache.canvas, screenX, screenY, screenWidth, screenHeight)
      drewBase = true
    }

    const needDetail = !drewBase ||
      camera.zoom > (cache?.pixelsPerUnitX ?? 0) * DETAIL_RATIO ||
      camera.zoom > (cache?.pixelsPerUnitY ?? 0) * DETAIL_RATIO

    if (needDetail) {
      paintNodeToScreen(
        layer.quadtree,
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        ctx,
        camera,
        colors,
        effectiveDepth,
        canvasWidth,
        canvasHeight,
      )
    }

    ctx.restore()
  }

  const childDepth = Math.max(depthHint, treeDepth + 1)
  const reversedChildren = Array.isArray(layer.children) ? [...layer.children].reverse() : []
  for (const child of reversedChildren) {
    drawLayer(child, ctx, canvas, camera, childDepth, store, useCache)
  }
}

export function createMapRenderer() {
  const cacheSupported = supportsCanvas()
  let cacheStore = new WeakMap()

  return {
    draw(map, ctx, canvas, camera, depth = 11) {
      if (!map?.layer || !ctx || !canvas || !camera) return
      const initialDepth = Number.isFinite(depth) ? Math.max(0, depth) : 11
      drawLayer(map.layer, ctx, canvas, camera, initialDepth, cacheStore, cacheSupported)
    },
    clearCache() {
      cacheStore = new WeakMap()
    },
  }
}
