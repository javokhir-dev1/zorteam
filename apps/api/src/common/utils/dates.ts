import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);

export const TZ = process.env.TZ || 'Asia/Tashkent';

export { dayjs };

/** Mahalliy vaqt mintaqasidagi hozirgi payt */
export function now() {
  return dayjs().tz(TZ);
}

/** "YYYY-MM-DD" ko'rinishidagi sana kaliti */
export function dateKey(d: Date | string | dayjs.Dayjs = new Date()): string {
  return dayjs(d as any).tz(TZ).format('YYYY-MM-DD');
}

/** Sana ustuni uchun UTC yarim tunga tenglashtirilgan Date (@db.Date) */
export function toDateOnly(d: Date | string | dayjs.Dayjs): Date {
  return new Date(`${dateKey(d)}T00:00:00.000Z`);
}

/**
 * Berilgan sana va "HH:mm" vaqtidan mahalliy mintaqadagi to'liq Date yasaydi.
 */
export function atTime(date: Date | string | dayjs.Dayjs, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((v) => Number(v));
  return dayjs.tz(`${dateKey(date)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'YYYY-MM-DD HH:mm', TZ).toDate();
}

/** ISO hafta kuni: 1 = Dushanba ... 7 = Yakshanba */
export function isoWeekday(d: Date | string | dayjs.Dayjs = new Date()): number {
  return dayjs(d as any).tz(TZ).isoWeekday();
}

/** Foydalanuvchiga ko'rsatish uchun formatlash */
export function fmtTime(d?: Date | null): string {
  return d ? dayjs(d).tz(TZ).format('HH:mm') : '—';
}

export function fmtDate(d?: Date | null): string {
  return d ? dayjs(d).tz(TZ).format('DD.MM.YYYY') : '—';
}

export function fmtDateTime(d?: Date | null): string {
  return d ? dayjs(d).tz(TZ).format('DD.MM.YYYY HH:mm') : '—';
}

/** Oy chegaralari */
export function monthRange(year: number, month: number) {
  const start = dayjs.tz(`${year}-${String(month).padStart(2, '0')}-01`, 'YYYY-MM-DD', TZ).startOf('month');
  return { start: start.toDate(), end: start.endOf('month').toDate() };
}

/** Hafta chegaralari (dushanbadan yakshanbagacha) */
export function weekRange(d: Date | string = new Date()) {
  const start = dayjs(d as any).tz(TZ).startOf('isoWeek');
  return { start: start.toDate(), end: start.endOf('isoWeek').toDate() };
}

const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

export function uzMonthName(month: number): string {
  return UZ_MONTHS[month - 1] ?? String(month);
}
