import path from 'node:path';

class Map {
  constructor(name, layer) {
    this.name = name;
    this.layer = layer;
  }

  draw(ctx, x, y, width, height) {
    if (!this.layer || !this.layer.quadtree) return;

    const drawNode = (node, x, y, size) => {
      if (node.isLeaf()) {
        if (node.value !== null && node.value !== undefined) {
          ctx.fillStyle = node.value;
          ctx.fillRect(x, y, size, size);
        }
      } else {
        const halfSize = size / 2;
        drawNode(node.getChild(0), x, y, halfSize); // Top-left
        drawNode(node.getChild(1), x + halfSize, y, halfSize); // Top-right
        drawNode(node.getChild(2), x, y + halfSize, halfSize); // Bottom-left
        drawNode(node.getChild(3), x + halfSize, y + halfSize, halfSize); // Bottom-right
      }
    };

    const layer = this.layer;
    const quadtree = layer.quadtree;
    const layerSize = Math.max(layer.size[0], layer.size[1]);
    const scaleX = width / layerSize;
    const scaleY = height / layerSize;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);
    drawNode(quadtree, 0, 0, layerSize);
    ctx.restore();
  }
}

let layerHighestId = 0;

function getLayerHughestId() {
  return layerHighestId;
}

function setLayerHighestId(id) {
  if (typeof id === 'number' && id >= layerHighestId) {
    layerHighestId = id;
  }
}

class Layer {
  constructor(id, quadtree, parent, pos, size, name) {
    this.id = id;
    this.quadtree = quadtree;
    this.parent = parent;
    this.pos = pos;
    this.size = size;
    this.name = name;
    this.areas = [new Area(0, 'transparent', this, 'None')];
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

function getAreaHighestId() {
  return areaHighestId;
}

function setAreaHighestId(id) {
  if (typeof id === 'number' && id >= areaHighestId) {
    areaHighestId = id;
  }
}

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

  drawPolygon(points, value, depth = 11) {
    if (depth === 0) {
      const pointInPolygon = (x, y, polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const xi = polygon[i][0], yi = polygon[i][1];
          const xj = polygon[j][0], yj = polygon[j][1];

          const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }
      const contained = pointInPolygon(0.5, 0.5, points);
      if (contained) this.set(value);
      return;
    }

    this.divide();

    const halfPoints = points.map(([px, py]) => [px * 2, py * 2]);

    this.children[0].drawPolygon(halfPoints, value, depth - 1);
    this.children[1].drawPolygon(halfPoints.map(([px, py]) => [px - 1, py]), value, depth - 1);
    this.children[2].drawPolygon(halfPoints.map(([px, py]) => [px, py - 1]), value, depth - 1);
    this.children[3].drawPolygon(halfPoints.map(([px, py]) => [px - 1, py - 1]), value, depth - 1);

    this.tryMerge();
  }

  drawLine(x1, y1, x2, y2, width, value, depth = 11) {
    const points = [
      [x1 + Math.cos(Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2) * width / 2, y1 + Math.sin(Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2) * width / 2],
      [x1 + Math.cos(Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2) * width / 2, y1 + Math.sin(Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2) * width / 2],
      [x2 + Math.cos(Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2) * width / 2, y2 + Math.sin(Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2) * width / 2],
      [x2 + Math.cos(Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2) * width / 2, y2 + Math.sin(Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2) * width / 2],
    ];
    return this.drawPolygon(points, value, depth);
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

export {
  Map,
  Layer,
  Area,
  Quadtree,
  serializeMap,
  deserializeMap,
  getLayerHughestId,
  setLayerHighestId,
  getAreaHighestId,
  setAreaHighestId
};
