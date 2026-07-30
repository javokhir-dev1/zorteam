import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toDateOnly } from '../../common/utils/dates';
import { UpsertScheduleDto, UpsertOfficeDto, UpsertCalendarDayDto } from './dto';
import type { AuthUser } from '../../common/auth/auth.types';

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  isWorkday: weekday <= 5,
  startTime: '10:00',
  endTime: '19:00',
}));

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Ish grafiklari ----------

  list() {
    return this.prisma.workSchedule.findMany({
      where: { isActive: true },
      include: {
        days: { orderBy: { weekday: 'asc' } },
        _count: { select: { users: true, departments: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id },
      include: {
        days: { orderBy: { weekday: 'asc' } },
        departments: { select: { id: true, name: true } },
        users: { select: { id: true, fullName: true } },
      },
    });
    if (!schedule) throw new NotFoundException('Grafik topilmadi');
    return schedule;
  }

  async create(actor: AuthUser, dto: UpsertScheduleDto) {
    const days = dto.days?.length ? dto.days : DEFAULT_DAYS;
    this.validateDays(days);

    const schedule = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.workSchedule.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
      }
      return tx.workSchedule.create({
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault ?? false,
          requireCheckOut: dto.requireCheckOut ?? false,
          graceMinutes: dto.graceMinutes ?? 15,
          windowMinutes: dto.windowMinutes ?? 15,
          reminderMinutes: dto.reminderMinutes ?? 10,
          days: { create: days },
        },
        include: { days: { orderBy: { weekday: 'asc' } } },
      });
    });

    await this.audit.log(actor.id, 'schedule.create', 'WorkSchedule', schedule.id, null, schedule);
    return schedule;
  }

  async update(actor: AuthUser, id: string, dto: UpsertScheduleDto) {
    const before = await this.prisma.workSchedule.findUnique({
      where: { id },
      include: { days: true },
    });
    if (!before) throw new NotFoundException('Grafik topilmadi');

    if (dto.days?.length) this.validateDays(dto.days);

    const after = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.workSchedule.updateMany({
          data: { isDefault: false },
          where: { isDefault: true, id: { not: id } },
        });
      }

      if (dto.days?.length) {
        await tx.scheduleDay.deleteMany({ where: { scheduleId: id } });
        await tx.scheduleDay.createMany({
          data: dto.days.map((d) => ({ ...d, scheduleId: id })),
        });
      }

      return tx.workSchedule.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault,
          requireCheckOut: dto.requireCheckOut,
          graceMinutes: dto.graceMinutes,
          windowMinutes: dto.windowMinutes,
          reminderMinutes: dto.reminderMinutes,
        },
        include: { days: { orderBy: { weekday: 'asc' } } },
      });
    });

    await this.audit.log(actor.id, 'schedule.update', 'WorkSchedule', id, before, after);
    return after;
  }

  async remove(actor: AuthUser, id: string) {
    const inUse = await this.prisma.user.count({ where: { scheduleId: id } });
    const inUseDept = await this.prisma.department.count({ where: { scheduleId: id } });
    if (inUse || inUseDept) {
      throw new BadRequestException(
        `Bu grafik ishlatilmoqda (${inUse} hodim, ${inUseDept} bo'lim). Avval ularni boshqa grafikka o'tkazing.`,
      );
    }

    await this.prisma.workSchedule.update({ where: { id }, data: { isActive: false } });
    await this.audit.log(actor.id, 'schedule.delete', 'WorkSchedule', id);
    return { ok: true };
  }

  // ---------- Ofislar (geofence) ----------

  listOffices() {
    return this.prisma.office.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async upsertOffice(actor: AuthUser, dto: UpsertOfficeDto, id?: string) {
    const office = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.office.updateMany({
          data: { isDefault: false },
          where: id ? { id: { not: id } } : {},
        });
      }

      const data = {
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters ?? 150,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      };

      return id
        ? tx.office.update({ where: { id }, data })
        : tx.office.create({ data });
    });

    await this.audit.log(actor.id, id ? 'office.update' : 'office.create', 'Office', office.id, null, office);
    return office;
  }

  /**
   * Ofisni o'chirish.
   *
   * Davomat yozuvlarida ishlatilgan bo'lsa tarixni buzmaslik uchun
   * faqat faolsizlantiriladi, aks holda butunlay o'chiriladi.
   * Asosiy ofis o'chirilsa, qolganlardan biri asosiy bo'ladi.
   */
  async removeOffice(actor: AuthUser, id: string) {
    const office = await this.prisma.office.findUnique({ where: { id } });
    if (!office) throw new NotFoundException('Ofis topilmadi');

    const usedInAttendance = await this.prisma.attendance.count({ where: { officeId: id } });

    if (usedInAttendance > 0) {
      await this.prisma.office.update({
        where: { id },
        data: { isActive: false, isDefault: false },
      });
    } else {
      await this.prisma.office.delete({ where: { id } });
    }

    // Asosiy ofis o'chirilgan bo'lsa — boshqasini asosiy qilamiz
    if (office.isDefault) {
      const next = await this.prisma.office.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.office.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    await this.audit.log(actor.id, 'office.delete', 'Office', id, office, null);

    return {
      ok: true,
      softDeleted: usedInAttendance > 0,
      usedInAttendance,
    };
  }

  async defaultOffice() {
    return (
      (await this.prisma.office.findFirst({ where: { isDefault: true, isActive: true } })) ??
      (await this.prisma.office.findFirst({ where: { isActive: true } }))
    );
  }

  // ---------- Bayram / dam olish kunlari ----------

  listCalendar(year?: number) {
    const where = year
      ? {
          date: {
            gte: new Date(`${year}-01-01T00:00:00.000Z`),
            lte: new Date(`${year}-12-31T00:00:00.000Z`),
          },
        }
      : {};
    return this.prisma.calendarDay.findMany({ where, orderBy: { date: 'asc' } });
  }

  async upsertCalendarDay(actor: AuthUser, dto: UpsertCalendarDayDto) {
    const date = toDateOnly(dto.date);
    const day = await this.prisma.calendarDay.upsert({
      where: { date },
      create: { date, name: dto.name, isWorkday: dto.isWorkday ?? false },
      update: { name: dto.name, isWorkday: dto.isWorkday ?? false },
    });

    await this.audit.log(actor.id, 'calendar.upsert', 'CalendarDay', day.id, null, day);
    return day;
  }

  async removeCalendarDay(actor: AuthUser, id: string) {
    await this.prisma.calendarDay.delete({ where: { id } });
    await this.audit.log(actor.id, 'calendar.delete', 'CalendarDay', id);
    return { ok: true };
  }

  // ---------- Yordamchi ----------

  private validateDays(days: { weekday: number; startTime: string; endTime: string }[]) {
    const seen = new Set<number>();
    for (const day of days) {
      if (seen.has(day.weekday)) {
        throw new BadRequestException(`${day.weekday}-kun ikki marta kiritilgan`);
      }
      seen.add(day.weekday);
    }
  }

  /**
   * Hodimning amaldagi grafigi: shaxsiy grafik > bo'lim grafigi > standart grafik.
   */
  async effectiveScheduleFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        schedule: { include: { days: true } },
        department: { select: { schedule: { include: { days: true } } } },
      },
    });

    if (user?.schedule) return user.schedule;
    if (user?.department?.schedule) return user.department.schedule;

    return this.prisma.workSchedule.findFirst({
      where: { isDefault: true, isActive: true },
      include: { days: true },
    });
  }
}
