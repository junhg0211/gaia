import { promises as fs } from 'node:fs';
import path from 'node:path';

class Map {
  constructor(name, layer) {
    this.name = name;
    this.layer = layer;
  }
}

let layerHighestId = 0;

class Layer {

  constructor(id, quadtree, parent, pos, size, name) {
    this.id = id;
    this.quadtree = quadtree;
    this.parent = parent;
    this.pos = pos;
    this.size = size;
    this.name = name;
    this.areas = [];
    this.children = [];

    if (this.id === undefined || this.id === null) {
      this.id = Layer.getNextId();
    } else if (this.id > layerHighestId) {
      layerHighestId = this.id;
    }
  }

  static getNextId() {
    return ++layerHighestId;
  }
}

let areaHighestId = 0;

class Area {

  constructor(id, color, parent, name) {
    this.id = id;
    this.color = color;
    this.parent = parent;
    this.name = name;

    if (this.id === undefined || this.id === null) {
      this.id = Area.getNextId();
    } else if (this.id > areaHighestId) {
      areaHighestId = this.id;
    }
  }

  static getNextId() {
    return ++areaHighestId;
  }
}

class Quadtree {
  constructor(value, parent = null) {
    this.value = value;
    this.parent = parent;
    this.children = null;
  }

  isLeaf() {
    return this.children === null;
  }

  divide() {
    if (!this.isLeaf()) return;

    this.children = [
      new Quadtree(this.value, this),
      new Quadtree(this.value, this),
      new Quadtree(this.value, this),
      new Quadtree(this.value, this),
    ];
  }

  getChild(index) {
    if (this.isLeaf()) return null;
    return this.children[index];
  }

  set(value) {
    this.value = value;
    this.children = null;
  }

  tryMerge() {
    if (this.isLeaf()) return;

    this.children.forEach(child => child.tryMerge());

    const firstValue = this.children[0].value;
    const allSame = this.children.every(child => child.isLeaf() && child.value === firstValue);

    if (allSame) {
      this.set(firstValue);
    }
  }

  drawCircle(x, y, radius, value, depth = 11) {
    if (depth === 0) {
      const contained = Math.hypot(x - 0.5, y - 0.5) <= radius;
      if (contained) this.set(value);
      return;
    }

    this.divide();

    const distLU = Math.hypot(x - 0, y - 0);
    const distRU = Math.hypot(x - 1, y - 0);
    const distLD = Math.hypot(x - 0, y - 1);
    const distRD = Math.hypot(x - 1, y - 1);

    if (distLU <= radius) this.children[0].drawCircle((x - 0) * 2, (y - 0) * 2, radius * 2, value, depth - 1);
    if (distRU <= radius) this.children[1].drawCircle((x - 1) * 2, (y - 0) * 2, radius * 2, value, depth - 1);
    if (distLD <= radius) this.children[2].drawCircle((x - 0) * 2, (y - 1) * 2, radius * 2, value, depth - 1);
    if (distRD <= radius) this.children[3].drawCircle((x - 1) * 2, (y - 1) * 2, radius * 2, value, depth - 1);

    this.tryMerge();
  }
}

function serializeQuadtree(node) {
  if (!node) return null;

  if (node.isLeaf()) {
    return { value: node.value };
  }

  return {
    value: node.value,
    children: node.children.map(child => serializeQuadtree(child)),
  };
}

function serializeArea(area) {
  return {
    id: area.id,
    color: area.color,
    name: area.name,
  };
}

function serializeLayer(layer) {
  if (!layer) return null;

  return {
    id: layer.id,
    name: layer.name,
    pos: layer.pos,
    size: layer.size,
    quadtree: serializeQuadtree(layer.quadtree),
    areas: layer.areas.map(area => serializeArea(area)),
    children: layer.children.map(child => serializeLayer(child)),
  };
}

function serializeMap(map) {
  return {
    name: map.name,
    layer: serializeLayer(map.layer),
  };
}

function deserializeQuadtree(data, parent = null) {
  if (!data) return null;

  const node = new Quadtree(data.value, parent);
  if (Array.isArray(data.children) && data.children.length > 0) {
    node.children = data.children.map(child => deserializeQuadtree(child, node));
  }
  return node;
}

function deserializeArea(data, parent) {
  return new Area(data.id, data.color, parent, data.name);
}

function deserializeLayer(data, parent = null) {
  if (!data) return null;

  const quadtree = deserializeQuadtree(data.quadtree);
  const layer = new Layer(data.id, quadtree, parent, data.pos ?? null, data.size ?? null, data.name);

  layer.areas = (data.areas ?? []).map(areaData => deserializeArea(areaData, layer));
  layer.children = (data.children ?? []).map(childData => deserializeLayer(childData, layer));

  return layer;
}

function deserializeMap(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('Invalid map data');
  }

  const layer = deserializeLayer(data.layer, null);
  return new Map(data.name, layer);
}

async function saveMapToFile(map, filename) {
  if (!(map instanceof Map)) {
    throw new TypeError('Expected map to be an instance of Map');
  }

  if (typeof filename !== 'string' || filename.length === 0) {
    throw new TypeError('Filename must be a non-empty string');
  }

  const serialized = serializeMap(map);
  const contents = JSON.stringify(serialized, null, 2);

  const directory = path.dirname(filename);
  if (directory && directory !== '.') {
    await fs.mkdir(directory, { recursive: true });
  }

  await fs.writeFile(filename, contents, 'utf8');
}

async function loadMapFromFile(filename) {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new TypeError('Filename must be a non-empty string');
  }

  const raw = await fs.readFile(filename, 'utf8');
  const data = JSON.parse(raw);

  layerHighestId = 0;
  areaHighestId = 0;

  return deserializeMap(data);
}

export { Map, Layer, Area, Quadtree, saveMapToFile, loadMapFromFile };
