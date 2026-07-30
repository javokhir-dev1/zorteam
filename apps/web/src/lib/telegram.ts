'use client';

/**
 * Telegram Mini App SDK ustidan yupqa qatlam.
 * Brauzerda (Telegramdan tashqarida) ochilganda ham sindirmaydi —
 * bu ishlab chiqish paytida qulay.
 */

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string };
    start_param?: string;
  };
  version: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  ready(): void;
  expand(): void;
  close(): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (ok: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    setText(text: string): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted: boolean;
    init(callback?: () => void): void;
    getLocation(
      callback: (data: {
        latitude: number;
        longitude: number;
        horizontal_accuracy?: number;
      } | null) => void,
    ): void;
    openSettings(): void;
  };
}

export function tg(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as any).Telegram?.WebApp ?? null;
}

export function isInsideTelegram(): boolean {
  const app = tg();
  return Boolean(app?.initData);
}

export function tgReady() {
  const app = tg();
  if (!app) return;
  app.ready();
  app.expand();
  document.body.classList.add('tg-app');
}

export function haptic(type: 'success' | 'error' | 'warning') {
  tg()?.HapticFeedback?.notificationOccurred(type);
}

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'telegram' | 'browser';
}

/**
 * Joylashuvni olish.
 * Avval Telegram LocationManager (aniqroq va ruxsat bir marta so'raladi),
 * u bo'lmasa brauzerning geolocation API'si.
 */
export function getPosition(timeoutMs = 20000): Promise<Position> {
  return new Promise((resolve, reject) => {
    const app = tg();
    const manager = app?.LocationManager;

    const useBrowser = () => {
      if (!navigator.geolocation) {
        reject(new Error("Qurilmangiz joylashuvni aniqlashni qo'llab-quvvatlamaydi"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
            source: 'browser',
          }),
        (error) => {
          const messages: Record<number, string> = {
            1: "Joylashuvga ruxsat berilmadi. Telefon sozlamalaridan ruxsat bering.",
            2: 'Joylashuv aniqlanmadi. Ochiq joyga chiqib qayta urinib ko\'ring.',
            3: 'Joylashuvni aniqlash vaqti tugadi.',
          };
          reject(new Error(messages[error.code] ?? 'Joylashuv aniqlanmadi'));
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    };

    if (!manager) {
      useBrowser();
      return;
    }

    const request = () => {
      if (!manager.isLocationAvailable) {
        useBrowser();
        return;
      }

      manager.getLocation((data) => {
        if (!data) {
          // Ruxsat berilmagan bo'lishi mumkin — brauzer usuliga o'tamiz
          useBrowser();
          return;
        }
        resolve({
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.horizontal_accuracy ?? 0,
          source: 'telegram',
        });
      });
    };

    if (manager.isInited) {
      request();
    } else {
      manager.init(() => request());
    }
  });
}
