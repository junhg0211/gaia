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

  const setConnected = (value) => {
    if (onConnectedChange) {
      onConnectedChange(value)
    }
  }

  const handleMapMessage = (data) => {
    const mapData = data.slice(4)
    const parsed = deserializeMap(JSON.parse(mapData))
    setMap(parsed)
    updateCanvas?.()
  }

  const handleMapCompactMessage = (data) => {
    const payload = data.slice(5)
    const parsed = deserializeMapCompact(JSON.parse(payload))
    setMap(parsed)
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

  const handleLineMessage = (data) => {
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
    layer.quadtree.drawLine(x1, y1, x2, y2, width, areaId, depth, bounds)
    layer.cleanup()
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

  const handleRectMessage = (data) => {
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
    layer.quadtree.drawRect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.max(x1, x2),
      Math.max(y1, y2),
      parsedAreaId,
      depth,
      bounds,
    )
    layer.cleanup()
    updateCanvas?.()
  }

  const handleLayerMessage = (data) => {
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

    const nextLayer = deserializeLayerCompact(layerData, null)
    const updated = map.replaceLayer(nextLayer, parentId === undefined ? null : parentId)
    if (!updated) return

    bumpMapUpdate?.()
    updateCanvas?.()
  }

  const handlePolygonMessage = (data) => {
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
    layer.quadtree.drawPolygon(newPoints, parsedAreaId, depth, bounds)
    layer.cleanup()
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

  const handleErrorMessage = (data) => {
    const message = data.slice(4)
    addLogEntry?.(`Error from server: ${message}`)
  }

  const handleMessage = (data) => {
    if (data.startsWith('MAPC:')) {
      handleMapCompactMessage(data)
    } else if (data.startsWith('MAP:')) {
      handleMapMessage(data)
    } else if (data.startsWith('CURSOR:')) {
      handleCursorMessage(data)
    } else if (data.startsWith('NEWA:')) {
      handleNewAreaMessage(data)
    } else if (data.startsWith('NEWL:')) {
      handleNewLayerMessage(data)
    } else if (data.startsWith('LINE:')) {
      handleLineMessage(data)
    } else if (data.startsWith('DELL:')) {
      handleDeleteLayerMessage(data)
    } else if (data.startsWith('DELA:')) {
      handleDeleteAreaMessage(data)
    } else if (data.startsWith('RECT:')) {
      handleRectMessage(data)
    } else if (data.startsWith('POLY:')) {
      handlePolygonMessage(data)
    } else if (data.startsWith('LAYER:')) {
      handleLayerMessage(data)
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
    } else if (data.startsWith('ERR:')) {
      handleErrorMessage(data)
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
      handleMessage(data)
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
