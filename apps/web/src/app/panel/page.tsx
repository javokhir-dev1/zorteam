'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, StatCard, Loading, Badge, Empty } from '@/components/ui';
import { fmtDate, fmtTime, ATTENDANCE_STATUS, ATTENDANCE_FLAG, ABSENCE_TYPE } from '@/lib/format';

interface Summary {
  date: string;
  onTime: number;
  late: number;
  missed: number;
  pending: number;
  excused: number;
  dayOff: number;
  flagged: number;
  expected: number;
  attendanceRate: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [absent, setAbsent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Summary>('/attendance/summary'),
      api<{ items: any[] }>('/attendance?flagged=true&take=8'),
      api<{ items: any[] }>('/absences/today'),
    ])
      .then(([s, f, a]) => {
        setSummary(s);
        setFlagged(f.items);
        setAbsent(a.items);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <>
      <PageHeader title="Bosh sahifa" subtitle={summary ? fmtDate(summary.date) : undefined} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Davomat"
          value={`${summary?.attendanceRate ?? 0}%`}
          hint={`${summary?.expected ?? 0} hodimdan`}
        />
        <StatCard label="Vaqtida" value={summary?.onTime ?? 0} tone="text-emerald-600" />
        <StatCard label="Kechikkan" value={summary?.late ?? 0} tone="text-amber-600" />
        <StatCard label="Belgilanmagan" value={summary?.missed ?? 0} tone="text-red-600" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatCard label="Kutilmoqda" value={summary?.pending ?? 0} hint="Oyna hali ochiq" />
        <StatCard label="Sababli" value={summary?.excused ?? 0} hint="Safar, ta'til, kasallik" />
        <StatCard
          label="Shubhali"
          value={summary?.flagged ?? 0}
          tone={summary?.flagged ? 'text-violet-600' : undefined}
          hint="Tekshirish tavsiya etiladi"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Shubhali belgilanishlar */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={17} className="text-violet-600" />
              Tekshirish kerak
            </h2>
            <Link href="/panel/davomat?flagged=true" className="text-xs text-brand-600">
              Barchasi <ArrowRight size={12} className="inline" />
            </Link>
          </div>

          <div className="space-y-2">
            {flagged.length === 0 && <Empty text="Shubhali belgilanish yo'q" />}

            {flagged.map((item) => {
              const status = ATTENDANCE_STATUS[item.status];
              return (
                <div key={item.id} className="card flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.user.fullName}</p>
                    <p className="muted truncate text-xs">
                      {item.user.department?.name ?? '—'} · {fmtTime(item.checkInAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.flags.map((flag: string) => (
                        <Badge key={flag} className="border-violet-200 bg-violet-50 text-violet-700">
                          {ATTENDANCE_FLAG[flag] ?? flag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Badge className={status?.color}>{status?.label}</Badge>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bugun sababli yo'qlar */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Bugun sababli yo'q</h2>
            <Link href="/panel/yoqliklar" className="text-xs text-brand-600">
              Barchasi <ArrowRight size={12} className="inline" />
            </Link>
          </div>

          <div className="space-y-2">
            {absent.length === 0 && <Empty text="Bugun hamma ish joyida" />}

            {absent.map((item) => (
              <div key={item.id} className="card flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.user.fullName}</p>
                  <p className="muted truncate text-xs">
                    {item.user.position} · {item.user.department?.name ?? '—'}
                  </p>
                </div>
                <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                  {ABSENCE_TYPE[item.type]}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
