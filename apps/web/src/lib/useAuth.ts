'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getToken, setToken } from './api';

/**
 * Telegram Mini App'dan `?token=...` bilan kelingan bo'lsa,
 * kalitni saqlab, manzilni tozalaymiz — shunda kalit brauzer
 * tarixida va manzil qatorida qolmaydi.
 */
function consumeTokenFromUrl() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return;

  setToken(token);
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export interface Me {
  id: string;
  fullName: string;
  position: string;
  roles: string[];
  employeeNo: string | null;
  phone: string | null;
  email: string | null;
  department: { id: string; name: string; type: string } | null;
  headOf: { id: string; name: string }[];
}

export function useAuth(requireAuth = true) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    consumeTokenFromUrl();

    if (!getToken()) {
      if (requireAuth) router.replace('/login');
      setLoading(false);
      return;
    }

    api<Me>('/auth/me')
      .then(setMe)
      .catch(() => {
        clearToken();
        if (requireAuth) router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router, requireAuth]);

  const logout = () => {
    clearToken();
    router.replace('/login');
  };

  const has = (...roles: string[]) => Boolean(me?.roles.some((r) => roles.includes(r)));

  return { me, loading, logout, has, isAdmin: has('ADMIN') };
}
