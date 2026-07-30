'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Youtube, Instagram, Send, TrendingUp, TrendingDown } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox, StatCard, Table, Td } from '@/components/ui';
import { fmtNumber, deltaLabel, fmtDate } from '@/lib/format';
import { uzMonth } from '@/lib/months';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  YOUTUBE: <Youtube size={16} className="text-red-600" />,
  INSTAGRAM: <Instagram size={16} className="text-pink-600" />,
  TELEGRAM: <Send size={16} className="text-sky-500" />,
};

export default function SocialPage() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<any | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [comparison, list] = await Promise.all([
        api<any>(`/social/monthly?year=${year}&month=${month}`),
        api<any[]>('/social/accounts'),
      ]);
      setData(comparison);
      setAccounts(list);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncAll = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const results = await api<any[]>('/social/sync-all', { method: 'POST' });
      const failed = results.filter((r) => !r.ok);
      setMessage(
        failed.length
          ? `${results.length - failed.length}/${results.length} sinxronlandi. Xato: ${failed.map((f) => `${f.account} (${f.error})`).join('; ')}`
          : `Barchasi sinxronlandi (${results.length})`,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Sinxronizatsiya xatosi');
    } finally {
      setSyncing(false);
    }
  };

  const total = data?.total;
  const delta = total ? deltaLabel(total.deltaPercent) : null;

  return (
    <>
      <PageHeader
        title="Ijtimoiy tarmoq analitikasi"
        subtitle={data?.period.label}
        actions={
          isAdmin && (
            <>
              <button onClick={syncAll} disabled={syncing} className="btn-ghost text-xs">
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                Sinxronlash
              </button>
              <button onClick={() => setCreating(true)} className="btn-primary text-xs">
                <Plus size={14} />
                Akkaunt
              </button>
            </>
          )
        }
      />

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        YouTube va Instagram statistikasi avtomatik yig'iladi. <b>Telegram</b> postlari avtomatik
        yoziladi, lekin ko'rishlar sonini Telegram Bot API bermaydi — uni pastdagi postlar
        ro'yxatidan qo'lda kiritasiz.
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3">
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

      {message && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          {message}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {total && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Jami ko'rishlar" value={fmtNumber(total.views)} />
              <StatCard
                label="O'tgan oyga nisbatan"
                value={
                  <span className={delta?.color}>
                    {total.deltaPercent > 0 ? (
                      <TrendingUp size={20} className="mr-1 inline" />
                    ) : total.deltaPercent < 0 ? (
                      <TrendingDown size={20} className="mr-1 inline" />
                    ) : null}
                    {delta?.text}
                  </span>
                }
                hint={`Oldingi oy: ${fmtNumber(total.prevViews)}`}
              />
              <StatCard label="Postlar" value={total.posts} />
              <StatCard label="Obunachilar" value={fmtNumber(total.followers)} />
            </div>
          )}

          {data?.shows?.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 font-semibold">Ko'rsatuvlar kesimida</h2>
              <Table head={["Ko'rsatuv", "Ko'rishlar", "O'tgan oy", "O'zgarish"]}>
                {data.shows.map((show: any) => {
                  const showDelta = deltaLabel(show.deltaPercent);
                  return (
                    <tr key={show.showId ?? 'none'}>
                      <Td className="font-medium">{show.name}</Td>
                      <Td>{fmtNumber(show.views)}</Td>
                      <Td className="text-xs">{fmtNumber(show.prevViews)}</Td>
                      <Td className={`font-medium ${showDelta.color}`}>{showDelta.text}</Td>
                    </tr>
                  );
                })}
              </Table>
            </>
          )}

          <h2 className="mb-3 mt-6 font-semibold">Akkauntlar</h2>

          {accounts.length === 0 ? (
            <Empty text="Akkaunt qo'shilmagan" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map((account) => {
                const stat = data?.accounts?.find((s: any) => s.accountId === account.id);
                const accountDelta = stat ? deltaLabel(stat.deltaPercent) : null;

                return (
                  <div key={account.id} className="card space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {PLATFORM_ICON[account.platform]}
                        <div>
                          <p className="font-medium">{account.name}</p>
                          <p className="muted text-xs">{account.handle ?? account.externalId}</p>
                        </div>
                      </div>
                      {account.show && (
                        <Badge className="border-violet-200 bg-violet-50 text-violet-700">
                          {account.show.name}
                        </Badge>
                      )}
                    </div>

                    {stat && (
                      <div className="flex items-baseline gap-3">
                        <span className="text-xl font-semibold">{fmtNumber(stat.views)}</span>
                        <span className={`text-sm ${accountDelta?.color}`}>{accountDelta?.text}</span>
                      </div>
                    )}

                    <p className="muted text-xs">
                      {stat ? `${stat.postCount} post · ${fmtNumber(stat.followers)} obunachi` : "Ma'lumot yo'q"}
                    </p>

                    {account.lastSyncedAt && (
                      <p className="muted text-[11px]">
                        Sinxronlangan: {fmtDate(account.lastSyncedAt)}
                      </p>
                    )}

                    {account.syncError && (
                      <p className="text-[11px] text-red-600">Xato: {account.syncError}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {creating && (
        <AccountModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </>
  );
}

function AccountModal({ onClose, onSaved }: any) {
  const [shows, setShows] = useState<any[]>([]);
  const [form, setForm] = useState({
    platform: 'YOUTUBE',
    name: '',
    externalId: '',
    handle: '',
    url: '',
    showId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>('/shows').then(setShows).catch(() => undefined);
  }, []);

  const hint: Record<string, string> = {
    YOUTUBE: "Kanal ID (UC... bilan boshlanadi). Kanal sahifasi manzilidan olinadi.",
    INSTAGRAM: 'Instagram Business Account ID (Facebook Business Manager orqali).',
    TELEGRAM: "Kanal chat ID (-100... ko'rinishida). Bot kanalga admin qilinishi shart.",
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('/social/accounts', {
        method: 'POST',
        body: { ...form, showId: form.showId || null },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title="Ijtimoiy tarmoq akkaunti" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Platforma</label>
          <select
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
            className="input"
          >
            <option value="YOUTUBE">YouTube</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="TELEGRAM">Telegram</option>
          </select>
        </div>

        <div>
          <label className="label text-xs">Nomi *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
        </div>

        <div>
          <label className="label text-xs">Akkaunt/Kanal ID *</label>
          <input
            value={form.externalId}
            onChange={(e) => setForm({ ...form, externalId: e.target.value })}
            className="input"
          />
          <p className="muted mt-1 text-[11px]">{hint[form.platform]}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">@username</label>
            <input
              value={form.handle}
              onChange={(e) => setForm({ ...form, handle: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Ko'rsatuv</label>
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
        </div>

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
