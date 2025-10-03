<script>
  import Area from './Area.svelte';
  import Layer from './Layer.svelte';
  import { createEventDispatcher } from 'svelte';

  export let layer;

  const dispatch = createEventDispatcher();
  function addArea() {
    dispatch('addArea', { layerId: layer.id });
  }
  function addLayer() {
    dispatch('addLayer', { parentId: layer.id });
  }

  function passThrough(event) {
    dispatch(event.type, event.detail);
  }
</script>

<div class="layer-container">
  <div>{layer.name}</div>
  <div>
    <button on:click={addArea}>영역 추가</button>
    {#each layer.areas as area}
      <Area {area} />
    {/each}
  </div>
  <div>
    <button on:click={addLayer}>레이어 추가</button>
    {#each layer.children as child}
    <Layer layer={child} on:addLayer={passThrough} on:addArea={passThrough} />
    {/each}
  </div>
</div>

<style>
  .layer-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
