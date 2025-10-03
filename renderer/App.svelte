<script>
  let ws;
  let connected = false;

  function connect() {
    ws = new WebSocket("ws://localhost:48829");
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
      connected = true;
    };
    ws.onmessage = (event) => {
      console.log("Message from server:", event.data);
    };
    ws.onclose = () => {
      console.log("Disconnected from WebSocket server");
    };
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
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
    <div class="workspace"></div>
    <div class="properties-window"></div>
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
  }
</style>
