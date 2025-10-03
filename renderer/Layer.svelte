<script>
  import Area from './Area.svelte';
  import Layer from './Layer.svelte';
  import { Quadtree, Area as AreaType, Layer as LayerType } from "../dataframe.js";

  export let layer;
  export let ws;

  let color = "#ff0000";
  let name = "new area";

  async function addArea() {
    ws.send(`NEWA:${layer.id}:${name}:${color}`);
  }

  let layerName = "new layer";

  async function addLayer() {
    ws.send(`NEWL:${layer.id}:${layerName}`);
  }
</script>

<div class="layer-container">
  <div>{layer.name}</div>
  <div>
    <button on:click={addArea}>영역 추가</button>
    <div>
      <input type="color" bind:value={color} />
      <input type="text" bind:value={name} />
    </div>
    {#each layer.areas as area}
    <Area {area} on:areaselect />
    {/each}
  </div>
  <div>
    <button on:click={addLayer}>레이어 추가</button>
    <div>
      <input type="text" bind:value={layerName} />
    </div>
    {#each layer.children as child}
    <Layer {ws} layer={child} />
    {/each}
  </div>
</div>

<style>
  .layer-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
  }
</style>
