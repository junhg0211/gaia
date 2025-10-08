const METERS_PER_WORLD_UNIT = 1000
const SQUARE_METERS_PER_SQUARE_WORLD_UNIT = METERS_PER_WORLD_UNIT * METERS_PER_WORLD_UNIT

function stripTrailingZeros(value) {
  if (!value.includes('.')) return value
  return value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1')
}

function formatWithPrecision(value, decimals) {
  return stripTrailingZeros(value.toFixed(decimals))
}

export function worldToMeters(worldUnits) {
  return worldUnits * METERS_PER_WORLD_UNIT
}

export function worldToSquareMeters(worldArea) {
  return worldArea * SQUARE_METERS_PER_SQUARE_WORLD_UNIT
}

export function formatDistanceFromMeters(meters) {
  const absMeters = Math.abs(meters)
  if (absMeters >= 1000) {
    const value = meters / 1000
    const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
    return `${formatWithPrecision(value, decimals)} km`
  }
  if (absMeters >= 1) {
    const decimals = absMeters >= 100 ? 0 : absMeters >= 10 ? 1 : 2
    return `${formatWithPrecision(meters, decimals)} m`
  }
  const centimeters = meters * 100
  return `${formatWithPrecision(centimeters, 0)} cm`
}

export function formatWorldDistance(worldUnits) {
  return formatDistanceFromMeters(worldToMeters(worldUnits))
}

export function formatWorldCoordinate(worldUnits) {
  return formatWorldDistance(worldUnits)
}

export function formatAreaFromSquareMeters(squareMeters) {
  const abs = Math.abs(squareMeters)
  if (abs >= 1e6) {
    const value = squareMeters / 1e6
    const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
    return `${formatWithPrecision(value, decimals)} km²`
  }
  if (abs >= 1) {
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
    return `${formatWithPrecision(squareMeters, decimals)} m²`
  }
  const squareCentimeters = squareMeters * 10000
  return `${formatWithPrecision(squareCentimeters, 0)} cm²`
}

export function formatWorldArea(worldArea) {
  return formatAreaFromSquareMeters(worldToSquareMeters(worldArea))
}

export const metersPerWorldUnit = METERS_PER_WORLD_UNIT
