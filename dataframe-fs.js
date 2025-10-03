import { promises as fs } from 'node:fs';
import { Map, serializeMap, deserializeMap, setAreaHighestId, setLayerHighestId } from './dataframe.js';
import path from 'node:path';

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

  setLayerHighestId(0);
  setAreaHighestId(0);

  return deserializeMap(data);
}

export {
  saveMapToFile,
  loadMapFromFile
};
