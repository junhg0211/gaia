import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Map, Layer, Area, Quadtree } from './dataframe.js';
import { saveMapToFile, loadMapFromFile } from './dataframe-fs.js';

function sampleQuadtreeValue(tree, x, y, bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 }) {
  if (tree.isLeaf() || !tree.children) return tree.value;

  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;

  let index;
  let childBounds;

  if (x < midX) {
    if (y < midY) {
      index = 0;
      childBounds = { minX: bounds.minX, minY: bounds.minY, maxX: midX, maxY: midY };
    } else {
      index = 2;
      childBounds = { minX: bounds.minX, minY: midY, maxX: midX, maxY: bounds.maxY };
    }
  } else {
    if (y < midY) {
      index = 1;
      childBounds = { minX: midX, minY: bounds.minY, maxX: bounds.maxX, maxY: midY };
    } else {
      index = 3;
      childBounds = { minX: midX, minY: midY, maxX: bounds.maxX, maxY: bounds.maxY };
    }
  }

  const child = tree.getChild(index);
  if (!child) return tree.value;

  return sampleQuadtreeValue(child, x, y, childBounds);
}

const tests = [
  {
    name: 'Layer auto assigns ids when missing',
    run: () => {
      const layerA = new Layer(undefined, new Quadtree(0), null, null, null, 'layerA');
      assert.equal(layerA.id, 1);

      const layerB = new Layer(null, new Quadtree(0), null, null, null, 'layerB');
      assert.equal(layerB.id, 2);
    },
  },
  {
    name: 'Layer manual ids advance counter',
    run: () => {
      const manual = new Layer(10, new Quadtree(0), null, null, null, 'manual');
      assert.equal(manual.id, 10);

      const autoAfterManual = new Layer(undefined, new Quadtree(0), null, null, null, 'auto');
      assert.equal(autoAfterManual.id, 11);
    },
  },
  {
    name: 'Area auto assigns ids when missing',
    run: () => {
      const areaA = new Area(undefined, '#ff0000', null, 'areaA');
      assert.equal(areaA.id, 1);

      const areaB = new Area(null, '#00ff00', null, 'areaB');
      assert.equal(areaB.id, 2);
    },
  },
  {
    name: 'Area manual ids advance counter',
    run: () => {
      const manual = new Area(15, '#0000ff', null, 'manual');
      assert.equal(manual.id, 15);

      const autoAfterManual = new Area(undefined, '#ffffff', null, 'auto');
      assert.equal(autoAfterManual.id, 16);
    },
  },
  {
    name: 'Map stores name and layer reference',
    run: () => {
      const layer = new Layer(undefined, new Quadtree(0), null, null, null, 'base');
      const map = new Map('mapName', layer);

      assert.equal(map.name, 'mapName');
      assert.equal(map.layer, layer);
    },
  },
  {
    name: 'Quadtree divide and merge keeps values in sync',
    run: () => {
      const tree = new Quadtree(0);
      assert.equal(tree.isLeaf(), true);

      tree.divide();
      assert.equal(tree.isLeaf(), false);
      assert.equal(tree.children.length, 4);

      tree.children.forEach(child => child.set(7));
      tree.tryMerge();

      assert.equal(tree.isLeaf(), true);
      assert.equal(tree.value, 7);
    },
  },
  {
    name: 'Quadtree drawCircle writes value at depth 0',
    run: () => {
      const tree = new Quadtree(0);
      tree.drawCircle(0.5, 0.5, 1, 5, 0);
      assert.equal(tree.value, 5);
      assert.equal(tree.isLeaf(), true);
    },
  },
  {
    name: 'Quadtree drawLine respects layer bounds',
    run: () => {
      const layer = new Layer(undefined, new Quadtree(0), null, [0, 0], [16, 16], 'line-layer');
      const bounds = { minX: layer.pos[0], minY: layer.pos[1], maxX: layer.pos[0] + layer.size[0], maxY: layer.pos[1] + layer.size[1] };

      layer.quadtree.drawLine(2, 2, 14, 14, 2, 7, 6, bounds);

      const onLine = sampleQuadtreeValue(layer.quadtree, 8, 8, bounds);
      const offLine = sampleQuadtreeValue(layer.quadtree, 8, 2, bounds);

      assert.equal(onLine, 7);
      assert.equal(offLine, 0);
    },
  },
  {
    name: 'Map can be saved to and loaded from file',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gaia-map-'));
      const filePath = path.join(tempDir, 'map.json');

      const rootLayer = new Layer(undefined, new Quadtree(3), null, { x: 10, y: 20 }, { width: 100, height: 200 }, 'root');
      const area = new Area(undefined, '#123456', rootLayer, 'area1');
      rootLayer.areas.push(area);

      const childLayer = new Layer(undefined, new Quadtree(5), rootLayer, null, null, 'child');
      rootLayer.children.push(childLayer);

      const map = new Map('save-load-test', rootLayer);

      await saveMapToFile(map, filePath);
      const loaded = await loadMapFromFile(filePath);

      assert.equal(loaded.name, map.name);
      assert.equal(loaded.layer.name, map.layer.name);
      assert.deepEqual(loaded.layer.pos, map.layer.pos);
      assert.deepEqual(loaded.layer.size, map.layer.size);
      assert.equal(loaded.layer.quadtree.value, map.layer.quadtree.value);
      assert.equal(loaded.layer.areas.length, 2);
      assert.equal(loaded.layer.areas[1].name, 'area1');
      assert.equal(loaded.layer.children.length, 1);
      assert.equal(loaded.layer.children[0].name, 'child');

      await fs.rm(tempDir, { recursive: true, force: true });
    },
  },
];

let passed = 0;

for (const test of tests) {
  await test.run();
  console.log(`\u2713 ${test.name}`);
  passed += 1;
}

console.log(`Passed ${passed}/${tests.length} tests`);
