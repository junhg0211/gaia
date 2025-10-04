<script>
  import Area from './Area.svelte';
  import Layer from './Layer.svelte';
  import { Quadtree, Area as AreaType, Layer as LayerType } from "../dataframe.js";

  export let layer;
  export let ws;
  export let selectedArea;

  let color = "#ff0000";
  let name = "new area";

  async function addArea() {
    ws.send(`NEWA:${layer.id}:${name}:${color}`);
  }

  let layerName = "new layer";

  async function addLayer() {
    ws.send(`NEWL:${layer.id}:${layerName}`);
  }

  async function deleteLayer() {
    ws.send(`DELL:${layer.id}`);
  }
</script>

<div class="layer-container">
  <div class="name">{layer.name}</div>
  <div>
    <button on:click={deleteLayer}>레이어 삭제</button>
    <div class="add-area-inputs">
      <input type="color" bind:value={color} />
      <input type="text" bind:value={name} />
      <button on:click={addArea}>영역 추가</button>
    </div>
    {#each layer.areas as area}
    <Area {ws} {area} {selectedArea} on:areaselect />
    {/each}
  </div>
  <div class="child-layers">
    <div class="add-layer-inputs">
      <input type="text" bind:value={layerName} />
      <button on:click={addLayer}>레이어 추가</button>
    </div>
    {#each layer.children as child}
    <Layer {ws} {selectedArea} layer={child} on:areaselect />
    {/each}
  </div>
</div>

<style>
  .layer-container {
    padding-left: 4px;
    border-left: 1px solid #ccc;
    margin-left: 4px;
  }
  .name {
    font-weight: bold;
    margin-bottom: 4px;
  }
  .add-area-inputs, .add-layer-inputs {
    margin-top: 4px;
    margin-bottom: 4px;
  }
  .add-area-inputs input[type="text"], .add-layer-inputs input[type="text"] {
    margin-left: 4px;
  }
  input[type="color"] {
    padding: 0;
    border: none;
    width: 32px;
    vertical-align: middle;
    background: none;
  }
  .child-layers {
    margin-top: 8px;
  }
</style>
