'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Table, Td, Modal, ErrorBox } from '@/components/ui';
import { fmtDate, ABSENCE_TYPE, ABSENCE_STATUS, todayKey } from '@/lib/format';

export default function AbsencesPage() {
  const { has, isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<any | null>(null);

  const canApprove = isAdmin || has('APPROVER');
  const canCreate = isAdmin || has('DEPT_HEAD');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    try {
      setItems(await api<any[]>(`/absences?${params}`));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Yo'qlik so'rovlari"
        subtitle="Xizmat safari, davolanish, ta'til"
        actions={
          canCreate && (
            <button onClick={() => setCreating(true)} className="btn-primary text-xs">
              <Plus size={14} />
              Yangi so'rov
            </button>
          )
        }
      />

      <div className="card mb-4 flex flex-wrap gap-2">
        {[
          { value: '', label: 'Barchasi' },
          { value: 'PENDING', label: 'Kutilmoqda' },
          { value: 'APPROVED', label: 'Tasdiqlangan' },
          { value: 'REJECTED', label: 'Rad etilgan' },
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
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="So'rov yo'q" />
      ) : (
        <Table head={['Hodim', 'Turi', 'Muddat', 'Sabab', 'Holat', 'Kiritdi', '']}>
          {items.map((item) => {
            const statusMeta = ABSENCE_STATUS[item.status];
            return (
              <tr key={item.id}>
                <Td>
                  <p className="font-medium">{item.user.fullName}</p>
                  <p className="muted text-xs">{item.user.department?.name ?? '—'}</p>
                </Td>
                <Td className="text-xs">{ABSENCE_TYPE[item.type]}</Td>
                <Td className="text-xs">
                  {fmtDate(item.startDate)} — {fmtDate(item.endDate)}
                </Td>
                <Td className="max-w-[240px] text-xs">{item.reason}</Td>
                <Td>
                  <Badge className={statusMeta?.color}>{statusMeta?.label}</Badge>
                  {item.decidedBy && (
                    <p className="muted mt-1 text-[11px]">{item.decidedBy.fullName}</p>
                  )}
                </Td>
                <Td className="text-xs">{item.createdBy?.fullName ?? '—'}</Td>
                <Td>
                  {item.status === 'PENDING' && canApprove && (
                    <button onClick={() => setDeciding(item)} className="text-xs text-brand-600">
                      Hal qilish
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {creating && (
        <CreateAbsenceModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}

      {deciding && (
        <DecideModal
          absence={deciding}
          onClose={() => setDeciding(null)}
          onSaved={async () => {
            setDeciding(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function CreateAbsenceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    userId: '',
    type: 'BUSINESS_TRIP',
    startDate: todayKey(),
    endDate: todayKey(),
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: any[] }>('/users?take=300&status=ACTIVE')
      .then((data) => setUsers(data.items))
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('/absences', { method: 'POST', body: form });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title="Yangi yo'qlik so'rovi" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Hodim *</label>
          <select
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            className="input"
          >
            <option value="">Tanlang</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} — {u.position}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label text-xs">Turi *</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="input"
          >
            {Object.entries(ABSENCE_TYPE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Boshlanish *</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Tugash *</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label text-xs">Sabab *</label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={3}
            className="input resize-none"
          />
        </div>

        <p className="muted text-xs">
          So'rov tasdiqlovchi rahbarga Telegram orqali yuboriladi.
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

function DecideModal({
  absence,
  onClose,
  onSaved,
}: {
  absence: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: 'APPROVED' | 'REJECTED') => {
    setSaving(true);
    setError(null);
    try {
      await api(`/absences/${absence.id}/decide`, {
        method: 'POST',
        body: { status, note: note.trim() || undefined },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarilmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={absence.user.fullName} onClose={onClose}>
      <div className="muted space-y-1 text-sm">
        <p>Turi: {ABSENCE_TYPE[absence.type]}</p>
        <p>
          Muddat: {fmtDate(absence.startDate)} — {fmtDate(absence.endDate)}
        </p>
        <p>Sabab: {absence.reason}</p>
        <p>Kiritdi: {absence.createdBy?.fullName}</p>
      </div>

      <div className="mt-4">
        <label className="label text-xs">Izoh (ixtiyoriy)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input resize-none"
        />
      </div>

      <p className="muted mt-3 text-xs">
        Tasdiqlansa, shu kunlarda hodimdan belgilanish so'ralmaydi.
      </p>

      {error && <div className="mt-3"><ErrorBox message={error} /></div>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => decide('REJECTED')}
          disabled={saving}
          className="btn-ghost flex-1 text-red-600"
        >
          <X size={15} />
          Rad etish
        </button>
        <button onClick={() => decide('APPROVED')} disabled={saving} className="btn-primary flex-1">
          <Check size={15} />
          Tasdiqlash
        </button>
      </div>
    </Modal>
  );
}
