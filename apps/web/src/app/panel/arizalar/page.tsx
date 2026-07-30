'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserCheck, UserX, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Kutilmoqda', color: 'border-amber-200 bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Qabul qilingan', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Rad etilgan', color: 'border-red-200 bg-red-50 text-red-700' },
};

interface RegistrationRequest {
  id: string;
  telegramId: string;
  telegramUsername: string | null;
  fullName: string;
  position: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  department: { id: string; name: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  createdUser: { id: string; fullName: string } | null;
}

export default function RegistrationsPage() {
  const [items, setItems] = useState<RegistrationRequest[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<RegistrationRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    try {
      setItems(await api<RegistrationRequest[]>(`/registrations?${params}`));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = items.filter((item) => item.status === 'PENDING').length;

  return (
    <>
      <PageHeader
        title="Ro'yxatdan o'tish arizalari"
        subtitle="Hodimlar bot orqali yuborgan arizalar"
      />

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        Hodim botda <b>/start</b> bosib ism sharifi, vazifasi va bo'limini kiritadi. Ariza siz
        tasdiqlagunga qadar u tizimga kira olmaydi — tasdiqlangach hodim yozuvi avtomatik
        yaratiladi va Telegram akkaunti bog'lanadi.
      </div>

      <div className="card mb-4 flex flex-wrap gap-2">
        {[
          { value: 'PENDING', label: `Kutilmoqda${status === 'PENDING' && pending ? ` (${pending})` : ''}` },
          { value: 'APPROVED', label: 'Qabul qilingan' },
          { value: 'REJECTED', label: 'Rad etilgan' },
          { value: '', label: 'Barchasi' },
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
        <Empty text="Ariza yo'q" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{item.fullName}</p>
                  <p className="muted text-xs">{item.position}</p>
                </div>
                <Badge className={STATUS[item.status]?.color}>{STATUS[item.status]?.label}</Badge>
              </div>

              <div className="muted space-y-0.5 text-xs">
                <p>Bo'lim: {item.department?.name ?? '—'}</p>
                {item.telegramUsername && (
                  <p>
                    Telegram:{' '}
                    <a
                      href={`https://t.me/${item.telegramUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600"
                    >
                      @{item.telegramUsername}
                    </a>
                  </p>
                )}
                <p>Yuborilgan: {fmtDateTime(item.createdAt)}</p>
                {item.decidedBy && (
                  <p>
                    Hal qildi: {item.decidedBy.fullName} · {fmtDateTime(item.decidedAt)}
                  </p>
                )}
                {item.decisionNote && <p>Izoh: {item.decisionNote}</p>}
              </div>

              {item.status === 'PENDING' && (
                <button onClick={() => setActive(item)} className="btn-primary w-full text-xs">
                  Ko'rib chiqish
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {active && (
        <DecisionModal
          request={active}
          onClose={() => setActive(null)}
          onDone={async () => {
            setActive(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function DecisionModal({
  request,
  onClose,
  onDone,
}: {
  request: RegistrationRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [fullName, setFullName] = useState(request.fullName);
  const [position, setPosition] = useState(request.position);
  const [departmentId, setDepartmentId] = useState(request.department?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>('/departments').then(setDepartments).catch(() => undefined);
  }, []);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/registrations/${request.id}/approve`, {
        method: 'POST',
        body: { fullName, position, departmentId: departmentId || null },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tasdiqlanmadi');
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/registrations/${request.id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rad etilmadi');
      setBusy(false);
    }
  };

  return (
    <Modal title="Arizani ko'rib chiqish" onClose={onClose}>
      <div className="space-y-3">
        <p className="muted text-xs">
          Ma'lumotlarni tasdiqlashdan oldin tuzatishingiz mumkin — hodim yozuvi shu qiymatlar
          bilan yaratiladi.
        </p>

        <div>
          <label className="label text-xs">Ism sharifi</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Vazifasi</label>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Bo'lim</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
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
        </div>

        <div
          className="rounded-lg border p-3 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <p>Telegram ID: {request.telegramId}</p>
          {request.telegramUsername && <p>Username: @{request.telegramUsername}</p>}
          <p>Yuborilgan: {fmtDateTime(request.createdAt)}</p>
        </div>

        {error && <ErrorBox message={error} />}

        <button onClick={approve} disabled={busy || !fullName || !position} className="btn-primary w-full">
          <UserCheck size={16} />
          {busy ? 'Bajarilmoqda…' : 'Tasdiqlash va hodim sifatida qabul qilish'}
        </button>

        <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <label className="label text-xs">Rad etish sababi</label>
          <div className="flex gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input"
              placeholder="Sababni yozing…"
            />
            <button
              onClick={reject}
              disabled={busy || reason.trim().length < 3}
              className="btn-ghost shrink-0 text-red-600"
            >
              <UserX size={15} />
              Rad etish
            </button>
          </div>
          <p className="muted mt-1.5 flex items-center gap-1 text-[11px]">
            <Send size={11} />
            Sabab hodimga Telegram orqali yuboriladi
          </p>
        </div>
      </div>
    </Modal>
  );
}
