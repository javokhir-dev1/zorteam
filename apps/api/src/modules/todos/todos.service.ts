import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTodoDto, UpdateTodoDto } from './dto';

/**
 * Shaxsiy eslatmalar. Har bir amal `userId` bo'yicha cheklanadi —
 * hodim boshqa birovning yozuvini ko'ra ham, o'zgartira ham olmaydi.
 */
@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.todo.findMany({
      where: { userId },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
  }

  create(userId: string, dto: CreateTodoDto) {
    return this.prisma.todo.create({
      data: { userId, text: dto.text.trim() },
    });
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    await this.ensureOwn(userId, id);

    return this.prisma.todo.update({
      where: { id },
      data: {
        ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
        ...(dto.done !== undefined ? { done: dto.done } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwn(userId, id);
    await this.prisma.todo.delete({ where: { id } });
  }

  /** Yozuv mavjudligini va shu hodimniki ekanini tekshiradi */
  private async ensureOwn(userId: string, id: string) {
    const todo = await this.prisma.todo.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!todo) throw new NotFoundException('Eslatma topilmadi');
  }
}
