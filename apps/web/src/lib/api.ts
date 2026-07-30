/**
 * Backend bilan ishlash uchun yagona klient.
 *
 * Ikki xil avtorizatsiya:
 *   • admin panel — localStorage'dagi JWT
 *   • Mini App    — Telegram initData (har so'rovda yuboriladi)
 */

/**
 * Bo'sh qiymat = so'rovlar shu manzilning o'ziga ketadi va
 * Next.js ularni backendga uzatadi (next.config.mjs → rewrites).
 * Backend alohida domenda tursa NEXT_PUBLIC_API_URL to'ldiriladi.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'zorteam_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

function initData(): string | null {
  if (typeof window === 'undefined') return null;
  return (window as any).Telegram?.WebApp?.initData || null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** FormData yuborilganda Content-Type qo'yilmaydi */
  formData?: FormData;
}

export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const tgInitData = initData();
  if (tgInitData) headers['X-Telegram-Init-Data'] = tgInitData;

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
    body,
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? Array.isArray((payload as any).message)
          ? (payload as any).message.join(', ')
          : (payload as any).message
        : null) ?? `So'rov bajarilmadi (${response.status})`;

    if (response.status === 401 && token) {
      clearToken();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/app')) {
        window.location.href = '/login';
      }
    }

    throw new ApiError(String(message), response.status, payload);
  }

  return payload as T;
}

/** Excel/PDF hisobotni yuklab olish (avtorizatsiya sarlavhasi bilan) */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/api${path}`, { headers });
  if (!response.ok) throw new ApiError('Fayl yuklanmadi', response.status);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

/** Fayl (masalan davomat fotosi) manzili — autentifikatsiya bilan yuklanadi */
export async function fetchFileUrl(fileId: string): Promise<string> {
  const token = getToken();
  const tgInitData = initData();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tgInitData) headers['X-Telegram-Init-Data'] = tgInitData;

  const response = await fetch(`${API_URL}/api/files/${fileId}`, { headers });
  if (!response.ok) throw new ApiError('Rasm yuklanmadi', response.status);

  return URL.createObjectURL(await response.blob());
}
