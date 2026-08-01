// ============================================================
//  Zo'r team — pm2 process konfiguratsiyasi (Docker'siz deploy)
//
//  Ishlatish (loyiha ildizidan):
//    npm run build
//    pm2 start ecosystem.config.js
//    pm2 save
//
//  Muhim: barcha yo'llar shu fayl joylashgan papkaga nisbatan.
//  API `.env` faylini loyiha ildizidan o'zi o'qiydi (ConfigModule),
//  web esa o'qimaydi — shuning uchun uning env'i shu yerda beriladi.
// ============================================================

module.exports = {
  apps: [
    {
      name: 'zorteam-api',
      // NestJS build natijasi. cwd — loyiha ildizi, shunda ildizdagi
      // .env fayli topiladi (app.module.ts envFilePath ga qarang).
      cwd: __dirname,
      script: 'apps/api/dist/main.js',
      instances: 1,
      // Telegram bot va cron joblar bitta processda ishlashi SHART —
      // cluster rejimi xabarlarni ikki marta yuboradi.
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      // Sharp va Prisma xotirani ushlab qolsa qayta ishga tushadi
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tashkent',
      },
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'zorteam-web',
      // Next.js binarini to'g'ridan-to'g'ri chaqiramiz: npm oraliq
      // processi bo'lmasa pm2 restart va signal uzatish to'g'ri ishlaydi.
      cwd: __dirname + '/apps/web',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 3002',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tashkent',
        NEXT_TELEMETRY_DISABLED: '1',
        // /api/* so'rovlari shu manzilga uzatiladi.
        // DIQQAT: Next.js rewrites'ni BUILD paytida hisoblab qo'yadi,
        // shuning uchun bu qiymat `next build` paytida ham bir xil
        // bo'lishi kerak (qo'llanmadagi build buyrug'iga qarang).
        API_PROXY_TARGET: 'http://127.0.0.1:4002',
      },
      error_file: 'logs/web-error.log',
      out_file: 'logs/web-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
