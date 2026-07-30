/**
 * Ikki koordinata orasidagi masofa (metrda) — Haversine formulasi.
 */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Yer radiusi, metr
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Koordinata haqiqiy qiymat ekanini tekshiradi.
 */
export function isValidCoordinate(lat?: number | null, lon?: number | null): boolean {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  // 0,0 — "Null orol", odatda soxta yoki bo'sh qiymat
  if (lat === 0 && lon === 0) return false;
  return true;
}

/**
 * Ikki belgilanish orasidagi tezlik (km/soat).
 * Haqiqatga to'g'ri kelmaydigan "sakrash"ni aniqlash uchun.
 */
export function speedKmh(
  meters: number,
  fromAt: Date,
  toAt: Date,
): number {
  const hours = Math.abs(toAt.getTime() - fromAt.getTime()) / 3_600_000;
  if (hours <= 0) return Number.POSITIVE_INFINITY;
  return meters / 1000 / hours;
}
