const EARTH_RADIUS_METERS = 6371008.8;

function coordinate(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function validCoordinates(latitude, longitude) {
  const lat = coordinate(latitude, -90, 90);
  const lon = coordinate(longitude, -180, 180);
  return lat === null || lon === null ? null : { latitude: lat, longitude: lon };
}

export function straightLineDistanceMeters(from, to) {
  const a = validCoordinates(from?.latitude, from?.longitude);
  const b = validCoordinates(to?.latitude, to?.longitude);
  if (!a || !b) return Infinity;
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
