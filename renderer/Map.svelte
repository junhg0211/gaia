<script>
  import Layer from './Layer.svelte';

  export let map;

  function addArea(event) {
    console.log('Map received addArea event:', event.detail);
  }

  function addLayer(event) {
    console.log('Map received addLayer event:', event.detail);
  }
</script>

<div class="map-container">
  <div>{map.name}</div>
  <Layer layer={map.layer} on:addLayer={addLayer} on:addArea={addArea} />
</div>

<style>
  .map-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
