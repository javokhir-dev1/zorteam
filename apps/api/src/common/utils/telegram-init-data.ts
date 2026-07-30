import { createHmac } from 'crypto';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface ParsedInitData {
  user?: TelegramInitUser;
  auth_date: number;
  query_id?: string;
  start_param?: string;
}

export interface VerifyResult {
  data: ParsedInitData | null;
  /** Xato sababi — diagnostika uchun */
  reason?: string;
}

/**
 * Telegram Mini App'dan kelgan initData'ni tekshiradi.
 * Bu tekshiruvsiz Mini App so'rovlariga ishonib bo'lmaydi —
 * hodim boshqa hodim nomidan belgilanib qo'yishi mumkin edi.
 *
 * Rasmiy algoritm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Eslatma: Bot API 7.10 dan boshlab initData ichida `signature` maydoni ham keladi
 * (uchinchi tomon tekshiruvi uchun). Turli mijozlar uni data-check-string'ga
 * turlicha qo'shadi, shuning uchun ikkala variant ham tekshiriladi.
 * Ikkalasi ham bot tokeni bilan imzolangan — xavfsizlik pasaymaydi.
 */
export function verifyInitDataDetailed(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): VerifyResult {
  if (!initData) return { data: null, reason: 'initData bo\'sh' };
  if (!botToken) return { data: null, reason: 'bot tokeni sozlanmagan' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { data: null, reason: 'hash maydoni yo\'q' };

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

  const buildCheckString = (excludeSignature: boolean) =>
    [...params.entries()]
      .filter(([key]) => key !== 'hash' && (!excludeSignature || key !== 'signature'))
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

  const matches = [true, false].some((excludeSignature) => {
    const computed = createHmac('sha256', secretKey)
      .update(buildCheckString(excludeSignature))
      .digest('hex');
    return computed === hash;
  });

  if (!matches) {
    return {
      data: null,
      reason: `hash mos kelmadi (maydonlar: ${[...params.keys()].sort().join(', ')})`,
    };
  }

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate) return { data: null, reason: 'auth_date yo\'q' };

  // Eskirgan initData qabul qilinmaydi (takroriy hujumdan himoya)
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds) {
    return { data: null, reason: `initData eskirgan (${Math.round(ageSeconds / 3600)} soat)` };
  }

  let user: TelegramInitUser | undefined;
  const rawUser = params.get('user');
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch {
      return { data: null, reason: 'user maydonini o\'qib bo\'lmadi' };
    }
  }

  if (!user?.id) {
    return { data: null, reason: 'user maydoni yo\'q (Mini App noto\'g\'ri ochilgan)' };
  }

  return {
    data: {
      user,
      auth_date: authDate,
      query_id: params.get('query_id') ?? undefined,
      start_param: params.get('start_param') ?? undefined,
    },
  };
}

/** Qisqa ko'rinish — faqat natija kerak bo'lganda */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): ParsedInitData | null {
  return verifyInitDataDetailed(initData, botToken, maxAgeSeconds).data;
}
