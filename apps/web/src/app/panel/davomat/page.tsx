'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Image as ImageIcon, Download } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import {
  PageHeader,
  Loading,
  Badge,
  Empty,
  Table,
  Td,
  Modal,
  AuthImage,
  StatCard,
} from '@/components/ui';
import {
  fmtTime,
  fmtDate,
  todayKey,
  ATTENDANCE_STATUS,
  ATTENDANCE_FLAG,
  ATTENDANCE_METHOD,
} from '@/lib/format';

export default function AttendancePage() {
  const [date, setDate] = useState(todayKey());
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState<any | null>(null);

  useEffect(() => {
    api<any[]>('/departments').then(setDepartments).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date, take: '300' });
    if (departmentId) params.set('departmentId', departmentId);
    if (status) params.set('status', status);
    if (flagged) params.set('flagged', 'true');

    try {
      const [list, sum] = await Promise.all([
        api<{ items: any[] }>(`/attendance?${params}`),
        api<any>(`/attendance/summary?date=${date}`),
      ]);
      setItems(list.items);
      setSummary(sum);
    } finally {
      setLoading(false);
    }
  }, [date, departmentId, status, flagged]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportSheet = async () => {
    const [year, month] = date.split('-');
    const params = new URLSearchParams({ year, month: String(Number(month)) });
    if (departmentId) params.set('departmentId', departmentId);

    await downloadFile(
      `/reports/export/attendance-sheet?${params}`,
      `davomat-${year}-${month}.xlsx`,
    );
  };

  return (
    <>
      <PageHeader
        title="Davomat"
        subtitle={fmtDate(date)}
        actions={
          <button onClick={exportSheet} className="btn-ghost text-xs">
            <Download size={14} />
            Oylik tabel (Excel)
          </button>
        }
      />

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Davomat" value={`${summary.attendanceRate}%`} />
          <StatCard label="Vaqtida" value={summary.onTime} tone="text-emerald-600" />
          <StatCard label="Kechikkan" value={summary.late} tone="text-amber-600" />
          <StatCard label="Belgilanmagan" value={summary.missed} tone="text-red-600" />
          <StatCard label="Sababli" value={summary.excused} tone="text-sky-600" />
          <StatCard label="Shubhali" value={summary.flagged} tone="text-violet-600" />
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label text-xs">Sana</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input w-auto"
          />
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
          <label className="label text-xs">Holat</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
            <option value="">Barchasi</option>
            {Object.entries(ATTENDANCE_STATUS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
            className="h-4 w-4"
          />
          Faqat shubhalilar
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Bu sana uchun yozuv topilmadi" />
      ) : (
        <Table head={['Hodim', "Bo'lim", 'Reja', 'Belgilandi', 'Holat', 'Masofa', 'Usul', 'Foto']}>
          {items.map((item) => {
            const meta = ATTENDANCE_STATUS[item.status];
            return (
              <tr key={item.id}>
                <Td>
                  <p className="font-medium">{item.user.fullName}</p>
                  <p className="muted text-xs">{item.user.position}</p>
                </Td>
                <Td className="text-xs">{item.user.department?.name ?? '—'}</Td>
                <Td className="text-xs">{fmtTime(item.expectedStartAt)}</Td>
                <Td>
                  <span className="text-sm">{fmtTime(item.checkInAt)}</span>
                  {item.minutesLate > 0 && (
                    <span className="ml-1 text-xs text-amber-600">+{item.minutesLate}</span>
                  )}
                </Td>
                <Td>
                  <Badge className={meta?.color}>{meta?.label}</Badge>
                  {item.flags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.flags.map((flag: string) => (
                        <Badge
                          key={flag}
                          className="border-violet-200 bg-violet-50 text-violet-700"
                        >
                          {ATTENDANCE_FLAG[flag] ?? flag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Td>
                <Td className="text-xs">
                  {item.distanceMeters !== null && item.distanceMeters !== undefined ? (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {item.distanceMeters} m
                    </span>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="text-xs">{item.method ? ATTENDANCE_METHOD[item.method] : '—'}</Td>
                <Td>
                  {item.photo ? (
                    <button
                      onClick={() => setPhoto(item)}
                      className="overflow-hidden rounded-md border"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <AuthImage fileId={item.photo.id} className="h-11 w-11 object-cover" />
                    </button>
                  ) : (
                    <ImageIcon size={16} className="text-slate-300" />
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {photo && (
        <Modal title={photo.user.fullName} onClose={() => setPhoto(null)}>
          <AuthImage fileId={photo.photo.id} className="w-full rounded-lg" />
          <div className="muted mt-4 space-y-1 text-sm">
            <p>Belgilangan vaqt: {fmtTime(photo.checkInAt)}</p>
            <p>Holat: {ATTENDANCE_STATUS[photo.status]?.label}</p>
            {photo.distanceMeters !== null && <p>Ofisgacha: {photo.distanceMeters} m</p>}
            {photo.accuracyMeters && <p>GPS aniqligi: ±{Math.round(photo.accuracyMeters)} m</p>}
            {photo.latitude && (
              <a
                href={`https://maps.google.com/?q=${photo.latitude},${photo.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand-600"
              >
                <MapPin size={13} /> Xaritada ko'rish
              </a>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
