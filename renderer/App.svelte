<script>
  import { onMount, tick } from 'svelte'
  import "bootstrap-icons/font/bootstrap-icons.css"
  import Map from './Map.svelte'
  import { Quadtree, Area as AreaType, Layer as LayerType, deserializeMap } from "../dataframe.js";

  let ws
  let connected = false
  let map

  let log = []
  const cursors = {}
  let username = "User"

  let mapUpdate = 0

  let wsAddress = 'localhost:48829'
  function connect() {
    ws = new WebSocket(`ws://${wsAddress}`)
    ws.onopen = () => {
      connected = true
      addLogEntry('connected to websocket')
      ws.send(`LOGIN:secret:${username}`)
      ws.send(`LOAD`)
    }
    ws.onmessage = (event) => {
      addLogEntry(event.data)

      if (event.data.startsWith('MAP:')) {
        const mapData = event.data.slice(4)
        map = deserializeMap(JSON.parse(mapData))
        updateCanvas()
      } else if (event.data.startsWith('CURSOR:')) {
        const [id, x, y] = event.data.slice(7).split(',')
        cursors[id] = { x, y }
        updateCanvas()
      } else if (event.data.startsWith('NEWA:')) {
        const mapData = event.data.slice(5)
        const [ layerId, areaId, name, color ] = mapData.split(':')
        const layer = map.findLayer(parseInt(layerId))
        if (layer) {
          layer.areas.push(new AreaType(parseInt(areaId), color, layer, name))
          mapUpdate = (mapUpdate + 1) % 1000000
        }
      } else if (event.data.startsWith('NEWL:')) {
        const mapData = event.data.slice(5)
        const [ parentId, layerId, name ] = mapData.split(':')
        const parent = map.findLayer(parseInt(parentId))
        if (parent) {
          parent.children.push(new LayerType(parseInt(layerId), new Quadtree(0), parent, [0,0], [1,1], name))
          mapUpdate = (mapUpdate + 1) % 1000000
        }
      } else if (event.data.startsWith('LINE:')) {
        const mapData = event.data.slice(5)
        const [ layerId, from, to, areaAndWidth ] = mapData.split(':')
        const [ x1, y1 ] = from.split(',').map(v => parseInt(v))
        const [ x2, y2 ] = to.split(',').map(v => parseInt(v))
        const [ areaId, width ] = areaAndWidth.split(',').map(v => parseInt(v))
        const layer = map.findLayer(parseInt(layerId))
        if (layer) {
          layer.expandTo(x1, y1)
          layer.expandTo(x2, y2)
          const [px, py] = layer.pos ?? [0, 0]
          const [sx, sy] = layer.size ?? [1, 1]
          const bounds = { minX: px, minY: py, maxX: px + sx, maxY: py + sy }
          layer.quadtree.drawLine(x1, y1, x2, y2, width, areaId, undefined, bounds)
          console.log(layer)
          updateCanvas()
        }
      }

    }
    ws.onclose = () => {
      connected = false
      addLogEntry('connection closed')
    }
    ws.onerror = () => {
      addLogEntry('connection error')
    }
  }

  function reloadMap() {
    if (ws && connected) {
      ws.send(`LOAD`)
      mapUpdate = (mapUpdate + 1) % 1000000
    }
  }

  let logContainer
  async function addLogEntry(entry) {
    log = [...log, entry]
    log = log.slice(-100) // Keep only the last 100 entries

    // Scroll to the bottom of the log container
    if (logContainer) {
      await tick()
      logContainer.scrollTo(0, logContainer.scrollHeight + 100)
    }
  }

  let mouseX, mouseY
  let workspace

  let canvas
  let ctx
  async function resizeCanvas() {
    if (!canvas || !workspace) return

    canvas.width = 0;
    canvas.height = 0;
    await tick();
    canvas.width = workspace.clientWidth
    canvas.height = workspace.clientHeight
    updateCanvas()
  }

  function handleWheel(event) {
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      return;
    }

    camera.x += (event.deltaX / camera.zoom)
    camera.y += (event.deltaY / camera.zoom)

    if (event.altKey) {
      camera.setZoom(camera.zoom * Math.exp(event.deltaY * 0.001))
    }

    if (nowTool.onwheel)
      nowTool.onwheel(event)

    updateCanvas()
  }

  onMount(() => {
    ctx = canvas.getContext('2d')
    resizeCanvas()

    window.addEventListener('resize', resizeCanvas)
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('mousedown', mouseButtonDownHandler)
    window.addEventListener("mousemove", mouseMoveHandler);
    window.addEventListener("mouseup", mouseButtonUpHandler);
  })

  function mouseMoveHandler(event) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      return;
    }

    if (isPanning) {
      const deltaX = (event.clientX - panStartX) / camera.zoom;
      const deltaY = (event.clientY - panStartY) / camera.zoom;
      camera.x = initialCameraX - deltaX;
      camera.y = initialCameraY - deltaY;
      updateCanvas();
    }

    // Get mouse position relative to the workspace
    const x = parseInt(camera.toWorldX(event.clientX - rect.left))
    const y = parseInt(camera.toWorldY(event.clientY - rect.top))

    if (ws && connected) {
      const message = `CURSOR:${x},${y}`
      ws.send(message)
    }

    mouseX = x
    mouseY = y

    if (nowTool.onmousemove)
      nowTool.onmousemove(event)
  }

  function mouseButtonUpHandler(event) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      return;
    }

    if (event.button === 1) { // Middle mouse button
      isPanning = false;
    }

    if (nowTool.onmouseup)
      nowTool.onmouseup(event)
  }

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let initialCameraX = 0;
  let initialCameraY = 0;
  function mouseButtonDownHandler(event) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      return;
    }

    if (event.button === 1) { // Middle mouse button
      // if mouse is in the canvas
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        return;
      }

      event.preventDefault(); // Prevent default behavior like scrolling
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      initialCameraX = camera.x;
      initialCameraY = camera.y;
    }

    if (nowTool.onmousedown)
      nowTool.onmousedown(event)
  }

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    setZoom(zoom) {
      this.zoom = zoom
      this.zoom = Math.max(1/10000, Math.min(this.zoom, 100))
    },
    toScreenX(worldX) {
      return (worldX - this.x) * this.zoom + canvas.width / 2
    },
    toScreenY(worldY) {
      return (worldY - this.y) * this.zoom + canvas.height / 2
    },
    toWorldX(screenX) {
      return (screenX - canvas.width / 2) / this.zoom + this.x
    },
    toWorldY(screenY) {
      return (screenY - canvas.height / 2) / this.zoom + this.y
    }
  }

  function updateCanvas() {
    if (!ctx || !canvas) return

    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // draw map
    if (map) {
      map.draw(ctx, canvas, camera)
    }

    // Draw grid
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

    if (nowTool.render) {
      nowTool.render(ctx)
    }

    // draw cursors
    for (const id in cursors) {
      const cursor = cursors[id]
      const screenX = camera.toScreenX(cursor.x)
      const screenY = camera.toScreenY(cursor.y)
      ctx.fillStyle = 'red'
      ctx.beginPath()
      ctx.arc(screenX, screenY, 5, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillStyle = 'black'
      ctx.fillText(id, screenX + 8, screenY - 8)
    }
  }

  const tools = [
    {
      name: "선택",
      icon: "cursor",
      hotkey: "v",
    },
    {
      name: "패닝",
      onmousedown: (e) => {
        if (e.button === 0) {
          isPanning = true;
          panStartX = e.clientX;
          panStartY = e.clientY;
          initialCameraX = camera.x;
          initialCameraY = camera.y;
        }
      },
      onmousemove: (e) => {
        if (isPanning) {
          const deltaX = (e.clientX - panStartX) / camera.zoom;
          const deltaY = (e.clientY - panStartY) / camera.zoom;
          camera.x = initialCameraX - deltaX;
          camera.y = initialCameraY - deltaY;
          updateCanvas();
        }
      },
      onmouseup: (e) => {
        if (e.button === 0) {
          isPanning = false;
        }
      },
      icon: "arrows-move",
      hotkey: "h",
    },
    {
      name: "확대",
      onmousedown: (e) => {
        if (e.button === 0) {
          nowTool.vars.startX = e.clientX
          nowTool.vars.startY = e.clientY
          nowTool.vars.initialZoom = camera.zoom
          nowTool.vars.zooming = true
        }
      },
      onmousemove: (e) => {
        if (nowTool.vars.zooming) {
          const delta = (e.clientY + e.clientX) - (nowTool.vars.startY + nowTool.vars.startX)
          camera.setZoom(nowTool.vars.initialZoom * Math.exp(delta * 0.005))
          updateCanvas()
        }
      },
      onmouseup: (e) => {
        if (e.button === 0) {
          nowTool.vars.zooming = false
        }
      },
      vars: {
        zooming: false,
        startX: 0, startY: 0,
        initialZoom: 1,
      },
      icon: "zoom-in",
      hotkey: "z",
    },
    {
      name: "선",
      onmousedown: (e) => {
        if (e.button === 0) {
          nowTool.vars.x = e.clientX
          nowTool.vars.y = e.clientY
          nowTool.vars.brushing = true
        }
      },
      onmousemove: (e) => {
        if (e.button !== 0) return
        if (!nowTool.vars.brushing) return;

        nowTool.vars.toX = e.clientX
        nowTool.vars.toY = e.clientY

        updateCanvas()
      },
      onmouseup: (e) => {
        if (e.button === 0) {
          nowTool.vars.brushing = false

          if (!map) return

          const startX = parseInt(camera.toWorldX(nowTool.vars.x - canvas.getBoundingClientRect().left))
          const startY = parseInt(camera.toWorldY(nowTool.vars.y - canvas.getBoundingClientRect().top))
          const endX = parseInt(camera.toWorldX(nowTool.vars.toX - canvas.getBoundingClientRect().left))
          const endY = parseInt(camera.toWorldY(nowTool.vars.toY - canvas.getBoundingClientRect().top))
          ws.send(`LINE:${selectedArea.parent.id}:${startX},${startY}:${endX},${endY}:${selectedArea.id},${nowTool.vars.width}`)
          updateCanvas()
        }
      },
      onwheel: (e) => {},
      vars: {
        brushing: false,
        width: 10,
        x: 0, y: 0,
        toX: 0, toY: 0,
      },
      render: (ctx) => {
        if (nowTool.vars.brushing) {
          const rect = canvas.getBoundingClientRect()

          ctx.strokeStyle = 'blue'
          ctx.lineWidth = nowTool.vars.width * camera.zoom
          ctx.beginPath()
          ctx.moveTo(nowTool.vars.x - rect.left, nowTool.vars.y - rect.top)
          ctx.lineTo(nowTool.vars.toX - rect.left, nowTool.vars.toY - rect.top)
          ctx.stroke()
        }
      },
      icon: "type-underline",
      hotkey: "l",
    },
  ]
  let nowTool = tools[0]

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return
    }
    for (const tool of tools) {
      if (e.key.toLowerCase() === tool.hotkey.toLowerCase()) {
        selectTool(tool)()
        e.preventDefault()
        break
      }
    }
  })

  function selectTool(tool) {
    return () => {
      if (nowTool && nowTool.onend) {
        nowTool.onend()
      }
      nowTool = tool
      if (nowTool && nowTool.onstart) {
        nowTool.onstart()
      }
    }
  }

  let selectedArea
  function handleAreaSelect(event) {
    const { area } = event.detail
    selectedArea = area
  }
