'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { tgReady, haptic } from '@/lib/telegram';
import { fmtDateTime, TASK_STATUS } from '@/lib/format';
import { BackLink } from '@/components/BackLink';

interface MyTask {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  deadlineAt: string | null;
  fromUser: { fullName: string };
  fromDepartment: { name: string };
}

export default function MyTasksPage() {
  const [items, setItems] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<MyTask[]>('/tasks/my'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    tgReady();
    void load();
  }, [load]);

  const changeStatus = async (id: string, status: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/tasks/${id}/status`, { method: 'POST', body: { status } });
      haptic('success');
      await load();
    } catch (err) {
      haptic('error');
      setError(err instanceof ApiError ? err.message : "O'zgartirilmadi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink title="Topshiriqlarim" />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="muted text-sm">Yuklanmoqda…</p>}

      {!loading && items.length === 0 && (
        <div className="card text-center">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={32} />
          <p className="text-sm">Bajarilishi kerak bo'lgan topshiriq yo'q</p>
        </div>
      )}

      {items.map((task) => {
        const overdue = task.deadlineAt && new Date(task.deadlineAt) < new Date();
        const status = TASK_STATUS[task.status];

        return (
          <div key={task.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  #{task.number} — {task.title}
                </p>
                <p className="muted mt-0.5 text-xs">
                  {task.fromUser.fullName} · {task.fromDepartment.name}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${status?.color}`}>
                {status?.label}
              </span>
            </div>

            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {task.description}
            </p>

            {task.deadlineAt && (
              <p
                className={`flex items-center gap-1.5 text-xs ${
                  overdue ? 'text-red-600' : 'text-amber-600'
                }`}
              >
                {overdue ? <AlertTriangle size={13} /> : <Clock size={13} />}
                {overdue ? 'Muddat o\'tdi: ' : 'Muddat: '}
                {fmtDateTime(task.deadlineAt)}
              </p>
            )}

            <div className="flex gap-2">
              {task.status === 'ACCEPTED' && (
                <button
                  onClick={() => changeStatus(task.id, 'IN_PROGRESS')}
                  disabled={busyId === task.id}
                  className="btn-ghost flex-1 text-xs"
                >
                  Boshlash
                </button>
              )}
              <button
                onClick={() => changeStatus(task.id, 'DONE')}
                disabled={busyId === task.id}
                className="btn-primary flex-1 text-xs"
              >
                Bajarildi
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
