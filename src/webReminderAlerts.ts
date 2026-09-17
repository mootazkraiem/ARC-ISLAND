// Web has no equivalent of expo-notifications' OS-level scheduled alerts —
// see the file-level note in src/notifications.ts, which no-ops entirely on
// web. This module is a real, working substitute for the temporary web
// preview: while this tab/window stays open, it polls enabled reminders
// against the current time and fires a genuine desktop notification via the
// browser's own Notification API (a real OS toast, not an in-page banner),
// plus the same bundled alarm sound.
//
// Hard limit, by design, not a bug: this can only fire while the tab/app is
// open and the computer is awake — there is no way for a web page to wake
// itself up after being fully closed without a push server, which is out of
// scope here (no backend, per the project's constraints). That gap is
// exactly the same one every "Native-only" note elsewhere in this project
// already calls out for web.
//
// Completely separate from src/notifications.ts — native iOS/Android
// scheduling is untouched by this file.
import { Asset } from 'expo-asset';
import { Reminder } from './types';

const FIRED_KEY = 'arc_island_web_fired_reminders';
const CHECK_INTERVAL_MS = 15000;
// Catch-up window: covers the gap between poll ticks and a tab that was
// briefly backgrounded/throttled by the browser, without re-firing an old
// reminder from a previous day (the reminder's own date/time already keeps
// this bounded — see the loop below).
const CATCH_UP_WINDOW_MS = 120000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let alarmAudio: any = null;

function getWindow(): any {
  return (globalThis as any).window;
}

function getAlarmSoundUri(): string | null {
  try {
    return Asset.fromModule(require('../assets/sounds/reminder_alarm.wav')).uri;
  } catch {
    return null;
  }
}

function loadFired(): Record<string, '1'> {
  try {
    const raw = getWindow()?.localStorage?.getItem(FIRED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFired(fired: Record<string, '1'>) {
  try {
    getWindow()?.localStorage?.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {
    // Best-effort only — a failed save just means a possible duplicate
    // notification next tick, not a crash.
  }
}

function playAlarmSound() {
  const win = getWindow();
  if (!win) return;
  try {
    if (!alarmAudio) {
      const uri = getAlarmSoundUri();
      if (!uri) return;
      alarmAudio = new win.Audio(uri);
    }
    alarmAudio.currentTime = 0;
    alarmAudio.play?.().catch(() => {
      // Browsers block audio autoplay until the user has interacted with
      // the page at least once this session — not fatal, the visible
      // notification below still fires either way.
    });
  } catch {
    // ignore
  }
}

function fireNotification(reminder: Reminder) {
  const win = getWindow();
  if (!win?.Notification || win.Notification.permission !== 'granted') return;
  try {
    new win.Notification('Reminder', { body: reminder.title, tag: reminder.id });
  } catch {
    // ignore
  }
  playAlarmSound();
}

/** Call once, after reminders have loaded, to start the web-only due-check
 * loop. Safe to call more than once — it always clears any previous
 * interval first. No-ops entirely when `window` doesn't exist (native). */
export function startWebReminderAlerts(getReminders: () => Reminder[]) {
  const win = getWindow();
  if (!win) return;
  stopWebReminderAlerts();

  if (win.Notification && win.Notification.permission === 'default') {
    win.Notification.requestPermission().catch(() => {});
  }

  const fired = loadFired();

  intervalId = setInterval(() => {
    const now = Date.now();
    const todayIso = new Date(now).toISOString().slice(0, 10);
    let changed = false;

    for (const reminder of getReminders()) {
      if (!reminder.enabled) continue;
      const [hour, minute] = reminder.time.split(':').map(Number);
      const due = new Date(`${reminder.date}T00:00:00`);
      due.setHours(hour, minute, 0, 0);
      const dueAt = due.getTime();

      const fireKey = `${reminder.id}:${todayIso}`;
      const isDue = dueAt <= now && now - dueAt < CATCH_UP_WINDOW_MS;
      if (isDue && fired[fireKey] !== '1') {
        fired[fireKey] = '1';
        changed = true;
        fireNotification(reminder);
      }
    }

    if (changed) saveFired(fired);
  }, CHECK_INTERVAL_MS);
}

export function stopWebReminderAlerts() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
