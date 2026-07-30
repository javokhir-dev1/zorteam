'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CalendarDays,
  ClipboardList,
  Star,
  MessageSquareLock,
  Film,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

/** Admin panelga kira oladigan rollar */
const PANEL_ROLES = ['ADMIN', 'APPROVER', 'DEPT_HEAD', 'VIEWER'];
import { api, ApiError } from '@/lib/api';
import { tgReady, getPosition, haptic, isInsideTelegram, type Position } from '@/lib/telegram';
import { CameraCapture } from '@/components/CameraCapture';
import { fmtTime, ATTENDANCE_FLAG } from '@/lib/format';

interface TodayStatus {
  date: string;
  status: string;
  expectedStartAt: string | null;
  windowClosesAt: string | null;
  checkInAt: string | null;
  minutesLate: number;
  canCheckIn: boolean;
  office: { name: string; latitude: number; longitude: number; radiusMeters: number } | null;
  serverTime: string;
}

interface CheckInResult {
  status: string;
  checkInAt: string;
  minutesLate: number;
  distanceMeters: number | null;
  flags: string[];
  message: string;
}

/** Nosozlikni aniqlash uchun Mini App holati */
function diagnostics() {
  const app = (typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null) ?? null;
  return {
    sdkYuklandi: Boolean(app),
    initDataUzunligi: app?.initData?.length ?? 0,
    telegramVersiyasi: app?.version ?? null,
    platforma: app?.platform ?? null,
    foydalanuvchiId: app?.initDataUnsafe?.user?.id ?? null,
    manzil: typeof window !== 'undefined' ? window.location.origin : null,
  };
}

