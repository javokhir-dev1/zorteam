'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function BackLink({ title, href = '/app' }: { title: string; href?: string }) {
  return (
    <header className="flex items-center gap-2 pt-2">
      <Link href={href} className="-ml-2 rounded-full p-2 hover:bg-black/5" aria-label="Orqaga">
        <ChevronLeft size={20} />
      </Link>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}
