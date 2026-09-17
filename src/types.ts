export type RepeatMode = 'once' | 'daily' | 'weekly';

export type Category = 'personal' | 'work' | 'health' | 'errand' | 'other';

export interface Reminder {
  id: string;
  title: string;
  /** ISO date string (YYYY-MM-DD) — the calendar day the reminder is anchored to */
  date: string;
  /** 24h "HH:mm" */
  time: string;
  /** How long the quest occupies in the Quest Calendar, in minutes.
   * Optional and defaults to DEFAULT_QUEST_MINUTES — every quest created
   * before the calendar existed simply has no value here, which is why
   * this is not required. It is display/scheduling geometry only: the
   * notification engine still fires at `time` exactly as before and never
   * reads this field. */
  durationMin?: number;
  repeat: RepeatMode;
  enabled: boolean;
  category: Category;
  /** Expo notification identifier currently scheduled for this reminder, if any */
  notificationId: string | null;
  createdAt: number;
}

export type ReminderDraft = Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>;
