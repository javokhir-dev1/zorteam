'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? '/panel' : '/login');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    </div>
  );
}
