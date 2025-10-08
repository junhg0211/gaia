import {
  Quadtree,
  Area as AreaType,
  Layer as LayerType,
  deserializeMap,
  deserializeMapCompact,
  deserializeLayerCompact,
} from '../dataframe.js'

export function createWebSocketManager({
  getWsAddress,
  getUsername,
  onSocketChange,
  onConnectedChange,
  addLogEntry,
  setMap,
  getMap,
  updateCanvas,
  bumpMapUpdate,
  getCursors,
  saveMap,
}) {
  let socket

  const createYieldToUI = () => {
    if (typeof window === 'undefined') {
      return () => Promise.resolve()
    }
    if (typeof requestIdleCallback === 'function') {
      return () => new Promise(resolve => requestIdleCallback(() => resolve(), { timeout: 16 }))
    }
    if (typeof requestAnimationFrame === 'function') {
      return () => new Promise(resolve => requestAnimationFrame(() => resolve()))
    }
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel()
      const pending = []
      channel.port1.onmessage = () => {
        const next = pending.shift()
        if (next) next()
      }
      return () => new Promise(resolve => {
        pending.push(resolve)
        channel.port2.postMessage(null)
      })
    }
    return () => new Promise(resolve => setTimeout(resolve, 0))
  }

  const yieldToUI = createYieldToUI()
  const messageQueue = []
  let processingQueue = false

  const setConnected = (value) => {
    if (onConnectedChange) {
      onConnectedChange(value)
    }
  }

  const handleMapMessage = async (data) => {
    const mapData = data.slice(4)
    await yieldToUI()
    const parsed = deserializeMap(JSON.parse(mapData))
    setMap(parsed)
    await yieldToUI()
    parsed.layer.calculateAllAreas()
    await yieldToUI()
    updateCanvas?.()
  }

  const handleMapCompactMessage = async (data) => {
    const payload = data.slice(5)
    await yieldToUI()
    const parsed = deserializeMapCompact(JSON.parse(payload))
    setMap(parsed)
    await yieldToUI()
    parsed.layer.calculateAllAreas()
    await yieldToUI()
    updateCanvas?.()
  }

  const handleCursorMessage = (data) => {
    const payload = data.slice(7)
    const [id, x, y] = payload.split(',')
    const cursors = getCursors?.()
    if (!cursors) return
    cursors[id] = { x: Number(x), y: Number(y) }
    updateCanvas?.()
  }

  const handleNewAreaMessage = (data) => {
    const payload = data.slice(5)
    const [layerId, areaId, name, color] = payload.split(':')
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(Number(layerId))
    if (!layer) return
    layer.areas.push(new AreaType(Number(areaId), color, layer, name))
    bumpMapUpdate?.()
  }

  const handleNewLayerMessage = (data) => {
    const payload = data.slice(5)
    const [parentId, layerId, name] = payload.split(':')
    const map = getMap?.()
    if (!map) return
    const parent = map.findLayer(Number(parentId))
    if (!parent) return
    parent.children.push(new LayerType(Number(layerId), new Quadtree(0), parent, [0, 0], [1, 1], name))
    bumpMapUpdate?.()
  }

  const handleLineMessage = async (data) => {
    const payload = data.slice(5)
    let [layerId, from, to, areaAndWidth, precision] = payload.split(':')
    const [x1, y1] = from.split(',').map((value) => Number(value))
    const [x2, y2] = to.split(',').map((value) => Number(value))
    const [areaId, width] = areaAndWidth.split(',').map((value) => Number(value))
    precision = parseFloat(precision) || 1
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(Number(layerId))
    if (!layer) return
    layer.expandTo(x1, y1)
    layer.expandTo(x2, y2)
    const [px, py] = layer.pos ?? [0, 0]
    const [sx, sy] = layer.size ?? [1, 1]
    const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
    const depth = Math.log2(layer.size[0] / precision)
    const targetArea = map.findArea(areaId)
    const clipAreas = targetArea?.clipAreas ?? []
    await yieldToUI()
    layer.quadtree.drawLine(x1, y1, x2, y2, width, areaId, depth, bounds, clipAreas)
    await yieldToUI()
    layer.cleanup()
    await yieldToUI()
    layer.calculateAreas()
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleDeleteLayerMessage = (data) => {
    const payload = data.slice(5)
    const layerId = Number(payload)
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(layerId)
    if (!layer || !layer.parent) return
    const index = layer.parent.children.indexOf(layer)
    if (index === -1) return
    layer.parent.children.splice(index, 1)
    bumpMapUpdate?.()
  }

  const handleDeleteAreaMessage = (data) => {
    const payload = data.slice(5)
    const areaId = Number(payload)
    const map = getMap?.()
    if (!map) return
    const area = map.findArea(areaId)
    if (!area || !area.parent) return
    area.parent.removeArea(areaId)
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleRectMessage = async (data) => {
    const payload = data.slice(5)
    let [layerId, from, to, areaId, precision] = payload.split(':')
    const [x1, y1] = from.split(',').map((value) => Number(value))
    const [x2, y2] = to.split(',').map((value) => Number(value))
    precision = parseFloat(precision) || 1
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(Number(layerId))
    if (!layer) return
    const parsedAreaId = Number(areaId)
    layer.expandTo(x1, y1)
    layer.expandTo(x2, y2)
    const [px, py] = layer.pos ?? [0, 0]
    const [sx, sy] = layer.size ?? [1, 1]
    const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
    const depth = Math.log2(layer.size[0] / precision)
    const targetArea = map.findArea(parsedAreaId)
    const clipAreas = targetArea?.clipAreas ?? []
    await yieldToUI()
    layer.quadtree.drawRect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.max(x1, x2),
      Math.max(y1, y2),
      parsedAreaId,
      depth,
      bounds,
      clipAreas,
    )
    await yieldToUI()
    layer.cleanup()
    await yieldToUI()
    layer.calculateAreas()
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleLayerMessage = async (data) => {
    const payload = data.slice(6)
    let parsed
    try {
      parsed = JSON.parse(payload)
    } catch (error) {
      console.warn('Failed to parse layer payload', error)
      return
    }

    const { layer: layerData, parentId = null } = parsed ?? {}
    if (!layerData) return

    const map = getMap?.()
    if (!map) return

    await yieldToUI()
    const nextLayer = deserializeLayerCompact(layerData, null)
    await yieldToUI()
    const updated = map.replaceLayer(nextLayer, parentId === undefined ? null : parentId)
    if (!updated) return

    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handlePolygonMessage = async (data) => {
    const payload = data.slice(5)
    let [layerId, pointsStr, areaId, precision] = payload.split(':')
    precision = parseFloat(precision) || 1
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(Number(layerId))
    if (!layer) return
    const points = pointsStr.split(',').map((value) => Number(value))
    const parsedAreaId = Number(areaId)
    for (let i = 0; i < points.length; i += 2) {
      layer.expandTo(points[i], points[i + 1])
    }
    const [px, py] = layer.pos ?? [0, 0]
    const [sx, sy] = layer.size ?? [1, 1]
    const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
    const newPoints = []
    for (let i = 0; i < points.length; i += 2) {
      newPoints.push([points[i], points[i + 1]])
    }
    const depth = Math.log2(layer.size[0] / precision)
    const targetArea = map.findArea(parsedAreaId)
    const clipAreas = targetArea?.clipAreas ?? []
    await yieldToUI()
    layer.quadtree.drawPolygon(newPoints, parsedAreaId, depth, bounds, undefined, clipAreas)
    await yieldToUI()
    layer.cleanup()
    await yieldToUI()
    layer.calculateAreas()
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleFillMessage = async (data) => {
    const payload = data.slice(5)
    const parts = payload.split(':')
    if (parts.length < 4) return
    const [layerIdStr, coordStr, areaIdStr, precisionStr] = parts
    const [xStr, yStr] = coordStr.split(',')
    const layerId = Number(layerIdStr)
    const x = Number(xStr)
    const y = Number(yStr)
    const areaId = Number(areaIdStr)
    const precision = parseFloat(precisionStr) || 1
    if (!Number.isFinite(layerId) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(areaId)) {
      return
    }
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(layerId)
    if (!layer) return
    await yieldToUI()
    layer.floodFill(x, y, areaId, precision)
    await yieldToUI()
    layer.cleanup()
    await yieldToUI()
    layer.calculateAreas()
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleDisconnectMessage = (data) => {
    const username = data.slice(11)
    delete getCursors?.()[username]
    updateCanvas?.()
  }

  const handleSetAreaNameMessage = (data) => {
    const payload = data.slice(5)
    const [areaIdStr, name] = payload.split(':')
    const areaId = Number(areaIdStr)
    const map = getMap?.()
    if (!map) return
    const area = map.findArea(areaId)
    if (!area) return
    area.name = name
    bumpMapUpdate?.()
  }

  const handleSetAreaColorMessage = (data) => {
    const payload = data.slice(5)
    const [areaIdStr, color] = payload.split(':')
    const areaId = Number(areaIdStr)
    const map = getMap?.()
    if (!map) return
    const area = map.findArea(areaId)
    if (!area) return
    area.color = color
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleSetLayerNameMessage = (data) => {
    const payload = data.slice(5)
    const [layerIdStr, name] = payload.split(':')
    const layerId = Number(layerIdStr)
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(layerId)
    if (!layer) return
    layer.name = name
    bumpMapUpdate?.()
  }

  const handleSetLayerOrderMessage = (data) => {
    const payload = data.slice(5)
    const [layerIdStr, newIndexStr] = payload.split(':')
    const layerId = Number(layerIdStr)
    const newIndex = Number(newIndexStr)
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(layerId)
    if (!layer || !layer.parent) return
    const currentIndex = layer.parent.children.indexOf(layer)
    if (currentIndex === -1 || currentIndex === newIndex) return
    layer.parent.children.splice(currentIndex, 1)
    layer.parent.children.splice(newIndex, 0, layer)
    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handleMergeAreasMessage = async (data) => {
    const payload = data.slice(5)
    const [layerId, areaIds] = payload.split(':')
    const ids = areaIds.split(',').map((id) => Number(id))
    if (ids.length < 2) return
    const map = getMap?.()
    if (!map) return
    const layer = map.findLayer(Number(layerId))
    if (!layer) return
    await yieldToUI()
    layer.mergeAreas(ids)
    await yieldToUI()
    bumpMapUpdate?.()
    updateCanvas?.()
    saveMap?.()
  }

  const handleAddClipMessage = (data) => {
    const payload = data.slice(8)
    const [areaIdStr, clipAreaIdStr] = payload.split(':')
    const areaId = Number(areaIdStr)
    const clipAreaId = Number(clipAreaIdStr)
    const map = getMap?.()
    if (!map) return
    const area = map.findArea(areaId)
    const clipArea = map.findArea(clipAreaId)
    if (!area || !clipArea) return
    if (area.clipAreas.find((a) => a.id === clipAreaId)) return
    area.clipAreas.push(clipArea.id)
    bumpMapUpdate?.()
  }

  const handleRemoveClipMessage = (data) => {
    const payload = data.slice(8)
    const [areaIdStr, clipAreaIdStr] = payload.split(':')
    const areaId = Number(areaIdStr)
    const clipAreaId = Number(clipAreaIdStr)
    const map = getMap?.()
    if (!map) return
    const area = map.findArea(areaId)
    if (!area) return
    const index = area.clipAreas.indexOf(clipAreaId)
    if (index === -1) return
    area.clipAreas.splice(index, 1)
    bumpMapUpdate?.()
  }

  const handleErrorMessage = (data) => {
    const message = data.slice(4)
    addLogEntry?.(`Error from server: ${message}`)
  }

  const handleMessage = async (data) => {
    if (data.startsWith('MAPC:')) {
      await handleMapCompactMessage(data)
    } else if (data.startsWith('MAP:')) {
      await handleMapMessage(data)
    } else if (data.startsWith('CURSOR:')) {
      handleCursorMessage(data)
    } else if (data.startsWith('NEWA:')) {
      handleNewAreaMessage(data)
    } else if (data.startsWith('NEWL:')) {
      handleNewLayerMessage(data)
    } else if (data.startsWith('LINE:')) {
      await handleLineMessage(data)
    } else if (data.startsWith('DELL:')) {
      handleDeleteLayerMessage(data)
    } else if (data.startsWith('DELA:')) {
      handleDeleteAreaMessage(data)
    } else if (data.startsWith('RECT:')) {
      await handleRectMessage(data)
    } else if (data.startsWith('POLY:')) {
      await handlePolygonMessage(data)
    } else if (data.startsWith('FILL:')) {
      await handleFillMessage(data)
    } else if (data.startsWith('LAYER:')) {
      await handleLayerMessage(data)
    } else if (data.startsWith('DISCONNECT:')) {
      handleDisconnectMessage(data)
    } else if (data.startsWith('SEAN:')) {
      handleSetAreaNameMessage(data)
    } else if (data.startsWith('SEAC:')) {
      handleSetAreaColorMessage(data)
    } else if (data.startsWith('SLNA:')) {
      handleSetLayerNameMessage(data)
    } else if (data.startsWith('LYOD:')) {
      handleSetLayerOrderMessage(data)
    } else if (data.startsWith('MERG:')) {
      await handleMergeAreasMessage(data)
    } else if (data.startsWith('ADDCLIP:')) {
      handleAddClipMessage(data)
    } else if (data.startsWith('REMCLIP:')) {
      handleRemoveClipMessage(data)
    } else if (data.startsWith('ERR:')) {
      handleErrorMessage(data)
    }
  }

  function enqueueMessage(data) {
    messageQueue.push(data)
    if (processingQueue) {
      return
    }
    processingQueue = true
    processQueue().catch(error => {
      console.warn('Failed to process websocket message queue', error)
    })
  }

  async function processQueue() {
    try {
      while (messageQueue.length > 0) {
        const next = messageQueue.shift()
        if (typeof next === 'undefined') {
          continue
        }
        try {
          await handleMessage(next)
        } catch (error) {
          console.warn('Failed to handle websocket message', error, { data: next })
        }
        await yieldToUI()
      }
    } finally {
      processingQueue = false
      if (messageQueue.length > 0 && !processingQueue) {
        processingQueue = true
        processQueue().catch(error => {
          console.warn('Failed to resume websocket message queue', error)
        })
      }
    }
  }

  const connect = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close()
    }
    let address = getWsAddress?.()
    if (!/:/.test(address)) {
      address += ':48829'
    }
    if (!address) return
    socket = new WebSocket(`ws://${address}`)
    if (onSocketChange) {
      onSocketChange(socket)
    }
    socket.onopen = () => {
      setConnected(true)
      addLogEntry?.('connected to websocket')
      const username = getUsername?.() ?? ''
      socket.send(`LOGIN:secret:${username}`)
      socket.send('LOADC')
    }
    socket.onmessage = (event) => {
      const { data } = event
      if (typeof data === 'string' && (data.startsWith('MAPC:') || data.startsWith('LAYER:'))) {
        addLogEntry?.(`${data.slice(0, 32)}...`)
      } else {
        addLogEntry?.(data)
      }
      enqueueMessage(data)
    }
    socket.onclose = () => {
      setConnected(false)
      addLogEntry?.('connection closed')
      socket = null
    }
    socket.onerror = (e) => {
      addLogEntry?.(`websocket error`)
      socket = null
      setConnected(false)
    }
  }

  const reloadMap = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send('LOADC')
    bumpMapUpdate?.()
  }

  const reloadLayer = (layerId) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    if (typeof layerId !== 'number' || !Number.isFinite(layerId)) return
    socket.send(`LOAD_LAYER:${Math.trunc(layerId)}`)
  }

  return {
    connect,
    reloadMap,
    reloadLayer,
  }
}
