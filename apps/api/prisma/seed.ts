/**
 * Boshlang'ich ma'lumotlar.
 * Ishga tushirish:  npm run db:seed
 *
 * Bu skript qayta-qayta ishga tushirilishi mumkin — mavjud yozuvlar buzilmaydi.
 */
import {
  PrismaClient,
  DepartmentType,
  SystemRole,
  EvaluationTargetType,
  EvaluatorKind,
  EvaluationTrigger,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log("Boshlang'ich ma'lumotlar yozilmoqda...\n");

  // ---------- 1. Ish grafigi ----------
  let schedule = await prisma.workSchedule.findFirst({ where: { isDefault: true } });
  if (!schedule) {
    schedule = await prisma.workSchedule.create({
      data: {
        name: 'Standart 10:00 – 19:00',
        description: "Dushanbadan jumagacha, 15 daqiqalik belgilanish oynasi",
        isDefault: true,
        graceMinutes: 15,
        windowMinutes: 15,
        reminderMinutes: 10,
        days: {
          create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            isWorkday: weekday <= 5,
            startTime: '10:00',
            endTime: '19:00',
          })),
        },
      },
    });
    console.log(`  ✓ Ish grafigi: ${schedule.name}`);
  }

  // ---------- 2. Ofis (geofence) ----------
  let office = await prisma.office.findFirst({ where: { isDefault: true } });
  if (!office) {
    office = await prisma.office.create({
      data: {
        name: 'Bosh ofis',
        address: "Toshkent sh. — aniq manzilni admin panelda o'zgartiring",
        // NAMUNAVIY koordinata — haqiqiy ofis koordinatasini panelda kiriting
        latitude: 41.311081,
        longitude: 69.240562,
        radiusMeters: 150,
        isDefault: true,
      },
    });
    console.log(`  ✓ Ofis: ${office.name} (koordinatani panelda aniqlashtiring)`);
  }

  // ---------- 3. Bo'limlar ----------
  const departments: { name: string; code: string; type: DepartmentType }[] = [
    { name: 'Ma\'muriyat', code: 'ADMIN', type: DepartmentType.DEPARTMENT },
    { name: 'Operatorlar', code: 'OPER', type: DepartmentType.DEPARTMENT },
    { name: 'Montaj', code: 'MONTAJ', type: DepartmentType.DEPARTMENT },
    { name: 'Yorug\'lik', code: 'LIGHT', type: DepartmentType.DEPARTMENT },
    { name: 'Monitor va texnika', code: 'TECH', type: DepartmentType.DEPARTMENT },
    { name: 'Boshlovchilar', code: 'HOST', type: DepartmentType.DEPARTMENT },
    { name: 'Dizayn', code: 'DESIGN', type: DepartmentType.DEPARTMENT },
    { name: 'Ssenariy', code: 'SCRIPT', type: DepartmentType.DEPARTMENT },
    { name: 'SMM va marketing', code: 'SMM', type: DepartmentType.DEPARTMENT },
    { name: 'Prodakshn — asosiy', code: 'PROD1', type: DepartmentType.PRODUCTION },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      create: { ...dept, scheduleId: schedule.id },
      update: {},
    });
  }
  console.log(`  ✓ ${departments.length} ta bo'lim`);

  // ---------- 4. Jamoa rollari ----------
  const crewRoles = [
    { name: 'Operator', code: 'OPERATOR', dept: 'OPER', sortOrder: 1 },
    { name: 'Boshlovchi', code: 'HOST', dept: 'HOST', sortOrder: 2 },
    { name: 'Montajchi', code: 'EDITOR', dept: 'MONTAJ', sortOrder: 3 },
    { name: 'Chiroqchi', code: 'LIGHT', dept: 'LIGHT', sortOrder: 4 },
    { name: 'Monitorchi', code: 'MONITOR', dept: 'TECH', sortOrder: 5 },
    { name: 'Rejissor', code: 'DIRECTOR', dept: 'PROD1', sortOrder: 6 },
    { name: 'Ssenariynavis', code: 'WRITER', dept: 'SCRIPT', sortOrder: 7 },
    { name: 'Dizayner', code: 'DESIGNER', dept: 'DESIGN', sortOrder: 8 },
  ];

  for (const role of crewRoles) {
    const department = await prisma.department.findUnique({ where: { code: role.dept } });
    await prisma.crewRole.upsert({
      where: { code: role.code },
      create: {
        name: role.name,
        code: role.code,
        departmentId: department?.id,
        sortOrder: role.sortOrder,
      },
      update: { departmentId: department?.id },
    });
  }
  console.log(`  ✓ ${crewRoles.length} ta jamoa roli`);

  // ---------- 5. Administrator ----------
  const adminDept = await prisma.department.findUnique({ where: { code: 'ADMIN' } });
  const adminEmail = 'admin@zorteam.uz';
  const adminPassword = 'admin12345';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      fullName: 'Tizim administratori',
      position: 'Administrator',
      email: adminEmail,
      phone: '+998900000000',
      roles: [SystemRole.ADMIN],
      departmentId: adminDept?.id,
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
    update: {},
  });
  console.log(`  ✓ Administrator: ${adminEmail} / ${adminPassword}`);

  // ---------- 6. Baholash qoidalari ----------
  const existingRules = await prisma.evaluationRule.count();
  if (existingRules === 0) {
    await prisma.evaluationRule.create({
      data: {
        name: "Bo'lim rahbari — hodimni baholaydi",
        targetType: EvaluationTargetType.USER,
        trigger: EvaluationTrigger.AFTER_EPISODE,
        evaluatorKind: EvaluatorKind.DEPARTMENT_HEAD,
        windowHours: 48,
        criteria: {
          create: [
            { name: 'Vaqtida kelish va intizom', weight: 1, maxScore: 5, sortOrder: 1 },
            { name: 'Ish sifati', weight: 2, maxScore: 5, sortOrder: 2 },
            { name: 'Jamoaviy ish', weight: 1, maxScore: 5, sortOrder: 3 },
            { name: 'Tashabbuskorlik', weight: 1, maxScore: 5, sortOrder: 4 },
          ],
        },
      },
    });

    await prisma.evaluationRule.create({
      data: {
        name: "Jamoa a'zosi — prodakshnni baholaydi",
        targetType: EvaluationTargetType.SHOW,
        trigger: EvaluationTrigger.AFTER_EPISODE,
        evaluatorKind: EvaluatorKind.ASSIGNED_CREW,
        windowHours: 48,
        criteria: {
          create: [
            { name: 'Tashkilotchilik', weight: 2, maxScore: 5, sortOrder: 1 },
            { name: "Texnika va jihozlar holati", weight: 1, maxScore: 5, sortOrder: 2 },
            { name: "Vaqtdan foydalanish", weight: 1, maxScore: 5, sortOrder: 3 },
            { name: 'Muhit va munosabat', weight: 1, maxScore: 5, sortOrder: 4 },
          ],
        },
      },
    });
    console.log('  ✓ 2 ta baholash qoidasi');
  }

  // ---------- 7. Bayram kunlari (2026) ----------
  const holidays = [
    { date: '2026-01-01', name: 'Yangi yil' },
    { date: '2026-03-08', name: 'Xotin-qizlar kuni' },
    { date: '2026-03-21', name: 'Navro\'z' },
    { date: '2026-05-09', name: 'Xotira va qadrlash kuni' },
    { date: '2026-09-01', name: 'Mustaqillik kuni' },
    { date: '2026-10-01', name: "O'qituvchi va murabbiylar kuni" },
    { date: '2026-12-08', name: 'Konstitutsiya kuni' },
  ];

  for (const holiday of holidays) {
    await prisma.calendarDay.upsert({
      where: { date: new Date(`${holiday.date}T00:00:00.000Z`) },
      create: {
        date: new Date(`${holiday.date}T00:00:00.000Z`),
        name: holiday.name,
        isWorkday: false,
      },
      update: {},
    });
  }
  console.log(`  ✓ ${holidays.length} ta bayram kuni`);

  console.log('\nTayyor. Admin panelga kirish:');
  console.log(`   Login:  ${adminEmail}`);
  console.log(`   Parol:  ${adminPassword}`);
  console.log('\n⚠️  Birinchi kirishdan keyin parolni almashtiring va ofis koordinatasini kiriting.\n');
}

main()
  .catch((error) => {
    console.error('Seed xatosi:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
