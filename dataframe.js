import path from 'node:path';

const EPSILON = 1e-9;

function pointOnSegment(px, py, ax, ay, bx, by) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > EPSILON) return false;

  const minX = Math.min(ax, bx) - EPSILON;
  const maxX = Math.max(ax, bx) + EPSILON;
  const minY = Math.min(ay, by) - EPSILON;
  const maxY = Math.max(ay, by) + EPSILON;

  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (pointOnSegment(x, y, xi, yi, xj, yj)) return true;

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || EPSILON) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

function polygonBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

function rectsOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function rectFullyInside(inner, outer) {
  return (
    inner.minX >= outer.minX - EPSILON &&
    inner.maxX <= outer.maxX + EPSILON &&
    inner.minY >= outer.minY - EPSILON &&
    inner.maxY <= outer.maxY + EPSILON
  );
}

function clipHasRestrictions(clip) {
  return !!(clip && clip.hasRestrictions);
}

function clipAllowsLeaf(clip, value, bounds) {
  if (!clipHasRestrictions(clip)) return true;
  if (clip.allowsValue(value)) return true;
  if (clip.externalCovers(bounds)) return true;
  return clip.externalIntersects(bounds);
}

function pointInRect(x, y, rect) {
  return x >= rect.minX - EPSILON && x <= rect.maxX + EPSILON && y >= rect.minY - EPSILON && y <= rect.maxY + EPSILON;
}

function orientation(ax, ay, bx, by, cx, cy) {
  const value = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(value) < EPSILON) return 0;
  return value > 0 ? 1 : -1;
}

function segmentsIntersect(a, b, c, d) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const [cx, cy] = c;
  const [dx, dy] = d;

  const o1 = orientation(ax, ay, bx, by, cx, cy);
  const o2 = orientation(ax, ay, bx, by, dx, dy);
  const o3 = orientation(cx, cy, dx, dy, ax, ay);
  const o4 = orientation(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && pointOnSegment(cx, cy, ax, ay, bx, by)) return true;
  if (o2 === 0 && pointOnSegment(dx, dy, ax, ay, bx, by)) return true;
  if (o3 === 0 && pointOnSegment(ax, ay, cx, cy, dx, dy)) return true;
  if (o4 === 0 && pointOnSegment(bx, by, cx, cy, dx, dy)) return true;

  return false;
}

function segmentIntersectsRect(a, b, rect) {
  if (pointInRect(a[0], a[1], rect) || pointInRect(b[0], b[1], rect)) return true;

  const corners = [
    [rect.minX, rect.minY],
    [rect.maxX, rect.minY],
    [rect.maxX, rect.maxY],
    [rect.minX, rect.maxY],
  ];

  const edges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  for (const [start, end] of edges) {
    if (segmentsIntersect(a, b, start, end)) return true;
  }

  return false;
}

function polygonIntersectsRect(points, rect, cachedBounds) {
  const bounds = cachedBounds ?? polygonBounds(points);
  if (!rectsOverlap(rect, bounds)) return false;

  if (
    rect.minX >= bounds.minX && rect.maxX <= bounds.maxX &&
    rect.minY >= bounds.minY && rect.maxY <= bounds.maxY &&
    points.length === 0
  ) {
    return false;
  }

  const corners = [
    [rect.minX, rect.minY],
    [rect.maxX, rect.minY],
    [rect.maxX, rect.maxY],
    [rect.minX, rect.maxY],
  ];

  for (const point of points) {
    if (pointInRect(point[0], point[1], rect)) return true;
  }

  for (const corner of corners) {
    if (pointInPolygon(corner[0], corner[1], points)) return true;
  }

  const centerX = (rect.minX + rect.maxX) / 2;
  const centerY = (rect.minY + rect.maxY) / 2;
  if (pointInPolygon(centerX, centerY, points)) return true;

  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    if (segmentIntersectsRect(start, end, rect)) return true;
  }

  return false;
}

function circleContainsRect(cx, cy, radius, rect) {
  const corners = [
    [rect.minX, rect.minY],
    [rect.maxX, rect.minY],
    [rect.maxX, rect.maxY],
    [rect.minX, rect.maxY],
  ];

  for (const [x, y] of corners) {
    if (Math.hypot(x - cx, y - cy) > radius + EPSILON) {
      return false;
    }
  }

  return true;
}

function circleIntersectsRect(cx, cy, radius, rect) {
  const closestX = Math.max(rect.minX, Math.min(cx, rect.maxX));
  const closestY = Math.max(rect.minY, Math.min(cy, rect.maxY));
  const distance = Math.hypot(closestX - cx, closestY - cy);
  return distance <= radius + EPSILON;
}

function polygonContainsRect(points, rect) {
  const corners = [
    [rect.minX, rect.minY],
    [rect.maxX, rect.minY],
    [rect.maxX, rect.maxY],
    [rect.minX, rect.maxY],
  ];

  return corners.every(corner => pointInPolygon(corner[0], corner[1], points));
}

