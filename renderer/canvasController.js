import { tick } from 'svelte'

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
}) {
  const ensureCanvasRect = () => getCanvasRect() ?? null

  const toWorldPoint = (clientX, clientY) => {
    const rect = ensureCanvasRect()
    if (!rect) return null
    return {
      x: Math.trunc(camera.toWorldX(clientX - rect.left)),
      y: Math.trunc(camera.toWorldY(clientY - rect.top)),
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
        const selectedArea = getSelectedArea()
        const map = getMap()
        const canvas = getCanvas()
        if (!selectedArea || !map || !canvas) return
        const fromWorld = toWorldPoint(lineVars.x, lineVars.y)
        const toWorld = toWorldPoint(event.clientX, event.clientY)
        if (!fromWorld || !toWorld) return
        sendMessage(`LINE:${selectedArea.parent.id}:${fromWorld.x},${fromWorld.y}:${toWorld.x},${toWorld.y}:${selectedArea.id},${lineVars.width}`)
        updateCanvas()
      },
      onwheel: () => {},
      render: (ctx) => {
        if (!lineVars.brushing) return
        const rect = ensureCanvasRect()
        if (!rect) return
        const startX = lineVars.x - rect.left
        const startY = lineVars.y - rect.top
        const endX = lineVars.toX - rect.left
        const endY = lineVars.toY - rect.top
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = lineVars.width * camera.zoom
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        ctx.stroke()
      },
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
        sendMessage(`RECT:${selectedArea.parent.id}:${x1},${y1}:${x2},${y2}:${selectedArea.id}`)
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
          sendMessage(`POLY:${selectedArea.parent.id}:${worldPoints.join(',')}:${selectedArea.id}`)
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
        }
      },
      onmousemove: (event) => {
        if (event.button !== 0) return
        if (!brushVars.brushing) return
        const selectedArea = getSelectedArea()
        const map = getMap()
        const canvas = getCanvas()
        if (!selectedArea || !map || !canvas) return
        const start = toWorldPoint(brushVars.previousX, brushVars.previousY)
        const end = toWorldPoint(event.clientX, event.clientY)
        if (!start || !end) return
        sendMessage(`LINE:${selectedArea.parent.id}:${start.x},${start.y}:${end.x},${end.y}:${selectedArea.id},${brushVars.width}`)
        brushVars.previousX = event.clientX
        brushVars.previousY = event.clientY
        updateCanvas()
      },
      onmouseup: (event) => {
        if (event.button === 0) {
          brushVars.brushing = false
        }
      },
      onwheel: (event) => {
        if (event.deltaY < 0) {
          brushVars.width = Math.min(brushVars.width + 1, 100)
        } else {
          brushVars.width = Math.max(brushVars.width - 1, 1)
        }
        updateCanvas()
      },
    },
    {
      name: "거리 측정",
      icon: 'rulers',
      hotkey: 'i',
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

        ctx.fillStyle = 'black'
        ctx.font = '14px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${distanceStr} m`, (startX + endX) / 2, (startY + endY) / 2 - 5)
      },
    },
  ]

  return tools
}

export function createCanvasController(options) {
  const {
    getMap,
    getCurrentTool,
    getCursors,
    getSelectedArea,
    getWs,
    isConnected,
    onMousePositionChange = () => {},
  } = options

  let canvas = null
  let workspace = null
  let ctx = null

  const panState = {
    active: false,
    startX: 0,
    startY: 0,
    initialCameraX: 0,
    initialCameraY: 0,
  }

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    setZoom(zoom) {
      this.zoom = clamp(zoom, 1 / 10000, 100)
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
    sendMessage: (message) => {
      const socket = getWs?.()
      if (!socket || !isConnected?.()) return
      socket.send(message)
    },
  })

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
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const map = getMap?.()
    if (map) {
      map.draw(ctx, canvas, camera)
    }

    const gridLength = Math.pow(2, Math.floor(Math.log2(100 / camera.zoom)))
    const gridSize = gridLength * camera.zoom
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.font = '10px Arial'
    ctx.fillStyle = 'black'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const startX = camera.toScreenX(0) % gridSize
    const startY = camera.toScreenY(0) % gridSize
    for (let x = startX; x < canvas.width; x += gridSize) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.fillText(Math.round(camera.toWorldX(x)), x + 2, 2)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = startY; y < canvas.height; y += gridSize) {
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.fillText(Math.round(camera.toWorldY(y)), canvas.width - 2, y - 2)
    }
    ctx.stroke()

    // 카메라 줌 레벨 따라서 축척 그리기
    // 1픽셀은 1미터
    // 화면 왼쪽 아래에 1 or 2 or 5 단위로 눈금 표시
    // 눈금 하나의 길이는 100-200 픽셀 사이
    const units = [1, 2, 5]
    let unit = 0.1
    while (unit * camera.zoom < 60) {
      if (unit / Math.pow(10, Math.floor(Math.log10(unit))) === 1) {
        unit *= 2
      } else if (unit / Math.pow(10, Math.floor(Math.log10(unit))) === 2) {
        unit *= 2.5
      } else {
        unit *= 2
      }
    }
    const repeats = Math.ceil(300 / (unit * camera.zoom))

    const scaleBarLength = unit * camera.zoom
    const padding = 10
    ctx.fillStyle = 'black'
    const yPos = canvas.height - padding
    for (let i = 0; i < repeats; i++) {
      const xPos = padding + i * scaleBarLength
      ctx.fillStyle = i % 2 === 0 ? 'white' : 'black'
      ctx.fillRect(xPos, yPos, scaleBarLength, 5)

      ctx.fillStyle = 'black'
      ctx.font = '10px Arial'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      const label = (i + 1) * unit >= 1000 ? `${((i + 1) * unit / 1000).toFixed(0)} km` : `${((i + 1) * unit).toFixed(0)} m`
      ctx.fillText(label, xPos + scaleBarLength, yPos - 2)
    }
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1
    ctx.strokeRect(padding, yPos, repeats * scaleBarLength, 5)

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
      ctx.fillStyle = 'red'
      ctx.beginPath()
      ctx.arc(screenX, screenY, 5, 0, Math.PI * 2)
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
      camera.setZoom(camera.zoom * Math.exp(event.deltaY * 0.001))
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

    if (panState.active) {
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

    window.addEventListener('resize', boundResize)
    window.addEventListener('wheel', boundWheel, { passive: true })
    window.addEventListener('mousedown', boundMouseDown)
    window.addEventListener('mousemove', boundMouseMove)
    window.addEventListener('mouseup', boundMouseUp)

    return () => {
      window.removeEventListener('resize', boundResize)
      window.removeEventListener('wheel', boundWheel)
      window.removeEventListener('mousedown', boundMouseDown)
      window.removeEventListener('mousemove', boundMouseMove)
      window.removeEventListener('mouseup', boundMouseUp)
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
  }
}
