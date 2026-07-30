export default () => ({
  port: Number(process.env.API_PORT ?? 4000),
  tz: process.env.TZ ?? 'Asia/Tashkent',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-almashtiring',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? '',
    username: process.env.TELEGRAM_BOT_USERNAME ?? '',
    miniAppUrl: process.env.MINIAPP_URL ?? 'http://localhost:3000/app',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  },

  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    localPath: process.env.STORAGE_LOCAL_PATH ?? './storage',
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? '',
      accessKey: process.env.S3_ACCESS_KEY ?? '',
      secretKey: process.env.S3_SECRET_KEY ?? '',
    },
  },

  attendance: {
    // GPS aniqligi shu qiymatdan yomon bo'lsa shubhali deb belgilanadi (metr)
    maxAccuracyMeters: Number(process.env.ATTENDANCE_MAX_ACCURACY ?? 200),
    // Perceptual hash farqi shu qiymatdan kichik bo'lsa "takroriy rasm"
    phashMaxDistance: Number(process.env.ATTENDANCE_PHASH_DISTANCE ?? 6),
    // Teleport tekshiruvi: km/soat
    maxSpeedKmh: Number(process.env.ATTENDANCE_MAX_SPEED_KMH ?? 200),
  },

  social: {
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
    instagramToken: process.env.INSTAGRAM_ACCESS_TOKEN ?? '',
    instagramAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '',
  },
});
