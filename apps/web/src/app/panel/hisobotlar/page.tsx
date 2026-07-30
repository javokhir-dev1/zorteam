'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { PageHeader, Loading, StatCard, Table, Td, Badge, Empty } from '@/components/ui';
import { uzMonth } from '@/lib/months';

export default function ReportsPage() {
  const now = new Date();
  const [mode, setMode] = useState<'weekly' | 'monthly'>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path =
        mode === 'monthly'
          ? `/reports/monthly?year=${year}&month=${month}`
          : `/reports/weekly?date=${date}`;
      setReport(await api(path));
    } finally {
      setLoading(false);
    }
  }, [mode, year, month, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportReport = async () => {
    if (mode === 'monthly') {
      await downloadFile(
        `/reports/export/monthly?year=${year}&month=${month}`,
        `hisobot-${year}-${String(month).padStart(2, '0')}.xlsx`,
      );
    } else {
      await downloadFile(`/reports/export/weekly?date=${date}`, `haftalik-${date}.xlsx`);
    }
  };

  return (
    <>
      <PageHeader
        title="Hisobotlar"
        subtitle={report?.period.label}
        actions={
          <button onClick={exportReport} className="btn-ghost text-xs">
            <Download size={14} />
            Excel
          </button>
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setMode('monthly')}
            className={`rounded-lg px-3 py-2 text-xs ${
              mode === 'monthly' ? 'bg-brand-600 text-white' : 'border'
            }`}
            style={mode === 'monthly' ? undefined : { borderColor: 'var(--border)' }}
          >
            Oylik
          </button>
          <button
            onClick={() => setMode('weekly')}
            className={`rounded-lg px-3 py-2 text-xs ${
              mode === 'weekly' ? 'bg-brand-600 text-white' : 'border'
            }`}
            style={mode === 'weekly' ? undefined : { borderColor: 'var(--border)' }}
          >
            Haftalik
          </button>
        </div>

        {mode === 'monthly' ? (
          <>
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
          </>
        ) : (
          <div>
            <label className="label text-xs">Hafta (istalgan kuni)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input w-auto"
            />
          </div>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : !report ? (
        <Empty text="Hisobot yo'q" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Davomat"
              value={`${report.overall.attendanceRate}%`}
              hint={`${report.overall.workdayRecords} yozuv`}
            />
            <StatCard label="Kechikish" value={report.overall.late} tone="text-amber-600" />
            <StatCard label="Belgilanmagan" value={report.overall.missed} tone="text-red-600" />
            <StatCard
              label="O'rtacha baho"
              value={report.evaluations.average ?? '—'}
              hint={`${report.evaluations.count} ta baho`}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="So'rovlar" value={report.tasks.created} />
            <StatCard label="Bajarilgan" value={report.tasks.completed} tone="text-emerald-600" />
            <StatCard label="Kechikkan" value={report.tasks.overdue} tone="text-red-600" />
            <StatCard
              label="Javobsiz"
              value={report.tasks.noResponse}
              tone={report.tasks.noResponse ? 'text-red-600' : undefined}
            />
          </div>

          <h2 className="mb-3 mt-6 font-semibold">Bo'limlar kesimida</h2>

          <Table
            head={[
              "Bo'lim",
              'Davomat',
              'Kechikish',
              'Yo\'q',
              "So'rov",
              'Bajarildi',
              'Kechikkan',
              'Deadline %',
              'Baho',
              'Kamchiliklar',
            ]}
          >
            {report.departments.map((dept: any) => (
              <tr key={dept.departmentId}>
                <Td>
                  <p className="font-medium">{dept.name}</p>
                  <p className="muted text-xs">{dept.employees} hodim</p>
                </Td>
                <Td>
                  <span
                    className={
                      dept.attendanceRate >= 95
                        ? 'text-emerald-600'
                        : dept.attendanceRate >= 85
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }
                  >
                    {dept.attendanceRate}%
                  </span>
                </Td>
                <Td className="text-xs">{dept.late}</Td>
                <Td className="text-xs">{dept.missed}</Td>
                <Td className="text-xs">{dept.tasksReceived}</Td>
                <Td className="text-xs">{dept.tasksCompleted}</Td>
                <Td className="text-xs">{dept.tasksOverdue}</Td>
                <Td className="text-xs">{dept.deadlineRate}%</Td>
                <Td className="text-xs">{dept.avgEvaluation ?? '—'}</Td>
                <Td>
                  {dept.issues.length === 0 ? (
                    <span className="text-xs text-emerald-600">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {dept.issues.map((issue: string) => (
                        <Badge key={issue} className="border-red-200 bg-red-50 text-red-700">
                          <AlertTriangle size={9} className="inline" /> {issue}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
