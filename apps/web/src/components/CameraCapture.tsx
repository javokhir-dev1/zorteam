'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';

interface Props {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

/**
 * Jonli kamera.
 *
 * Muhim: bu yerda <input type="file"> ISHLATILMAYDI — shuning uchun
 * galereyadan tayyor rasm tanlab bo'lmaydi. Faqat shu daqiqadagi
 * kadr olinadi. Davomat tizimining ishonchliligi shunga asoslangan.
 */
export function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setReady(false);
    stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Qurilmangiz kamerani qo'llab-quvvatlamaydi yoki sahifa HTTPS orqali ochilmagan.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setReady(true);
    } catch (err) {
      const name = (err as Error).name;
      const messages: Record<string, string> = {
        NotAllowedError:
          "Kameraga ruxsat berilmadi. Telefon sozlamalaridan Telegramga kamera ruxsatini bering.",
        NotFoundError: 'Kamera topilmadi.',
        NotReadableError: 'Kamera boshqa dastur tomonidan band.',
        OverconstrainedError: 'Bu kamera rejimi mavjud emas.',
      };
      setError(messages[name] ?? `Kamera ochilmadi: ${(err as Error).message}`);
    }
  }, [facingMode, stop]);

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready || busy) return;

    setBusy(true);
    try {
      const maxSide = 1080;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Rasm olishda xato');

      // Old kamerada ko'zgu effektini bekor qilamiz — rasm tabiiy chiqadi
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85),
      );

      if (!blob) throw new Error('Rasm yaratilmadi');

      stop();
      onCapture(blob);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button
          onClick={() => {
            stop();
            onCancel();
          }}
          className="rounded-full bg-white/15 p-2"
          aria-label="Yopish"
        >
          <X size={20} />
        </button>

        <span className="text-sm font-medium">Ish joyingizda suratga oling</span>

        <button
          onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
          className="rounded-full bg-white/15 p-2"
          aria-label="Kamerani almashtirish"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm text-white/90">{error}</p>
            <button onClick={() => void start()} className="rounded-lg bg-white/15 px-5 py-2.5 text-sm text-white">
              Qayta urinish
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }}
          />
        )}

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center py-8">
        <button
          onClick={capture}
          disabled={!ready || busy}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
          aria-label="Suratga olish"
        >
          {busy ? (
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Camera size={30} className="text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
