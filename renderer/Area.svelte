<script>
  import { createEventDispatcher } from 'svelte';

  export let area;

  const dispatch = createEventDispatcher();

  function selectArea() {
    dispatch('areaselect', { area });
  }
</script>

<div class="area-container">
  <div>{area.name}</div>
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
