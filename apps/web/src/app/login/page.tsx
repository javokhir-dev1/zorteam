'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { api, ApiError, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: { login, password },
      });
      setToken(response.token);
      router.replace('/panel');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kirishda xato');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Zo'r team</h1>
          <p className="muted text-sm">Boshqaruv tizimi</p>
        </div>

        <div>
          <label className="label">Login</label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className="input"
            placeholder="email yoki telefon"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="label">Parol</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          <LogIn size={16} />
          {loading ? 'Kirilmoqda…' : 'Kirish'}
        </button>

        <p className="muted text-center text-xs">
          Oddiy hodimlar tizimga Telegram bot orqali kiradi
        </p>
      </form>
    </div>
  );
}
