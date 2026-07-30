'use client';

import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { api } from '@/lib/api';
import { tgReady } from '@/lib/telegram';
import { fmtDateTime } from '@/lib/format';
import { BackLink } from '@/components/BackLink';

interface MyAssignment {
  id: string;
  status: string;
  note: string | null;
  crewRole: { name: string };
  episode: {
    id: string;
    title: string | null;
    recordAt: string | null;
    airAt: string | null;
    location: string | null;
    show: { id: string; name: string; code: string };
  };
}

const ASSIGNMENT_STATUS: Record<string, { label: string; color: string }> = {
  ASSIGNED: { label: 'Kutilmoqda', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  CONFIRMED: { label: 'Tasdiqlangan', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  DECLINED: { label: 'Rad etilgan', color: 'text-red-600 bg-red-50 border-red-200' },
  REPLACED: { label: 'Almashtirilgan', color: 'text-slate-500 bg-slate-50 border-slate-200' },
};

export default function MyShowsPage() {
  const [items, setItems] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tgReady();
    api<MyAssignment[]>('/assignments/my')
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <BackLink title="Ko'rsatuvlarim" />

      {loading && <p className="muted text-sm">Yuklanmoqda…</p>}

      {!loading && items.length === 0 && (
        <div className="card text-center">
          <Film className="mx-auto mb-3 text-slate-400" size={32} />
          <p className="text-sm">Biriktirilgan ko'rsatuv yo'q</p>
        </div>
      )}

      {items.map((item) => {
        const status = ASSIGNMENT_STATUS[item.status];
        const when = item.episode.recordAt ?? item.episode.airAt;

        return (
          <div key={item.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.episode.show.name}</p>
                {item.episode.title && (
                  <p className="muted text-xs">{item.episode.title}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${status?.color}`}>
                {status?.label}
              </span>
            </div>

            <div className="muted space-y-1 text-xs">
              <p>Rolingiz: <span className="font-medium">{item.crewRole.name}</span></p>
              {when && <p>Vaqti: {fmtDateTime(when)}</p>}
              {item.episode.location && <p>Joyi: {item.episode.location}</p>}
              {item.note && <p>Izoh: {item.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
