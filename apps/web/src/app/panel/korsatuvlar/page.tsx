'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Film, UserPlus, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox } from '@/components/ui';
import { fmtDateTime, EPISODE_STATUS } from '@/lib/format';

export default function ShowsPage() {
  const { isAdmin, has } = useAuth();
  const [shows, setShows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingShow, setEditingShow] = useState<any | null>(null);
  const [leadersFor, setLeadersFor] = useState<any | null>(null);
  const [newEpisodeFor, setNewEpisodeFor] = useState<string | null>(null);
  const [crewFor, setCrewFor] = useState<string | null>(null);

  const canManage = isAdmin || has('DEPT_HEAD');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setShows(await api<any[]>('/shows?includeInactive=true'));
    } finally {
      setLoading(false);
    }
  }, []);

  const openShow = async (id: string) => {
    setSelected(await api(`/shows/${id}`));
  };

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Ko'rsatuvlar"
        subtitle="Efirlar va jamoa biriktirish"
        actions={
          isAdmin && (
            <button onClick={() => setEditingShow({})} className="btn-primary text-xs">
              <Plus size={14} />
              Yangi ko'rsatuv
            </button>
          )
        }
      />

      {loading ? (
        <Loading />
      ) : shows.length === 0 ? (
        <Empty text="Ko'rsatuv yo'q" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shows.map((show) => (
            <div key={show.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{show.name}</p>
                  <p className="muted text-xs">
                    {show.code} · {show.production?.name}
                  </p>
                </div>
                <Film size={17} className="shrink-0 text-brand-600" />
              </div>

              <div className="muted text-xs">
                <p>{show.episodeCount} ta efir</p>
                {show.leaders.length > 0 && (
                  <p className="mt-1">
                    Rahbar: {show.leaders.map((l: any) => l.fullName).join(', ')}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => openShow(show.id)} className="btn-ghost flex-1 text-xs">
                  Efirlar
                </button>
                {isAdmin && (
                  <button onClick={() => setLeadersFor(show)} className="btn-ghost text-xs">
                    <Users size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} wide>
          <div className="mb-4 flex items-center justify-between">
            <p className="muted text-sm">{selected.episodes.length} ta efir</p>
            {canManage && (
              <button
                onClick={() => setNewEpisodeFor(selected.id)}
                className="btn-primary text-xs"
              >
                <Plus size={13} />
                Yangi efir
              </button>
            )}
          </div>

          <div className="space-y-2">
            {selected.episodes.length === 0 && <Empty text="Efir qo'shilmagan" />}

            {selected.episodes.map((episode: any) => {
              const status = EPISODE_STATUS[episode.status];
              return (
                <div
                  key={episode.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {episode.title ?? `Efir #${episode.number ?? '—'}`}
                    </p>
                    <p className="muted text-xs">
                      {fmtDateTime(episode.recordAt ?? episode.airAt)} ·{' '}
                      {episode._count.assignments} kishi
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={status?.color}>{status?.label}</Badge>
                    {canManage && (
                      <button
                        onClick={() => setCrewFor(episode.id)}
                        className="text-xs text-brand-600"
                      >
                        Jamoa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {editingShow && (
        <ShowModal
          show={editingShow}
          onClose={() => setEditingShow(null)}
          onSaved={async () => {
            setEditingShow(null);
            await load();
          }}
        />
      )}

      {leadersFor && (
        <LeadersModal
          show={leadersFor}
          onClose={() => setLeadersFor(null)}
          onSaved={async () => {
            setLeadersFor(null);
            await load();
          }}
        />
      )}

      {newEpisodeFor && (
        <EpisodeModal
          showId={newEpisodeFor}
          onClose={() => setNewEpisodeFor(null)}
          onSaved={async () => {
            const showId = newEpisodeFor;
            setNewEpisodeFor(null);
            await load();
            if (showId) await openShow(showId);
          }}
        />
      )}

      {crewFor && (
        <CrewModal
          episodeId={crewFor}
          onClose={() => setCrewFor(null)}
          onChanged={async () => {
            if (selected) await openShow(selected.id);
          }}
        />
      )}
    </>
  );
}

function ShowModal({ show, onClose, onSaved }: any) {
  const isNew = !show.id;
  const [productions, setProductions] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: show.name ?? '',
    code: show.code ?? '',
    productionId: show.production?.id ?? '',
    description: show.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>('/departments')
      .then((list) => setProductions(list.filter((d) => d.type === 'PRODUCTION')))
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await api('/shows', { method: 'POST', body: { ...form, code: form.code.toUpperCase() } });
      } else {
        await api(`/shows/${show.id}`, { method: 'PATCH', body: form });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? "Yangi ko'rsatuv" : form.name} onClose={onClose}>
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
            />
          </div>
          <div>
            <label className="label text-xs">Prodakshn *</label>
            <select
              value={form.productionId}
              onChange={(e) => setForm({ ...form, productionId: e.target.value })}
              className="input"
            >
              <option value="">Tanlang</option>
              {productions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label text-xs">Tavsif</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="input resize-none"
          />
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

function LeadersModal({ show, onClose, onSaved }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>(show.leaders.map((l: any) => l.id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ items: any[] }>('/users?take=300&status=ACTIVE')
      .then((data) => setUsers(data.items))
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/shows/${show.id}/leaders`, { method: 'POST', body: { userIds: selected } });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${show.name} — javobgar rahbarlar`} onClose={onClose}>
      <div
        className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {users.map((user) => (
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
              <p className="muted truncate text-xs">{user.position}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="btn-ghost flex-1">
          Bekor qilish
        </button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1">
          Saqlash ({selected.length})
        </button>
      </div>
    </Modal>
  );
}

function EpisodeModal({ showId, onClose, onSaved }: any) {
  const [form, setForm] = useState({ title: '', number: '', recordAt: '', airAt: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/shows/${showId}/episodes`, {
        method: 'POST',
        body: {
          title: form.title || undefined,
          number: form.number ? Number(form.number) : undefined,
          recordAt: form.recordAt ? new Date(form.recordAt).toISOString() : undefined,
          airAt: form.airAt ? new Date(form.airAt).toISOString() : undefined,
          location: form.location || undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title="Yangi efir" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Sarlavha</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Raqami</label>
            <input
              type="number"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">S'yomka vaqti</label>
            <input
              type="datetime-local"
              value={form.recordAt}
              onChange={(e) => setForm({ ...form, recordAt: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Efir vaqti</label>
            <input
              type="datetime-local"
              value={form.airAt}
              onChange={(e) => setForm({ ...form, airAt: e.target.value })}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label text-xs">Joyi</label>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="input"
            placeholder="Studiya 1"
          />
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

function CrewModal({ episodeId, onClose, onChanged }: any) {
  const [episode, setEpisode] = useState<any | null>(null);
  const [crewRoles, setCrewRoles] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [crewRoleId, setCrewRoleId] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [ep, roles] = await Promise.all([
      api<any>(`/episodes/${episodeId}`),
      api<any[]>('/crew-roles'),
    ]);
    setEpisode(ep);
    setCrewRoles(roles);
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!crewRoleId) {
      setCandidates([]);
      return;
    }
    api<any[]>(`/assignable-users?crewRoleId=${crewRoleId}`)
      .then(setCandidates)
      .catch(() => setCandidates([]));
    setUserId('');
  }, [crewRoleId]);

  const assign = async () => {
    if (!userId || !crewRoleId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/episodes/${episodeId}/assignments`, {
        method: 'POST',
        body: { userId, crewRoleId },
      });
      setUserId('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Biriktirilmadi');
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (assignmentId: string) => {
    setBusy(true);
    try {
      await api(`/assignments/${assignmentId}`, { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "O'chirilmadi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Jamoa" onClose={onClose} wide>
      {!episode ? (
        <Loading />
      ) : (
        <>
          <p className="muted mb-4 text-sm">
            {episode.show.name}
            {episode.title ? ` — ${episode.title}` : ''}
          </p>

          <div className="mb-4 space-y-2">
            {episode.assignments.length === 0 && <Empty text="Hali hech kim biriktirilmagan" />}

            {episode.assignments.map((assignment: any) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{assignment.user.fullName}</p>
                  <p className="muted truncate text-xs">
                    {assignment.crewRole.name} · {assignment.user.department?.name ?? '—'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    className={
                      assignment.status === 'CONFIRMED'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : assignment.status === 'DECLINED'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                    }
                  >
                    {assignment.status === 'CONFIRMED'
                      ? 'Tasdiqladi'
                      : assignment.status === 'DECLINED'
                        ? 'Rad etdi'
                        : 'Kutilmoqda'}
                  </Badge>
                  <button
                    onClick={() => unassign(assignment.id)}
                    disabled={busy}
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    aria-label="Olib tashlash"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-3 text-sm font-medium">Hodim biriktirish</p>

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                value={crewRoleId}
                onChange={(e) => setCrewRoleId(e.target.value)}
                className="input"
              >
                <option value="">Rol tanlang</option>
                {crewRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>

              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="input"
                disabled={!crewRoleId}
              >
                <option value="">
                  {crewRoleId ? 'Hodim tanlang' : 'Avval rol tanlang'}
                </option>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>

              <button onClick={assign} disabled={!userId || busy} className="btn-primary">
                <UserPlus size={15} />
              </button>
            </div>

            {crewRoleId && candidates.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                Bu rol uchun sizning tasarrufingizda hodim yo'q
              </p>
            )}

            {error && <div className="mt-3"><ErrorBox message={error} /></div>}
          </div>
        </>
      )}
    </Modal>
  );
}
