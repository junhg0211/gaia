<script>
  import Layer from './Layer.svelte';

  export let map;
  export let ws;
  export let selectedArea;
</script>

<div class="map-container">
  <div>{map.name}</div>
  <Layer {selectedArea} {ws} layer={map.layer} on:areaselect />
</div>

<style>
  .map-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
