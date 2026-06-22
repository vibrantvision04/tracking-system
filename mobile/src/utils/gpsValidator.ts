export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Checks if a point is inside a polygon using the Ray-Casting algorithm.
 */
export function isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  const x = point.longitude;
  const y = point.latitude;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi);
    if (intersect) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Calculates haversine distance in meters between two coordinates.
 */
export function getHaversineDistance(c1: Coordinate, c2: Coordinate): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((c2.latitude - c1.latitude) * Math.PI) / 180;
  const dLon = ((c2.longitude - c1.longitude) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.latitude * Math.PI) / 180) *
      Math.cos((c2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
