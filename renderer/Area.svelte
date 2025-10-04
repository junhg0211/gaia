<script>
  import { createEventDispatcher } from 'svelte';

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

  $: isSelected = selectedArea && selectedArea.id === area.id && selectedArea.parent === area.parent;
</script>

<button class="area-container" class:selected={isSelected } on:click={selectArea}>
  <div>{area.name} <span style="color: {area.color};">•</span></div>
  <div>
    <button on:click={deleteArea}>영역 삭제</button>
  </div>
</button>

<style>
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
