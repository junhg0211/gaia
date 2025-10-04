<script>
  import { onMount, onDestroy, tick } from 'svelte'
  import "bootstrap-icons/font/bootstrap-icons.css"
  import Map from './Map.svelte'
  import { createCanvasController } from './canvasController.js'
  import { createWebSocketManager } from './websocketManager.js'

  let ws
  let connected = false
  let map
  let log = []
  const cursors = {}
  let username = 'User'
  let mapUpdate = 0
  let wsAddress = 'localhost'

  let logContainer
  let workspace
  let canvas
  let selectedArea

  async function addLogEntry(entry) {
    if (entry.startsWith('CURSOR:')) return

    log = [...log, entry]
    log = log.slice(-100)
    if (logContainer) {
      await tick()
      logContainer.scrollTo(0, logContainer.scrollHeight + 100)
    }
  }

  let nowTool

  const canvasController = createCanvasController({
    getMap: () => map,
    getCurrentTool: () => nowTool,
    getCursors: () => cursors,
    getSelectedArea: () => selectedArea,
    getWs: () => ws,
    isConnected: () => connected,
  })

  const {
    tools,
    setCanvasRef,
    setWorkspaceRef,
    initialize: initializeCanvas,
    installGlobalListeners,
    updateCanvas: redrawCanvas,
  } = canvasController

  nowTool = tools[0]

  $: canvas && setCanvasRef(canvas)
  $: workspace && setWorkspaceRef(workspace)

  function selectTool(tool) {
    return () => {
      if (nowTool && nowTool.onend) {
        nowTool.onend()
      }
      nowTool = tool
      if (nowTool && nowTool.onstart) {
        nowTool.onstart()
      }
      redrawCanvas()
    }
  }

  const webSocketManager = createWebSocketManager({
    getWsAddress: () => wsAddress,
    getUsername: () => username,
    onSocketChange: (socketInstance) => {
      ws = socketInstance
    },
    onConnectedChange: (value) => {
      connected = value
    },
    addLogEntry,
    setMap: (value) => {
      map = value
      mapUpdate = (mapUpdate + 1) % 1000000
      redrawCanvas()
    },
    getMap: () => map,
    updateCanvas: () => redrawCanvas(),
    bumpMapUpdate: () => {
      mapUpdate = (mapUpdate + 1) % 1000000
    },
    getCursors: () => cursors,
  })

  const { connect, reloadMap: requestReload } = webSocketManager

  function saveMap() {
    if (!connected || !ws || !map) return
    ws.send('SAVE')
  }

  function reloadMap() {
    if (!connected || !ws) return
    requestReload()
  }

  function handleAreaSelect(event) {
    const { area } = event.detail
    selectedArea = area
  }

  let removeCanvasListeners = () => {}
  let removeKeydownListener = () => {}

  onMount(async () => {
    await tick()
    initializeCanvas()
    const teardown = installGlobalListeners()
    removeCanvasListeners = typeof teardown === 'function' ? teardown : () => {}

    const handleKeydown = (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return
      }
      for (const tool of tools) {
        if (event.key.toLowerCase() === tool.hotkey.toLowerCase()) {
          selectTool(tool)()
          event.preventDefault()
          break
        }
      }
    }
    window.addEventListener('keydown', handleKeydown)
    removeKeydownListener = () => window.removeEventListener('keydown', handleKeydown)
  })

  onDestroy(() => {
    removeCanvasListeners?.()
    removeKeydownListener?.()
  })

  const data = {
    updateCanvas: redrawCanvas,
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
        <button on:click={saveMap}><i class="bi bi-floppy"></i></button>
        <button on:click={reloadMap}><i class="bi bi-arrow-clockwise"></i></button>
      </div>
    {:else}
      <div>
        <input type="text" placeholder="Username" bind:value={username} />
        <input type="text" placeholder="localhost:48829" bind:value={wsAddress} />
        <button on:click={connect}><i class="bi bi-ethernet"></i></button>
      </div>
    {/if}
  </div>
  <div class="content">
    <div class="toolbar-window">
      {#each tools as tool}
      <div class="tool-button">
        <button title={tool.name} disabled={nowTool === tool} on:click={selectTool(tool)}>
          <i class="bi bi-{tool.icon}"></i>
          <!-- {tool.name} ({tool.hotkey.toUpperCase()}) -->
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
        <Map {data} {selectedArea} {map} {ws} on:areaselect={handleAreaSelect} />
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
    min-height: 0;
  }
  .toolbar-window {
    background-color: #e0e0e0;
    border-right: 1px solid #ccc;
  }
  .tool-button button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
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
    min-height: 0;
    overflow: hidden;
  }
  .layers {
    flex: 1 1 0;
    border-bottom: 1px solid #ccc;
    overflow-y: auto;
    min-height: 0;
  }
  .log {
    flex: 0 0 150px;
    min-height: 150px;
    border-top: 1px solid #ccc;
    overflow-y: auto;
  }
  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    cursor: pointer;
  }
</style>
