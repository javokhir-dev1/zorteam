'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { tgReady, haptic } from '@/lib/telegram';
import { fmtDate } from '@/lib/format';
import { BackLink } from '@/components/BackLink';

interface Criterion {
  id: string;
  name: string;
  weight: number;
  maxScore: number;
}

interface PendingEvaluation {
  id: string;
  targetType: 'USER' | 'SHOW';
  expiresAt: string | null;
  rule: { name: string; criteria: Criterion[] };
  targetUser: { id: string; fullName: string; position: string } | null;
  targetShow: { id: string; name: string } | null;
  episode: { id: string; title: string | null; airAt: string | null; show: { name: string } } | null;
}

export default function EvaluationsPage() {
  const [items, setItems] = useState<PendingEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PendingEvaluation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<PendingEvaluation[]>('/evaluations/my-pending'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    tgReady();
    void load();
  }, [load]);

  if (active) {
    return (
      <EvaluationForm
        evaluation={active}
        onDone={async () => {
          setActive(null);
          await load();
        }}
        onCancel={() => setActive(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BackLink title="Baholash" />

      {loading && <p className="muted text-sm">Yuklanmoqda…</p>}

      {!loading && items.length === 0 && (
        <div className="card text-center">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={32} />
          <p className="text-sm">Hozircha baholash kutilmayapti</p>
        </div>
      )}

      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => setActive(item)}
          className="card w-full text-left transition-colors hover:border-brand-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {item.targetType === 'USER'
                  ? item.targetUser?.fullName
                  : item.targetShow?.name}
              </p>
              <p className="muted text-xs">
                {item.targetType === 'USER'
                  ? item.targetUser?.position
                  : 'Prodakshnni baholash'}
              </p>
              {item.episode && (
                <p className="muted mt-1 text-xs">
                  {item.episode.show.name}
                  {item.episode.title ? ` — ${item.episode.title}` : ''}
                </p>
              )}
            </div>
            <Star size={18} className="shrink-0 text-amber-500" />
          </div>

          {item.expiresAt && (
            <p className="muted mt-2 text-[11px]">
              Oyna yopiladi: {fmtDate(item.expiresAt)}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function EvaluationForm({
  evaluation,
  onDone,
  onCancel,
}: {
  evaluation: PendingEvaluation;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allScored = evaluation.rule.criteria.every((c) => scores[c.id] !== undefined);

  const submit = async () => {
    if (!allScored) {
      setError('Barcha mezonlarni baholang');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api(`/evaluations/${evaluation.id}/submit`, {
        method: 'POST',
        body: {
          scores: Object.entries(scores).map(([criterionId, score]) => ({ criterionId, score })),
          comment: comment.trim() || undefined,
        },
      });
      haptic('success');
      onDone();
    } catch (err) {
      haptic('error');
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  const title =
    evaluation.targetType === 'USER'
      ? evaluation.targetUser?.fullName
      : evaluation.targetShow?.name;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 pt-2">
        <button onClick={onCancel} className="-ml-2 rounded-full p-2 text-sm hover:bg-black/5">
          ←
        </button>
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="muted text-xs">{evaluation.rule.name}</p>
        </div>
      </header>

      {evaluation.rule.criteria.map((criterion) => (
        <div key={criterion.id} className="card">
          <p className="mb-3 text-sm font-medium">{criterion.name}</p>
          <div className="flex gap-1.5">
            {Array.from({ length: criterion.maxScore }, (_, i) => i + 1).map((value) => {
              const selected = (scores[criterion.id] ?? 0) >= value;
              return (
                <button
                  key={value}
                  onClick={() => setScores((prev) => ({ ...prev, [criterion.id]: value }))}
                  className="flex-1 rounded-lg py-2.5 transition-colors"
                  style={{
                    background: selected ? '#f59e0b' : 'transparent',
                    border: `1px solid ${selected ? '#f59e0b' : 'var(--border)'}`,
                    color: selected ? '#fff' : 'inherit',
                  }}
                  aria-label={`${value} ball`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card">
        <label className="label text-sm">Izoh (ixtiyoriy)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder="Qo'shimcha fikringiz…"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button onClick={submit} disabled={saving || !allScored} className="btn-primary w-full py-3.5">
        {saving ? 'Saqlanmoqda…' : 'Baholashni yakunlash'}
      </button>
    </div>
  );
}
