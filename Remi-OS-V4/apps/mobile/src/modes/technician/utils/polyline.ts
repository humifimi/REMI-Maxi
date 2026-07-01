// 2026-05-25 — Google encoded-polyline decoder.
//
// Decodes a Google "Encoded Polyline Algorithm Format" string into
// an array of `{ latitude, longitude }` points consumable by
// react-native-maps' `<Polyline coordinates={...} />`.
//
// Algorithm reference:
//   https://developers.google.com/maps/documentation/utilities/polylinealgorithm
//
// Why inline instead of a dep: the algorithm is ~30 lines, has no
// dependencies of its own, and exists in many copies on the web
// because of how often React-Native projects need it. Adding a
// dependency for this would mean another version drift to keep
// pinned. Keeping it here in one file makes it a 3-second audit.
//
// Returns `[]` for null/empty/malformed input — callers fall back
// to straight-line polylines for that case.

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function decodePolyline(
  encoded: string | null | undefined,
): LatLng[] {
  if (!encoded) return [];
  const len = encoded.length;
  const path: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      if (b < 0) return path; // malformed — bail rather than throw
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      if (index >= len) return path;
      b = encoded.charCodeAt(index++) - 63;
      if (b < 0) return path;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    path.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
  }

  return path;
}

/**
 * Pick a point near the midpoint (by polyline-vertex count) of a
 * decoded path. Used to anchor the per-leg drive-time label on
 * the map roughly along the road, not just halfway between the
 * straight-line endpoints. Returns `null` when the path is
 * empty.
 */
export function polylineMidpoint(path: LatLng[]): LatLng | null {
  if (path.length === 0) return null;
  return path[Math.floor(path.length / 2)];
}
