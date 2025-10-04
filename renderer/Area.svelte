<script>
  import { createEventDispatcher } from 'svelte';
  import "bootstrap-icons/font/bootstrap-icons.css";

  export let area;
  export let ws;
  export let selectedArea;

  const dispatch = createEventDispatcher();

  function selectArea() {
    dispatch('areaselect', { area });
    console.log('Area selected:', area);
  }

  async function deleteArea() {
    ws.send(`DELA:${area.id}`);
  }

  function setAreaName(event) {
    const newName = event.target.value;
    ws.send(`SEAN:${area.id}:${newName}`);
  }

  function setAreaColor(event) {
    const newColor = event.target.value;
    ws.send(`SEAC:${area.id}:${newColor}`);
  }

  $: isSelected = selectedArea && selectedArea.id === area.id && selectedArea.parent === area.parent;
</script>

<button class="area-container" class:selected={isSelected} on:click={selectArea}>
  <div class="area-info">
    <input style="color" color={area.color} type="color" value={area.color} disabled={area.id === 0} on:change={setAreaColor} />
    <input type="text" value={area.name} on:change={setAreaName} disabled={area.id === 0} />
    <div class="spacer"></div>
    {#if area.id !== 0}
      <button on:click={deleteArea}><i class="bi bi-trash"></i></button>
    {/if}
  </div>
</button>

<style>
  .area-info {
    display: flex;
    align-items: center;
  }
  .spacer {
    flex-grow: 1;
  }
  input[type="text"] {
    border: none;
    background: none;
    font-size: 1em;
    width: 100px;
  }
  input[type="text"]:focus {
    outline: none;
    border-bottom: 1px solid #ccc;
  }
  input[type="color"] {
    border: none;
    background: none;
    cursor: pointer;
    width: 32px;
    padding: 0;
  }
  input[type="color"]:disabled {
    cursor: not-allowed;
  }

  .area-container {
    display: block;
    width: 100%;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .area-container.selected {
    background-color: #f0f0f0;
  }
  .area-container div {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .area-container button {
    background: none;
    border: none;
    color: red;
    cursor: pointer;
  }
  .area-container button:hover {
    text-decoration: underline;
  }
</style>