class Map {
  constructor(name, layer) {
    this.name = name;
    this.layer = layer;
  }

  findArea(id) {
    id = Number(id);
    const searchArea = (layer, id) => {
      for (const area of layer.areas) {
        if (area.id === id) return area;
      }
      for (const child of layer.children) {
        const found = searchArea(child, id);
        if (found) return found;
      }
      return null;
    };
    return searchArea(this.layer, id);
  }

  findLayer(id) {
    const searchLayer = (layer, id) => {
      if (layer.id === id) return layer;
      for (const child of layer.children) {
        const found = searchLayer(child, id);
        if (found) return found;
      }
      return null;
    };
    return searchLayer(this.layer, id);
  }

  replaceLayer(nextLayer, parentId = null) {
    if (!(nextLayer instanceof Layer)) {
      throw new TypeError('Expected nextLayer to be an instance of Layer');
    }

    if (parentId === null) {
      nextLayer.parent = null;
      this.layer = nextLayer;
      return true;
    }

    const parentLayer = this.findLayer(parentId);
    if (!parentLayer) return false;

    const existingIndex = parentLayer.children.findIndex(child => child.id === nextLayer.id);
    if (existingIndex === -1) {
      parentLayer.children.push(nextLayer);
    } else {
      parentLayer.children[existingIndex] = nextLayer;
    }
    nextLayer.parent = parentLayer;
    return true;
  }

  draw(ctx, canvas, camera, depth = 11) {
    const drawLayer = layer => {
      const [px, py] = layer.pos;
      const [sx, sy] = layer.size;

      const x = camera.toScreenX(px);
      const y = camera.toScreenY(py);
      const w = sx * camera.zoom;
      const h = sy * camera.zoom;

      const drawNode = (node, x, y, w, h, depth) => {
        if (!node) return;

        if (node.isLeaf()) {
          if (node.value !== 0) {
            const area = layer.areas.find(a => a.id === node.value);
            if (area.color === 'transparent') return;

            ctx.fillStyle = area.color;
            ctx.fillRect(x, y, w, h);
          }
          return;
        }

        const hw = w / 2;
        const hh = h / 2;

        drawNode(node.getChild(0), x, y, hw, hh, depth - 1);
        drawNode(node.getChild(1), x + hw, y, hw, hh, depth - 1);
        drawNode(node.getChild(2), x, y + hh, hw, hh, depth - 1);
        drawNode(node.getChild(3), x + hw, y + hh, hw, hh, depth - 1);
      };

      if (layer.visible)
        drawNode(layer.quadtree, x, y, w, h, depth);

      const reversedLayers = [...layer.children].reverse();
      for (const child of reversedLayers) {
        drawLayer(child);
      }
    }

    drawLayer(this.layer);
  }
}

let layerHighestId = 0;

function getLayerHighestId() {
  return layerHighestId;
}

function setLayerHighestId(id) {
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    throw new TypeError('Layer highest id must be a finite number');
  }
  layerHighestId = Math.max(0, Math.trunc(id));
}

