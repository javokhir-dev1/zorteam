import { Controller, Get, Param, Res, StreamableFile, Header } from '@nestjs/common';
import type { Response } from 'express';
import { StorageService } from './storage.service';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Faylni berish. Autentifikatsiya global AuthGuard orqali tekshiriladi —
   * ya'ni davomat fotolarini tashqaridan ochib bo'lmaydi.
   */
  @Get(':id')
  @Header('Cache-Control', 'private, max-age=86400')
  async get(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { file, stream } = await this.storage.getStream(id);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
    });

    return new StreamableFile(stream);
  }
}
