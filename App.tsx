import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { Reminder, ReminderDraft } from './src/types';
import { theme } from './src/theme';
import { loadReminders, saveReminders } from './src/storage';
import {
  initNotifications,
  requestNotificationPermissions,
  scheduleSnooze,
  syncNotificationForReminder,
} from './src/notifications';
import { HomeScreen } from './src/screens/HomeScreen';
import { EditorScreen } from './src/screens/EditorScreen';
import { AssistantScreen } from './src/screens/AssistantScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { IdeaVaultScreen } from './src/screens/IdeaVaultScreen';
import { UnlockToast } from './src/components/UnlockToast';
import { DayRecapModal } from './src/components/DayRecapModal';
import { LevelUpModal } from './src/components/LevelUpModal';
import { parseQuickAdd } from './src/nlParse';
import { Progression } from './src/progression/engine';
import { CardUnlockInfo, CompletionResult, DailyLogEntry, LevelInfo } from './src/progression/types';
import { Vault } from './src/thoughts/vault';
import { useDesignSystemFonts } from './src/fonts';

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

type Screen =
  | { name: 'home' }
  | { name: 'editor'; reminder: Reminder | null; prefill?: ReminderDraft | null }
  | { name: 'assistant' }
  | { name: 'settings'; from: 'home' | 'assistant' }
  | { name: 'progress' }
  | { name: 'collection' }
  | { name: 'ideaVault' };

