'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Building2,
  CalendarCheck,
  PlaneTakeoff,
  Film,
  Inbox,
  Star,
  MessageSquareLock,
  BarChart3,
  Share2,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: string[];
}

const NAV: NavItem[] = [
  { href: '/panel', label: 'Bosh sahifa', icon: <LayoutDashboard size={18} /> },
  { href: '/panel/davomat', label: 'Davomat', icon: <CalendarCheck size={18} /> },
  { href: '/panel/hodimlar', label: 'Hodimlar', icon: <Users size={18} /> },
  {
    href: '/panel/arizalar',
    label: 'Arizalar',
    icon: <UserPlus size={18} />,
    roles: ['ADMIN'],
  },
  { href: '/panel/bolimlar', label: "Bo'limlar", icon: <Building2 size={18} /> },
  { href: '/panel/yoqliklar', label: "Yo'qliklar", icon: <PlaneTakeoff size={18} /> },
  { href: '/panel/korsatuvlar', label: "Ko'rsatuvlar", icon: <Film size={18} /> },
  { href: '/panel/sorovlar', label: "So'rovlar", icon: <Inbox size={18} /> },
  { href: '/panel/baholash', label: 'Baholash', icon: <Star size={18} /> },
  {
    href: '/panel/murojaatlar',
    label: 'Murojaatlar',
    icon: <MessageSquareLock size={18} />,
    roles: ['ADMIN'],
  },
  { href: '/panel/hisobotlar', label: 'Hisobotlar', icon: <BarChart3 size={18} /> },
  { href: '/panel/ijtimoiy', label: 'Ijtimoiy tarmoq', icon: <Share2 size={18} /> },
  { href: '/panel/sozlamalar', label: 'Sozlamalar', icon: <Settings size={18} />, roles: ['ADMIN'] },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout, has } = useAuth();
  const [open, setOpen] = useState(false);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);

  // Tasdiqlash kutayotgan arizalar soni — yon menyuda ko'rsatiladi
  useEffect(() => {
    if (!me?.roles.includes('ADMIN')) return;

    const load = () =>
      api<{ count: number }>('/registrations/pending-count')
        .then((data) => setPendingRegistrations(data.count))
        .catch(() => undefined);

    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [me, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  if (!me) return null;

  const visibleNav = NAV.filter((item) => !item.roles || has(...item.roles));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex h-16 items-center justify-between border-b px-5" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="font-semibold leading-tight">Zo'r team</p>
            <p className="muted text-[11px]">Boshqaruv tizimi</p>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-0.5 p-3">
          {visibleNav.map((item) => {
            const active =
              item.href === '/panel' ? pathname === '/panel' : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active ? 'bg-brand-600 text-white' : 'hover:bg-black/5'
                }`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.href === '/panel/arizalar' && pendingRegistrations > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      active ? 'bg-white text-brand-700' : 'bg-red-500 text-white'
                    }`}
                  >
                    {pendingRegistrations}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className="absolute inset-x-0 bottom-0 border-t p-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="truncate text-sm font-medium">{me.fullName}</p>
          <p className="muted truncate text-xs">
            {me.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}
          </p>
          <button onClick={logout} className="btn-ghost mt-3 w-full text-xs">
            <LogOut size={14} />
            Chiqish
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Kontent */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-16 items-center gap-3 border-b px-4 lg:hidden"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <button onClick={() => setOpen(true)} aria-label="Menyu">
            <Menu size={22} />
          </button>
          <span className="font-semibold">Zo'r team</span>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
