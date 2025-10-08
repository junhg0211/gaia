import { tick } from 'svelte'
import { Area, serializeLayerCompact } from '../dataframe.js'
import { createMapRenderer } from './quadtreeRenderer.js'
import {
  formatWorldArea,
  formatWorldCoordinate,
  formatWorldDistance,
  formatDistanceFromMeters,
  worldToMeters,
} from './units.js'

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function buildTools({
  camera,
  panState,
  updateCanvas,
  getCanvas,
  getCanvasRect,
  getSelectedArea,
  getMap,
  sendMessage,
  setCurrentTool,
  setSelectedArea,
  bumpMapUpdate,
  onImageProcessingStart = () => {},
  onImageProcessingProgress = () => {},
  onImageProcessingComplete = () => {},
}) {
  const ensureCanvasRect = () => getCanvasRect() ?? null

  const toWorldPoint = (clientX, clientY) => {
    const rect = ensureCanvasRect()
    if (!rect) return null
    return {
      x: camera.toWorldX(clientX - rect.left),
      y: camera.toWorldY(clientY - rect.top),
    }
  }

  const zoomVars = {
    zooming: false,
    startX: 0,
    startY: 0,
    initialZoom: 1,
  }

  const lineVars = {
    brushing: false,
    width: 10,
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
  }

  const rectVars = {
    brushing: false,
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
  }

  const polygonVars = {
    brushing: false,
    points: [],
    toX: 0,
    toY: 0,
  }

  const brushVars = {
    brushing: false,
    width: 10,
    previousX: 0,
    previousY: 0,
    mouseX: 0,
    mouseY: 0,
  }

  const lassoVars = {
    active: false,
    points: [],
  }

  const fillVars = {}

  const imageVars = {
    image: null,
    positionX: 0,
    positionY: 0,
    scale: 1,
    phase: 'idle',
    nearestEdge: null,
    startX: 0,
    startY: 0,
  }

  const mergeVars = {
    area: null,
  }

  const tools = [
    {
      name: '선택',
      icon: 'cursor',
      hotkey: 'v',
    },
    {
      name: '패닝',
      icon: 'arrows-move',
      hotkey: 'h',
      onmousedown: (event) => {
        if (event.button === 0) {
          panState.active = true
          panState.startX = event.clientX
          panState.startY = event.clientY
          panState.initialCameraX = camera.x
          panState.initialCameraY = camera.y
        }
      },
      onmousemove: (event) => {
        if (!panState.active) return
        const deltaX = (event.clientX - panState.startX) / camera.zoom
        const deltaY = (event.clientY - panState.startY) / camera.zoom
        camera.x = panState.initialCameraX - deltaX
        camera.y = panState.initialCameraY - deltaY
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button === 0) {
          panState.active = false
        }
      },
    },
    {
      name: '확대',
      icon: 'zoom-in',
      hotkey: 'z',
      vars: zoomVars,
      onmousedown: (event) => {
        if (event.button === 0) {
          zoomVars.startX = event.clientX
          zoomVars.startY = event.clientY
          zoomVars.initialZoom = camera.zoom
          zoomVars.zooming = true
        }
      },
      onmousemove: (event) => {
        if (!zoomVars.zooming) return
        const delta = event.clientY + event.clientX - (zoomVars.startY + zoomVars.startX)
        camera.setZoom(zoomVars.initialZoom * Math.exp(delta * 0.005))
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button === 0) {
          zoomVars.zooming = false
        }
      },
    },
    {
      name: '선',
      icon: 'type-underline',
      hotkey: 'l',
      vars: lineVars,
      onmousedown: (event) => {
        if (event.button === 0) {
          lineVars.x = event.clientX
          lineVars.y = event.clientY
          lineVars.brushing = true
        }
      },
      onmousemove: (event) => {
        if (lineVars.brushing) {
          if (event.button !== 0) return
          lineVars.toX = event.clientX
          lineVars.toY = event.clientY
          updateCanvas()
        } else {
          lineVars.x = event.clientX
          lineVars.y = event.clientY
          updateCanvas()
        }
      },
      onmouseup: (event) => {
        if (!lineVars.brushing) return
        if (event.button !== 0) return
        lineVars.brushing = false
        const selectedArea = getSelectedArea()
        const canvas = getCanvas()
        if (!selectedArea || !canvas) return
        const fromWorld = toWorldPoint(lineVars.x, lineVars.y)
        const toWorld = toWorldPoint(event.clientX, event.clientY)
        if (!fromWorld || !toWorld) return
        const precision = 1 / camera.zoom;
        sendMessage("SNAP");
        sendMessage(`LINE:${selectedArea.parent.id}:${fromWorld.x},${fromWorld.y}:${toWorld.x},${toWorld.y}:${selectedArea.id},${lineVars.width}:${precision}`)
        lineVars.x = event.clientX
        lineVars.y = event.clientY
        updateCanvas()
      },
      onwheel: () => {},
      render: (ctx) => {
        if (lineVars.brushing) {
          const rect = ensureCanvasRect()
          if (!rect) return
          const startX = lineVars.x - rect.left
          const startY = lineVars.y - rect.top
          const endX = lineVars.toX - rect.left
          const endY = lineVars.toY - rect.top
          ctx.fillStyle = 'blue'
          ctx.beginPath()
          ctx.arc(startX, startY, lineVars.width * camera.zoom / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(endX, endY, lineVars.width * camera.zoom / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'blue'
          ctx.lineWidth = lineVars.width * camera.zoom
          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.lineTo(endX, endY)
          ctx.stroke()
        } else {
          const rect = ensureCanvasRect()
          if (!rect) return
          const x = lineVars.x - rect.left
          const y = lineVars.y - rect.top
          ctx.strokeStyle = 'black'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x - 10, y)
          ctx.lineTo(x + 10, y)
          ctx.moveTo(x, y - 10)
          ctx.lineTo(x, y + 10)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x, y, lineVars.width * camera.zoom / 2, 0, Math.PI * 2)
          ctx.stroke()
        }
      },
      onkeydown: (event) => {
        if (event.key === '[') {
          lineVars.width = Math.max(5, lineVars.width - 5)
        } else if (event.key === ']') {
          lineVars.width = Math.min(300, lineVars.width + 5)
        }
        updateCanvas()
      }
    },
    {
      name: '사각형',
      icon: 'square',
      hotkey: 'm',
      vars: rectVars,
      onmousedown: (event) => {
        if (event.button === 0) {
          rectVars.x = event.clientX
          rectVars.y = event.clientY
          rectVars.toX = event.clientX
          rectVars.toY = event.clientY
          rectVars.brushing = true
        }
      },
      onmousemove: (event) => {
        if (event.button !== 0) return
        if (!rectVars.brushing) return
        rectVars.toX = event.clientX
        rectVars.toY = event.clientY
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button !== 0) return
        if (!rectVars.brushing) return
        rectVars.brushing = false
        const selectedArea = getSelectedArea()
        const map = getMap()
        const canvas = getCanvas()
        if (!selectedArea || !map || !canvas) return
        const fromWorld = toWorldPoint(rectVars.x, rectVars.y)
        const toWorld = toWorldPoint(event.clientX, event.clientY)
        if (!fromWorld || !toWorld) return
        const x1 = Math.min(fromWorld.x, toWorld.x)
        const y1 = Math.min(fromWorld.y, toWorld.y)
        const x2 = Math.max(fromWorld.x, toWorld.x)
        const y2 = Math.max(fromWorld.y, toWorld.y)
        const precision = 1 / camera.zoom;
        sendMessage("SNAP");
        sendMessage(`RECT:${selectedArea.parent.id}:${x1},${y1}:${x2},${y2}:${selectedArea.id}:${precision}`)
        updateCanvas()
      },
      render: (ctx) => {
        if (!rectVars.brushing) return
        const rect = ensureCanvasRect()
        if (!rect) return
        const x = Math.min(rectVars.x, rectVars.toX) - rect.left
        const y = Math.min(rectVars.y, rectVars.toY) - rect.top
        const width = Math.abs(rectVars.toX - rectVars.x)
        const height = Math.abs(rectVars.toY - rectVars.y)
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, width, height)
      },
    },
    {
      name: '다각형',
      icon: 'hexagon',
      hotkey: 'p',
      vars: polygonVars,
      onmouseup: (event) => {
        if (event.button === 0) {
          if (!polygonVars.brushing) {
            polygonVars.points = []
            polygonVars.brushing = true
          }
          polygonVars.points.push({ x: event.clientX, y: event.clientY })
          updateCanvas()
        } else if (event.button === 2) {
          if (!polygonVars.brushing || polygonVars.points.length < 3) return
          polygonVars.brushing = false
          const selectedArea = getSelectedArea()
          const map = getMap()
          const canvas = getCanvas()
          if (!selectedArea || !map || !canvas) return
          const worldPoints = polygonVars.points.map((point) => {
            const wp = toWorldPoint(point.x, point.y)
            return wp ? `${wp.x},${wp.y}` : null
          }).filter(Boolean)
          if (worldPoints.length !== polygonVars.points.length) return
          const precision = 1 / camera.zoom;
          sendMessage("SNAP");
          sendMessage(`POLY:${selectedArea.parent.id}:${worldPoints.join(',')}:${selectedArea.id}:${precision}`)
          updateCanvas()
        }
      },
      onmousemove: (event) => {
        if (!polygonVars.brushing) return
        polygonVars.toX = event.clientX
        polygonVars.toY = event.clientY
        updateCanvas()
      },
      render: (ctx) => {
        if (!polygonVars.brushing || polygonVars.points.length === 0) return
        const rect = ensureCanvasRect()
        if (!rect) return
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(polygonVars.points[0].x - rect.left, polygonVars.points[0].y - rect.top)
        for (let i = 1; i < polygonVars.points.length; i += 1) {
          ctx.lineTo(polygonVars.points[i].x - rect.left, polygonVars.points[i].y - rect.top)
        }
        ctx.lineTo(polygonVars.toX - rect.left, polygonVars.toY - rect.top)
        ctx.stroke()

        for (const point of polygonVars.points) {
          ctx.fillStyle = 'blue'
          ctx.beginPath()
          ctx.arc(point.x - rect.left, point.y - rect.top, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      },
    },
    {
      name: '브러시',
      icon: 'brush',
      hotkey: 'b',
      vars: brushVars,
      onmousedown: (event) => {
        if (event.button === 0) {
          brushVars.brushing = true
          brushVars.previousX = event.clientX
          brushVars.previousY = event.clientY
          brushVars.mouseX = event.clientX
          brushVars.mouseY = event.clientY
          sendMessage("SNAP");
        }
      },
      onmousemove: (event) => {
        brushVars.mouseX = event.clientX
        brushVars.mouseY = event.clientY
        updateCanvas()

        if (event.button !== 0) return
        if (!brushVars.brushing) return
        const selectedArea = getSelectedArea()
        const canvas = getCanvas()
        if (!selectedArea || !canvas) return
        const start = toWorldPoint(brushVars.previousX, brushVars.previousY)
        const end = toWorldPoint(event.clientX, event.clientY)
        if (!start || !end) return
        const width = brushVars.width / camera.zoom
        const precision = 1 / camera.zoom;
        sendMessage(`LINE:${selectedArea.parent.id}:${start.x},${start.y}:${end.x},${end.y}:${selectedArea.id},${width}:${precision}`)
        brushVars.previousX = event.clientX
        brushVars.previousY = event.clientY
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button === 0) {
          brushVars.brushing = false
        }
      },
      onkeydown: (event) => {
        if (event.key === '[') {
          brushVars.width = Math.max(5, brushVars.width - 5)
          updateCanvas()
        } else if (event.key === ']') {
          brushVars.width = Math.min(300, brushVars.width + 5)
          updateCanvas()
        }
      },
      render: (ctx) => {
        const rect = ensureCanvasRect()
        if (!rect) return
        const x = brushVars.mouseX - rect.left
        const y = brushVars.mouseY - rect.top
        ctx.strokeStyle = 'black'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, brushVars.width / 2, 0, Math.PI * 2)
        ctx.stroke()
      },
    },
    {
      name: '페인트 통',
      icon: 'paint-bucket',
      hotkey: 'g',
      vars: fillVars,
      onmousedown: (event) => {
        if (event.button !== 0) return
        const selectedArea = getSelectedArea()
        const canvas = getCanvas()
        if (!selectedArea || !canvas) return

        const map = getMap?.()
        const canonicalArea = typeof map?.findArea === 'function'
          ? map.findArea(selectedArea.id)
          : selectedArea
        const targetArea = canonicalArea ?? selectedArea
        const layer = targetArea?.parent ?? selectedArea.parent
        if (!layer || typeof layer.sampleValueAt !== 'function') return

        const worldPoint = toWorldPoint(event.clientX, event.clientY)
        if (!worldPoint) return

        const precision = Math.max(1 / camera.zoom, 1e-6)
        sendMessage('SNAP')
        sendMessage(`FILL:${layer.id}:${worldPoint.x},${worldPoint.y}:${targetArea.id}:${precision}`)
      },
    },
    {
      name: "거리 측정",
      icon: 'rulers',
      hotkey: 'u',
      vars: lineVars,
      onstart: () => {
        lineVars.x = 0
        lineVars.y = 0
        lineVars.toX = 0
        lineVars.toY = 0
        lineVars.brushing = false
      },
      onmousedown: (event) => {
        if (event.button === 0) {
          lineVars.x = event.clientX
          lineVars.y = event.clientY
          lineVars.brushing = true
        }
      },
      onmousemove: (event) => {
        if (event.button !== 0) return
        if (!lineVars.brushing) return
        lineVars.toX = event.clientX
        lineVars.toY = event.clientY
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button !== 0) return
        if (!lineVars.brushing) return
        lineVars.brushing = false
      },
      render: (ctx) => {
        const rect = ensureCanvasRect()
        if (!rect) return
        const startX = lineVars.x - rect.left
        const startY = lineVars.y - rect.top
        const endX = lineVars.toX - rect.left
        const endY = lineVars.toY - rect.top
        ctx.strokeStyle = 'green'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        ctx.stroke()

        const fromWorld = toWorldPoint(lineVars.x, lineVars.y)
        const toWorld = toWorldPoint(lineVars.toX, lineVars.toY)
        if (!fromWorld || !toWorld) return
        const dx = toWorld.x - fromWorld.x
        const dy = toWorld.y - fromWorld.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        function numberWithCommas(x) {
          return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
        }
        const distanceStr = numberWithCommas(distance.toFixed(2));

        ctx.font = '14px Arial'
        const textwidth = ctx.measureText(`${distanceStr} m`).width
        ctx.fillStyle = 'white'
        ctx.fillRect((startX + endX) / 2 - textwidth / 2 - 4, (startY + endY) / 2 - 20, textwidth + 8, 16)

        ctx.fillStyle = 'black'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${distanceStr} m`, (startX + endX) / 2, (startY + endY) / 2 - 5)
      },
    },
    {
      name: "올가미",
      icon: 'feather',
      hotkey: 'f',
      vars: {
        active: false,
        points: [],
      },
      onstart: () => {
        lassoVars.active = false
        lassoVars.points = []
      },
      onmousedown: (event) => {
        if (event.button === 0) {
          lassoVars.active = true
          lassoVars.points = [{ x: event.clientX, y: event.clientY }]
        }
      },
      onmousemove: (event) => {
        if (!lassoVars.active) return
        lassoVars.points.push({ x: event.clientX, y: event.clientY })
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button !== 0) return
        if (!lassoVars.active) return
        lassoVars.active = false
        const selectedArea = getSelectedArea()
        const map = getMap()
        const canvas = getCanvas()
        if (!selectedArea || !map || !canvas) return
        if (lassoVars.points.length < 3) {
          lassoVars.points = []
          updateCanvas()
          return
        }
        const worldPoints = lassoVars.points.map((point) => {
          const wp = toWorldPoint(point.x, point.y)
          return wp ? `${wp.x},${wp.y}` : null
        }).filter(Boolean)
        if (worldPoints.length !== lassoVars.points.length) {
          lassoVars.points = []
          updateCanvas()
          return
        }
        const precision = 1 / camera.zoom;
        sendMessage("SNAP");
        sendMessage(`POLY:${selectedArea.parent.id}:${worldPoints.join(',')}:${selectedArea.id}:${precision}`)
        lassoVars.points = []
        updateCanvas()
      },
      render: (ctx) => {
        if (lassoVars.points.length === 0) return
        const rect = ensureCanvasRect()
        if (!rect) return
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(lassoVars.points[0].x - rect.left, lassoVars.points[0].y - rect.top)
        for (let i = 1; i < lassoVars.points.length; i += 1) {
          ctx.lineTo(lassoVars.points[i].x - rect.left, lassoVars.points[i].y - rect.top)
        }
        if (lassoVars.active) {
          ctx.lineTo(lassoVars.points[lassoVars.points.length - 1].x - rect.left, lassoVars.points[lassoVars.points.length - 1].y - rect.top)
        } else {
          ctx.closePath()
        }
        ctx.stroke()
      },
    },
    {
      name: "이미지 삽입",
      icon: 'image',
      hotkey: 'a',
      onstart: () => {
        imageVars.image = null
        imageVars.positionX = 0
        imageVars.positionY = 0
        imageVars.scale = 1
        imageVars.phase = 'idle'
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = (e) => {
          const file = e.target.files[0]
          if (!file) { return }
          const reader = new FileReader()
          reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
              imageVars.image = img
              updateCanvas()
            }
            img.src = event.target.result
          }
          reader.readAsDataURL(file)
        }
        input.click()
      },
      onend: async () => {
        if (imageVars.phase !== 'resizing' || !imageVars.image) return

        imageVars.phase = 'idle'
        imageVars.nearestEdge = null

        const selectedArea = getSelectedArea()
        const layer = selectedArea?.parent
        const quadtree = layer?.quadtree
        if (!layer || !quadtree) return

        const image = imageVars.image
        const pixelScale = imageVars.scale
        const originX = imageVars.positionX
        const originY = imageVars.positionY
        const worldWidth = image.width * pixelScale
        const worldHeight = image.height * pixelScale

        layer.expandTo(originX, originY)
        layer.expandTo(originX + worldWidth, originY + worldHeight)

        const [layerX, layerY] = layer.pos ?? [0, 0]
        const [layerWidth, layerHeight] = layer.size ?? [1, 1]
        const layerBounds = {
          minX: layerX,
          minY: layerY,
          maxX: layerX + layerWidth,
          maxY: layerY + layerHeight,
        }

        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (!context) {
          updateCanvas()
          return
        }
        context.imageSmoothingEnabled = false
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, image.width, image.height)

        const colorToArea = new Map()

        const ensureArea = (hexColor) => {
          if (colorToArea.has(hexColor)) return colorToArea.get(hexColor)
          const existing = layer.areas.find(areaItem => areaItem.color.toLowerCase() === hexColor)
          if (existing) {
            colorToArea.set(hexColor, existing)
            return existing
          }
          const area = new Area(null, hexColor, layer, hexColor)
          layer.areas.push(area)
          colorToArea.set(hexColor, area)
          return area
        }

        const depth = Math.max(0, Math.log2(layerWidth / Math.max(pixelScale, Number.EPSILON)))

        const toHex = (r, g, b) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`

        const totalPixels = image.width * image.height
        if (totalPixels === 0) {
          onImageProcessingStart()
          onImageProcessingProgress({ percent: 1, stage: '완료', etaSeconds: 0 })
          onImageProcessingComplete()
          imageVars.image = null
          updateCanvas()
          return
        }

        const extraSteps = 2
        const totalWork = totalPixels + extraSteps
        let processedPixels = 0
        let extraCompleted = 0

        const yieldEvery = Math.max(1, Math.floor(image.height / 60))
        const yieldControl = (() => {
          const hasDocument = typeof document !== 'undefined'

          const createFastYield = () => {
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

            if (typeof queueMicrotask === 'function') {
              return () => new Promise(resolve => queueMicrotask(resolve))
            }

            if (typeof setImmediate === 'function') {
              return () => new Promise(resolve => setImmediate(resolve))
            }

            return () => new Promise(resolve => setTimeout(resolve, 0))
          }

          const fastYield = createFastYield()
          const rafYield = typeof requestAnimationFrame === 'function'
            ? () => new Promise(resolve => requestAnimationFrame(() => resolve()))
            : fastYield

          const shouldSkipRaf = () => {
            if (!hasDocument) return true
            if (typeof document.hidden === 'boolean' && document.hidden) return true
            if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true
            return false
          }

          return () => {
            return shouldSkipRaf() ? fastYield() : rafYield()
          }
        })()

        const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now()
        const startTime = nowMs()

        const reportProgress = (stage) => {
          const processedUnits = Math.min(totalWork, processedPixels + extraCompleted)
          const elapsedSeconds = (nowMs() - startTime) / 1000
          let eta = null
          if (processedUnits > 0 && processedUnits < totalWork && elapsedSeconds > 1e-6) {
            const rate = processedUnits / elapsedSeconds
            if (rate > 1e-6) {
              eta = (totalWork - processedUnits) / rate
            }
          }
          const percent = totalWork === 0 ? 1 : processedUnits / totalWork
          onImageProcessingProgress({
            percent,
            stage,
            etaSeconds: eta,
          })
        }

        let processingStarted = false
        onImageProcessingStart()
        processingStarted = true
        reportProgress('초기화 중')

        try {
          await yieldControl()
          sendMessage('SNAP')

          const alphaThreshold = 16
          const visited = new Uint8Array(totalPixels)
          const progressInterval = Math.max(1, Math.floor(totalPixels / 200))
          const yieldPixelThreshold = Math.max(5000, Math.floor(totalPixels / 120))
          let lastProgressPixels = 0
          let lastYieldAt = 0

          const maybeReport = (stage) => {
            if (processedPixels - lastProgressPixels >= progressInterval || processedPixels === totalPixels) {
              reportProgress(stage)
              lastProgressPixels = processedPixels
            }
          }

          const maybeYield = async () => {
            if (processedPixels - lastYieldAt >= yieldPixelThreshold) {
              await yieldControl()
              lastYieldAt = processedPixels
            }
          }

          // Group contiguous pixels with the same color into larger rectangles
          // so we avoid per-pixel quadtree writes when importing images.
          for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
              const flatIndex = y * image.width + x
              if (visited[flatIndex]) continue

              const baseIndex = flatIndex * 4
              const alpha = data[baseIndex + 3]

              if (alpha < alphaThreshold) {
                visited[flatIndex] = 1
                processedPixels += 1
                maybeReport('픽셀 묶음 변환 중')
                await maybeYield()
                continue
              }

              const r = data[baseIndex]
              const g = data[baseIndex + 1]
              const b = data[baseIndex + 2]
              const hexColor = toHex(r, g, b).toLowerCase()
              const area = ensureArea(hexColor)

              let xEnd = x + 1
              while (xEnd < image.width) {
                const nextFlat = y * image.width + xEnd
                if (visited[nextFlat]) break
                const pixelIndex = nextFlat * 4
                if (data[pixelIndex + 3] < alphaThreshold) break
                if (data[pixelIndex] !== r || data[pixelIndex + 1] !== g || data[pixelIndex + 2] !== b) break
                xEnd += 1
              }

              let yEnd = y + 1
              let canExtend = true
              while (canExtend && yEnd < image.height) {
                for (let xx = x; xx < xEnd; xx++) {
                  const extendFlat = yEnd * image.width + xx
                  if (visited[extendFlat]) {
                    canExtend = false
                    break
                  }
                  const extendIndex = extendFlat * 4
                  if (data[extendIndex + 3] < alphaThreshold) {
                    canExtend = false
                    break
                  }
                  if (data[extendIndex] !== r || data[extendIndex + 1] !== g || data[extendIndex + 2] !== b) {
                    canExtend = false
                    break
                  }
                }
                if (canExtend) {
                  yEnd += 1
                }
              }

              const minX = originX + x * pixelScale
              const minY = originY + y * pixelScale
              const maxX = originX + xEnd * pixelScale
              const maxY = originY + yEnd * pixelScale

              quadtree.drawRect(minX, minY, maxX, maxY, area.id, depth, layerBounds)

              for (let yy = y; yy < yEnd; yy++) {
                const rowOffset = yy * image.width
                visited.fill(1, rowOffset + x, rowOffset + xEnd)
              }

              const rectPixels = (xEnd - x) * (yEnd - y)
              processedPixels += rectPixels
              maybeReport('픽셀 묶음 변환 중')
              await maybeYield()

              x = xEnd - 1
            }

            if (y % yieldEvery === 0) {
              await yieldControl()
              lastYieldAt = processedPixels
            }
          }

          processedPixels = totalPixels
          reportProgress('픽셀 묶음 변환 중')

          extraCompleted = Math.min(extraSteps, extraCompleted + 1)
          reportProgress('레이어 압축 중')
          await yieldControl()

          const payload = {
            parentId: layer.parent ? layer.parent.id : null,
            layer: serializeLayerCompact(layer),
          }

          extraCompleted = Math.min(extraSteps, extraCompleted + 1)
          reportProgress('레이어 전송 중')
          await yieldControl()

          sendMessage(`SET_LAYER:${layer.id}:${JSON.stringify(payload)}`)
        } catch (error) {
          console.warn('Image processing failed', error)
          reportProgress('오류 발생')
        } finally {
          if (processingStarted) {
            extraCompleted = extraSteps
            reportProgress('마무리 중')
            onImageProcessingComplete()
          }
          imageVars.image = null
          updateCanvas()
        }
      },
      onmousedown: (event) => {
        if (!imageVars.image) {
          setCurrentTool(tools[0]) // 선택 툴로 변경
          return
        }

        if (event.button === 0 && imageVars.image && imageVars.phase === 'idle') {
          const rect = ensureCanvasRect()
          imageVars.positionX = camera.toWorldX(event.clientX - (rect ? rect.left : 0))
          imageVars.positionY = camera.toWorldY(event.clientY - (rect ? rect.top : 0))
          imageVars.phase = 'positioning'
          updateCanvas()
        }

        if (event.button === 0 && imageVars.phase === 'resizing' && imageVars.nearestEdge) {
          // resizing start
          imageVars.phase = `resize-${imageVars.nearestEdge}`
        }
      },
      render: (ctx) => {
        if (imageVars.phase === 'idle') return
        if (!imageVars.image) return
        const rect = ensureCanvasRect()
        if (!rect) return
        const x = camera.toScreenX(imageVars.positionX)
        const y = camera.toScreenY(imageVars.positionY)
        const width = imageVars.image.width * camera.zoom * imageVars.scale
        const height = imageVars.image.height * camera.zoom * imageVars.scale
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, width, height)
        ctx.drawImage(imageVars.image, x, y, width, height)
        // text: position and scale
        ctx.font = '14px Arial'
        ctx.fillStyle = 'black'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        const posText = `(${formatWorldCoordinate(imageVars.positionX)}, ${formatWorldCoordinate(imageVars.positionY)})`
        const widthText = `W: ${formatWorldDistance(imageVars.image.width * imageVars.scale)}`
        const heightText = `H: ${formatWorldDistance(imageVars.image.height * imageVars.scale)}`
        ctx.fillText(`${posText} ${widthText} ${heightText}`, x + 4, y + height + 4)
      },
      onmousemove: (event) => {
        if (imageVars.phase === 'positioning') {
          const rect = ensureCanvasRect()
          if (!rect) return
          const mouseX = event.clientX - rect.left
          const mouseY = event.clientY - rect.top
          imageVars.scale = (camera.toWorldX(mouseX) - imageVars.positionX) / imageVars.image.width
          imageVars.scale = Math.max(0, imageVars.scale)
          updateCanvas()
        }

        if (imageVars.phase === 'resizing') {
          // change cursor based on position
          const rect = ensureCanvasRect()
          if (!rect) return
          const x = camera.toScreenX(imageVars.positionX)
          const y = camera.toScreenY(imageVars.positionY)
          const mouseX = event.clientX - rect.left
          const mouseY = event.clientY - rect.top
          const width = imageVars.image.width * camera.zoom * imageVars.scale
          const height = imageVars.image.height * camera.zoom * imageVars.scale

          const edgeSize = 10
          if (mouseX >= x + width - edgeSize && mouseX <= x + width + edgeSize) {
            if (mouseY >= y + height - edgeSize && mouseY <= y + height + edgeSize) {
              document.body.style.cursor = 'nwse-resize'
              imageVars.nearestEdge = 'bottom-right'
            } else if (mouseY >= y && mouseY <= y + height) {
              document.body.style.cursor = 'ew-resize'
              imageVars.nearestEdge = 'right'
            }
          } else if (mouseY >= y + height - edgeSize && mouseY <= y + height + edgeSize && mouseX >= x && mouseX <= x + width) {
            document.body.style.cursor = 'ns-resize'
            imageVars.nearestEdge = 'bottom'
          } else if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height) {
            document.body.style.cursor = 'move'
            imageVars.nearestEdge = 'whole'
            const rect = ensureCanvasRect()
            imageVars.startX = camera.toWorldX(event.clientX - (rect ? rect.left : 0))
            imageVars.startY = camera.toWorldY(event.clientY - (rect ? rect.top : 0))
          } else {
            document.body.style.cursor = 'default'
            imageVars.nearestEdge = null
          }
        }

        if (imageVars.phase.startsWith('resize-') && imageVars.nearestEdge) {
          const rect = ensureCanvasRect()
          if (!rect) return
          const mouseWorldX = camera.toWorldX(event.clientX - rect.left)
          const mouseWorldY = camera.toWorldY(event.clientY - rect.top)
          switch (imageVars.nearestEdge) {
            case 'bottom-right':
            case 'right':
              imageVars.scale = (mouseWorldX - imageVars.positionX) / imageVars.image.width
              imageVars.scale = Math.max(0, imageVars.scale)
              break
            case 'bottom':
              imageVars.scale = (mouseWorldY - imageVars.positionY) / imageVars.image.height
              imageVars.scale = Math.max(0, imageVars.scale)
              break
            case 'whole':
              const currentWorldX = camera.toWorldX(event.clientX - (rect ? rect.left : 0))
              const currentWorldY = camera.toWorldY(event.clientY - (rect ? rect.top : 0))
              const dx = currentWorldX - imageVars.startX
              const dy = currentWorldY - imageVars.startY
              imageVars.positionX += dx
              imageVars.positionY += dy
              imageVars.startX = currentWorldX
              imageVars.startY = currentWorldY
              break
            default:
              break
          }

          updateCanvas()
        }
      },
      onmouseup: (event) => {
        if (event.button !== 0) return

        if (imageVars.phase === 'positioning') {
          imageVars.phase = 'resizing'
        }

        if (imageVars.phase.startsWith('resize-')) {
          imageVars.phase = 'resizing'
          imageVars.nearestEdge = null
          document.body.style.cursor = 'default'
        }
      }
    },
    {
      name: '다각형 넓이 측정',
      icon: 'beaker',
      hotkey: 'o',
      vars: polygonVars,
      onstart: () => {
        polygonVars.points = []
        polygonVars.toX = 0
        polygonVars.toY = 0
        polygonVars.brushing = false
      },
      onmouseup: (event) => {
        if (event.button === 0) {
          if (!polygonVars.brushing) {
            polygonVars.points = []
            polygonVars.brushing = true
          }
          polygonVars.points.push({ x: event.clientX, y: event.clientY })
          updateCanvas()
        }
      },
      onmousemove: (event) => {
        if (!polygonVars.brushing) return
        polygonVars.toX = event.clientX
        polygonVars.toY = event.clientY
        updateCanvas()
      },
      render: (ctx) => {
        if (!polygonVars.brushing || polygonVars.points.length === 0) return
        const rect = ensureCanvasRect()
        if (!rect) return
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(polygonVars.points[0].x - rect.left, polygonVars.points[0].y - rect.top)
        for (let i = 1; i < polygonVars.points.length; i += 1) {
          ctx.lineTo(polygonVars.points[i].x - rect.left, polygonVars.points[i].y - rect.top)
        }
        ctx.lineTo(polygonVars.toX - rect.left, polygonVars.toY - rect.top)
        ctx.stroke()

        for (const point of polygonVars.points) {
          ctx.fillStyle = 'blue'
          ctx.beginPath()
          ctx.arc(point.x - rect.left, point.y - rect.top, 5, 0, Math.PI * 2)
          ctx.fill()
        }

        if (polygonVars.points.length < 3) return

        const worldPoints = polygonVars.points.map((point) => {
          const wp = toWorldPoint(point.x, point.y)
          return wp ? { x: wp.x, y: wp.y } : null
        }).filter(Boolean)
        if (worldPoints.length !== polygonVars.points.length) return

        let area = 0
        for (let i = 0; i < worldPoints.length; i++) {
          const j = (i + 1) % worldPoints.length
          area += worldPoints[i].x * worldPoints[j].y
          area -= worldPoints[j].x * worldPoints[i].y
        }
        area = Math.abs(area) / 2

        ctx.beginPath()
        ctx.moveTo(polygonVars.points[0].x - rect.left, polygonVars.points[0].y - rect.top)
        for (let i = 1; i < polygonVars.points.length; i += 1) {
          ctx.lineTo(polygonVars.points[i].x - rect.left, polygonVars.points[i].y - rect.top)
        }
        ctx.closePath()
        ctx.fillStyle = 'rgba(0, 0, 255, 0.1)'
        ctx.fill()

        // 화면에 넓이 표시
        const centroid = worldPoints.reduce((acc, point) => ({
          x: acc.x + point.x / worldPoints.length,
          y: acc.y + point.y / worldPoints.length,
        }), { x: 0, y: 0 })
        const screenX = camera.toScreenX(centroid.x)
        const screenY = camera.toScreenY(centroid.y)

        ctx.font = '14px Arial'
        const areaStr = formatWorldArea(area)
        const textwidth = ctx.measureText(areaStr).width
        ctx.fillStyle = 'white'
        ctx.fillRect(screenX - textwidth / 2 - 4, screenY - 20, textwidth + 8, 16)

        ctx.fillStyle = 'black'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(areaStr, screenX, screenY - 5)
      },
    },
    {
      name: '영역 합치기',
      icon: 'link',
      hotkey: 'r',
      vars: mergeVars,
      onstart: () => {
        mergeVars.area = getSelectedArea()
        if (!mergeVars.area) {
          setCurrentTool(tools[0]) // 선택 툴로 변경
        }
      },
      onend: () => {
        const to = getSelectedArea()
        if (mergeVars.area && to && mergeVars.area !== to && mergeVars.area.parent === to.parent) {
          const layer = mergeVars.area.parent
          const quadtree = layer?.quadtree
          if (!quadtree) return

          sendMessage("SNAP");
          sendMessage(`MERG:${layer.id}:${mergeVars.area.id},${to.id}`)
          console.log(`Merging area ${mergeVars.area.id} into ${to.id}`)
        }
      }
    },
    {
      name: '스포이드',
      icon: 'eyedropper',
      hotkey: 'i',
      onmouseup: (event) => {
        if (event.button !== 0) return
        const selectedArea = getSelectedArea()
        const layer = selectedArea?.parent
        const quadtree = layer?.quadtree
        if (!layer || !quadtree) return

        const x = camera.toWorldX(event.clientX)
        const y = camera.toWorldY(event.clientY)
        const areaX = (x - (layer.pos ? layer.pos[0] : 0)) / (layer.size ? layer.size[0] : 1)
        const areaY = (y - (layer.pos ? layer.pos[1] : 0)) / (layer.size ? layer.size[1] : 1)
        const areaId = quadtree.findValueAt(areaX, areaY) ?? 0
        const area = layer.areas.find(a => a.id === areaId)
        if (!area) return

        setSelectedArea(area)
        bumpMapUpdate()
      }
    },
  ]

  return tools
}

