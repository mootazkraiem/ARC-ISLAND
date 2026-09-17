import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Reminder } from './types';

export const CATEGORY_REMINDER = 'reminder-actions';
// A new channel id on purpose, not a rename of the old 'reminders-soft' one:
// Android locks a channel's sound/importance/vibration to whatever they were
// the first time that channel id was created on a given device — calling
// setNotificationChannelAsync again with different settings under the same
// id is silently ignored on devices that already have it. A fresh id is the
// only reliable way to actually change these settings for anyone who's
// already run the app before.
const CHANNEL_ID = 'reminders-alarm';
// Bundled via the expo-notifications config plugin's "sounds" entry in
// app.json (assets/sounds/reminder_alarm.wav) — a short, distinct 3-beep
// tone instead of the platform's default message sound. Used on both the
// Android channel (which is what actually controls sound on Android 8+;
// per-notification `sound` is ignored there) and the iOS content (where
// there's no channel concept, so it has to be set per-notification).
// NOTE: custom bundled sounds only play in a development/EAS build —
// Expo Go can't include a project's native assets, so in Expo Go this falls
// back to the system default sound. Everything else here (channel
// importance, the vibration pattern, heads-up behavior, Done/Snooze) works
// in Expo Go today; the custom tone is the one piece that needs a real build
// to actually hear.
const REMINDER_SOUND = 'reminder_alarm.wav';

// expo-notifications lists Android/iOS only for every API used in this file
// — there is no Web row anywhere in its docs, including for
// setNotificationHandler below, which runs at import time. Guarding it (and
// every exported function) for web is what keeps `import './notifications'`
// from throwing before the app even renders. This is a web-only early
// return, not a reimplementation: the native Android/iOS behavior below —
// channels, categories, triggers, sound — is untouched.
if (Platform.OS !== 'web') {
  // Foreground presentation: still show a native-style banner + soft vibration
  // even while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function initNotifications() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync(CATEGORY_REMINDER, [
    {
      identifier: 'DONE',
      buttonTitle: 'Done',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'SNOOZE',
      buttonTitle: 'Snooze 10m',
      options: { opensAppToForeground: false },
    },
  ]);

  if (Platform.OS === 'android') {
    // Alarm-style, not a chat ping: max importance (heads-up + sound even
    // over other apps), a longer/insistent four-pulse buzz instead of the
    // old soft double-pulse, and the dedicated reminder_alarm.wav tone
    // instead of the system default. lightColor uses the app's own "due"
    // accent (see theme.ts) so it visually reads as urgent too.
    // Pattern is [wait, vibrate, wait, vibrate...] in ms.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders (alarm)',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400, 200, 400],
      enableVibrate: true,
      lightColor: '#FF7A59',
      sound: REMINDER_SOUND,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  // Scheduled/triggered local notifications aren't supported on web at all
  // (see the file-level note above), so there is nothing meaningful to ask
  // permission for here. Returning true (rather than false) specifically
  // skips App.tsx's "Notifications disabled — enable them in Settings"
  // alert, which would be a confusing, native-only instruction in a browser
  // tab. Reminders still fully work as list items on web; they just won't
  // pop an OS-level alert at their scheduled time.
  if (Platform.OS === 'web') return true;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
    },
  });
  return requested.granted;
}

function weekdayFromISODate(iso: string): number {
  // Expo weekday: Sunday = 1 ... Saturday = 7
  const d = new Date(`${iso}T00:00:00`);
  return d.getDay() + 1;
}

// SDK 57's expo-notifications requires the typed trigger shape
// (a `type: SchedulableTriggerInputTypes.X` discriminant) — the old bare
// { hour, minute, repeats: true } object this used to accept on SDK 51 no
// longer type-checks (and per Expo's changelog, is no longer guaranteed to
// schedule correctly either). Daily/weekly triggers imply repeats — there's
// no `repeats` field to set on those types.
function buildTrigger(
  reminder: Pick<Reminder, 'date' | 'time' | 'repeat'>
): Notifications.SchedulableNotificationTriggerInput {
  const [hour, minute] = reminder.time.split(':').map(Number);

  if (reminder.repeat === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    };
  }

  if (reminder.repeat === 'weekly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: weekdayFromISODate(reminder.date),
      hour,
      minute,
      channelId: CHANNEL_ID,
    };
  }

  // once — fire at the specific date+time
  const fireDate = new Date(`${reminder.date}T00:00:00`);
  fireDate.setHours(hour, minute, 0, 0);
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: fireDate,
    channelId: CHANNEL_ID,
  };
}

export async function cancelScheduledNotification(notificationId: string | null) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    // Already fired/cancelled — safe to ignore.
  }
}

/** Cancels any existing notification for this reminder and schedules a fresh one
 * if the reminder is enabled. Returns the new notification id (or null if disabled). */
export async function syncNotificationForReminder(
  reminder: Reminder
): Promise<string | null> {
  // No-op on web — see the file-level note above. Returning null (the same
  // value used for "disabled") keeps every caller's shape identical; the
  // reminder itself still saves and shows normally in the list.
  if (Platform.OS === 'web') return null;

  await cancelScheduledNotification(reminder.notificationId);

  if (!reminder.enabled) return null;

  const trigger = buildTrigger(reminder);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Reminder',
      body: reminder.title,
      // Android 8+ ignores this and uses the channel's sound instead (see
      // setNotificationChannelAsync above) — set here too since iOS has no
      // channel concept and reads sound per-notification.
      sound: REMINDER_SOUND,
      // iOS 15+: asks to break through Focus modes / Do Not Disturb like a
      // time-sensitive alert rather than a normal notification. 'critical'
      // would be stronger still but requires a special Apple entitlement
      // that has to be requested and approved per-app — out of reach here.
      interruptionLevel: 'timeSensitive',
      categoryIdentifier: CATEGORY_REMINDER,
      data: { reminderId: reminder.id },
    },
    trigger,
  });
  return id;
}

export async function scheduleSnooze(reminder: Reminder, minutes = 10) {
  if (Platform.OS === 'web') return;
  const fireDate = new Date(Date.now() + minutes * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Reminder (snoozed)',
      body: reminder.title,
      sound: REMINDER_SOUND,
      interruptionLevel: 'timeSensitive',
      categoryIdentifier: CATEGORY_REMINDER,
      data: { reminderId: reminder.id, snoozed: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: CHANNEL_ID,
    },
  });
}
