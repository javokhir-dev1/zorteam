import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbsenceStatus,
  AttendanceFlag,
  AttendanceMethod,
  AttendanceStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../files/storage.service';
import { SchedulesService } from '../schedules/schedules.service';
import { hammingDistance } from '../../common/utils/phash';
import { distanceMeters, isValidCoordinate, speedKmh } from '../../common/utils/geo';
import { atTime, dateKey, dayjs, isoWeekday, toDateOnly, TZ, fmtTime } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';
import type { AttendanceQuery, ManualAttendanceDto } from './dto';

export interface CheckInInput {
  userId: string;
  photo: Buffer;
  photoName?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  method: AttendanceMethod;
  deviceInfo?: string;
  ipAddress?: string;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly schedules: SchedulesService,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  //  Kunlik yozuvlarni tayyorlash
  // ============================================================

  /**
   * Berilgan kun uchun barcha faol hodimlarga davomat yozuvini yaratadi.
   * Har kuni yarim tunda ishga tushadi.
   *
   * Yozuv holati darhol aniqlanadi:
   *   - dam olish kuni / bayram      → DAY_OFF
   *   - tasdiqlangan yo'qlik so'rovi → EXCUSED
   *   - aks holda                    → PENDING (belgilanish kutilmoqda)
   */
  async ensureDayRecords(date: Date = new Date()) {
    const day = toDateOnly(date);
    const weekday = isoWeekday(date);

    const [users, calendarDay, absences] = await Promise.all([
      this.prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: { id: true, departmentId: true },
      }),
      this.prisma.calendarDay.findUnique({ where: { date: day } }),
      this.prisma.absenceRequest.findMany({
        where: {
          status: AbsenceStatus.APPROVED,
          startDate: { lte: day },
          endDate: { gte: day },
        },
        select: { id: true, userId: true },
      }),
    ]);

    const absenceByUser = new Map(absences.map((a) => [a.userId, a.id]));
    const office = await this.schedules.defaultOffice();

    let created = 0;
    for (const user of users) {
      const existing = await this.prisma.attendance.findUnique({
        where: { userId_date: { userId: user.id, date: day } },
        select: { id: true, status: true, checkInAt: true },
      });

      // Belgilanib bo'lingan yozuvga tegmaymiz
      if (existing?.checkInAt) continue;

      const schedule = await this.schedules.effectiveScheduleFor(user.id);
      const scheduleDay = schedule?.days.find((d) => d.weekday === weekday);

      // Bayram kuni ish kuniga ko'chirilgan bo'lsa (isWorkday = true) ishlaymiz
      const isHoliday = calendarDay ? !calendarDay.isWorkday : false;
      const isWorkday = calendarDay?.isWorkday === true
        ? true
        : !isHoliday && (scheduleDay?.isWorkday ?? false);

      let status: AttendanceStatus = AttendanceStatus.PENDING;
      let absenceRequestId: string | null = null;

      if (!isWorkday || !schedule || !scheduleDay) {
        status = AttendanceStatus.DAY_OFF;
      } else if (absenceByUser.has(user.id)) {
        status = AttendanceStatus.EXCUSED;
        absenceRequestId = absenceByUser.get(user.id)!;
      }

      const startTime = scheduleDay?.startTime ?? '10:00';
      const expectedStartAt = atTime(day, startTime);
      const windowClosesAt = dayjs(expectedStartAt)
        .add(schedule?.windowMinutes ?? 15, 'minute')
        .toDate();

      const data = {
        userId: user.id,
        date: day,
        expectedStartAt,
        windowClosesAt,
        status,
        absenceRequestId,
        officeId: office?.id ?? null,
      };

      if (existing) {
        await this.prisma.attendance.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.attendance.create({ data });
        created++;
      }
    }

    this.logger.log(`${dateKey(day)}: ${created} ta yangi davomat yozuvi tayyorlandi`);
    return { date: dateKey(day), created, total: users.length };
  }

  // ============================================================
  //  Belgilanish
  // ============================================================

  async checkIn(input: CheckInInput) {
    const today = toDateOnly(new Date());

    let attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId: input.userId, date: today } },
    });

    // Yozuv bo'lmasa (yangi hodim, kun o'rtasida qo'shilgan) — darhol yaratamiz
    if (!attendance) {
      await this.ensureDayRecords(new Date());
      attendance = await this.prisma.attendance.findUnique({
        where: { userId_date: { userId: input.userId, date: today } },
      });
    }

    if (!attendance) {
      throw new BadRequestException('Bugungi kun uchun davomat yozuvi topilmadi');
    }

    if (attendance.checkInAt) {
      throw new BadRequestException(
        `Siz bugun allaqachon belgilangansiz (${fmtTime(attendance.checkInAt)})`,
      );
    }

    if (attendance.status === AttendanceStatus.DAY_OFF) {
      throw new BadRequestException('Bugun sizda dam olish kuni');
    }

    if (attendance.status === AttendanceStatus.EXCUSED) {
      throw new BadRequestException(
        "Bugun siz uchun tasdiqlangan yo'qlik (safar/ta'til) belgilangan",
      );
    }

    if (!input.photo?.length) {
      throw new BadRequestException('Rasm yuborilmadi');
    }

    const now = new Date();
    const flags = new Set<AttendanceFlag>();

    // --- 1. Rasmni saqlash ---
    const file = await this.storage.save({
      buffer: input.photo,
      fileName: input.photoName ?? `checkin-${dateKey(now)}.jpg`,
      mimeType: 'image/jpeg',
      uploadedById: input.userId,
      isImage: true,
      folder: 'attendance',
    });

    // --- 2. Takroriy rasm tekshiruvi ---
    if (file.phash && (await this.isDuplicatePhoto(input.userId, file.id, file.phash))) {
      flags.add(AttendanceFlag.DUPLICATE_PHOTO);
    }

    // --- 3. Joylashuv tekshiruvi ---
    let distance: number | null = null;
    const office = attendance.officeId
      ? await this.prisma.office.findUnique({ where: { id: attendance.officeId } })
      : await this.schedules.defaultOffice();

    if (!isValidCoordinate(input.latitude, input.longitude)) {
      flags.add(AttendanceFlag.NO_LOCATION);
    } else {
      const maxAccuracy = this.config.get<number>('attendance.maxAccuracyMeters') ?? 200;
      if (input.accuracy && input.accuracy > maxAccuracy) {
        flags.add(AttendanceFlag.LOW_GPS_ACCURACY);
      }

      if (office) {
        distance = distanceMeters(
          input.latitude!,
          input.longitude!,
          office.latitude,
          office.longitude,
        );
        if (distance > office.radiusMeters) {
          flags.add(AttendanceFlag.OUTSIDE_GEOFENCE);
        }
      }

      // --- 4. "Sakrash" tekshiruvi: oldingi belgilanishga nisbatan tezlik ---
      if (await this.isTeleport(input.userId, input.latitude!, input.longitude!, now)) {
        flags.add(AttendanceFlag.TELEPORT);
      }
    }

    // --- 5. Usul ---
    if (input.method === AttendanceMethod.TELEGRAM_CHAT) {
      flags.add(AttendanceFlag.FALLBACK_METHOD);
    }

    // --- 6. Kechikish hisobi ---
    const schedule = await this.schedules.effectiveScheduleFor(input.userId);
    const graceMinutes = schedule?.graceMinutes ?? 15;
    const minutesLate = Math.max(
      0,
      Math.round((now.getTime() - attendance.expectedStartAt.getTime()) / 60000),
    );
    const status =
      minutesLate <= graceMinutes ? AttendanceStatus.ON_TIME : AttendanceStatus.LATE;

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status,
        method: input.method,
        checkInAt: now,
        minutesLate,
        photoFileId: file.id,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMeters: input.accuracy ?? null,
        distanceMeters: distance,
        officeId: office?.id ?? null,
        flags: { set: [...flags] },
        deviceInfo: input.deviceInfo?.slice(0, 500),
        ipAddress: input.ipAddress,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        office: { select: { name: true } },
      },
    });

    await this.audit.log(input.userId, 'attendance.checkIn', 'Attendance', updated.id, null, {
      status,
      minutesLate,
      distance,
      flags: [...flags],
      method: input.method,
    });

    return {
      id: updated.id,
      status: updated.status,
      checkInAt: updated.checkInAt,
      minutesLate: updated.minutesLate,
      distanceMeters: updated.distanceMeters,
      flags: updated.flags,
      officeName: updated.office?.name ?? null,
      message: this.checkInMessage(updated.status, minutesLate, [...flags]),
    };
  }

  private checkInMessage(status: AttendanceStatus, minutesLate: number, flags: AttendanceFlag[]) {
    const parts: string[] = [];

    if (status === AttendanceStatus.ON_TIME) {
      parts.push('✅ Belgilandingiz — vaqtida');
    } else {
      parts.push(`⚠️ Belgilandingiz — ${minutesLate} daqiqa kechikish`);
    }

    if (flags.includes(AttendanceFlag.OUTSIDE_GEOFENCE)) {
      parts.push('📍 Ofis hududidan tashqarida');
    }
    if (flags.includes(AttendanceFlag.NO_LOCATION)) {
      parts.push('📍 Joylashuv aniqlanmadi');
    }
    if (flags.includes(AttendanceFlag.LOW_GPS_ACCURACY)) {
      parts.push('📡 GPS aniqligi past');
    }
    if (flags.includes(AttendanceFlag.DUPLICATE_PHOTO)) {
      parts.push('🖼 Rasm avval yuborilgan');
    }

    return parts.join('\n');
  }

  /**
   * Hodim avval yuborgan rasmni qayta yubordimi?
   * Oxirgi 90 kundagi rasmlar bilan perceptual hash orqali solishtiriladi.
   */
  private async isDuplicatePhoto(userId: string, fileId: string, phash: string): Promise<boolean> {
    const threshold = this.config.get<number>('attendance.phashMaxDistance') ?? 6;
    const since = dayjs().subtract(90, 'day').toDate();

    const previous = await this.prisma.attendance.findMany({
      where: {
        userId,
        checkInAt: { gte: since },
        photoFileId: { not: null },
        photo: { phash: { not: null } },
      },
      select: { photo: { select: { id: true, phash: true } } },
      orderBy: { checkInAt: 'desc' },
      take: 120,
    });

    return previous.some(
      (p) =>
        p.photo?.phash &&
        p.photo.id !== fileId &&
        hammingDistance(p.photo.phash, phash) <= threshold,
    );
  }

  /**
   * Oldingi belgilanishdan hozirgisiga yetib kelish jismonan mumkinmi?
   * Masalan 5 daqiqada 30 km — bu soxta lokatsiya belgisi.
   */
  private async isTeleport(
    userId: string,
    latitude: number,
    longitude: number,
    at: Date,
  ): Promise<boolean> {
    const previous = await this.prisma.attendance.findFirst({
      where: {
        userId,
        checkInAt: { not: null, lt: at },
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { checkInAt: 'desc' },
      select: { latitude: true, longitude: true, checkInAt: true },
    });

    if (!previous?.checkInAt) return false;

    const meters = distanceMeters(previous.latitude!, previous.longitude!, latitude, longitude);
    // 3 km dan kichik farqlar shahar ichida normal
    if (meters < 3000) return false;

    const maxSpeed = this.config.get<number>('attendance.maxSpeedKmh') ?? 200;
    return speedKmh(meters, previous.checkInAt, at) > maxSpeed;
  }

  // ============================================================
  //  So'rovlar
  // ============================================================

  async list(actor: AuthUser, query: AttendanceQuery) {
    const take = Math.min(Number(query.take ?? 100), 500);
    const skip = Number(query.skip ?? 0);

    const where: Prisma.AttendanceWhereInput = {};

    if (query.date) {
      where.date = toDateOnly(query.date);
    } else if (query.from || query.to) {
      where.date = {
        gte: query.from ? toDateOnly(query.from) : undefined,
        lte: query.to ? toDateOnly(query.to) : undefined,
      };
    } else {
      where.date = toDateOnly(new Date());
    }

    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.userId) where.userId = query.userId;
    if (query.flagged === 'true') where.flags = { isEmpty: false };

    const userWhere: Prisma.UserWhereInput = {};
    const visible = await this.access.visibleDepartmentIds(actor);
    if (visible !== null) {
      userWhere.departmentId = { in: visible.length ? visible : ['__none__'] };
    }
    if (query.departmentId) userWhere.departmentId = query.departmentId;
    if (Object.keys(userWhere).length) where.user = userWhere;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              position: true,
              department: { select: { id: true, name: true } },
            },
          },
          photo: { select: { id: true } },
          office: { select: { id: true, name: true } },
          absenceRequest: { select: { id: true, type: true } },
        },
        orderBy: [{ date: 'desc' }, { status: 'asc' }, { checkInAt: 'asc' }],
        take,
        skip,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  /** Kunlik umumiy ko'rsatkichlar — admin panel bosh sahifasi uchun */
  async dailySummary(actor: AuthUser, date?: string) {
    const day = toDateOnly(date ?? new Date());

    const where: Prisma.AttendanceWhereInput = { date: day };
    const visible = await this.access.visibleDepartmentIds(actor);
    if (visible !== null) {
      where.user = { departmentId: { in: visible.length ? visible : ['__none__'] } };
    }

    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    const flagged = await this.prisma.attendance.count({
      where: { ...where, flags: { isEmpty: false } },
    });

    const working =
      (counts[AttendanceStatus.ON_TIME] ?? 0) +
      (counts[AttendanceStatus.LATE] ?? 0) +
      (counts[AttendanceStatus.MISSED] ?? 0) +
      (counts[AttendanceStatus.PENDING] ?? 0);

    return {
      date: dateKey(day),
      onTime: counts[AttendanceStatus.ON_TIME] ?? 0,
      late: counts[AttendanceStatus.LATE] ?? 0,
      missed: counts[AttendanceStatus.MISSED] ?? 0,
      pending: counts[AttendanceStatus.PENDING] ?? 0,
      excused: counts[AttendanceStatus.EXCUSED] ?? 0,
      dayOff: counts[AttendanceStatus.DAY_OFF] ?? 0,
      flagged,
      expected: working,
      attendanceRate:
        working > 0
          ? Math.round((((counts[AttendanceStatus.ON_TIME] ?? 0) + (counts[AttendanceStatus.LATE] ?? 0)) / working) * 100)
          : 0,
    };
  }

  /** Hodimning o'z davomati (Mini App uchun) */
  async myAttendance(userId: string, days = 14) {
    const from = toDateOnly(dayjs().subtract(days, 'day').toDate());

    const items = await this.prisma.attendance.findMany({
      where: { userId, date: { gte: from } },
      select: {
        id: true,
        date: true,
        status: true,
        checkInAt: true,
        minutesLate: true,
        expectedStartAt: true,
        flags: true,
        method: true,
      },
      orderBy: { date: 'desc' },
    });

    const workdays = items.filter(
      (i) => i.status !== AttendanceStatus.DAY_OFF && i.status !== AttendanceStatus.EXCUSED,
    );
    const onTime = workdays.filter((i) => i.status === AttendanceStatus.ON_TIME).length;

    return {
      items,
      stats: {
        workdays: workdays.length,
        onTime,
        late: workdays.filter((i) => i.status === AttendanceStatus.LATE).length,
        missed: workdays.filter((i) => i.status === AttendanceStatus.MISSED).length,
        rate: workdays.length ? Math.round((onTime / workdays.length) * 100) : 0,
      },
    };
  }

  /** Bugungi holat — Mini App ochilganda ko'rsatiladi */
  async todayStatus(userId: string) {
    const today = toDateOnly(new Date());

    let attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
      include: { office: true },
    });

    if (!attendance) {
      await this.ensureDayRecords(new Date());
      attendance = await this.prisma.attendance.findUnique({
        where: { userId_date: { userId, date: today } },
        include: { office: true },
      });
    }

    const office = attendance?.office ?? (await this.schedules.defaultOffice());

    return {
      date: dateKey(today),
      status: attendance?.status ?? AttendanceStatus.PENDING,
      expectedStartAt: attendance?.expectedStartAt ?? null,
      windowClosesAt: attendance?.windowClosesAt ?? null,
      checkInAt: attendance?.checkInAt ?? null,
      minutesLate: attendance?.minutesLate ?? 0,
      canCheckIn: attendance?.status === AttendanceStatus.PENDING && !attendance?.checkInAt,
      office: office
        ? {
            name: office.name,
            latitude: office.latitude,
            longitude: office.longitude,
            radiusMeters: office.radiusMeters,
          }
        : null,
      serverTime: new Date(),
      timezone: TZ,
    };
  }

  /** Admin qo'lda tuzatish kiritishi (izoh majburiy, jurnalga yoziladi) */
  async manualEntry(actor: AuthUser, dto: ManualAttendanceDto) {
    const day = toDateOnly(dto.date);

    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId: dto.userId, date: day } },
    });
    if (!attendance) throw new NotFoundException('Davomat yozuvi topilmadi');

    const checkInAt = dto.checkInTime ? atTime(day, dto.checkInTime) : attendance.checkInAt;
    const minutesLate = checkInAt
      ? Math.max(0, Math.round((checkInAt.getTime() - attendance.expectedStartAt.getTime()) / 60000))
      : 0;

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: dto.status,
        checkInAt,
        minutesLate,
        method: AttendanceMethod.MANUAL,
        flags: { set: [...new Set([...attendance.flags, AttendanceFlag.MANUAL_ENTRY])] },
        note: dto.note,
      },
    });

    await this.audit.log(actor.id, 'attendance.manual', 'Attendance', attendance.id, attendance, updated);
    return updated;
  }
}