export function createCanvasController(options) {
  const {
    getMap,
    getCurrentTool,
    setCurrentTool,
    getCursors,
    getSelectedArea,
    getWs,
    isConnected,
    setSelectedArea,
    bumpMapUpdate,
    onMousePositionChange = () => {},
    onImageProcessingStart = () => {},
    onImageProcessingProgress = () => {},
    onImageProcessingComplete = () => {},
  } = options

  let canvas = null
  let workspace = null
  let ctx = null
  let spaceKeyPressed = false

  const panState = {
    active: false,
    startX: 0,
    startY: 0,
    initialCameraX: 0,
    initialCameraY: 0,
  }

  const mapRenderer = createMapRenderer()

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    setZoom(zoom) {
      this.zoom = clamp(zoom, 1 / 100, 1000000)
    },
    toScreenX(worldX) {
      const width = canvas ? canvas.width : 0
      return (worldX - this.x) * this.zoom + width / 2
    },
    toScreenY(worldY) {
      const height = canvas ? canvas.height : 0
      return (worldY - this.y) * this.zoom + height / 2
    },
    toWorldX(screenX) {
      const width = canvas ? canvas.width : 0
      return (screenX - width / 2) / this.zoom + this.x
    },
    toWorldY(screenY) {
      const height = canvas ? canvas.height : 0
      return (screenY - height / 2) / this.zoom + this.y
    },
  }

  const tools = buildTools({
    camera,
    panState,
    updateCanvas: () => updateCanvas(),
    getCanvas: () => canvas,
    getCanvasRect: () => (canvas ? canvas.getBoundingClientRect() : null),
    getSelectedArea,
    getMap,
    setCurrentTool,
    setSelectedArea,
    bumpMapUpdate,
    sendMessage: (message) => {
      const socket = getWs?.()
      if (!socket || !isConnected?.()) return
      socket.send(message)
    },
    onImageProcessingStart,
    onImageProcessingProgress,
    onImageProcessingComplete,
  })

  let gridOn = true

  function toggleGrid() {
    gridOn = !gridOn
    updateCanvas()
  }

  function sendCursorMessage(x, y) {
    const socket = getWs?.()
    if (!socket || !isConnected?.()) return
    socket.send(`CURSOR:${x},${y}`)
  }

  async function resizeCanvas() {
    if (!canvas || !workspace) return
    canvas.width = 0
    canvas.height = 0
    await tick()
    canvas.width = workspace.clientWidth
    canvas.height = workspace.clientHeight
    ctx = canvas.getContext('2d')
    updateCanvas()
  }

  function updateCanvas() {
    if (!ctx || !canvas) return

    ctx.fillStyle = '#f0f0f0'
    ctx.globalAlpha = 1
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const map = getMap?.()
    if (map) {
      mapRenderer.draw(map, ctx, canvas, camera)
    }

    let unit = 0.0001
    while (unit * camera.zoom < 60) {
      if (unit / Math.pow(10, Math.floor(Math.log10(unit))) === 1) {
        unit *= 2
      } else if (unit / Math.pow(10, Math.floor(Math.log10(unit))) === 2) {
        unit *= 2.5
      } else {
        unit *= 2
      }
    }

    const gridSize = unit * camera.zoom
    ctx.globalAlpha = 1
    if (gridOn) {
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.font = '10px Arial'
    ctx.fillStyle = 'black'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const startX = camera.toScreenX(0) % gridSize
    const startY = camera.toScreenY(0) % gridSize
    for (let x = startX; x < canvas.width; x += gridSize) {
    ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
    ctx.stroke()
      let label = Math.round(camera.toWorldX(x))
      if (label > 0) {
        label = `${label}E`
      } else if (label < 0) {
        label = `${-label}W`
      }
      ctx.fillText(label, x + 2, 2)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = startY; y < canvas.height; y += gridSize) {
    ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
    ctx.stroke()
      let label = Math.round(camera.toWorldY(y))
      if (label > 0) {
        label = `${label}S`
      } else if (label < 0) {
        label = `${-label}N`
      }
      ctx.fillText(label, canvas.width - 2, y)
    }
    }

    // 카메라 줌 레벨 따라서 축척 그리기
    const repeats = Math.ceil(300 / (unit * camera.zoom))

    const scaleBarLength = unit * camera.zoom
    const padding = 10
    const yPos = canvas.height - padding
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 3
    ctx.strokeRect(padding, yPos, repeats * scaleBarLength, 5)
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1
    ctx.strokeRect(padding, yPos, repeats * scaleBarLength, 5)
    const unitMeters = worldToMeters(unit)
    for (let i = 0; i < repeats; i++) {
      const xPos = padding + i * scaleBarLength
      ctx.fillStyle = i % 2 === 0 ? 'white' : 'black'
      ctx.fillRect(xPos, yPos, scaleBarLength, 5)

      ctx.font = '10px Arial'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      const segmentMeters = (i + 1) * unitMeters
      const label = formatDistanceFromMeters(segmentMeters)
      const textWidth = ctx.measureText(label).width
      ctx.fillStyle = 'white'
      ctx.fillRect(xPos + scaleBarLength - textWidth - 2, yPos - 14, textWidth + 4, 12)
      ctx.fillStyle = 'black'
      ctx.fillText(label, xPos + scaleBarLength, yPos - 2)
    }

    // 도구
    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.render) {
      activeTool.render(ctx)
    }

    const cursorPositions = getCursors?.() ?? {}
    for (const id in cursorPositions) {
      const cursor = cursorPositions[id]
      const screenX = camera.toScreenX(cursor.x)
      const screenY = camera.toScreenY(cursor.y)
      const color = /.*#([0-9a-fA-F]{6})/.exec(id) ? `#${/.*#([0-9a-fA-F]{6})/.exec(id)[1]}` : 'red'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(screenX, screenY)
      ctx.lineTo(screenX + 10, screenY + 4)
      ctx.lineTo(screenX + 4, screenY + 10)
      ctx.lineTo(screenX, screenY + 6)
      ctx.lineTo(screenX - 4, screenY + 10)
      ctx.lineTo(screenX - 10, screenY + 4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'black'
      ctx.fillText(id, screenX + 8, screenY - 8)
    }
  }

  function withinCanvas(event) {
    if (!canvas) return false
    const rect = canvas.getBoundingClientRect()
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
  }

  function handleWheel(event) {
    if (!withinCanvas(event)) return
    if (event.altKey) {
      const rect = canvas?.getBoundingClientRect()
      if (!rect) return
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const worldX = camera.toWorldX(mouseX)
      const worldY = camera.toWorldY(mouseY)
      camera.x = worldX
      camera.y = worldY
      camera.setZoom(camera.zoom * Math.exp(-event.deltaY * 0.001))
      const newWorldX = camera.toWorldX(mouseX)
      const newWorldY = camera.toWorldY(mouseY)
      camera.x += worldX - newWorldX
      camera.y += worldY - newWorldY
    } else if (event.shiftKey) {
      camera.x += event.deltaY / camera.zoom
    } else {
      camera.x += event.deltaX / camera.zoom
      camera.y += event.deltaY / camera.zoom
    }
    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.onwheel) {
      activeTool.onwheel(event)
    }
    updateCanvas()
  }

  function mouseMoveHandler(event) {
    if (!withinCanvas(event)) return

    if (panState.active || spaceKeyPressed) {
      const deltaX = (event.clientX - panState.startX) / camera.zoom
      const deltaY = (event.clientY - panState.startY) / camera.zoom
      camera.x = panState.initialCameraX - deltaX
      camera.y = panState.initialCameraY - deltaY
      updateCanvas()
    }

    const rect = canvas?.getBoundingClientRect()
    if (!rect) return
    const worldX = Math.trunc(camera.toWorldX(event.clientX - rect.left))
    const worldY = Math.trunc(camera.toWorldY(event.clientY - rect.top))

    if (isConnected?.()) {
      sendCursorMessage(worldX, worldY)
    }

    onMousePositionChange({ x: worldX, y: worldY })

    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.onmousemove) {
      activeTool.onmousemove(event)
    }
  }

  function mouseButtonUpHandler(event) {
    if (!withinCanvas(event)) return

    if (event.button === 1) {
      panState.active = false
    }

    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.onmouseup) {
      activeTool.onmouseup(event)
    }
  }

  function mouseButtonDownHandler(event) {
    if (!withinCanvas(event)) return

    if (event.button === 1) {
      event.preventDefault()
      panState.active = true
      panState.startX = event.clientX
      panState.startY = event.clientY
      panState.initialCameraX = camera.x
      panState.initialCameraY = camera.y
    }

    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.onmousedown) {
      activeTool.onmousedown(event)
    }
  }

  function keyDownHandler(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
      return
    }

    if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      ws.send('UNDO')
      return
    }

    if (event.key === ' ') {
      if (!spaceKeyPressed) {
        spaceKeyPressed = true
        document.body.style.cursor = 'grab'
      }
    }

    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.onkeydown) {
      activeTool.onkeydown(event)
    }
  }

  function keyUpHandler(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
      return
    }

    if (event.key === ' ') {
      spaceKeyPressed = false
      document.body.style.cursor = 'default'
      panState.active = false
    }

    const activeTool = getCurrentTool?.()
    if (activeTool && activeTool.onkeyup) {
      activeTool.onkeyup(event)
    }
  }

  function setCanvasRef(element) {
    canvas = element
    if (canvas) {
      ctx = canvas.getContext('2d')
    }
  }

  function setWorkspaceRef(element) {
    workspace = element
  }

  function initialize() {
    if (!canvas) return
    ctx = canvas.getContext('2d')
    resizeCanvas()
  }

  function installGlobalListeners() {
    const boundResize = () => resizeCanvas()
    const boundWheel = (event) => handleWheel(event)
    const boundMouseDown = (event) => mouseButtonDownHandler(event)
    const boundMouseMove = (event) => mouseMoveHandler(event)
    const boundMouseUp = (event) => mouseButtonUpHandler(event)
    const boundKeyDown = (event) => keyDownHandler(event)
    const boundKeyUp = (event) => keyUpHandler(event)

    window.addEventListener('resize', boundResize)
    window.addEventListener('wheel', boundWheel, { passive: true })
    window.addEventListener('mousedown', boundMouseDown)
    window.addEventListener('mousemove', boundMouseMove)
    window.addEventListener('mouseup', boundMouseUp)
    window.addEventListener('keydown', boundKeyDown)
    window.addEventListener('keyup', boundKeyUp)

    return () => {
      window.removeEventListener('resize', boundResize)
      window.removeEventListener('wheel', boundWheel)
      window.removeEventListener('mousedown', boundMouseDown)
      window.removeEventListener('mousemove', boundMouseMove)
      window.removeEventListener('mouseup', boundMouseUp)
      window.addEventListener('keydown', boundKeyDown)
      window.addEventListener('keyup', boundKeyUp)
    }
  }

  return {
    camera,
    tools,
    setCanvasRef,
    setWorkspaceRef,
    initialize,
    resizeCanvas,
    updateCanvas,
    handleWheel,
    mouseMoveHandler,
    mouseButtonDownHandler,
    mouseButtonUpHandler,
    installGlobalListeners,
    toggleGrid
  }
}