export default function App() {
  const [fontsLoaded] = useDesignSystemFonts();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [unlockQueue, setUnlockQueue] = useState<CardUnlockInfo[]>([]);
  const [dayRecap, setDayRecap] = useState<DailyLogEntry | null>(null);
  const [levelUp, setLevelUp] = useState<LevelInfo | null>(null);
  const remindersRef = useRef<Reminder[]>([]);
  remindersRef.current = reminders;

  useEffect(() => {
    (async () => {
      await initNotifications();
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications disabled',
          'Enable notifications in Settings so reminders can alert you.'
        );
      }
      const [stored] = await Promise.all([loadReminders(), Progression.init(), Vault.init()]);
      setReminders(stored);
      setReady(true);
      const recap = await Progression.consumeYesterdayRecapIfDue();
      if (recap) setDayRecap(recap);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveReminders(reminders);
  }, [reminders, ready]);

  // Handle notification action buttons (Done / Snooze) — fires even if the
  // app was backgrounded or killed and gets relaunched by the tap.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const reminderId = response.notification.request.content.data?.reminderId as
        | string
        | undefined;
      const actionId = response.actionIdentifier;
      if (!reminderId) return;

      const current = remindersRef.current.find((r) => r.id === reminderId);
      if (!current) return;

      if (actionId === 'SNOOZE') {
        await scheduleSnooze(current);
        return;
      }

      if (actionId === 'DONE') {
        await completeReminder(reminderId);
      }
    });
    return () => sub.remove();
  }, []);

  const applyReminderUpdate = async (updated: Reminder) => {
    const notificationId = await syncNotificationForReminder(updated);
    const final = { ...updated, notificationId };
    setReminders((prev) => {
      const exists = prev.some((r) => r.id === final.id);
      return exists ? prev.map((r) => (r.id === final.id ? final : r)) : [...prev, final];
    });
  };

  const handleSave = async (draft: ReminderDraft) => {
    const editing = screen.name === 'editor' ? screen.reminder : null;
    const base: Reminder = editing
      ? { ...editing, ...draft }
      : {
          id: genId(),
          notificationId: null,
          createdAt: Date.now(),
          ...draft,
        };
    await applyReminderUpdate(base);
    setScreen({ name: 'home' });
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const target = reminders.find((r) => r.id === id);
    if (!target) return;
    await applyReminderUpdate({ ...target, enabled });
  };

  const handleDelete = async (id: string) => {
    const target = reminders.find((r) => r.id === id);
    if (target?.notificationId) {
      await syncNotificationForReminder({ ...target, enabled: false });
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setScreen({ name: 'home' });
  };

  // The single funnel every "I did this" moment goes through — swipe-done on
  // Home, the Today's Path checklist, the notification's Done action, and
  // Nudge's complete_reminder tool all call this same function. This is the
  // ReminderCompleted → ProgressionEngine boundary from the architecture:
  // the reminder engine only knows "disable if one-off"; everything about
  // XP, skills, streaks, and card unlocks lives entirely in Progression and
  // never leaks back into notification/storage logic.
  const completeReminder = async (id: string): Promise<CompletionResult | null> => {
    const target = reminders.find((r) => r.id === id);
    if (!target) return null;

    // One-off reminders are done once fired; repeating ones stay scheduled
    // — completing today doesn't cancel tomorrow's occurrence.
    if (target.repeat === 'once') {
      await applyReminderUpdate({ ...target, enabled: false });
    }

    const result = await Progression.recordCompletion({
      reminderId: target.id,
      title: target.title,
      category: target.category,
      at: new Date(),
    });

    if (result.unlockedCards.length > 0) {
      setUnlockQueue((prev) => [...prev, ...result.unlockedCards]);
    }
    // Level-up takes priority in the UI (it's the rarer, bigger moment) —
    // the unlock toast queue still runs underneath/after it.
    if (result.leveledUp) {
      setLevelUp(result.newLevel);
    }

    return result;
  };

  const handleQuickAdd = (parsed: ReturnType<typeof parseQuickAdd>) => {
    setScreen({
      name: 'editor',
      reminder: null,
      prefill: { ...parsed, enabled: true },
    });
  };

  // Used by the voice assistant to create a reminder directly (no editor
  // confirmation step — the model already resolved date/time/category, and
  // the spoken reply is the confirmation). Returns the new reminder's id so
  // callers like promote_idea can link a project to its first task.
  const handleAssistantCreate = async (draft: ReminderDraft): Promise<string> => {
    const id = genId();
    await applyReminderUpdate({
      id,
      notificationId: null,
      createdAt: Date.now(),
      ...draft,
    });
    return id;
  };

  if (!ready) {
    return <View style={styles.flexBg} />;
  }

  return (
    <GestureHandlerRootView style={styles.flexBg}>
      <StatusBar barStyle="light-content" />
      {screen.name === 'home' ? (
        <HomeScreen
          reminders={reminders}
          onAdd={() => setScreen({ name: 'editor', reminder: null })}
          onEdit={(r) => setScreen({ name: 'editor', reminder: r })}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onComplete={completeReminder}
          onQuickAdd={handleQuickAdd}
          onOpenAssistant={() => setScreen({ name: 'assistant' })}
          onOpenProgress={() => setScreen({ name: 'progress' })}
          onOpenIdeaVault={() => setScreen({ name: 'ideaVault' })}
        />
      ) : screen.name === 'editor' ? (
        <EditorScreen
          initial={screen.reminder}
          prefill={screen.prefill}
          onSave={handleSave}
          onCancel={() => setScreen({ name: 'home' })}
          onDelete={handleDelete}
        />
      ) : screen.name === 'assistant' ? (
        <AssistantScreen
          reminders={reminders}
          onCreate={handleAssistantCreate}
          onComplete={completeReminder}
          onDelete={handleDelete}
          onOpenSettings={() => setScreen({ name: 'settings', from: 'assistant' })}
          onOpenIdeaVault={() => setScreen({ name: 'ideaVault' })}
          onBack={() => setScreen({ name: 'home' })}
        />
      ) : screen.name === 'settings' ? (
        <SettingsScreen
          onBack={() =>
            screen.from === 'assistant' ? setScreen({ name: 'assistant' }) : setScreen({ name: 'home' })
          }
        />
      ) : screen.name === 'progress' ? (
        <ProgressScreen
          onBack={() => setScreen({ name: 'home' })}
          onOpenCollection={() => setScreen({ name: 'collection' })}
        />
      ) : screen.name === 'collection' ? (
        <CollectionScreen onBack={() => setScreen({ name: 'progress' })} />
      ) : (
        <IdeaVaultScreen onBack={() => setScreen({ name: 'home' })} />
      )}

      {unlockQueue.length > 0 && (
        <UnlockToast
          unlock={unlockQueue[0]}
          onPress={() => {
            setUnlockQueue((prev) => prev.slice(1));
            setScreen({ name: 'collection' });
          }}
          onDismiss={() => setUnlockQueue((prev) => prev.slice(1))}
        />
      )}

      <DayRecapModal entry={dayRecap} onClose={() => setDayRecap(null)} />
      <LevelUpModal level={levelUp} onClose={() => setLevelUp(null)} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flexBg: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: Platform.OS === 'android' ? 24 : 0,
  },
});
