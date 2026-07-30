import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { join, dirname, extname } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { perceptualHash, sha256, imageMeta, normalizeImage } from '../../common/utils/phash';
import { dateKey } from '../../common/utils/dates';

export interface SaveFileOptions {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  uploadedById?: string | null;
  /** Rasm bo'lsa: ixchamlashtirish va perceptual hash hisoblash */
  isImage?: boolean;
  /** Papka bo'limi: "attendance", "tasks", "avatars"... */
  folder?: string;
}

/**
 * Fayllarni saqlash. Hozircha lokal disk, keyinchalik S3'ga o'tish uchun
 * bitta interfeys ortida turadi (STORAGE_DRIVER sozlamasi).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.root = this.config.get<string>('storage.localPath') ?? './storage';
  }

  async onModuleInit() {
    await fs.mkdir(this.root, { recursive: true });
  }

  async save(options: SaveFileOptions) {
    let buffer = options.buffer;
    let phash: string | null = null;
    let width: number | null = null;
    let height: number | null = null;

    if (options.isImage) {
      try {
        buffer = await normalizeImage(buffer);
        phash = await perceptualHash(buffer);
        const meta = await imageMeta(buffer);
        width = meta.width;
        height = meta.height;
      } catch (error) {
        this.logger.warn(`Rasmni qayta ishlashda xato: ${(error as Error).message}`);
      }
    }

    const folder = options.folder ?? 'misc';
    const ext = options.isImage ? '.jpg' : extname(options.fileName) || '.bin';
    const storageKey = `${folder}/${dateKey()}/${randomUUID()}${ext}`;
    const fullPath = join(this.root, storageKey);

    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return this.prisma.storedFile.create({
      data: {
        storageKey,
        fileName: options.fileName,
        mimeType: options.isImage ? 'image/jpeg' : options.mimeType,
        sizeBytes: buffer.length,
        width,
        height,
        phash,
        sha256: sha256(buffer),
        uploadedById: options.uploadedById ?? null,
      },
    });
  }

  async getStream(fileId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Fayl topilmadi');

    const fullPath = join(this.root, file.storageKey);
    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException('Fayl diskda topilmadi');
    }

    return { file, stream: createReadStream(fullPath) };
  }

  async remove(fileId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) return;

    try {
      await fs.unlink(join(this.root, file.storageKey));
    } catch {
      // Fayl allaqachon yo'q bo'lsa e'tibor bermaymiz
    }
    await this.prisma.storedFile.delete({ where: { id: fileId } });
  }
}
