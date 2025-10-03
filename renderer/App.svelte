<script>
  import { onMount, tick } from 'svelte'

  let ws
  let connected = false

  let log = []

  function connect() {
    ws = new WebSocket('ws://localhost:48829')
    ws.onopen = () => {
      connected = true
      addLogEntry('connected to websocket')
      ws.send(`LOGIN:secret:Username`)
    }
    ws.onmessage = (event) => {
      addLogEntry(event.data)
    }
    ws.onclose = () => {
      connected = false
      addLogEntry('connection closed')
    }
    ws.onerror = () => {
      addLogEntry('connection error')
    }
  }

  let logContainer
  function addLogEntry(entry) {
    log = [...log, entry]
    log = log.slice(-100) // Keep only the last 100 entries

    // Scroll to the bottom of the log container
    if (logContainer) {
      logContainer.scrollTo(0, logContainer.scrollHeight)
    }
  }

  let mouseX, mouseY
  let workspace
  function handleMouseMove(event) {
    if (!connected || !canvas) return

    // Get mouse position relative to the workspace
    const rect = canvas.getBoundingClientRect()
    const x = camera.toWorldX(event.clientX - rect.left)
    const y = camera.toWorldY(event.clientY - rect.top)
    const message = `CURSOR:${x},${y}`
    ws.send(message)

    mouseX = x
    mouseY = y
  }

  let canvas
  let ctx
  async function resizeCanvas() {
    if (!canvas || !workspace) return

    await tick();
    canvas.width = workspace.clientWidth - 10
    canvas.height = workspace.clientHeight - 10
    updateCanvas()
  }

  function handleWheel(event) {
    if (event.deltaY < 0) {
      camera.setZoom(camera.zoom * 1.1)
    } else if (event.deltaY > 0) {
      camera.setZoom(camera.zoom / 1.1)
    }
    updateCanvas()
  }

  onMount(() => {
    ctx = canvas.getContext('2d')
    resizeCanvas()

    window.addEventListener('resize', resizeCanvas)
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener("mousebuttondown", mouseButtonDownHandler);
    window.addEventListener("mousemove", mouseMoveHandler);
    window.addEventListener("mouseup", mouseButtonUpHandler);
  })

  function mouseMoveHandler(event) {
    if (isPanning) {
      const deltaX = (event.clientX - panStartX) / camera.zoom;
      const deltaY = (event.clientY - panStartY) / camera.zoom;
      camera.x = initialCameraX - deltaX;
      camera.y = initialCameraY - deltaY;
      updateCanvas();
    }
  }

  function mouseButtonUpHandler(event) {
    if (event.button === 1) { // Middle mouse button
      isPanning = false;
    }
  }

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let initialCameraX = 0;
  let initialCameraY = 0;
  function mouseButtonDownHandler(event) {
    if (event.button === 1) { // Middle mouse button
      event.preventDefault(); // Prevent default behavior like scrolling
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      initialCameraX = camera.x;
      initialCameraY = camera.y;
    }
  }

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    setZoom(zoom) {
      this.zoom = zoom
      this.zoom = Math.max(0.1, Math.min(this.zoom, 10))
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

    // Draw grid
    const gridSize = 50 * camera.zoom
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = camera.toScreenX(-camera.x % 50); x < canvas.width; x += gridSize) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
    }
    for (let y = camera.toScreenY(-camera.y % 50); y < canvas.height; y += gridSize) {
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
    }
    ctx.stroke()
  }
</script>

<svelte:head>
  <title>Gaia</title>
  <style>
    body {
      margin: 0;
      font-family: Pretendard, sans-serif;
    }
  </style>
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
</svelte:head>

<div class="main-container">
  <div class="header">
    <div>Gaia</div>
    {#if connected}
      <div>Connected to WebSocket server</div>
    {:else}
      <div><button on:click={connect}>Connect to WebSocket</button></div>
    {/if}
  </div>
  <div class="content">
    <div class="toolbar-window"></div>
    <div class="workspace" on:mousemove={handleMouseMove} bind:this={workspace}>
      <canvas bind:this={canvas}></canvas>
    </div>
    <div class="properties-window">
      <div class="properties-content"></div>
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
    overflow: hidden;
  }
  .properties-window {
    width: 300px;
    background-color: #e0e0e0;
    border-left: 1px solid #ccc;
    display: flex;
    flex-direction: column;
  }
  .properties-content {
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
