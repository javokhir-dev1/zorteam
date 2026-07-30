/**
 * Telegram akkauntini hodimga qo'lda bog'lash.
 *
 * Odatda hodim taklif havolasi orqali o'zi ulanadi. Bu skript
 * favqulodda holatlar uchun (havola ishlamasa, telefon raqami mos kelmasa).
 *
 * Ishlatish:
 *   npx tsx apps/api/prisma/link-telegram.ts <email-yoki-telefon> <telegramId> [username]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [login, telegramIdRaw, username] = process.argv.slice(2);

  if (!login || !telegramIdRaw) {
    console.error(
      'Ishlatish: npx tsx apps/api/prisma/link-telegram.ts <email-yoki-telefon> <telegramId> [username]',
    );
    process.exit(1);
  }

  const telegramId = BigInt(telegramIdRaw);

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { phone: login }] },
    select: { id: true, fullName: true, telegramId: true },
  });

  if (!user) {
    console.error(`Hodim topilmadi: ${login}`);
    process.exit(1);
  }

  // Shu Telegram ID boshqa hodimga bog'langan bo'lsa uzamiz
  const occupied = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true, fullName: true },
  });

  if (occupied && occupied.id !== user.id) {
    console.log(`⚠️  Bu Telegram ID ${occupied.fullName} dan uzildi`);
    await prisma.user.update({
      where: { id: occupied.id },
      data: { telegramId: null, telegramUsername: null, telegramLinkedAt: null },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId,
      telegramUsername: username?.replace('@', '') ?? null,
      telegramLinkedAt: new Date(),
      botBlocked: false,
    },
  });

  // Ishlatilmagan taklif kodlarini yopamiz
  await prisma.inviteCode.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  console.log(`✅ ${user.fullName} → Telegram ID ${telegramId} ga bog'landi`);
}

main()
  .catch((error) => {
    console.error('Xato:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
