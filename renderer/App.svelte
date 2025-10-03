<script>
  let messages = [];
  let ws;

  function connect() {
    ws = new WebSocket("ws://localhost:48829");
    ws.onopen = () => messages = [...messages, "✅ Connected to server"];
    ws.onmessage = (event) => messages = [...messages, "📩 " + event.data];
  }

  function sendEcho() {
    ws?.send("ECHO Hello from UI");
  }

  function sendAnnounce() {
    ws?.send("ANNOUNCE This is a broadcast!");
  }
</script>

<h1>Gaia UI</h1>
<button on:click={connect}>Connect</button>
<button on:click={sendEcho}>Send ECHO</button>
<button on:click={sendAnnounce}>Send ANNOUNCE</button>

<ul>
  {#each messages as msg}
  <li>{msg}</li>
  {/each}
</ul>
