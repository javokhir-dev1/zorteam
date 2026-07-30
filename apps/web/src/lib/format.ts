import dayjs from 'dayjs';
import 'dayjs/locale/uz-latn';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('uz-latn');

export const TZ = 'Asia/Tashkent';

export function fmtTime(value?: string | Date | null): string {
  return value ? dayjs(value).tz(TZ).format('HH:mm') : '—';
}

export function fmtDate(value?: string | Date | null): string {
  return value ? dayjs(value).tz(TZ).format('DD.MM.YYYY') : '—';
}

export function fmtDateTime(value?: string | Date | null): string {
  return value ? dayjs(value).tz(TZ).format('DD.MM.YYYY HH:mm') : '—';
}

export function fmtDay(value?: string | Date | null): string {
  return value ? dayjs(value).tz(TZ).format('DD MMMM') : '—';
}

export function fromNow(value?: string | Date | null): string {
  return value ? dayjs(value).tz(TZ).fromNow() : '—';
}

export function todayKey(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}

export const ATTENDANCE_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  ON_TIME: { label: 'Vaqtida', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: '✓' },
  LATE: { label: 'Kechikdi', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: '!' },
  MISSED: { label: 'Belgilanmadi', color: 'text-red-600 bg-red-50 border-red-200', icon: '✕' },
  PENDING: { label: 'Kutilmoqda', color: 'text-slate-500 bg-slate-50 border-slate-200', icon: '…' },
  EXCUSED: { label: 'Sababli', color: 'text-sky-600 bg-sky-50 border-sky-200', icon: '≈' },
  DAY_OFF: { label: 'Dam olish', color: 'text-slate-400 bg-slate-50 border-slate-200', icon: '–' },
};

export const ATTENDANCE_FLAG: Record<string, string> = {
  OUTSIDE_GEOFENCE: 'Ofisdan tashqarida',
  LOW_GPS_ACCURACY: 'GPS aniqligi past',
  DUPLICATE_PHOTO: 'Takroriy rasm',
  FALLBACK_METHOD: 'Zaxira usul',
  TELEPORT: 'Mantiqsiz masofa',
  NO_LOCATION: 'Joylashuv yo\'q',
  MANUAL_ENTRY: 'Qo\'lda kiritilgan',
};

export const ATTENDANCE_METHOD: Record<string, string> = {
  MINIAPP: 'Mini App (kamera)',
  TELEGRAM_CHAT: 'Telegram chat',
  MANUAL: 'Qo\'lda',
};

export const ABSENCE_TYPE: Record<string, string> = {
  BUSINESS_TRIP: 'Xizmat safari',
  SICK_LEAVE: 'Davolanish',
  VACATION: "Ta'til",
  UNPAID: "Ish haqisiz ta'til",
  REMOTE: 'Masofadan',
  OTHER: 'Boshqa',
};

export const ABSENCE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Kutilmoqda', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  APPROVED: { label: 'Tasdiqlangan', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  REJECTED: { label: 'Rad etilgan', color: 'text-red-600 bg-red-50 border-red-200' },
  CANCELLED: { label: 'Bekor qilingan', color: 'text-slate-500 bg-slate-50 border-slate-200' },
};

export const TASK_STATUS: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Yangi', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  ACCEPTED: { label: 'Qabul qilindi', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  IN_PROGRESS: { label: 'Jarayonda', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  DONE: { label: 'Bajarildi', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  REJECTED: { label: 'Rad etildi', color: 'text-red-600 bg-red-50 border-red-200' },
  CANCELLED: { label: 'Bekor qilindi', color: 'text-slate-500 bg-slate-50 border-slate-200' },
};

export const TASK_PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Past', color: 'text-slate-500' },
  NORMAL: { label: 'Oddiy', color: 'text-sky-600' },
  HIGH: { label: 'Yuqori', color: 'text-amber-600' },
  URGENT: { label: 'Shoshilinch', color: 'text-red-600' },
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  APPROVER: 'Tasdiqlovchi rahbar',
  DEPT_HEAD: "Bo'lim rahbari",
  EMPLOYEE: 'Hodim',
  VIEWER: 'Kuzatuvchi',
};

export const EPISODE_STATUS: Record<string, { label: string; color: string }> = {
  PLANNED: { label: 'Rejalashtirilgan', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  IN_PROGRESS: { label: 'Jarayonda', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  DONE: { label: "Bo'lib o'tdi", color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  CANCELLED: { label: 'Bekor qilingan', color: 'text-slate-500 bg-slate-50 border-slate-200' },
};

export const FEEDBACK_CATEGORY: Record<string, string> = {
  TECHNICAL: 'Texnika va jihozlar',
  RELATIONS: 'Munosabatlar',
  CONDITIONS: 'Ish sharoiti',
  SALARY: 'Moliyaviy masalalar',
  SUGGESTION: 'Taklif',
  OTHER: 'Boshqa',
};

export function humanDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} daq`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat ${minutes % 60} daq`;
  const days = Math.floor(hours / 24);
  return `${days} kun ${hours % 24} soat`;
}

export function fmtNumber(value: number): string {
  return new Intl.NumberFormat('uz-UZ').format(value);
}

export function deltaLabel(percent: number): { text: string; color: string } {
  if (percent > 0) return { text: `+${percent}%`, color: 'text-emerald-600' };
  if (percent < 0) return { text: `${percent}%`, color: 'text-red-600' };
  return { text: '0%', color: 'text-slate-500' };
}