const getLayerHughestId = getLayerHighestId;

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
    if (this.quadtree) {
      this.quadtree.parent = null;
    }

    if (this.id === undefined || this.id === null) {
      this.id = Layer.getNextId();
    } else if (this.id > layerHighestId) {
      layerHighestId = this.id;
    }
  }

  static getNextId() {
    return ++layerHighestId;
  }

  mergeAreas(ids) {
    const validIds = ids.filter(id => id !== 0);

    if (validIds.length === 0) return;

    const targetId = validIds[0];
    for (let i = 1; i < validIds.length; i++) {
      const id = validIds[i];
      this.quadtree.changeValue(id, targetId);
      this.areas = this.areas.filter(area => area.id !== id);
    }
    this.quadtree.tryMerge();
  }

  calculateAreas() {
    const area = {};
    const traverse = (node, bounds) => {
      if (node.isLeaf()) {
        if (node.value !== 0) {
          if (!area[node.value]) {
            area[node.value] = 0;
          }
          area[node.value] += (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
        }
        return;
      }

      const midX = (bounds.minX + bounds.maxX) / 2;
      const midY = (bounds.minY + bounds.maxY) / 2;
      const childBounds = [
        { minX: bounds.minX, minY: bounds.minY, maxX: midX, maxY: midY },
        { minX: midX, minY: bounds.minY, maxX: bounds.maxX, maxY: midY },
        { minX: bounds.minX, minY: midY, maxX: midX, maxY: bounds.maxY },
        { minX: midX, minY: midY, maxX: bounds.maxX, maxY: bounds.maxY },
      ];

      for (let i = 0; i < 4; i++) {
        const child = node.getChild(i);
        if (child) {
          traverse(child, childBounds[i]);
        }
      }
    };

    const bounds = this.getBounds();
    traverse(this.quadtree, bounds);
    for (const areaObj of this.areas) {
      areaObj.area = area[areaObj.id] || 0;
    }
  }

  calculateAllAreas() {
    this.calculateAreas();
    for (const child of this.children) {
      child.calculateAllAreas();
    }
  }

  expandTo(x, y) {
    const [px, py] = this.pos;
    const [sx, sy] = this.size;

    if (px <= x && x <= px + sx && py <= y && y <= py + sy) {
      this.quadtree.tryMerge();
      return;
    }

    this.size = [sx * 2, sy * 2];
    if (x < px + sx / 2) {
      if (y < py + sy / 2) {
        this.quadtree.expandBeing(3);
        this.pos = [px - sx, py - sy];
      } else {
        this.quadtree.expandBeing(1);
        this.pos = [px - sx, py];
      }
    } else {
      if (y < py + sy / 2) {
        this.quadtree.expandBeing(2);
        this.pos = [px, py - sy];
      } else {
        this.quadtree.expandBeing(0);
        this.pos = [px, py];
      }
    }

    this.expandTo(x, y);
  }

  removeArea(areaId) {
    if (areaId === 0) return;

    this.quadtree.changeValue(areaId, 0);
    this.areas = this.areas.filter(area => area.id !== areaId);
  }

  cleanup() {
    if (!this.quadtree || !this.quadtree.children) return;

    const nonEmptyChildren = this.quadtree.children.filter(child => !child.isLeaf() || child.value !== 0);
    if (nonEmptyChildren.length !== 1) return;

    const childIndex = this.quadtree.children.indexOf(nonEmptyChildren[0]);
    const [px, py] = this.pos;
    const [sx, sy] = this.size;

    const halfSx = sx / 2;
    const halfSy = sy / 2;

    switch (childIndex) {
      case 0:
        this.pos = [px, py];
        break;
      case 1:
        this.pos = [px + halfSx, py];
        break;
      case 2:
        this.pos = [px, py + halfSy];
        break;
      case 3:
        this.pos = [px + halfSx, py + halfSy];
        break;
    }

    this.size = [halfSx, halfSy];
    this.quadtree = nonEmptyChildren[0];
    this.quadtree.parent = null;
    if (typeof this.quadtree.markDirty === 'function') {
      this.quadtree.markDirty();
    }

    this.cleanup();
  }

  getBounds() {
    const [px, py] = this.pos ?? [0, 0];
    const [sx, sy] = this.size ?? [1, 1];
    return { minX: px, minY: py, maxX: px + sx, maxY: py + sy };
  }

  sampleValueAt(x, y, precision) {
    const bounds = this.getBounds();
    const [sx] = this.size ?? [1, 1];
    const width = Math.max(sx, EPSILON);
    const safePrecision = typeof precision === 'number' && precision > 0 ? precision : width;
    const rawDepth = Math.log2(width / safePrecision);
    const depth = Math.max(0, Math.min(16, Math.round(rawDepth)));
    return this.quadtree.getValueAt(x, y, depth, bounds);
  }

  floodFill(x, y, newValue, precision, options = {}) {
    if (!Number.isFinite(newValue)) {
      throw new TypeError('newValue must be a finite number');
    }

    const bounds = this.getBounds();
    const [sx, sy] = this.size ?? [1, 1];
    const width = Math.max(sx, EPSILON);
    const height = Math.max(sy, EPSILON);
    const safePrecision = typeof precision === 'number' && precision > 0 ? precision : width;
    const rawDepth = Math.log2(width / safePrecision);
    const depth = Math.max(0, Math.min(16, Math.round(rawDepth)));
    const cellsPerAxis = Math.max(1, 1 << depth);
    const cellWidth = width / cellsPerAxis;
    const cellHeight = height / cellsPerAxis;

    if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) {
      return { filled: 0, reason: 'invalid_precision' };
    }

    const originX = bounds.minX;
    const originY = bounds.minY;

    const startX = Math.floor((x - originX) / cellWidth);
    const startY = Math.floor((y - originY) / cellHeight);

    if (startX < 0 || startX >= cellsPerAxis || startY < 0 || startY >= cellsPerAxis) {
      return { filled: 0, reason: 'out_of_bounds' };
    }

    const sampleX = originX + (startX + 0.5) * cellWidth;
    const sampleY = originY + (startY + 0.5) * cellHeight;
    const targetValue = this.quadtree.getValueAt(sampleX, sampleY, depth, bounds);

    if (targetValue === newValue) {
      return { filled: 0, reason: 'already_filled', targetValue };
    }

    const baselineLimit = Math.max(1, Math.trunc(options.maxCells ?? 200000));
    const autoScale = options.autoScaleMaxCells !== false;
    const gridSize = cellsPerAxis * cellsPerAxis;
    let maxCells = baselineLimit;
    if (autoScale) {
      const limitCap = Math.max(baselineLimit, Math.trunc(options.maxCellsCap ?? 2000000));
      maxCells = Math.min(limitCap, Math.max(baselineLimit, gridSize));
    }

    const visitedArrayThreshold = Math.max(1, Math.trunc(options.maxVisitedArraySize ?? 8000000));
    const useArrayVisited = gridSize <= visitedArrayThreshold;
    const visitedArray = useArrayVisited ? new Uint8Array(gridSize) : null;
    const visitedSet = useArrayVisited ? null : new Set();
    const stack = [startY * cellsPerAxis + startX];
    const rows = new globalThis.Map();
    let fillCount = 0;
    let touchesBoundary = false;

    while (stack.length > 0) {
      const current = stack.pop();
      const cx = current % cellsPerAxis;
      const cy = Math.floor(current / cellsPerAxis);
      if (cx < 0 || cx >= cellsPerAxis || cy < 0 || cy >= cellsPerAxis) {
        continue;
      }

      if (cx === 0 || cy === 0 || cx === cellsPerAxis - 1 || cy === cellsPerAxis - 1) {
        touchesBoundary = true;
      }

      const alreadyVisited = useArrayVisited ? visitedArray[current] === 1 : visitedSet.has(current);
      if (alreadyVisited) {
        continue;
      }
      if (useArrayVisited) {
        visitedArray[current] = 1;
      } else {
        visitedSet.add(current);
      }

      const centerX = originX + (cx + 0.5) * cellWidth;
      const centerY = originY + (cy + 0.5) * cellHeight;
      const cellValue = this.quadtree.getValueAt(centerX, centerY, depth, bounds);
      if (cellValue !== targetValue) {
        continue;
      }

      let row = rows.get(cy);
      if (!row) {
        row = [];
        rows.set(cy, row);
      }
      row.push(cx);
      fillCount += 1;
      if (fillCount > maxCells) {
        return { filled: 0, reason: 'limit_exceeded', targetValue, limit: maxCells };
      }

      if (cx + 1 < cellsPerAxis) stack.push(cy * cellsPerAxis + (cx + 1));
      if (cx > 0) stack.push(cy * cellsPerAxis + (cx - 1));
      if (cy + 1 < cellsPerAxis) stack.push((cy + 1) * cellsPerAxis + cx);
      if (cy > 0) stack.push((cy - 1) * cellsPerAxis + cx);
    }

    if (fillCount === 0) {
      return { filled: 0, reason: 'no_target', targetValue };
    }

    const allowOpenSpace = options.allowOpenSpace ?? false;
    if (targetValue === 0 && !allowOpenSpace && touchesBoundary) {
      return { filled: 0, reason: 'open_space', targetValue, touchesBoundary: true };
    }

    // Batch contiguous cells into rectangles to reduce quadtree writes
    const sortedRows = [...rows.keys()].sort((a, b) => a - b);
    let activeSegments = new globalThis.Map();
    const rectangles = [];

    for (const rowIndex of sortedRows) {
      const cols = rows.get(rowIndex);
      if (!cols || cols.length === 0) continue;
      cols.sort((a, b) => a - b);

      const segments = [];
      let segStart = cols[0];
      let prev = cols[0];
      for (let i = 1; i < cols.length; i++) {
        const current = cols[i];
        if (current === prev) continue;
        if (current === prev + 1) {
          prev = current;
          continue;
        }
        segments.push({ start: segStart, end: prev });
        segStart = current;
        prev = current;
      }
      segments.push({ start: segStart, end: prev });

      const nextActive = new globalThis.Map();
      for (const segment of segments) {
        const key = `${segment.start}:${segment.end}`;
        const existing = activeSegments.get(key);
        if (existing) {
          existing.endRow = rowIndex;
          nextActive.set(key, existing);
        } else {
          nextActive.set(key, {
            startRow: rowIndex,
            endRow: rowIndex,
            startCol: segment.start,
            endCol: segment.end,
          });
        }
      }

      for (const [key, rect] of activeSegments.entries()) {
        if (!nextActive.has(key)) {
          rectangles.push(rect);
        }
      }

      activeSegments = nextActive;
    }

    for (const rect of activeSegments.values()) {
      rectangles.push(rect);
    }

    for (const rect of rectangles) {
      const minX = originX + rect.startCol * cellWidth;
      const minY = originY + rect.startRow * cellHeight;
      const maxX = originX + (rect.endCol + 1) * cellWidth;
      const maxY = originY + (rect.endRow + 1) * cellHeight;
      this.quadtree.drawRect(minX, minY, maxX, maxY, newValue, depth, bounds);
    }

    this.cleanup();

    return { filled: fillCount, targetValue, touchesBoundary };
  }
}

