<script>
  import Area from './Area.svelte';
  import Layer from './Layer.svelte';
  import { Quadtree, Area as AreaType, Layer as LayerType } from "../dataframe.js";
  import "bootstrap-icons/font/bootstrap-icons.css";

  export let layer;
  export let ws;
  export let selectedArea;

  let color = "#000000";
  let name = "새 영역";

  async function addArea() {
    ws.send(`NEWA:${layer.id}:${name}:${color}`);
  }

  let layerName = "새 레이어";

  async function addLayer() {
    ws.send(`NEWL:${layer.id}:${layerName}`);
  }

  async function deleteLayer() {
    ws.send(`DELL:${layer.id}`);
  }

  function changeLayerName(event) {
    const newName = event.target.value;
    ws.send(`SELN:${layer.id}:${newName}`);
  }

  let unfold = true;

  function upLayer() {
    const index = layer.parent.children.indexOf(layer) - 1;
    ws.send(`LYOD:${layer.id}:${index}`);
  }

  function downLayer() {
    const index = layer.parent.children.indexOf(layer) + 2;
    ws.send(`LYOD:${layer.id}:${index}`);
  }
</script>

<div class="layer-container">
  <div class="name">
    <input type="checkbox" bind:checked={unfold} />
    <input type="text" bind:value={layer.name} on:change={changeLayerName} />
  </div>
  {#if unfold}
  <div>
    <div class="add-area-inputs">
      <button on:click={deleteLayer}><i class="bi bi-trash"></i></button>
      <button on:click={addArea}><i class="bi bi-palette2"></i></button>
      <button on:click={upLayer}><i class="bi bi-arrow-up"></i></button>
      <button on:click={downLayer}><i class="bi bi-arrow-down"></i></button>
    </div>
    {#each layer.areas as area}
    <Area {ws} {area} {selectedArea} on:areaselect />
    {/each}
  </div>
  <div class="child-layers">
    <div class="add-layer-inputs">
      <button on:click={addLayer}><i class="bi bi-file-plus"></i></button>
    </div>
    {#each layer.children as child}
    <Layer {ws} {selectedArea} layer={child} on:areaselect />
    {/each}
  </div>
  {/if}
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
