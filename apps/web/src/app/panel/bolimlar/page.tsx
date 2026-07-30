'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox } from '@/components/ui';

export default function DepartmentsPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [headsFor, setHeadsFor] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sch] = await Promise.all([
        api<any[]>('/departments?includeInactive=true'),
        api<any[]>('/schedules'),
      ]);
      setItems(list);
      setSchedules(sch);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Bo'limlar va prodakshnlar"
        subtitle={`Jami: ${items.length}`}
        actions={
          isAdmin && (
            <button onClick={() => setEditing({})} className="btn-primary text-xs">
              <Plus size={14} />
              Yangi bo'lim
            </button>
          )
        }
      />

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Bo'lim yo'q" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((dept) => (
            <div key={dept.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{dept.name}</p>
                  <p className="muted text-xs">{dept.code}</p>
                </div>
                <Badge
                  className={
                    dept.type === 'PRODUCTION'
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }
                >
                  {dept.type === 'PRODUCTION' ? 'Prodakshn' : "Bo'lim"}
                </Badge>
              </div>

              <div className="muted flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <Users size={13} />
                  {dept.employeeCount} hodim
                </span>
                {dept.schedule && <span>{dept.schedule.name}</span>}
              </div>

              <div>
                <p className="muted mb-1 text-[11px]">Rahbarlar</p>
                {dept.heads.length === 0 ? (
                  <p className="text-xs text-amber-600">Rahbar belgilanmagan</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {dept.heads.map((head: any) => (
                      <Badge key={head.id} className="border-indigo-200 bg-indigo-50 text-indigo-700">
                        {head.fullName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(dept)} className="btn-ghost flex-1 text-xs">
                    Tahrirlash
                  </button>
                  <button onClick={() => setHeadsFor(dept)} className="btn-ghost flex-1 text-xs">
                    Rahbarlar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <DepartmentModal
          department={editing}
          schedules={schedules}
          allDepartments={items}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {headsFor && (
        <HeadsModal
          department={headsFor}
          onClose={() => setHeadsFor(null)}
          onSaved={async () => {
            setHeadsFor(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function DepartmentModal({
  department,
  schedules,
  allDepartments,
  onClose,
  onSaved,
}: {
  department: any;
  schedules: any[];
  allDepartments: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !department.id;
  const [form, setForm] = useState({
    name: department.name ?? '',
    code: department.code ?? '',
    type: department.type ?? 'DEPARTMENT',
    parentId: department.parentId ?? '',
    scheduleId: department.schedule?.id ?? '',
    isActive: department.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body = {
      name: form.name,
      code: form.code.toUpperCase(),
      type: form.type,
      parentId: form.parentId || null,
      scheduleId: form.scheduleId || null,
      ...(isNew ? {} : { isActive: form.isActive }),
    };

    try {
      if (isNew) await api('/departments', { method: 'POST', body });
      else await api(`/departments/${department.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? "Yangi bo'lim" : form.name} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Nomi *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Kod *</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="input uppercase"
              placeholder="OPER"
            />
          </div>
          <div>
            <label className="label text-xs">Turi</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="input"
            >
              <option value="DEPARTMENT">Bo'lim</option>
              <option value="PRODUCTION">Prodakshn</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Yuqori bo'lim</label>
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {allDepartments
                .filter((d) => d.id !== department.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Ish grafigi</label>
            <select
              value={form.scheduleId}
              onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
              className="input"
            >
              <option value="">Standart</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isNew && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4"
            />
            Faol
          </label>
        )}

        {error && <ErrorBox message={error} />}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">
            Bekor qilish
          </button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HeadsModal({
  department,
  onClose,
  onSaved,
}: {
  department: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>(department.heads.map((h: any) => h.id));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: any[] }>('/users?take=200&status=ACTIVE')
      .then((data) => setUsers(data.items))
      .catch(() => undefined);
  }, []);

  const filtered = users.filter((u) =>
    u.fullName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/departments/${department.id}/heads`, {
        method: 'POST',
        body: { userIds: selected },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={`${department.name} — rahbarlar`} onClose={onClose}>
      <p className="muted mb-3 text-sm">
        Rahbar tanlanganda unga avtomatik "Bo'lim rahbari" roli beriladi.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input mb-3"
        placeholder="Hodim qidirish…"
      />

      <div
        className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {filtered.map((user) => (
          <label
            key={user.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/5"
          >
            <input
              type="checkbox"
              checked={selected.includes(user.id)}
              onChange={(e) =>
                setSelected((prev) =>
                  e.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id),
                )
              }
              className="h-4 w-4"
            />
            <div className="min-w-0">
              <p className="truncate text-sm">{user.fullName}</p>
              <p className="muted truncate text-xs">
                {user.position} · {user.department?.name ?? '—'}
              </p>
            </div>
          </label>
        ))}
      </div>

      {error && <div className="mt-3"><ErrorBox message={error} /></div>}

      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="btn-ghost flex-1">
          Bekor qilish
        </button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1">
          {saving ? 'Saqlanmoqda…' : `Saqlash (${selected.length})`}
        </button>
      </div>
    </Modal>
  );
}
