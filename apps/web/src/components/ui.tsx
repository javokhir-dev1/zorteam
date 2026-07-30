'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchFileUrl } from '@/lib/api';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="muted mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="card">
      <p className="muted text-xs">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? ''}`}>{value}</p>
      {hint && <p className="muted mt-0.5 text-[11px]">{hint}</p>}
    </div>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${className ?? ''}`}>
      {children}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="muted py-10 text-center text-sm">{text}</p>;
}

export function Loading() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div
        className={`my-8 w-full rounded-xl border p-5 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-black/5" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Davomat fotosi — autentifikatsiya bilan yuklanadi */
export function AuthImage({ fileId, className }: { fileId: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetchFileUrl(fileId)
      .then((value) => {
        objectUrl = value;
        setUrl(value);
      })
      .catch(() => setFailed(true));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-[10px] text-slate-400 ${className ?? ''}`}>
        yo'q
      </div>
    );
  }

  if (!url) {
    return <div className={`animate-pulse bg-slate-100 ${className ?? ''}`} />;
  }

  return <img src={url} alt="Davomat fotosi" className={className} />;
}

export function Table({
  head,
  children,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr style={{ background: 'var(--surface)' }}>
            {head.map((cell, index) => (
              <th
                key={index}
                className="border-b px-3 py-2.5 text-left text-xs font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ background: 'var(--surface)' }}>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td
      className={`border-b px-3 py-2.5 align-middle ${className ?? ''}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </td>
  );
}
