import { Keyboard, InlineKeyboard } from 'grammy';

export const BTN = {
  CHECK_IN: '📍 Belgilanish',
  MY_ATTENDANCE: '📅 Davomatim',
  MY_TASKS: '📋 Topshiriqlarim',
  MY_SHOWS: '🎬 Ko\'rsatuvlarim',
  FEEDBACK: '✉️ Maxfiy murojaat',
  HELP: 'ℹ️ Yordam',
  SEND_LOCATION: '📍 Joylashuvni yuborish',
  CANCEL: '❌ Bekor qilish',
  SHARE_CONTACT: '📱 Raqamni yuborish',
} as const;

/** Asosiy menyu — hodim botni ochganda ko'radigan tugmalar */
export function mainMenu() {
  return new Keyboard()
    .text(BTN.CHECK_IN)
    .text(BTN.MY_ATTENDANCE)
    .row()
    .text(BTN.MY_TASKS)
    .text(BTN.MY_SHOWS)
    .row()
    .text(BTN.FEEDBACK)
    .text(BTN.HELP)
    .resized()
    .persistent();
}

/** Mini App'ni ochadigan tugma — jonli kamera va GPS shu yerda */
export function checkInButton(miniAppUrl: string, label = '📍 Belgilanish') {
  return new InlineKeyboard().webApp(label, miniAppUrl);
}

/** Zaxira usul: chatga lokatsiya yuborish */
export function locationRequestKeyboard() {
  return new Keyboard()
    .requestLocation(BTN.SEND_LOCATION)
    .row()
    .text(BTN.CANCEL)
    .resized()
    .oneTime();
}

/** Ro'yxatdan o'tishda telefon raqamni so'rash */
export function contactRequestKeyboard() {
  return new Keyboard().requestContact(BTN.SHARE_CONTACT).resized().oneTime();
}

/** Tasdiqlovchi rahbar uchun: yo'qlik so'rovini tasdiqlash/rad etish */
export function absenceDecisionKeyboard(absenceId: string) {
  return new InlineKeyboard()
    .text('✅ Tasdiqlash', `absence:approve:${absenceId}`)
    .text('❌ Rad etish', `absence:reject:${absenceId}`);
}

/** Ko'rsatuvga biriktirilganda hodim javobi */
export function assignmentKeyboard(assignmentId: string) {
  return new InlineKeyboard()
    .text('✅ Tasdiqlayman', `assign:confirm:${assignmentId}`)
    .text('❌ Ishtirok eta olmayman', `assign:decline:${assignmentId}`);
}

/** Bo'limlararo so'rov: rahbar javobi */
export function taskDecisionKeyboard(taskId: string, miniAppUrl: string) {
  return new InlineKeyboard()
    .webApp('👤 Ijrochi va muddat belgilash', `${miniAppUrl}/tasks/${taskId}`)
    .row()
    .text('❌ Rad etish', `task:reject:${taskId}`);
}

export function openMiniApp(url: string, label: string) {
  return new InlineKeyboard().webApp(label, url);
}