let areaHighestId = 0;

function getAreaHighestId() {
  return areaHighestId;
}

function setAreaHighestId(id) {
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    throw new TypeError('Area highest id must be a finite number');
  }
  areaHighestId = Math.max(0, Math.trunc(id));
}

class Area {
  constructor(id, color, parent, name) {
    this.id = id;
    this.color = color;
    this.parent = parent;
    this.name = name;
    this.area = 0;
    this.clipAreas = [];

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
    this.version = 0;
  }

  findValueAt(x, y) {
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }

    if (this.isLeaf()) {
      return this.value;
    }

    const midX = 0.5;
    const midY = 0.5;
    let childIndex;
    if (x < midX) {
      if (y < midY) {
        childIndex = 0;
      } else {
        childIndex = 2;
      }
    } else {
      if (y < midY) {
        childIndex = 1;
      } else {
        childIndex = 3;
      }
    }

    const child = this.getChild(childIndex);
    if (!child) {
      return this.value;
    }
    const newX = (x - (childIndex % 2) * midX) * 2;
    const newY = (y - Math.floor(childIndex / 2) * midY) * 2;
    return child.findValueAt(newX, newY);
  }

  isLeaf() {
    return this.children === null;
  }

  markDirty() {
    this.version = (this.version || 0) + 1;
    if (this.parent && typeof this.parent.markDirty === 'function') {
      this.parent.markDirty();
    }
  }

  divide() {
    if (!this.isLeaf()) return;

    this.children = [
      new Quadtree(this.value, this),
      new Quadtree(this.value, this),
      new Quadtree(this.value, this),
      new Quadtree(this.value, this),
    ];
    this.markDirty();
  }

  getChild(index) {
    if (this.isLeaf()) return null;
    return this.children[index];
  }

  set(value) {
    const valueChanged = this.value !== value || !this.isLeaf();
    this.value = value;
    this.children = null;
    if (valueChanged) {
      this.markDirty();
    }
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

  canFillEntireNode(clipContext, bounds) {
    if (!clipContext || !clipContext.hasRestrictions) return true;
    if (clipContext.externalCovers(bounds)) return true;

    if (this.isLeaf()) {
      return clipContext.allowsValue(this.value);
    }

    if (!this.children || this.children.length !== 4) {
      return clipContext.allowsValue(this.value);
    }

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;

    const childBounds = [
      { minX: bounds.minX, minY: bounds.minY, maxX: midX, maxY: midY },
      { minX: midX, minY: bounds.minY, maxX: bounds.maxX, maxY: midY },
      { minX: bounds.minX, minY: midY, maxX: midX, maxY: bounds.maxY },
      { minX: midX, minY: midY, maxX: bounds.maxX, maxY: bounds.maxY },
    ];

    for (let i = 0; i < 4; i++) {
      const child = this.children[i];
      if (!child) {
        if (!clipContext.allowsValue(this.value)) return false;
        continue;
      }
      if (!child.canFillEntireNode(clipContext, childBounds[i])) return false;
    }

    return true;
  }

  drawCircle(x, y, radius, value, depth = 11, bounds, clipContext) {
    const nodeBounds = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };

    if (!circleIntersectsRect(x, y, radius, nodeBounds)) return;

    const fullyCovered = circleContainsRect(x, y, radius, nodeBounds);
    const shouldForceDivide = clipContext && typeof clipContext.shouldSubdivide === 'function' ? clipContext.shouldSubdivide(nodeBounds, depth) : false;

    if ((fullyCovered || depth <= 0) && !shouldForceDivide && this.canFillEntireNode(clipContext, nodeBounds)) {
      this.set(value);
      return;
    }

    if (depth <= 0 && !shouldForceDivide) {
      if (!clipContext || clipAllowsLeaf(clipContext, this.value, nodeBounds)) {
        this.set(value);
      }
      return;
    }

    if (fullyCovered && this.isLeaf() && !shouldForceDivide && (!clipContext || clipAllowsLeaf(clipContext, this.value, nodeBounds))) {
      this.set(value);
      return;
    }

    const midX = (nodeBounds.minX + nodeBounds.maxX) / 2;
    const midY = (nodeBounds.minY + nodeBounds.maxY) / 2;

    const childBounds = [
      { minX: nodeBounds.minX, minY: nodeBounds.minY, maxX: midX, maxY: midY },
      { minX: midX, minY: nodeBounds.minY, maxX: nodeBounds.maxX, maxY: midY },
      { minX: nodeBounds.minX, minY: midY, maxX: midX, maxY: nodeBounds.maxY },
      { minX: midX, minY: midY, maxX: nodeBounds.maxX, maxY: nodeBounds.maxY },
    ];

    let subdivided = false;

    for (let i = 0; i < 4; i++) {
      const childBound = childBounds[i];
      if (!circleIntersectsRect(x, y, radius, childBound)) continue;
      if (!subdivided) {
        this.divide();
        subdivided = true;
      }
      this.children[i].drawCircle(x, y, radius, value, depth - 1, childBound, clipContext);
    }

    if (subdivided) {
      this.tryMerge();
    }
  }

  drawPolygon(points, value, depth = 11, bounds, polygonBoundsCache, clipContext) {
    const nodeBounds = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const polyBounds = polygonBoundsCache ?? polygonBounds(points);

    if (!rectsOverlap(nodeBounds, polyBounds)) return;

    const fullyCovered = polygonContainsRect(points, nodeBounds);
    const shouldForceDivide = clipContext && typeof clipContext.shouldSubdivide === 'function' ? clipContext.shouldSubdivide(nodeBounds, depth) : false;

    if (fullyCovered && !shouldForceDivide && this.canFillEntireNode(clipContext, nodeBounds)) {
      this.set(value);
      return;
    }

    if (fullyCovered && this.isLeaf() && !shouldForceDivide && (!clipContext || clipAllowsLeaf(clipContext, this.value, nodeBounds))) {
      this.set(value);
      return;
    }

    const intersects = polygonIntersectsRect(points, nodeBounds, polyBounds);
    if (!intersects) {
      return;
    }

    if (depth <= 0 && !shouldForceDivide) {
      if (this.canFillEntireNode(clipContext, nodeBounds)) {
        this.set(value);
        return;
      }
      if (!clipContext || clipAllowsLeaf(clipContext, this.value, nodeBounds)) {
        this.set(value);
      }
      return;
    }

    const midX = (nodeBounds.minX + nodeBounds.maxX) / 2;
    const midY = (nodeBounds.minY + nodeBounds.maxY) / 2;

    const childBounds = [
      { minX: nodeBounds.minX, minY: nodeBounds.minY, maxX: midX, maxY: midY },
      { minX: midX, minY: nodeBounds.minY, maxX: nodeBounds.maxX, maxY: midY },
      { minX: nodeBounds.minX, minY: midY, maxX: midX, maxY: nodeBounds.maxY },
      { minX: midX, minY: midY, maxX: nodeBounds.maxX, maxY: nodeBounds.maxY },
    ];

    let subdivided = false;

    for (let i = 0; i < 4; i++) {
      const childBound = childBounds[i];
      if (!rectsOverlap(childBound, polyBounds)) continue;
      if (!polygonIntersectsRect(points, childBound, polyBounds)) continue;

      if (!subdivided) {
        this.divide();
        subdivided = true;
      }

      this.children[i].drawPolygon(points, value, depth - 1, childBound, polyBounds, clipContext);
    }

    if (subdivided) {
      this.tryMerge();
      this.markDirty();
    }
  }

  drawLine(x1, y1, x2, y2, width, value, depth = 11, bounds, clipContext) {
    const nodeBounds = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };

    this.drawCircle(x1, y1, width / 2, value, depth, nodeBounds, clipContext);
    this.drawCircle(x2, y2, width / 2, value, depth, nodeBounds, clipContext);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);

    const half = width / 2;

    let points;
    if (length < EPSILON) {
      points = [
        [x1 - half, y1 - half],
        [x1 - half, y1 + half],
        [x1 + half, y1 + half],
        [x1 + half, y1 - half],
      ];
    } else {
      const nx = -dy / length;
      const ny = dx / length;
      points = [
        [x1 + nx * half, y1 + ny * half],
        [x1 - nx * half, y1 - ny * half],
        [x2 - nx * half, y2 - ny * half],
        [x2 + nx * half, y2 + ny * half],
      ];
    }

    return this.drawPolygon(points, value, depth, nodeBounds, undefined, clipContext);
  }

  expandBeing(index) {
    if (this.isLeaf()) {
      const originalValue = this.value;
      this.divide();
      for (let i = 0; i < 4; i++) {
        if (i === index) {
          this.children[i].set(originalValue);
        } else {
          this.children[i].set(0);
        }
      }
      return;
    }

    const preservedChild = new Quadtree(this.value, this);
    preservedChild.children = this.children;
    if (preservedChild.children) {
      for (const child of preservedChild.children) {
        child.parent = preservedChild;
      }
    }

    this.children = [
      new Quadtree(0, this),
      new Quadtree(0, this),
      new Quadtree(0, this),
      new Quadtree(0, this),
    ];
    this.children[index] = preservedChild;
    this.value = 0;
    this.markDirty();
  }

  changeValue(oldValue, newValue) {
    if (this.isLeaf()) {
      if (this.value === oldValue) {
        this.set(newValue);
      }
      return;
    }

    this.children.forEach(child => child.changeValue(oldValue, newValue));
    this.tryMerge();
    this.markDirty();
  }

  drawRect(minX, minY, maxX, maxY, value, depth = 11, bounds, clipContext) {
    const points = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    return this.drawPolygon(points, value, depth, bounds, undefined, clipContext);
  }

  getValueAt(x, y, depth = 11, bounds) {
    const nodeBounds = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };

    if (
      x < nodeBounds.minX - EPSILON ||
      x > nodeBounds.maxX + EPSILON ||
      y < nodeBounds.minY - EPSILON ||
      y > nodeBounds.maxY + EPSILON
    ) {
      return 0;
    }

    if (this.isLeaf() || depth <= 0) {
      return this.value;
    }

    if (!this.children || this.children.length !== 4) {
      return this.value;
    }

    const midX = (nodeBounds.minX + nodeBounds.maxX) / 2;
    const midY = (nodeBounds.minY + nodeBounds.maxY) / 2;

    let index = 0;
    let childBounds;

    if (x >= midX) {
      if (y >= midY) {
        index = 3;
        childBounds = { minX: midX, minY: midY, maxX: nodeBounds.maxX, maxY: nodeBounds.maxY };
      } else {
        index = 1;
        childBounds = { minX: midX, minY: nodeBounds.minY, maxX: nodeBounds.maxX, maxY: midY };
      }
    } else if (y >= midY) {
      index = 2;
      childBounds = { minX: nodeBounds.minX, minY: midY, maxX: midX, maxY: nodeBounds.maxY };
    } else {
      index = 0;
      childBounds = { minX: nodeBounds.minX, minY: nodeBounds.minY, maxX: midX, maxY: midY };
    }

    const child = this.children[index];
    if (!child) {
      return this.value;
    }

    return child.getValueAt(x, y, depth - 1, childBounds);
  }

  isRectUniform(rect, value, bounds) {
    const nodeBounds = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };

    if (!rectsOverlap(rect, nodeBounds)) {
      return true;
    }

    if (this.isLeaf()) {
      return this.value === value;
    }

    if (!this.children || this.children.length !== 4) {
      return this.value === value;
    }

    const midX = (nodeBounds.minX + nodeBounds.maxX) / 2;
    const midY = (nodeBounds.minY + nodeBounds.maxY) / 2;

    const childBounds = [
      { minX: nodeBounds.minX, minY: nodeBounds.minY, maxX: midX, maxY: midY },
      { minX: midX, minY: nodeBounds.minY, maxX: nodeBounds.maxX, maxY: midY },
      { minX: nodeBounds.minX, minY: midY, maxX: midX, maxY: nodeBounds.maxY },
      { minX: midX, minY: midY, maxX: nodeBounds.maxX, maxY: nodeBounds.maxY },
    ];

    for (let i = 0; i < 4; i++) {
      const child = this.children[i];
      const childBound = childBounds[i];
      if (!rectsOverlap(rect, childBound)) continue;
      if (!child) {
        if (this.value !== value) return false;
        continue;
      }
      if (!child.isRectUniform(rect, value, childBound)) return false;
    }

    return true;
  }

  rectHasValue(rect, value, bounds) {
    const nodeBounds = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };

    if (!rectsOverlap(rect, nodeBounds)) {
      return false;
    }

    if (this.isLeaf()) {
      return this.value === value;
    }

    if (!this.children || this.children.length !== 4) {
      return this.value === value;
    }

    const midX = (nodeBounds.minX + nodeBounds.maxX) / 2;
    const midY = (nodeBounds.minY + nodeBounds.maxY) / 2;

    const childBounds = [
      { minX: nodeBounds.minX, minY: nodeBounds.minY, maxX: midX, maxY: midY },
      { minX: midX, minY: nodeBounds.minY, maxX: nodeBounds.maxX, maxY: midY },
      { minX: nodeBounds.minX, minY: midY, maxX: midX, maxY: nodeBounds.maxY },
      { minX: midX, minY: midY, maxX: nodeBounds.maxX, maxY: nodeBounds.maxY },
    ];

    for (let i = 0; i < 4; i++) {
      const child = this.children[i];
      const childBound = childBounds[i];
      if (!rectsOverlap(rect, childBound)) continue;
      if (!child) {
        if (this.value === value) return true;
        continue;
      }
      if (child.rectHasValue(rect, value, childBound)) return true;
    }

    return false;
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
    clipAreas: area.clipAreas,
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

