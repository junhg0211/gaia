<script>
  import { createEventDispatcher } from 'svelte';

  export let area;
  export let ws;

  const dispatch = createEventDispatcher();

  function selectArea() {
    dispatch('areaselect', { area });
  }

  async function deleteArea() {
    ws.send(`DELA:${area.id}`);
  }
</script>

<div class="area-container">
  <div>{area.name} <span style="color: {area.color};">•</span></div>
  <div>
    <button on:click={deleteArea}>영역 삭제</button>
  </div>
  <div>
    <button on:click={selectArea}>영역 선택</button>
  </div>
</div>

<style>
  .area-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
