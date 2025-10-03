<script>
  import Layer from './Layer.svelte';

  export let map;
</script>

<div class="map-container">
  <div>{map.name}</div>
  <Layer layer={map.layer} />
</div>

<style>
  .map-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