function toBase64(bytes) {
  if (!bytes || bytes.length === 0) return '';

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }

  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  throw new Error('No base64 encoder available in this environment');
}

function fromBase64(base64) {
  if (!base64) return new Uint8Array(0);

  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(base64, 'base64');
    return Uint8Array.from(buffer);
  }

  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error('No base64 decoder available in this environment');
}

function encodeQuadtreeToArray(node, output) {
  if (!node) {
    output.push(0, 0);
    return;
  }

  const value = typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : 0;
  if (node.isLeaf()) {
    output.push(0, value >>> 0);
    return;
  }

  output.push(1, value >>> 0);

  for (let i = 0; i < 4; i++) {
    const child = node.children && node.children[i];
    if (child) {
      encodeQuadtreeToArray(child, output);
    } else {
      output.push(0, value >>> 0);
    }
  }
}

function serializeQuadtreeCompact(node) {
  if (!node) return '';
  const data = [];
  encodeQuadtreeToArray(node, data);
  const typed = new Uint32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    typed[i] = data[i] >>> 0;
  }
  const bytes = new Uint8Array(typed.buffer);
  return toBase64(bytes);
}

function decodeQuadtreeFromArray(data, cursor, parent) {
  if (cursor >= data.length) {
    return { node: new Quadtree(0, parent), cursor };
  }

  const type = data[cursor++];
  const value = data[cursor++];
  const node = new Quadtree(value, parent);

  if (type !== 1) {
    return { node, cursor };
  }

  node.children = [];
  for (let i = 0; i < 4; i++) {
    const childResult = decodeQuadtreeFromArray(data, cursor, node);
    node.children.push(childResult.node);
    cursor = childResult.cursor;
  }

  return { node, cursor };
}

