export type RepeatMode = 'once' | 'daily' | 'weekly';

export type Category = 'personal' | 'work' | 'health' | 'errand' | 'other';

export interface Reminder {
  id: string;
  title: string;
  /** ISO date string (YYYY-MM-DD) — the calendar day the reminder is anchored to */
  date: string;
  /** 24h "HH:mm" */
  time: string;
  repeat: RepeatMode;
  enabled: boolean;
  category: Category;
  /** Expo notification identifier currently scheduled for this reminder, if any */
  notificationId: string | null;
  createdAt: number;
}

export type ReminderDraft = Omit<Reminder, 'id' | 'createdAt' | 'notificationId'>;