export default function MiniAppHome() {
  const [today, setToday] = useState<TodayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [me, setMe] = useState<{ fullName: string; roles: string[] } | null>(null);
  const [openingPanel, setOpeningPanel] = useState(false);

  const positionRef = useRef<Promise<Position> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, profile] = await Promise.all([
        api<TodayStatus>('/attendance/today'),
        api<{ fullName: string; roles: string[] }>('/auth/me'),
      ]);
      setToday(status);
      setMe(profile);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ma\'lumot yuklanmadi');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Rahbarlar uchun: parol so'ramasdan admin panelga o'tish */
  const openPanel = async () => {
    setOpeningPanel(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>('/auth/panel-token', { method: 'POST' });
      const url = `${window.location.origin}/panel?token=${encodeURIComponent(token)}`;

      const app = (window as any).Telegram?.WebApp;
      if (app?.openLink) app.openLink(url);
      else window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Panel ochilmadi');
    } finally {
      setOpeningPanel(false);
    }
  };

  useEffect(() => {
    tgReady();
    void load();
  }, [load]);

  const startCheckIn = () => {
    setError(null);
    // Joylashuvni fon rejimida so'raymiz — kamera ochilguncha tayyor bo'ladi
    positionRef.current = getPosition().catch((err: Error) => {
      throw err;
    });
    setCameraOpen(true);
  };

  const handleCapture = async (photo: Blob) => {
    setCameraOpen(false);
    setSubmitting(true);
    setProgress('Joylashuv aniqlanmoqda…');

    try {
      const position = await (positionRef.current ?? getPosition());

      setProgress('Yuborilmoqda…');

      const formData = new FormData();
      formData.append('photo', photo, `checkin-${Date.now()}.jpg`);
      formData.append('latitude', String(position.latitude));
      formData.append('longitude', String(position.longitude));
      formData.append('accuracy', String(Math.round(position.accuracy)));
      formData.append('deviceInfo', `${position.source} | ${navigator.userAgent}`.slice(0, 400));

      const response = await api<CheckInResult>('/attendance/check-in', {
        method: 'POST',
        formData,
      });

      haptic(response.status === 'ON_TIME' ? 'success' : 'warning');
      setResult(response);
      await load();
    } catch (err) {
      haptic('error');
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
      setProgress('');
      positionRef.current = null;
    }
  };

  // ---------- Ko'rinishlar ----------

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  if (error && !today) {
    return (
      <div className="card mt-8 text-center">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={32} />
        <p className="text-sm">{error}</p>
        {!isInsideTelegram() && (
          <p className="muted mt-3 text-xs">
            Bu sahifa Telegram ilovasi ichida ochilishi kerak.
          </p>
        )}
        <button onClick={() => void load()} className="btn-ghost mt-4">
          Qayta urinish
        </button>

        {/* Diagnostika — nosozlikni topishga yordam beradi */}
        <details className="mt-4 text-left">
          <summary className="muted cursor-pointer text-xs">Texnik ma'lumot</summary>
          <pre className="muted mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px]">
            {JSON.stringify(diagnostics(), null, 1)}
          </pre>
        </details>
      </div>
    );
  }

  if (cameraOpen) {
    return <CameraCapture onCapture={handleCapture} onCancel={() => setCameraOpen(false)} />;
  }

  if (submitting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        <p className="text-sm muted">{progress}</p>
      </div>
    );
  }

  if (result) {
    const ok = result.status === 'ON_TIME';
    return (
      <div className="mt-6">
        <div className="card text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {ok ? <CheckCircle2 size={32} /> : <Clock size={32} />}
          </div>

          <h1 className="text-lg font-semibold">
            {ok ? 'Belgilandingiz' : `Kechikish: ${result.minutesLate} daqiqa`}
          </h1>
          <p className="muted mt-1 text-sm">{fmtTime(result.checkInAt)}</p>

          {result.distanceMeters !== null && (
            <p className="muted mt-3 text-xs">
              Ofisgacha masofa: {result.distanceMeters} m
            </p>
          )}

          {result.flags.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-800">
              {result.flags.map((flag) => (
                <div key={flag}>• {ATTENDANCE_FLAG[flag] ?? flag}</div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setResult(null)} className="btn-ghost mt-4 w-full">
          Yopish
        </button>
      </div>
    );
  }

  const statusView = () => {
    if (!today) return null;

    if (today.checkInAt) {
      return (
        <div className="card text-center">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={36} />
          <p className="font-medium">Bugun belgilangansiz</p>
          <p className="muted mt-1 text-sm">
            {fmtTime(today.checkInAt)}
            {today.minutesLate > 0 && ` — ${today.minutesLate} daqiqa kechikish`}
          </p>
        </div>
      );
    }

    if (today.status === 'DAY_OFF') {
      return (
        <div className="card text-center">
          <CalendarDays className="mx-auto mb-3 text-slate-400" size={36} />
          <p className="font-medium">Bugun dam olish kuni</p>
          <p className="muted mt-1 text-sm">Belgilanish talab qilinmaydi</p>
        </div>
      );
    }

    if (today.status === 'EXCUSED') {
      return (
        <div className="card text-center">
          <CalendarDays className="mx-auto mb-3 text-sky-500" size={36} />
          <p className="font-medium">Sababli yo'qsiz</p>
          <p className="muted mt-1 text-sm">Tasdiqlangan so'rov mavjud</p>
        </div>
      );
    }

    if (today.status === 'MISSED') {
      return (
        <div className="card text-center">
          <AlertTriangle className="mx-auto mb-3 text-red-500" size={36} />
          <p className="font-medium">Belgilanish oynasi yopilgan</p>
          <p className="muted mt-1 text-sm">
            Oyna {fmtTime(today.windowClosesAt)} da yopilgan. Rahbaringizga murojaat qiling.
          </p>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="mb-5 flex items-center justify-between text-sm">
          <div>
            <p className="muted text-xs">Ish vaqti</p>
            <p className="font-semibold">{fmtTime(today.expectedStartAt)}</p>
          </div>
          <div className="text-right">
            <p className="muted text-xs">Oyna yopiladi</p>
            <p className="font-semibold text-amber-600">{fmtTime(today.windowClosesAt)}</p>
          </div>
        </div>

        <button onClick={startCheckIn} className="btn-primary w-full py-4 text-base">
          <Camera size={20} />
          Belgilanish
        </button>

        <div className="muted mt-4 space-y-1.5 text-xs">
          <p className="flex items-start gap-2">
            <Camera size={13} className="mt-0.5 shrink-0" />
            Kamera ochiladi — shu daqiqadagi rasm olinadi
          </p>
          <p className="flex items-start gap-2">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            Joylashuvingiz avtomatik aniqlanadi
            {today.office && ` (${today.office.name}, ${today.office.radiusMeters} m)`}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-xl font-semibold">Zo'r team</h1>
        <p className="muted text-sm">{me?.fullName ?? 'Boshqaruv tizimi'}</p>
      </header>

      {/* Rahbarlar uchun admin panelga o'tish */}
      {me?.roles.some((role) => PANEL_ROLES.includes(role)) && (
        <button
          onClick={openPanel}
          disabled={openingPanel}
          className="card flex w-full items-center gap-3 border-brand-300 bg-brand-50 text-left transition-colors hover:border-brand-500"
        >
          <ShieldCheck size={22} className="shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-brand-800">
              {openingPanel ? 'Ochilmoqda…' : 'Boshqaruv paneli'}
            </p>
            <p className="text-xs text-brand-700">
              Hodimlar, bo'limlar, rahbarlar, hisobotlar
            </p>
          </div>
          <ExternalLink size={16} className="shrink-0 text-brand-600" />
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {statusView()}

      <nav className="grid grid-cols-2 gap-3">
        <MenuCard href="/app/davomat" icon={<CalendarDays size={20} />} label="Davomatim" />
        <MenuCard href="/app/baholash" icon={<Star size={20} />} label="Baholash" />
        <MenuCard href="/app/topshiriqlar" icon={<ClipboardList size={20} />} label="Topshiriqlar" />
        <MenuCard href="/app/korsatuvlar" icon={<Film size={20} />} label="Ko'rsatuvlar" />
        <MenuCard
          href="/app/murojaat"
          icon={<MessageSquareLock size={20} />}
          label="Maxfiy murojaat"
          wide
        />
      </nav>
    </div>
  );
}

function MenuCard({
  href,
  icon,
  label,
  wide,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card flex items-center gap-3 transition-colors hover:border-brand-300 ${
        wide ? 'col-span-2' : ''
      }`}
    >
      <span className="text-brand-600">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
