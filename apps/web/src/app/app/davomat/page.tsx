'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { tgReady } from '@/lib/telegram';
import { fmtDate, fmtTime, ATTENDANCE_STATUS } from '@/lib/format';
import { BackLink } from '@/components/BackLink';

interface MyAttendance {
  items: {
    id: string;
    date: string;
    status: string;
    checkInAt: string | null;
    minutesLate: number;
    method: string | null;
  }[];
  stats: { workdays: number; onTime: number; late: number; missed: number; rate: number };
}

export default function MyAttendancePage() {
  const [data, setData] = useState<MyAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);

  useEffect(() => {
    tgReady();
    setLoading(true);
    api<MyAttendance>(`/attendance/my?days=${days}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-4">
      <BackLink title="Davomatim" />

      <div className="flex gap-2">
        {[14, 30, 90].map((value) => (
          <button
            key={value}
            onClick={() => setDays(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              days === value ? 'bg-brand-600 text-white' : 'border'
            }`}
            style={days === value ? undefined : { borderColor: 'var(--border)' }}
          >
            {value} kun
          </button>
        ))}
      </div>

      {loading && <p className="muted text-sm">Yuklanmoqda…</p>}

      {data && (
        <>
          <div className="card">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Ish kuni" value={data.stats.workdays} />
              <Stat label="Vaqtida" value={data.stats.onTime} tone="text-emerald-600" />
              <Stat label="Kechikish" value={data.stats.late} tone="text-amber-600" />
              <Stat label="Yo'q" value={data.stats.missed} tone="text-red-600" />
            </div>
            <div className="mt-4 border-t pt-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="muted text-xs">Davomat ko'rsatkichi</p>
              <p className="text-2xl font-semibold">{data.stats.rate}%</p>
            </div>
          </div>

          <div className="space-y-2">
            {data.items.map((item) => {
              const status = ATTENDANCE_STATUS[item.status] ?? {
                label: item.status,
                color: '',
                icon: '',
              };
              return (
                <div key={item.id} className="card flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{fmtDate(item.date)}</p>
                    <p className="muted text-xs">
                      {item.checkInAt ? fmtTime(item.checkInAt) : '—'}
                      {item.minutesLate > 0 && ` (+${item.minutesLate} daq)`}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`text-lg font-semibold ${tone ?? ''}`}>{value}</p>
      <p className="muted text-[11px]">{label}</p>
    </div>
  );
}
