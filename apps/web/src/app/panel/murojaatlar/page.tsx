'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox } from '@/components/ui';
import { fmtDateTime, FEEDBACK_CATEGORY } from '@/lib/format';

const STATUS: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Yangi', color: 'border-sky-200 bg-sky-50 text-sky-700' },
  IN_REVIEW: { label: "Ko'rib chiqilmoqda", color: 'border-amber-200 bg-amber-50 text-amber-700' },
  ANSWERED: { label: 'Javob berilgan', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  CLOSED: { label: 'Yopilgan', color: 'border-slate-200 bg-slate-50 text-slate-500' },
};

export default function FeedbackPage() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    try {
      setItems(await api<any[]>(`/feedback?${params}`));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Maxfiy murojaatlar" subtitle="Muallif faqat administratorga ko'rinadi" />

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <ShieldAlert size={14} className="mb-0.5 inline" /> Hodimlarga bu murojaatlar "maxfiy" deb
        ko'rsatiladi — hamkasblari ko'rmaydi, lekin administrator muallifni ko'radi.
      </div>

      <div className="card mb-4 flex flex-wrap gap-2">
        {[
          { value: '', label: 'Barchasi' },
          ...Object.entries(STATUS).map(([value, meta]) => ({ value, label: meta.label })),
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
        <Empty text="Murojaat yo'q" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={async () => setActive(await api(`/feedback/${item.id}`))}
              className="card w-full text-left transition-colors hover:border-brand-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{item.subject}</p>
                  <p className="muted mt-0.5 text-xs">
                    {item.author.fullName} · {item.author.department?.name ?? '—'} ·{' '}
                    {fmtDateTime(item.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                    {FEEDBACK_CATEGORY[item.category]}
                  </Badge>
                  <Badge className={STATUS[item.status]?.color}>
                    {STATUS[item.status]?.label}
                  </Badge>
                </div>
              </div>

              <p className="muted mt-2 line-clamp-2 text-sm">{item.body}</p>
            </button>
          ))}
        </div>
      )}

      {active && (
        <FeedbackModal
          feedback={active}
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

function FeedbackModal({ feedback, onClose, onChanged }: any) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/feedback/${feedback.id}/reply`, { method: 'POST', body: { body: reply } });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuborilmadi');
      setBusy(false);
    }
  };

  return (
    <Modal title={feedback.subject} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="muted text-xs">
          <p>
            {feedback.author.fullName} · {feedback.author.position} ·{' '}
            {feedback.author.department?.name ?? '—'}
          </p>
          <p>
            {FEEDBACK_CATEGORY[feedback.category]} · {fmtDateTime(feedback.createdAt)}
          </p>
        </div>

        <div
          className="whitespace-pre-wrap rounded-lg border p-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          {feedback.body}
        </div>

        {feedback.replies.map((item: any) => (
          <div
            key={item.id}
            className="rounded-lg border-l-2 border-brand-500 bg-brand-50 p-3 text-sm text-slate-800"
          >
            <p className="mb-1 text-[11px] font-medium text-brand-700">
              {item.author.fullName} · {fmtDateTime(item.createdAt)}
            </p>
            {item.body}
          </div>
        ))}

        <div>
          <label className="label text-xs">Javob yozish</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            className="input resize-none"
            placeholder="Javobingiz hodimga Telegram orqali yuboriladi…"
          />
        </div>

        {error && <ErrorBox message={error} />}

        <div className="flex gap-2">
          <button
            onClick={async () => {
              await api(`/feedback/${feedback.id}/status`, {
                method: 'POST',
                body: { status: 'CLOSED' },
              });
              onChanged();
            }}
            className="btn-ghost flex-1 text-xs"
          >
            Yopish (javobsiz)
          </button>
          <button
            onClick={send}
            disabled={reply.trim().length < 2 || busy}
            className="btn-primary flex-1"
          >
            <Send size={15} />
            {busy ? 'Yuborilmoqda…' : 'Javob yuborish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
