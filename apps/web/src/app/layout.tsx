import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: "Zo'r team — Boshqaruv tizimi",
  description: 'Hodimlarni nazorat qilish va boshqarish tizimi',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <head>
        {/* Telegram SDK ildiz layoutda yuklanadi — Mini App sahifasi
            ochilishidan oldin window.Telegram tayyor bo'lishi kerak */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
