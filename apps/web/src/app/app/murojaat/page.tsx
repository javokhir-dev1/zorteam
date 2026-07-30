'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { tgReady, haptic } from '@/lib/telegram';
import { fmtDateTime, FEEDBACK_CATEGORY } from '@/lib/format';
import { BackLink } from '@/components/BackLink';

interface MyFeedback {
  id: string;
  category: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  replies: { id: string; body: string; createdAt: string; fromAdmin: boolean }[];
}

const STATUS_LABEL: Record<string, string> = {
  NEW: "Yuborildi",
  IN_REVIEW: "Ko'rib chiqilmoqda",
  ANSWERED: 'Javob berildi',
  CLOSED: 'Yopilgan',
};

export default function FeedbackPage() {
  const [items, setItems] = useState<MyFeedback[]>([]);
  const [category, setCategory] = useState('OTHER');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    setItems(await api<MyFeedback[]>('/feedback/my'));
  }, []);

  useEffect(() => {
    tgReady();
    void load();
  }, [load]);

  const submit = async () => {
    if (body.trim().length < 10) {
      setError("Murojaat kamida 10 belgidan iborat bo'lishi kerak");
      return;
    }

    setSending(true);
    setError(null);
    try {
      await api('/feedback', {
        method: 'POST',
        body: {
          category,
          subject: subject.trim() || body.trim().split('\n')[0].slice(0, 80),
          body: body.trim(),
        },
      });
      haptic('success');
      setSubject('');
      setBody('');
      setSent(true);
      await load();
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      haptic('error');
      setError(err instanceof ApiError ? err.message : 'Yuborilmadi');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink title="Maxfiy murojaat" />

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        <ShieldCheck size={15} className="mb-1 inline" />{' '}
        Murojaatingizni hamkasblaringiz ko'rmaydi — u faqat rahbariyatga yetib boradi.
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label text-sm">Kategoriya</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {Object.entries(FEEDBACK_CATEGORY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label text-sm">Mavzu (ixtiyoriy)</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input"
            placeholder="Qisqacha mavzu"
          />
        </div>

        <div>
          <label className="label text-sm">Murojaat matni</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="input resize-none"
            placeholder="Fikringizni yozing…"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {sent && <p className="text-sm text-emerald-600">✓ Murojaatingiz qabul qilindi</p>}

        <button onClick={submit} disabled={sending} className="btn-primary w-full">
          <Send size={16} />
          {sending ? 'Yuborilmoqda…' : 'Yuborish'}
        </button>
      </div>

      {items.length > 0 && (
        <>
          <h2 className="pt-2 text-sm font-semibold">Oldingi murojaatlaringiz</h2>
          {items.map((item) => (
            <div key={item.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.subject}</p>
                  <p className="muted text-xs">
                    {FEEDBACK_CATEGORY[item.category]} · {fmtDateTime(item.createdAt)}
                  </p>
                </div>
                <span className="muted shrink-0 text-[11px]">{STATUS_LABEL[item.status]}</span>
              </div>

              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {item.body}
              </p>

              {item.replies.map((reply) => (
                <div
                  key={reply.id}
                  className="rounded-lg border-l-2 border-brand-500 bg-brand-50 p-2.5 text-sm text-slate-800"
                >
                  <p className="mb-1 text-[11px] font-medium text-brand-700">Rahbariyat javobi</p>
                  {reply.body}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
