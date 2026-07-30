'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, AlertTriangle, Clock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox } from '@/components/ui';
import { fmtDateTime, TASK_STATUS, TASK_PRIORITY, humanDuration } from '@/lib/format';

export default function TasksPage() {
  const { isAdmin, has } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<any | null>(null);

  const canManage = isAdmin || has('DEPT_HEAD');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ take: '100' });
    if (status) params.set('status', status);
    if (overdue) params.set('overdue', 'true');

    try {
      const data = await api<{ items: any[] }>(`/tasks?${params}`);
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [status, overdue]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Bo'limlararo so'rovlar"
        subtitle="Deadline nazorati bilan"
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary text-xs">
            <Plus size={14} />
            Yangi so'rov
          </button>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2">
        {[
          { value: '', label: 'Barchasi' },
          { value: 'NEW', label: 'Yangi' },
          { value: 'ACCEPTED', label: 'Qabul qilingan' },
          { value: 'IN_PROGRESS', label: 'Jarayonda' },
          { value: 'DONE', label: 'Bajarilgan' },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => setStatus(option.value)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              status === option.value ? 'bg-brand-600 text-white' : 'border'
            }`}
            style={status === option.value ? undefined : { borderColor: 'var(--border)' }}
          >
            {option.label}
          </button>
        ))}

        <label className="ml-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
            className="h-4 w-4"
          />
          Faqat kechikkanlar
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="So'rov yo'q" />
      ) : (
        <div className="space-y-2">
          {items.map((task) => {
            const meta = TASK_STATUS[task.status];
            const priority = TASK_PRIORITY[task.priority];

            return (
              <button
                key={task.id}
                onClick={() => setActive(task)}
                className="card w-full text-left transition-colors hover:border-brand-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{task.number} — {task.title}
                    </p>
                    <p className="muted mt-0.5 text-xs">
                      {task.fromDepartment.name} → {task.toDepartment.name}
                      {task.assignee ? ` · ${task.assignee.fullName}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {task.noResponseFlagged && (
                      <Badge className="border-red-200 bg-red-50 text-red-700">Javobsiz</Badge>
                    )}
                    {task.isOverdue && (
                      <Badge className="border-red-200 bg-red-50 text-red-700">
                        <AlertTriangle size={10} className="inline" />{' '}
                        {humanDuration(task.overdueMinutes)}
                      </Badge>
                    )}
                    <span className={`text-xs ${priority?.color}`}>{priority?.label}</span>
                    <Badge className={meta?.color}>{meta?.label}</Badge>
                  </div>
                </div>

                {task.deadlineAt && (
                  <p className="muted mt-2 flex items-center gap-1 text-xs">
                    <Clock size={12} />
                    Muddat: {fmtDateTime(task.deadlineAt)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <CreateTaskModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}

      {active && (
        <TaskModal
          task={active}
          canManage={canManage}
          onClose={() => setActive(null)}
          onChanged={async () => {
            setActive(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function CreateTaskModal({ onClose, onSaved }: any) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [shows, setShows] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    toDepartmentId: '',
    priority: 'NORMAL',
    showId: '',
    desiredDeadline: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<any[]>('/departments'), api<any[]>('/shows')])
      .then(([d, s]) => {
        setDepartments(d);
        setShows(s);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          title: form.title,
          description: form.description,
          toDepartmentId: form.toDepartmentId,
          priority: form.priority,
          showId: form.showId || undefined,
          desiredDeadline: form.desiredDeadline
            ? new Date(form.desiredDeadline).toISOString()
            : undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuborilmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title="Yangi so'rov" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Sarlavha *</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input"
            placeholder="Ko'rsatuv uchun banner"
          />
        </div>

        <div>
          <label className="label text-xs">Tavsif *</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="input resize-none"
            placeholder="Nima kerakligini batafsil yozing…"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Qaysi bo'limga *</label>
            <select
              value={form.toDepartmentId}
              onChange={(e) => setForm({ ...form, toDepartmentId: e.target.value })}
              className="input"
            >
              <option value="">Tanlang</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label text-xs">Muhimlik</label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="input"
            >
              {Object.entries(TASK_PRIORITY).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label text-xs">Ko'rsatuv (ixtiyoriy)</label>
            <select
              value={form.showId}
              onChange={(e) => setForm({ ...form, showId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label text-xs">Taklif qilingan muddat</label>
            <input
              type="datetime-local"
              value={form.desiredDeadline}
              onChange={(e) => setForm({ ...form, desiredDeadline: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <p className="muted text-xs">
          So'rov bo'lim rahbariga Telegram orqali boradi. Rahbar ijrochi va aniq muddatni belgilaydi.
        </p>

        {error && <ErrorBox message={error} />}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">
            Bekor qilish
          </button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Yuborilmoqda…' : 'Yuborish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TaskModal({ task, canManage, onClose, onChanged }: any) {
  const [detail, setDetail] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDetail(await api(`/tasks/${task.id}`));
  }, [task.id]);

  useEffect(() => {
    void load();
    api<{ items: any[] }>(`/users?departmentId=${task.toDepartment.id}&status=ACTIVE&take=200`)
      .then((data) => setCandidates(data.items))
      .catch(() => undefined);
  }, [load, task.toDepartment.id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarilmadi');
    } finally {
      setBusy(false);
    }
  };

  if (!detail) {
    return (
      <Modal title="Yuklanmoqda…" onClose={onClose}>
        <Loading />
      </Modal>
    );
  }

  const meta = TASK_STATUS[detail.status];

  return (
    <Modal title={`#${detail.number} — ${detail.title}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={meta?.color}>{meta?.label}</Badge>
          {detail.isOverdue && (
            <Badge className="border-red-200 bg-red-50 text-red-700">
              Kechikish: {humanDuration(detail.overdueMinutes)}
            </Badge>
          )}
        </div>

        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {detail.description}
        </p>

        <div className="muted grid gap-1 text-xs sm:grid-cols-2">
          <p>Kimdan: {detail.fromUser.fullName} ({detail.fromDepartment.name})</p>
          <p>Kimga: {detail.toDepartment.name}</p>
          <p>Ijrochi: {detail.assignee?.fullName ?? '—'}</p>
          <p>Muddat: {detail.deadlineAt ? fmtDateTime(detail.deadlineAt) : '—'}</p>
          {detail.show && <p>Ko'rsatuv: {detail.show.name}</p>}
          {detail.rejectedReason && <p>Rad etish sababi: {detail.rejectedReason}</p>}
        </div>

        {/* Rahbar amallari */}
        {canManage && ['NEW', 'ACCEPTED'].includes(detail.status) && (
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-3 text-sm font-medium">Ijrochi va muddat belgilash</p>

            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="input"
              >
                <option value="">Ijrochi tanlang</option>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} — {user.position}
                  </option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="input"
              />
            </div>

            <button
              onClick={() =>
                run(() =>
                  api(`/tasks/${detail.id}/accept`, {
                    method: 'POST',
                    body: {
                      assigneeId,
                      deadlineAt: new Date(deadline).toISOString(),
                    },
                  }),
                )
              }
              disabled={!assigneeId || !deadline || busy}
              className="btn-primary mt-2 w-full text-xs"
            >
              Qabul qilish va biriktirish
            </button>

            <div className="mt-3 flex gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="input"
                placeholder="Rad etish sababi"
              />
              <button
                onClick={() =>
                  run(() =>
                    api(`/tasks/${detail.id}/reject`, {
                      method: 'POST',
                      body: { reason: rejectReason },
                    }),
                  )
                }
                disabled={rejectReason.trim().length < 5 || busy}
                className="btn-ghost shrink-0 text-xs text-red-600"
              >
                Rad etish
              </button>
            </div>
          </div>
        )}

        {/* Izohlar */}
        <div>
          <p className="mb-2 text-sm font-medium">Izohlar</p>

          <div className="space-y-2">
            {detail.comments.length === 0 && <p className="muted text-xs">Izoh yo'q</p>}

            {detail.comments.map((item: any) => (
              <div
                key={item.id}
                className="rounded-lg border p-2.5 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="muted mb-1 text-[11px]">
                  {item.author.fullName} · {fmtDateTime(item.createdAt)}
                </p>
                {item.body}
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="input"
              placeholder="Izoh yozish…"
            />
            <button
              onClick={() =>
                run(async () => {
                  await api(`/tasks/${detail.id}/comments`, {
                    method: 'POST',
                    body: { body: comment },
                  });
                  setComment('');
                })
              }
              disabled={!comment.trim() || busy}
              className="btn-ghost shrink-0 text-xs"
            >
              Yuborish
            </button>
          </div>
        </div>

        {error && <ErrorBox message={error} />}
      </div>
    </Modal>
  );
}