</script>

<svelte:head>
  <title>Gaia</title>
  <style>
    body {
      margin: 0;
      font-family: Pretendard, sans-serif;
      overflow: hidden;
    }
  </style>
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
</svelte:head>

<div class="main-container">
  <div class="header">
    <div>Gaia</div>
    {#if connected}
      <div>
        <button on:click={reloadMap}>Reload Map</button>
        Connected to WebSocket server
      </div>
    {:else}
      <div>
        <input type="text" placeholder="Username" bind:value={username} />
        <input type="text" placeholder="localhost:48829" bind:value={wsAddress} />
        <button on:click={connect}>Connect to WebSocket</button>
      </div>
    {/if}
  </div>
  <div class="content">
    <div class="toolbar-window">
      {#each tools as tool}
      <div>
        <button title={tool.name} disabled={nowTool === tool} on:click={selectTool(tool)}>
          <i class="bi bi-{tool.icon}"></i>
          {tool.name} ({tool.hotkey.toUpperCase()})
        </button>
      </div>
      {/each}
    </div>
    <div class="workspace" bind:this={workspace}>
      <canvas bind:this={canvas}></canvas>
    </div>
    <div class="properties-window">
      <div class="layers">
        {#if map}
        {#key mapUpdate}
        <Map {map} {ws} on:areaselect={handleAreaSelect} />
        {/key}
        {:else}
        <div>No map loaded</div>
        {/if}
      </div>
      <div class="log" bind:this={logContainer}>
        {#each log as entry}
        <div>{entry}</div>
        {/each}
      </div>
      <div class="minimap"></div>
    </div>
  </div>
</div>

<style>
  .main-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background-color: #f0f0f0;
    border-bottom: 1px solid #ccc;
  }
  .content {
    flex: 1;
    display: flex;
  }
  .toolbar-window {
    width: 200px;
    background-color: #e0e0e0;
    border-right: 1px solid #ccc;
  }
  .workspace {
    flex: 1;
    background-color: #ffffff;
  }
  .properties-window {
    width: 300px;
    background-color: #e0e0e0;
    border-left: 1px solid #ccc;
    display: flex;
    flex-direction: column;
  }
  .layers {
    flex: 1;
    border-bottom: 1px solid #ccc;
  }
  .log {
    height: 150px;
    border-bottom: 1px solid #ccc;
    overflow-y: auto;
  }
  .minimap {
    height: 100px;
    background-color: #d0d0d0;
  }
  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    cursor: pointer;
  }
</style>
