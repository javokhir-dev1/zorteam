'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trophy, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox, Table, Td } from '@/components/ui';
import { uzMonth } from '@/lib/months';

const EVALUATOR_KIND: Record<string, string> = {
  DEPARTMENT_HEAD: "Bo'lim rahbari",
  SHOW_LEADER: "Ko'rsatuv rahbari",
  ASSIGNED_CREW: 'Biriktirilgan jamoa',
  SPECIFIC_USER: 'Aniq hodim',
  CREW_PEER: "Jamoa a'zolari bir-birini",
};

const TARGET_TYPE: Record<string, string> = {
  USER: 'Hodimni',
  SHOW: 'Prodakshnni',
};

const TRIGGER: Record<string, string> = {
  AFTER_EPISODE: 'Efir tugagach',
  MONTHLY: 'Har oy',
  MANUAL: "Qo'lda",
};

export default function EvaluationsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<'rules' | 'leaderboard'>('leaderboard');

  return (
    <>
      <PageHeader title="Baholash" subtitle="Matritsa va reyting" />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('leaderboard')}
          className={`rounded-lg px-4 py-2 text-sm ${
            tab === 'leaderboard' ? 'bg-brand-600 text-white' : 'border'
          }`}
          style={tab === 'leaderboard' ? undefined : { borderColor: 'var(--border)' }}
        >
          Reyting
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('rules')}
            className={`rounded-lg px-4 py-2 text-sm ${
              tab === 'rules' ? 'bg-brand-600 text-white' : 'border'
            }`}
            style={tab === 'rules' ? undefined : { borderColor: 'var(--border)' }}
          >
            Baholash matritsasi
          </button>
        )}
      </div>

      {tab === 'leaderboard' ? <Leaderboard /> : <Rules />}
    </>
  );
}

function Leaderboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<any[]>(`/evaluations/leaderboard?year=${year}&month=${month}`)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <>
      <div className="card mb-4 flex flex-wrap gap-3">
        <div>
          <label className="label text-xs">Oy</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="input w-auto"
          >
            {uzMonth.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs">Yil</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-28"
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Bu oyda baho qo'yilmagan" />
      ) : (
        <Table head={['#', 'Hodim', "Bo'lim", "O'rtacha baho", 'Baholar soni']}>
          {items.map((item, index) => (
            <tr key={item.user.id}>
              <Td>
                {index < 3 ? (
                  <Trophy
                    size={16}
                    className={
                      index === 0
                        ? 'text-amber-500'
                        : index === 1
                          ? 'text-slate-400'
                          : 'text-amber-700'
                    }
                  />
                ) : (
                  <span className="muted text-xs">{index + 1}</span>
                )}
              </Td>
              <Td>
                <p className="font-medium">{item.user.fullName}</p>
                <p className="muted text-xs">{item.user.position}</p>
              </Td>
              <Td className="text-xs">{item.user.department?.name ?? '—'}</Td>
              <Td>
                <span
                  className={`font-semibold ${
                    item.average >= 4.5
                      ? 'text-emerald-600'
                      : item.average >= 3.5
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  {item.average}
                </span>
                <span className="muted text-xs"> / 5</span>
              </Td>
              <Td className="text-xs">{item.count}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function Rules() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<any[]>('/evaluations/rules'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing({})} className="btn-primary text-xs">
          <Plus size={14} />
          Yangi qoida
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Qoida yo'q" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((rule) => (
            <div key={rule.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{rule.name}</p>
                <Badge
                  className={
                    rule.isActive
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }
                >
                  {rule.isActive ? 'Faol' : 'O\'chirilgan'}
                </Badge>
              </div>

              <div className="muted space-y-1 text-xs">
                <p>
                  Kim baholaydi: <b>{EVALUATOR_KIND[rule.evaluatorKind]}</b>
                  {rule.evaluatorUser ? ` (${rule.evaluatorUser.fullName})` : ''}
                </p>
                <p>Nimani: {TARGET_TYPE[rule.targetType]}</p>
                <p>Qachon: {TRIGGER[rule.trigger]} · oyna {rule.windowHours} soat</p>
                {rule.targetDepartment && <p>Faqat: {rule.targetDepartment.name}</p>}
                {rule.targetCrewRole && <p>Faqat rol: {rule.targetCrewRole.name}</p>}
                <p>{rule.criteria.length} ta mezon · {rule._count.evaluations} ta baho</p>
              </div>

              <div className="flex flex-wrap gap-1">
                {rule.criteria.map((criterion: any) => (
                  <Badge key={criterion.id} className="border-slate-200 bg-slate-50 text-slate-600">
                    {criterion.name} (×{criterion.weight})
                  </Badge>
                ))}
              </div>

              <button onClick={() => setEditing(rule)} className="btn-ghost w-full text-xs">
                Tahrirlash
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RuleModal
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function RuleModal({ rule, onClose, onSaved }: any) {
  const isNew = !rule.id;
  const [departments, setDepartments] = useState<any[]>([]);
  const [crewRoles, setCrewRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: rule.name ?? '',
    targetType: rule.targetType ?? 'USER',
    trigger: rule.trigger ?? 'AFTER_EPISODE',
    evaluatorKind: rule.evaluatorKind ?? 'DEPARTMENT_HEAD',
    evaluatorUserId: rule.evaluatorUser?.id ?? '',
    targetDepartmentId: rule.targetDepartment?.id ?? '',
    targetCrewRoleId: rule.targetCrewRole?.id ?? '',
    windowHours: rule.windowHours ?? 48,
    isActive: rule.isActive ?? true,
  });

  const [criteria, setCriteria] = useState<any[]>(
    rule.criteria?.length
      ? rule.criteria
      : [{ name: 'Ish sifati', weight: 1, maxScore: 5, sortOrder: 0 }],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<any[]>('/departments'),
      api<any[]>('/crew-roles'),
      api<{ items: any[] }>('/users?take=300&status=ACTIVE'),
    ])
      .then(([d, c, u]) => {
        setDepartments(d);
        setCrewRoles(c);
        setUsers(u.items);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body = {
      ...form,
      evaluatorUserId: form.evaluatorUserId || null,
      targetDepartmentId: form.targetDepartmentId || null,
      targetCrewRoleId: form.targetCrewRoleId || null,
      windowHours: Number(form.windowHours),
      criteria: criteria.map((c, index) => ({
        id: c.id,
        name: c.name,
        weight: Number(c.weight),
        maxScore: Number(c.maxScore),
        sortOrder: index,
      })),
    };

    try {
      if (isNew) await api('/evaluations/rules', { method: 'POST', body });
      else await api(`/evaluations/rules/${rule.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? 'Yangi baholash qoidasi' : form.name} onClose={onClose} wide>
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Qoida nomi *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            placeholder="Bo'lim rahbari — hodimni baholaydi"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Nimani baholaydi</label>
            <select
              value={form.targetType}
              onChange={(e) => setForm({ ...form, targetType: e.target.value })}
              className="input"
            >
              <option value="USER">Hodimni</option>
              <option value="SHOW">Prodakshnni (ko'rsatuvni)</option>
            </select>
          </div>

          <div>
            <label className="label text-xs">Kim baholaydi</label>
            <select
              value={form.evaluatorKind}
              onChange={(e) => setForm({ ...form, evaluatorKind: e.target.value })}
              className="input"
            >
              {Object.entries(EVALUATOR_KIND).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {form.evaluatorKind === 'SPECIFIC_USER' && (
            <div>
              <label className="label text-xs">Baholovchi hodim *</label>
              <select
                value={form.evaluatorUserId}
                onChange={(e) => setForm({ ...form, evaluatorUserId: e.target.value })}
                className="input"
              >
                <option value="">Tanlang</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.targetType === 'USER' && (
            <>
              <div>
                <label className="label text-xs">Faqat shu bo'lim (ixtiyoriy)</label>
                <select
                  value={form.targetDepartmentId}
                  onChange={(e) => setForm({ ...form, targetDepartmentId: e.target.value })}
                  className="input"
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
                <label className="label text-xs">Faqat shu rol (ixtiyoriy)</label>
                <select
                  value={form.targetCrewRoleId}
                  onChange={(e) => setForm({ ...form, targetCrewRoleId: e.target.value })}
                  className="input"
                >
                  <option value="">Barchasi</option>
                  {crewRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="label text-xs">Qachon ochiladi</label>
            <select
              value={form.trigger}
              onChange={(e) => setForm({ ...form, trigger: e.target.value })}
              className="input"
            >
              {Object.entries(TRIGGER).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label text-xs">Oyna (soat)</label>
            <input
              type="number"
              value={form.windowHours}
              onChange={(e) => setForm({ ...form, windowHours: Number(e.target.value) })}
              className="input"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0 text-xs">Mezonlar</label>
            <button
              onClick={() =>
                setCriteria([...criteria, { name: '', weight: 1, maxScore: 5, sortOrder: criteria.length }])
              }
              className="text-xs text-brand-600"
            >
              <Plus size={12} className="inline" /> Mezon qo'shish
            </button>
          </div>

          <div className="space-y-2">
            {criteria.map((criterion, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={criterion.name}
                  onChange={(e) => {
                    const next = [...criteria];
                    next[index] = { ...criterion, name: e.target.value };
                    setCriteria(next);
                  }}
                  className="input flex-1"
                  placeholder="Mezon nomi"
                />
                <input
                  type="number"
                  step="0.5"
                  value={criterion.weight}
                  onChange={(e) => {
                    const next = [...criteria];
                    next[index] = { ...criterion, weight: e.target.value };
                    setCriteria(next);
                  }}
                  className="input w-20"
                  title="Vazn"
                />
                <input
                  type="number"
                  value={criterion.maxScore}
                  onChange={(e) => {
                    const next = [...criteria];
                    next[index] = { ...criterion, maxScore: e.target.value };
                    setCriteria(next);
                  }}
                  className="input w-20"
                  title="Maksimal ball"
                />
                <button
                  onClick={() => setCriteria(criteria.filter((_, i) => i !== index))}
                  className="rounded p-2 text-red-500 hover:bg-red-50"
                  aria-label="O'chirish"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="muted mt-1 text-[11px]">Ustunlar: nomi · vazn · maksimal ball</p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="h-4 w-4"
          />
          Faol
        </label>

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
