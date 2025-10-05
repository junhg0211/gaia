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
  let imageProgress = null

  function normalizeProgress(info) {
    if (!info || typeof info.percent !== 'number') return
    const percent = Math.max(0, Math.min(1, info.percent))
    const stage = info.stage ?? imageProgress?.stage ?? '처리 중'
    const etaSeconds = typeof info.etaSeconds === 'number' && Number.isFinite(info.etaSeconds) && info.etaSeconds >= 0
      ? info.etaSeconds
      : null
    imageProgress = { percent, stage, etaSeconds }
  }

  function formatEta(seconds) {
    if (seconds === null) return '남은 시간 계산 중'
    if (!Number.isFinite(seconds) || seconds < 0) return '남은 시간 계산 중'
    const totalSeconds = Math.max(0, seconds)
    const minutes = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    if (minutes > 0) {
      return `남은 시간 약 ${minutes}분 ${secs.toFixed(0)}초`
    }
    return `남은 시간 약 ${secs.toFixed(1)}초`
  }

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
    setCurrentTool: (tool) => { nowTool = tool },
    getCursors: () => cursors,
    getSelectedArea: () => selectedArea,
    getWs: () => ws,
    isConnected: () => connected,
    onImageProcessingStart: () => {
      imageProgress = { percent: 0, stage: '준비 중', etaSeconds: null }
    },
    onImageProcessingProgress: normalizeProgress,
    onImageProcessingComplete: () => {
      imageProgress = null
    },
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

  function undoMap() {
    if (!connected || !ws) return
    ws.send('UNDO')
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
        <button on:click={undoMap}><i class="bi bi-arrow-counterclockwise"></i></button>
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
          <i class="bi bi-{tool.icon}"></i> {tool.hotkey.toUpperCase()}
        </button>
      </div>
      {/each}
    </div>
    <div class="workspace" bind:this={workspace}>
      <canvas bind:this={canvas}></canvas>
      {#if imageProgress !== null}
        <div class="processing-overlay">
          <div class="processing-card">
            <div class="processing-title">{imageProgress.stage}</div>
            <div class="processing-bar">
              <div
                class="processing-bar-fill"
                style={`width: ${(imageProgress.percent * 100).toFixed(2)}%`}
              ></div>
            </div>
            <div class="processing-percent">{(imageProgress.percent * 100).toFixed(2)}%</div>
            <div class="processing-eta">{formatEta(imageProgress.etaSeconds)}</div>
          </div>
        </div>
      {/if}
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
    position: relative;
    min-height: 0;
  }
  .workspace canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  .processing-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(4px);
    z-index: 5;
  }
  .processing-card {
    background: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.15);
    min-width: 240px;
    text-align: center;
  }
  .processing-title {
    font-weight: 600;
    margin-bottom: 0.75rem;
    font-size: 1.05rem;
  }
  .processing-bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: #d9d9d9;
    overflow: hidden;
    margin-bottom: 0.75rem;
  }
  .processing-bar-fill {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: linear-gradient(90deg, #2f80ed, #56ccf2);
    transition: width 0.18s ease-out;
    min-width: 12px;
  }
  .processing-bar-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 8px, transparent 8px, transparent 16px);
    animation: processing-stripes 0.75s linear infinite;
  }
  @keyframes processing-stripes {
    from { transform: translateX(0); }
    to { transform: translateX(32px); }
  }
  .processing-percent {
    font-size: 0.9rem;
    color: #333;
    margin-bottom: 0.25rem;
  }
  .processing-eta {
    font-size: 0.85rem;
    color: #555;
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
