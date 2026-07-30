export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Turli ko'rinishdagi koordinatalarni tushunadi.
 *
 * Qabul qilinadigan ko'rinishlar:
 *   41.311081, 69.240562
 *   41.311081 69.240562
 *   41°18'40.0"N 69°14'26.0"E
 *   https://www.google.com/maps/@41.311081,69.240562,17z
 *   https://maps.google.com/?q=41.311081,69.240562
 *   https://yandex.uz/maps/?ll=69.240562%2C41.311081   (yandexda tartib teskari)
 *
 * Google Maps'da nuqta ustiga o'ng tugma bosilsa koordinata nusxalanadi —
 * shuni to'g'ridan-to'g'ri qo'yish kifoya.
 */
export function parseCoordinates(input: string): Coordinates | null {
  const text = input.trim();
  if (!text) return null;

  // --- Yandex Maps: ll=uzunlik,kenglik (tartib teskari) ---
  const yandex = text.match(/[?&]ll=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i);
  if (yandex) {
    return validate(Number(yandex[2]), Number(yandex[1]));
  }

  // --- Google Maps havolasi: /@kenglik,uzunlik ---
  const googleAt = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (googleAt) {
    return validate(Number(googleAt[1]), Number(googleAt[2]));
  }

  // --- Havoladagi q= yoki query= parametri ---
  const query = text.match(/[?&](?:q|query|daddr|ll)=(-?\d+(?:\.\d+)?)(?:%2C|,)\s*(-?\d+(?:\.\d+)?)/i);
  if (query) {
    return validate(Number(query[1]), Number(query[2]));
  }

  // --- Gradus-daqiqa-soniya: 41°18'40.0"N 69°14'26.0"E ---
  const dms = text.match(
    /(\d+)[°\s]+(\d+)['′\s]+([\d.]+)["″\s]*([NSns])[,\s]+(\d+)[°\s]+(\d+)['′\s]+([\d.]+)["″\s]*([EWew])/,
  );
  if (dms) {
    const lat = toDecimal(Number(dms[1]), Number(dms[2]), Number(dms[3]), dms[4]);
    const lng = toDecimal(Number(dms[5]), Number(dms[6]), Number(dms[7]), dms[8]);
    return validate(lat, lng);
  }

  // --- Oddiy juftlik: vergul, nuqtali vergul yoki bo'sh joy bilan ---
  const pair = text.match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (pair) {
    // O'nlik ajratgich sifatida vergul ishlatilgan bo'lishi mumkin (41,31)
    const lat = Number(pair[1].replace(',', '.'));
    const lng = Number(pair[2].replace(',', '.'));
    return validate(lat, lng);
  }

  // --- Matn ichidan ikkita sonni ajratib olish (oxirgi chora) ---
  const numbers = text.match(/-?\d+\.\d+/g);
  if (numbers && numbers.length >= 2) {
    return validate(Number(numbers[0]), Number(numbers[1]));
  }

  return null;
}

function toDecimal(degrees: number, minutes: number, seconds: number, hemisphere: string): number {
  const value = degrees + minutes / 60 + seconds / 3600;
  return /[SsWw]/.test(hemisphere) ? -value : value;
}

function validate(latitude: number, longitude: number): Coordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** Xaritada ko'rsatish uchun OpenStreetMap iframe manzili */
export function osmEmbedUrl(latitude: number, longitude: number, radiusMeters = 150): string {
  // Radiusga qarab ko'rinish maydonini hisoblaymiz
  const degrees = Math.max(0.002, (radiusMeters * 4) / 111_000);
  const bbox = [
    longitude - degrees,
    latitude - degrees,
    longitude + degrees,
    latitude + degrees,
  ].join('%2C');

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