function deserializeQuadtreeCompact(base64, parent = null) {
  if (!base64) {
    return new Quadtree(0, parent);
  }

  const bytes = fromBase64(base64);
  if (bytes.length === 0) {
    return new Quadtree(0, parent);
  }

  if (bytes.byteLength % 4 !== 0) {
    throw new Error('Invalid quadtree payload');
  }

  const view = new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  const { node } = decodeQuadtreeFromArray(view, 0, parent);
  return node;
}

function serializeLayerCompact(layer) {
  if (!layer) return null;

  return {
    id: layer.id,
    name: layer.name,
    pos: layer.pos,
    size: layer.size,
    quadtree: serializeQuadtreeCompact(layer.quadtree),
    areas: layer.areas.map(area => serializeArea(area)),
    children: layer.children.map(child => serializeLayerCompact(child)),
  };
}

function serializeMapCompact(map) {
  return {
    name: map.name,
    layer: serializeLayerCompact(map.layer),
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

function deserializeLayerCompact(data, parent = null) {
  if (!data) return null;

  const quadtree = deserializeQuadtreeCompact(data.quadtree);
  const layer = new Layer(data.id, quadtree, parent, data.pos ?? null, data.size ?? null, data.name);

  layer.areas = (data.areas ?? []).map(areaData => deserializeArea(areaData, layer));
  layer.children = (data.children ?? []).map(childData => deserializeLayerCompact(childData, layer));

  return layer;
}

function deserializeArea(data, parent) {
  const area = new Area(parseInt(data.id), data.color, parent, data.name);
  area.clipAreas = Array.isArray(data.clipAreas) ? data.clipAreas.map(id => parseInt(id)) : [];
  return area;
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

function deserializeMapCompact(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('Invalid map data');
  }

  const layer = deserializeLayerCompact(data.layer, null);
  return new Map(data.name, layer);
}

function buildClipContext(map, layer, clipAreaIds) {
  if (!map || !layer || !Array.isArray(clipAreaIds) || clipAreaIds.length === 0) {
    return null;
  }

  const allowedValues = new Set();
  const externalMasks = [];
  const maxExtraDepth = 4;

  for (const rawId of clipAreaIds) {
    const areaId = Number(rawId);
    if (!Number.isFinite(areaId)) continue;

    const area = map.findArea(areaId);
    if (!area) continue;

    let parentLayer = area.parent;
    if (!(parentLayer instanceof Layer)) {
      const parentId = parentLayer && typeof parentLayer === 'object' ? parentLayer.id : parentLayer;
      parentLayer = map.findLayer(parentId);
    }

    if (!parentLayer || !parentLayer.quadtree) continue;

    if (parentLayer.id === layer.id) {
      allowedValues.add(area.id);
      continue;
    }

    const layerBounds = parentLayer.getBounds();
    externalMasks.push({
      covers(rect) {
        if (!rectFullyInside(rect, layerBounds)) return false;
        return parentLayer.quadtree.isRectUniform(rect, area.id, layerBounds);
      },
      intersects(rect) {
        if (!rectsOverlap(rect, layerBounds)) return false;
        return parentLayer.quadtree.rectHasValue(rect, area.id, layerBounds);
      },
    });
  }

  const hasRestrictions = allowedValues.size > 0 || externalMasks.length > 0;
  if (!hasRestrictions) return null;

  return {
    hasRestrictions,
    maxExtraDepth,
    allowsValue(value) {
      if (allowedValues.size === 0) return false;
      return allowedValues.has(value);
    },
    externalCovers(rect) {
      for (const mask of externalMasks) {
        if (mask.covers(rect)) return true;
      }
      return false;
    },
    externalIntersects(rect) {
      for (const mask of externalMasks) {
        if (mask.intersects(rect)) return true;
      }
      return false;
    },
    requiresSubdivision(rect) {
      for (const mask of externalMasks) {
        if (mask.intersects(rect) && !mask.covers(rect)) return true;
      }
      return false;
    },
    shouldSubdivide(rect, depth) {
      if (externalMasks.length === 0) return false;
      if (!this.requiresSubdivision(rect)) return false;
      if (typeof depth !== 'number') return this.requiresSubdivision(rect);
      return depth > -maxExtraDepth;
    },
  };
}

export {
  Map,
  Layer,
  Area,
  Quadtree,
  buildClipContext,
  serializeMap,
  deserializeMap,
  serializeMapCompact,
  deserializeMapCompact,
  serializeLayerCompact,
  deserializeLayerCompact,
  getLayerHighestId,
  getLayerHughestId,
  setLayerHighestId,
  getAreaHighestId,
  setAreaHighestId
};
