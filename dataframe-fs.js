import { promises as fsPromises, readFileSync } from 'node:fs';
import {
  Map,
  serializeMapCompact,
  deserializeMap,
  deserializeMapCompact,
  setAreaHighestId,
  setLayerHighestId,
} from './dataframe.js';
import path from 'node:path';

async function saveMapToFile(map, filename, options = {}) {
  if (!(map instanceof Map)) {
    throw new TypeError('Expected map to be an instance of Map');
  }

  if (typeof filename !== 'string' || filename.length === 0) {
    throw new TypeError('Filename must be a non-empty string');
  }

  const { pretty = false } = options;
  const serialized = serializeMapCompact(map);
  const contents = JSON.stringify(serialized, null, pretty ? 2 : 0);

  const directory = path.dirname(filename);
  if (directory && directory !== '.') {
    await fsPromises.mkdir(directory, { recursive: true });
  }

  await fsPromises.writeFile(filename, contents, 'utf8');
}

function loadMapFromFile(filename) {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new TypeError('Filename must be a non-empty string');
  }

  const raw = readFileSync(filename, 'utf8');
  const data = JSON.parse(raw);

  setLayerHighestId(0);
  setAreaHighestId(0);

  const isCompact = typeof data?.layer?.quadtree === 'string';
  if (isCompact) {
    return deserializeMapCompact(data);
  }

  return deserializeMap(data);
}

export {
  saveMapToFile,
  loadMapFromFile
};
