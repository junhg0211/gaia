<script>
  import { createEventDispatcher } from 'svelte';
  import "bootstrap-icons/font/bootstrap-icons.css";
  import { formatWorldArea } from "./units.js";

  export let area;
  export let ws;
  export let selectedArea;

  const dispatch = createEventDispatcher();

  function selectArea() {
    dispatch('areaselect', { area });
  }

  async function deleteArea() {
    ws.send('SNAP')
    ws.send(`DELA:${area.id}`);
  }

  function setAreaName(event) {
    const newName = event.target.value;
    ws.send('SNAP')
    ws.send(`SEAN:${area.id}:${newName}`);
  }

  function setAreaColor(event) {
    const newColor = event.target.value;
    ws.send('SNAP')
    ws.send(`SEAC:${area.id}:${newColor}`);
  }

  $: isSelected = selectedArea && selectedArea.id === area.id && selectedArea.parent === area.parent;

  function addClipArea(event) {
    if (event.key === 'Enter') {
      const clip = event.target.value.trim();
      if (clip) {
        ws.send(`ADDCLIP:${area.id}:${clip}`);
        event.target.value = '';
      }
    }
  }

  function removeClipArea(clip) {
    return () => ws.send(`REMCLIP:${area.id}:${clip}`);
  }
</script>

<button class="area-container" class:selected={isSelected} on:click={selectArea}> {#if area.id !== 0}
  <div class="smol clip-areas">
    <i class="bi bi-paperclip"></i>
    {#each area.clipAreas as clip}
      <button on:click={removeClipArea(clip)}>{clip}</button>
    {/each}
    <input type="text" on:keydown={addClipArea} />
    <div class="spacer"></div>
  </div>
  {/if}
  <div class="area-info">
    <input style="color" color={area.color} type="color" value={area.color} disabled={area.id === 0} on:change={setAreaColor} />
    {#if area.id === 0}
      공백
    {:else}
      <input type="text" value={area.name} on:change={setAreaName} disabled={area.id === 0} />
    {/if}
    <div class="spacer"></div>
    {#if area.id !== 0}
      <button on:click={deleteArea}><i class="bi bi-trash"></i></button>
    {/if}
  </div>
  {#if area.id !== 0}
  <div class="smol">
    #{area.id}, {formatWorldArea(area.area)}
  </div>
  {/if}
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
  .smol {
    font-size: 0.8em;
    color: #666;
  }
  .clip-areas {
    flex-wrap: wrap;
    gap: 4px;
  }
  .clip-areas button {
    color: #007bff;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .clip-areas button:hover {
    text-decoration: underline;
  }
  .clip-areas input {
    border: none;
    background: none;
    font-size: 0.8em;
    width: 60px;
  }
  .clip-areas input:focus {
    outline: none;
    border-bottom: 1px solid #ccc;
  }
</style>
