import sharp from 'sharp';
import { createHash } from 'crypto';

/**
 * dHash (difference hash) — rasmning 64 bitlik "barmoq izi".
 * Bir xil yoki ozgina o'zgartirilgan rasmlar bir xil hash beradi.
 * Takroriy foto yuborilishini aniqlash uchun ishlatiladi.
 */
export async function perceptualHash(buffer: Buffer): Promise<string> {
  const width = 9;
  const height = 8;

  const raw = await sharp(buffer)
    .greyscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();

  const bits: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = raw[y * width + x];
      const right = raw[y * width + x + 1];
      bits.push(left > right ? 1 : 0);
    }
  }

  // 64 bitni hex satrga aylantirish
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/** Ikki hash orasidagi Hamming masofasi (0 = bir xil rasm) */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;

  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function imageMeta(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? null, height: meta.height ?? null, format: meta.format ?? null };
}

/**
 * Rasmni saqlashdan oldin ixchamlashtirish — 200 hodim uchun disk tejaladi.
 */
export async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // EXIF bo'yicha to'g'rilash
    .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}
