<script>
  import Area from './Area.svelte';
  import Layer from './Layer.svelte';

  export let layer;
</script>

<div class="layer-container">
  <div>{layer.name}</div>
  <div>
    {#each layer.areas as area}
    <Area {area} />
    {/each}
  </div>
  <div>
    {#each layer.children as child}
      <Layer layer={child} />
    {/each}
  </div>
</div>

<style>
  .layer-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
