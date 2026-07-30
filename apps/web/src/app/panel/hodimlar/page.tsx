'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Link2, Search, Copy, Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Table, Td, Modal, ErrorBox } from '@/components/ui';
import { ROLE_LABEL, fmtDate } from '@/lib/format';

const ROLES = ['ADMIN', 'APPROVER', 'DEPT_HEAD', 'EMPLOYEE', 'VIEWER'];

export default function EmployeesPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [departments, setDepartments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [linked, setLinked] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [invite, setInvite] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([api<any[]>('/departments'), api<any[]>('/schedules')])
      .then(([d, s]) => {
        setDepartments(d);
        setSchedules(s);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ take: '200' });
    if (search.trim()) params.set('search', search.trim());
    if (departmentId) params.set('departmentId', departmentId);
    if (linked) params.set('linked', linked);

    try {
      const data = await api<{ items: any[]; total: number }>(`/users?${params}`);
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [search, departmentId, linked]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  const createInvite = async (userId: string) => {
    try {
      setInvite(await api(`/users/${userId}/invite`, { method: 'POST' }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Havola yaratilmadi');
    }
  };

  return (
    <>
      <PageHeader
        title="Hodimlar"
        subtitle={`Jami: ${total}`}
        actions={
          isAdmin && (
            <button onClick={() => setEditing({})} className="btn-primary text-xs">
              <UserPlus size={14} />
              Yangi hodim
            </button>
          )
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label text-xs">Qidiruv</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Ism, lavozim yoki telefon"
            />
          </div>
        </div>

        <div>
          <label className="label text-xs">Bo'lim</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="input w-auto"
          >
            <option value="">Barchasi</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label text-xs">Telegram</label>
          <select value={linked} onChange={(e) => setLinked(e.target.value)} className="input w-auto">
            <option value="">Barchasi</option>
            <option value="true">Ulangan</option>
            <option value="false">Ulanmagan</option>
          </select>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Hodim topilmadi" />
      ) : (
        <Table head={['Hodim', "Bo'lim", 'Rollar', 'Telegram', 'Holat', '']}>
          {items.map((user) => (
            <tr key={user.id}>
              <Td>
                <p className="font-medium">{user.fullName}</p>
                <p className="muted text-xs">
                  {user.position}
                  {user.phone ? ` · ${user.phone}` : ''}
                </p>
              </Td>
              <Td className="text-xs">{user.department?.name ?? '—'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role: string) => (
                    <Badge
                      key={role}
                      className={
                        role === 'ADMIN'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : role === 'DEPT_HEAD'
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : role === 'APPROVER'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                      }
                    >
                      {ROLE_LABEL[role] ?? role}
                    </Badge>
                  ))}
                </div>
              </Td>
              <Td>
                {user.telegramId ? (
                  user.botBlocked ? (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">Bloklangan</Badge>
                  ) : (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Ulangan
                    </Badge>
                  )
                ) : (
                  <button onClick={() => createInvite(user.id)} className="text-xs text-brand-600">
                    <Link2 size={12} className="inline" /> Havola
                  </button>
                )}
              </Td>
              <Td className="text-xs">
                {user.status === 'ACTIVE' ? 'Faol' : user.status === 'SUSPENDED' ? 'To\'xtatilgan' : 'Bo\'shagan'}
              </Td>
              <Td>
                <button onClick={() => setEditing(user)} className="text-xs text-brand-600">
                  Tahrirlash
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {editing && (
        <EmployeeModal
          user={editing}
          departments={departments}
          schedules={schedules}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {invite && <InviteModal invite={invite} onClose={() => setInvite(null)} />}
    </>
  );
}

function EmployeeModal({
  user,
  departments,
  schedules,
  isAdmin,
  onClose,
  onSaved,
}: {
  user: any;
  departments: any[];
  schedules: any[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !user.id;
  const [form, setForm] = useState({
    fullName: user.fullName ?? '',
    position: user.position ?? '',
    employeeNo: user.employeeNo ?? '',
    phone: user.phone ?? '',
    email: user.email ?? '',
    departmentId: user.department?.id ?? '',
    scheduleId: user.schedule?.id ?? '',
    status: user.status ?? 'ACTIVE',
    roles: user.roles ?? ['EMPLOYEE'],
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body: any = {
      fullName: form.fullName,
      position: form.position,
      employeeNo: form.employeeNo || null,
      phone: form.phone || null,
      email: form.email || null,
      departmentId: form.departmentId || null,
      scheduleId: form.scheduleId || null,
    };

    if (isAdmin) {
      body.roles = form.roles;
      if (form.password) body.password = form.password;
      if (!isNew) body.status = form.status;
    }

    try {
      if (isNew) {
        await api('/users', { method: 'POST', body });
      } else {
        await api(`/users/${user.id}`, { method: 'PATCH', body });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  const toggleRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r: string) => r !== role)
        : [...prev.roles, role],
    }));
  };

  return (
    <Modal title={isNew ? 'Yangi hodim' : form.fullName} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Ism sharifi *</label>
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Vazifasi *</label>
            <input
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Telefon</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input"
              placeholder="+998901234567"
            />
          </div>
          <div>
            <label className="label text-xs">Tabel raqami</label>
            <input
              value={form.employeeNo}
              onChange={(e) => setForm({ ...form, employeeNo: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Bo'lim</label>
            <select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {departments.map((d) => (
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
              <option value="">Bo'lim grafigi</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isAdmin && (
          <>
            <div>
              <label className="label text-xs">Rollar</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      form.roles.includes(role) ? 'border-brand-500 bg-brand-50 text-brand-700' : ''
                    }`}
                    style={
                      form.roles.includes(role) ? undefined : { borderColor: 'var(--border)' }
                    }
                  >
                    {ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
              <p className="muted mt-1.5 text-[11px]">
                Panelga faqat Administrator, Tasdiqlovchi rahbar, Bo'lim rahbari va Kuzatuvchi kira oladi
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label text-xs">
                  Email {form.roles.some((r: string) => r !== 'EMPLOYEE') && '(panel logini)'}
                </label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label text-xs">
                  Parol {isNew ? '' : "(bo'sh qoldirilsa o'zgarmaydi)"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input"
                />
              </div>
            </div>

            {!isNew && (
              <div>
                <label className="label text-xs">Holat</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="input"
                >
                  <option value="ACTIVE">Faol</option>
                  <option value="SUSPENDED">Vaqtincha to'xtatilgan</option>
                  <option value="DISMISSED">Ishdan bo'shagan</option>
                </select>
              </div>
            )}
          </>
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

function InviteModal({ invite, onClose }: { invite: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = invite.link ?? `Kod: ${invite.code}`;

  return (
    <Modal title="Telegramga ulash havolasi" onClose={onClose}>
      <p className="muted text-sm">
        Bu havolani <b>{invite.user.fullName}</b> ga yuboring. Havolani bosgach Telegram akkaunti
        tizimga bog'lanadi.
      </p>

      <div
        className="mt-4 flex items-center gap-2 rounded-lg border p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 rounded-md p-2 hover:bg-black/5"
          aria-label="Nusxalash"
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        </button>
      </div>

      {!invite.link && (
        <p className="mt-3 text-xs text-amber-600">
          TELEGRAM_BOT_USERNAME sozlanmagani uchun to'liq havola yaratilmadi — hodim botga
          <code className="mx-1">/start {invite.code}</code> deb yozishi kerak.
        </p>
      )}

      <p className="muted mt-3 text-xs">
        Havola muddati: {fmtDate(invite.expiresAt)} gacha
      </p>
    </Modal>
  );
}
