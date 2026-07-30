'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, MapPin, Clock, CalendarDays, Users2, Trash2, Crosshair } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Loading, Badge, Empty, Modal, ErrorBox, Table, Td } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import {
  parseCoordinates,
  osmEmbedUrl,
  googleMapsUrl,
  type Coordinates,
} from '@/lib/coordinates';

const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

type Tab = 'schedules' | 'offices' | 'calendar' | 'crewRoles';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('schedules');

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'schedules', label: 'Ish grafiklari', icon: <Clock size={15} /> },
    { key: 'offices', label: 'Ofis va geofence', icon: <MapPin size={15} /> },
    { key: 'calendar', label: 'Bayram kunlari', icon: <CalendarDays size={15} /> },
    { key: 'crewRoles', label: 'Jamoa rollari', icon: <Users2 size={15} /> },
  ];

  return (
    <>
      <PageHeader title="Sozlamalar" />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${
              tab === item.key ? 'bg-brand-600 text-white' : 'border'
            }`}
            style={tab === item.key ? undefined : { borderColor: 'var(--border)' }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'schedules' && <Schedules />}
      {tab === 'offices' && <Offices />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'crewRoles' && <CrewRoles />}
    </>
  );
}

// ============================================================
//  Ish grafiklari
// ============================================================

function Schedules() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<any[]>('/schedules'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing({})} className="btn-primary text-xs">
          <Plus size={14} />
          Yangi grafik
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((schedule) => (
          <div key={schedule.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{schedule.name}</p>
                <p className="muted text-xs">{schedule.description}</p>
              </div>
              {schedule.isDefault && (
                <Badge className="border-brand-200 bg-brand-50 text-brand-700">Standart</Badge>
              )}
            </div>

            <div className="space-y-1 text-xs">
              {schedule.days
                .filter((d: any) => d.isWorkday)
                .map((day: any) => (
                  <p key={day.id} className="muted">
                    {WEEKDAYS[day.weekday - 1]}: {day.startTime} – {day.endTime}
                  </p>
                ))}
            </div>

            <div className="muted grid grid-cols-3 gap-2 border-t pt-2 text-[11px]" style={{ borderColor: 'var(--border)' }}>
              <span>Kechikish chegarasi: {schedule.graceMinutes} daq</span>
              <span>Oyna: {schedule.windowMinutes} daq</span>
              <span>Eslatma: {schedule.reminderMinutes} daq</span>
            </div>

            <p className="muted text-xs">
              {schedule._count.users} hodim · {schedule._count.departments} bo'lim
            </p>

            <button onClick={() => setEditing(schedule)} className="btn-ghost w-full text-xs">
              Tahrirlash
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <ScheduleModal
          schedule={editing}
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

function ScheduleModal({ schedule, onClose, onSaved }: any) {
  const isNew = !schedule.id;
  const [form, setForm] = useState({
    name: schedule.name ?? '',
    description: schedule.description ?? '',
    isDefault: schedule.isDefault ?? false,
    requireCheckOut: schedule.requireCheckOut ?? false,
    graceMinutes: schedule.graceMinutes ?? 15,
    windowMinutes: schedule.windowMinutes ?? 15,
    reminderMinutes: schedule.reminderMinutes ?? 10,
  });

  const [days, setDays] = useState<any[]>(
    schedule.days?.length
      ? [...schedule.days].sort((a, b) => a.weekday - b.weekday)
      : [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          isWorkday: weekday <= 5,
          startTime: '10:00',
          endTime: '19:00',
        })),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body = {
      ...form,
      graceMinutes: Number(form.graceMinutes),
      windowMinutes: Number(form.windowMinutes),
      reminderMinutes: Number(form.reminderMinutes),
      days: days.map((d) => ({
        weekday: d.weekday,
        isWorkday: d.isWorkday,
        startTime: d.startTime,
        endTime: d.endTime,
      })),
    };

    try {
      if (isNew) await api('/schedules', { method: 'POST', body });
      else await api(`/schedules/${schedule.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? 'Yangi ish grafigi' : form.name} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Nomi *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">Tavsif</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label text-xs">Kechikish chegarasi (daq)</label>
            <input
              type="number"
              value={form.graceMinutes}
              onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) })}
              className="input"
            />
            <p className="muted mt-1 text-[10px]">Shu vaqtgacha "vaqtida" hisoblanadi</p>
          </div>
          <div>
            <label className="label text-xs">Belgilanish oynasi (daq)</label>
            <input
              type="number"
              value={form.windowMinutes}
              onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}
              className="input"
            />
            <p className="muted mt-1 text-[10px]">Keyin "belgilanmadi" yoziladi</p>
          </div>
          <div>
            <label className="label text-xs">Eslatma (daq)</label>
            <input
              type="number"
              value={form.reminderMinutes}
              onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}
              className="input"
            />
            <p className="muted mt-1 text-[10px]">Ish boshidan keyin</p>
          </div>
        </div>

        <div>
          <label className="label text-xs">Hafta kunlari</label>
          <div className="space-y-2">
            {days.map((day, index) => (
              <div key={day.weekday} className="flex items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={day.isWorkday}
                    onChange={(e) => {
                      const next = [...days];
                      next[index] = { ...day, isWorkday: e.target.checked };
                      setDays(next);
                    }}
                    className="h-4 w-4"
                  />
                  {WEEKDAYS[day.weekday - 1]}
                </label>

                <input
                  type="time"
                  value={day.startTime}
                  onChange={(e) => {
                    const next = [...days];
                    next[index] = { ...day, startTime: e.target.value };
                    setDays(next);
                  }}
                  disabled={!day.isWorkday}
                  className="input w-32"
                />
                <span className="muted">—</span>
                <input
                  type="time"
                  value={day.endTime}
                  onChange={(e) => {
                    const next = [...days];
                    next[index] = { ...day, endTime: e.target.value };
                    setDays(next);
                  }}
                  disabled={!day.isWorkday}
                  className="input w-32"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="h-4 w-4"
            />
            Standart grafik
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requireCheckOut}
              onChange={(e) => setForm({ ...form, requireCheckOut: e.target.checked })}
              className="h-4 w-4"
            />
            Ish oxirida ham belgilanish
          </label>
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

// ============================================================
//  Ofis (geofence)
// ============================================================

function Offices() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<any[]>('/offices'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (office: any) => {
    if (
      !window.confirm(
        `"${office.name}" ofisi o'chirilsinmi?\n\nDavomat yozuvlarida ishlatilgan bo'lsa, tarix saqlanadi va ofis shunchaki ro'yxatdan yashiriladi.`,
      )
    ) {
      return;
    }

    setError(null);
    try {
      const result = await api<{ softDeleted: boolean; usedInAttendance: number }>(
        `/offices/${office.id}`,
        { method: 'DELETE' },
      );
      if (result.softDeleted) {
        setError(
          `"${office.name}" ${result.usedInAttendance} ta davomat yozuvida ishlatilgan, shuning uchun tarix saqlanib, ofis ro'yxatdan olib tashlandi.`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "O'chirilmadi");
    }
  };

  if (loading) return <Loading />;

  const active = items.find((office) => office.isDefault) ?? items[0];

  return (
    <>
      {active ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <b>Hozir davomat shu ofisga qarab tekshiriladi:</b> {active.name} — radius{' '}
          {active.radiusMeters} m
          <div className="mt-0.5 text-xs">
            {active.latitude.toFixed(6)}, {active.longitude.toFixed(6)}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Ofis kiritilmagan — hozir joylashuv tekshirilmaydi. Quyidan ofis qo'shing.
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing({})} className="btn-primary text-xs">
          <Plus size={14} />
          Yangi ofis
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((office) => (
          <div
            key={office.id}
            className={`card space-y-3 ${office.isDefault ? 'border-emerald-300' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{office.name}</p>
                <p className="muted text-xs">{office.address || '—'}</p>
              </div>
              {office.isDefault && (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Asosiy</Badge>
              )}
            </div>

            <iframe
              title={office.name}
              src={osmEmbedUrl(office.latitude, office.longitude, office.radiusMeters)}
              className="h-40 w-full rounded-lg border"
              style={{ borderColor: 'var(--border)' }}
              loading="lazy"
            />

            <p className="muted text-xs">
              {office.latitude.toFixed(6)}, {office.longitude.toFixed(6)} · radius{' '}
              {office.radiusMeters} m
            </p>

            <div className="flex gap-2">
              <a
                href={googleMapsUrl(office.latitude, office.longitude)}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost flex-1 text-xs"
              >
                <MapPin size={13} />
                Xaritada
              </a>
              <button onClick={() => setEditing(office)} className="btn-ghost flex-1 text-xs">
                Tahrirlash
              </button>
              <button
                onClick={() => remove(office)}
                className="btn-ghost shrink-0 text-xs text-red-600"
                aria-label="O'chirish"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <OfficeModal
          office={editing}
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

function OfficeModal({ office, onClose, onSaved }: any) {
  const isNew = !office.id;

  const [name, setName] = useState(office.name ?? '');
  const [address, setAddress] = useState(office.address ?? '');
  const [radiusMeters, setRadiusMeters] = useState(office.radiusMeters ?? 150);
  const [isDefault, setIsDefault] = useState(office.isDefault ?? isNew);

  // Koordinata bitta maydonga kiritiladi — nusxalab qo'yish uchun qulay
  const [rawCoordinates, setRawCoordinates] = useState(
    office.latitude ? `${office.latitude}, ${office.longitude}` : '',
  );
  const [coordinates, setCoordinates] = useState<Coordinates | null>(
    office.latitude ? { latitude: office.latitude, longitude: office.longitude } : null,
  );

  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyRaw = (value: string) => {
    setRawCoordinates(value);
    setCoordinates(parseCoordinates(value));
  };

  /** Telefon/kompyuterning joriy joylashuvi — ofisda turib bosiladi */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Qurilmangiz joylashuvni aniqlashni qo'llab-quvvatlamaydi");
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const found = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };
        setCoordinates(found);
        setRawCoordinates(`${found.latitude}, ${found.longitude}`);
        setLocating(false);
      },
      (geoError) => {
        const messages: Record<number, string> = {
          1: 'Joylashuvga ruxsat berilmadi',
          2: 'Joylashuv aniqlanmadi',
          3: 'Joylashuvni aniqlash vaqti tugadi',
        };
        setError(messages[geoError.code] ?? 'Joylashuv aniqlanmadi');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const save = async () => {
    if (!coordinates) {
      setError("Koordinata to'g'ri kiritilmagan");
      return;
    }

    setSaving(true);
    setError(null);

    const body = {
      name,
      address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radiusMeters: Number(radiusMeters),
      isDefault,
    };

    try {
      if (isNew) await api('/offices', { method: 'POST', body });
      else await api(`/offices/${office.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? 'Yangi ofis' : name || 'Ofis'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Nomi *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Bosh ofis"
          />
        </div>

        <div>
          <label className="label text-xs">Manzil (ixtiyoriy)</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input"
            placeholder="Toshkent sh., Amir Temur ko'chasi 1"
          />
        </div>

        <div>
          <label className="label text-xs">Koordinata *</label>
          <input
            value={rawCoordinates}
            onChange={(e) => applyRaw(e.target.value)}
            className="input"
            placeholder="41.311081, 69.240562"
          />

          <div className="muted mt-1.5 space-y-0.5 text-[11px]">
            <p>
              Google Maps'da ofis ustiga <b>o'ng tugma</b> bosing → chiqqan koordinatani bosing
              (nusxalanadi) → shu yerga qo'ying.
            </p>
            <p>Havolani ham to'g'ridan-to'g'ri qo'ysangiz bo'ladi.</p>
          </div>

          <button
            onClick={useCurrentLocation}
            disabled={locating}
            className="btn-ghost mt-2 w-full text-xs"
          >
            <Crosshair size={14} />
            {locating ? 'Aniqlanmoqda…' : 'Hozir turgan joyimni olish'}
          </button>

          {rawCoordinates && !coordinates && (
            <p className="mt-2 text-xs text-red-600">
              Koordinatani o'qib bo'lmadi. Namuna: <code>41.311081, 69.240562</code>
            </p>
          )}

          {coordinates && (
            <div className="mt-2">
              <p className="text-xs text-emerald-600">
                ✓ Kenglik {coordinates.latitude}, uzunlik {coordinates.longitude}
              </p>
              <iframe
                title="Ofis joylashuvi"
                src={osmEmbedUrl(coordinates.latitude, coordinates.longitude, Number(radiusMeters))}
                className="mt-2 h-52 w-full rounded-lg border"
                style={{ borderColor: 'var(--border)' }}
                loading="lazy"
              />
              <p className="muted mt-1 text-[11px]">
                Belgi ofis binosida turibdimi — tekshiring.
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label text-xs">Radius (metr)</label>
          <input
            type="number"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(e.target.value)}
            className="input"
          />
          <p className="muted mt-1 text-[11px]">
            100–200 m tavsiya etiladi. 50 m dan kichik radiusda GPS xatoligi sabab ofisdagi
            hodim ham "tashqarida" deb belgilanishi mumkin.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4"
          />
          Asosiy ofis (davomat shunga qarab tekshiriladi)
        </label>

        {error && <ErrorBox message={error} />}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">
            Bekor qilish
          </button>
          <button onClick={save} disabled={saving || !name || !coordinates} className="btn-primary flex-1">
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
//  Bayram kunlari
// ============================================================

function Calendar() {
  const [items, setItems] = useState<any[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: '', name: '', isWorkday: false });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<any[]>(`/calendar?year=${year}`));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setError(null);
    try {
      await api('/calendar', { method: 'POST', body: form });
      setForm({ date: '', name: '', isWorkday: false });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Qo'shilmadi");
    }
  };

  return (
    <>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label text-xs">Yil</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-28"
          />
        </div>
        <div>
          <label className="label text-xs">Sana</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="input w-auto"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label text-xs">Nomi</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            placeholder="Mustaqillik kuni"
          />
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isWorkday}
            onChange={(e) => setForm({ ...form, isWorkday: e.target.checked })}
            className="h-4 w-4"
          />
          Ish kuni (ko'chirilgan)
        </label>
        <button
          onClick={add}
          disabled={!form.date || !form.name}
          className="btn-primary mb-0.5 text-xs"
        >
          <Plus size={14} />
          Qo'shish
        </button>
      </div>

      {error && <div className="mb-3"><ErrorBox message={error} /></div>}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Bu yil uchun kun belgilanmagan" />
      ) : (
        <Table head={['Sana', 'Nomi', 'Turi', '']}>
          {items.map((day) => (
            <tr key={day.id}>
              <Td>{fmtDate(day.date)}</Td>
              <Td>{day.name}</Td>
              <Td>
                <Badge
                  className={
                    day.isWorkday
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }
                >
                  {day.isWorkday ? "Ko'chirilgan ish kuni" : 'Dam olish'}
                </Badge>
              </Td>
              <Td>
                <button
                  onClick={async () => {
                    await api(`/calendar/${day.id}`, { method: 'DELETE' });
                    await load();
                  }}
                  className="text-xs text-red-600"
                >
                  O'chirish
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

// ============================================================
//  Jamoa rollari
// ============================================================

function CrewRoles() {
  const [items, setItems] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roles, depts] = await Promise.all([
        api<any[]>('/crew-roles'),
        api<any[]>('/departments'),
      ]);
      setItems(roles);
      setDepartments(depts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading />;

  return (
    <>
      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        Jamoa rollari ko'rsatuvga hodim biriktirishda ishlatiladi. Har rol bir bo'limga
        bog'lanadi — shunda bo'lim rahbari faqat o'z hodimini qo'ya oladi.
      </div>

      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing({})} className="btn-primary text-xs">
          <Plus size={14} />
          Yangi rol
        </button>
      </div>

      <Table head={['Rol', 'Kod', "Bo'lim", 'Tartib', '']}>
        {items.map((role) => (
          <tr key={role.id}>
            <Td className="font-medium">{role.name}</Td>
            <Td className="text-xs">{role.code}</Td>
            <Td className="text-xs">{role.department?.name ?? '—'}</Td>
            <Td className="text-xs">{role.sortOrder}</Td>
            <Td>
              <button onClick={() => setEditing(role)} className="text-xs text-brand-600">
                Tahrirlash
              </button>
            </Td>
          </tr>
        ))}
      </Table>

      {editing && (
        <CrewRoleModal
          role={editing}
          departments={departments}
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

function CrewRoleModal({ role, departments, onClose, onSaved }: any) {
  const isNew = !role.id;
  const [form, setForm] = useState({
    name: role.name ?? '',
    code: role.code ?? '',
    departmentId: role.department?.id ?? '',
    sortOrder: role.sortOrder ?? 0,
    isActive: role.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body = {
      ...form,
      code: form.code.toUpperCase(),
      departmentId: form.departmentId || null,
      sortOrder: Number(form.sortOrder),
    };

    try {
      if (isNew) await api('/crew-roles', { method: 'POST', body });
      else await api(`/crew-roles/${role.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? 'Yangi jamoa roli' : form.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs">Nomi *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder="Operator"
            />
          </div>
          <div>
            <label className="label text-xs">Kod *</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="input uppercase"
              placeholder="OPERATOR"
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
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Tartib raqami</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              className="input"
            />
          </div>
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
