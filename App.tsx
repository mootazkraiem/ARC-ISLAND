import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { Reminder, ReminderDraft } from './src/types';
import { safeAlert } from './src/alert';
import { startWebReminderAlerts, stopWebReminderAlerts } from './src/webReminderAlerts';
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
import { SystemScreen, SystemMode } from './src/screens/SystemScreen';
import { QuestCalendarScreen } from './src/screens/QuestCalendarScreen';
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
import { WeekProposal, blockToDraft, buildProposal } from './src/system/forge';

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

type Screen =
  | { name: 'home' }
  | { name: 'editor'; reminder: Reminder | null; prefill?: ReminderDraft | null }
  | { name: 'system'; mode?: SystemMode }
  | { name: 'calendar' }
  | { name: 'settings'; from: 'home' | 'system' }
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
  // A forged week awaiting the user's decision. Held here, at the top, so
  // the System screen (which produces it) and the Quest Calendar (which
  // renders and commits it) see the same one. Intentionally NOT persisted:
  // an uncommitted proposal should not survive a reload and quietly reappear
  // as if it were real schedule.
  const [proposal, setProposal] = useState<WeekProposal | null>(null);
  const remindersRef = useRef<Reminder[]>([]);
  remindersRef.current = reminders;

  useEffect(() => {
    (async () => {
      await initNotifications();
      const granted = await requestNotificationPermissions();
      if (!granted) {
        safeAlert(
          'The System cannot summon you',
          'Enable notifications so quests can alert you when their hour arrives.'
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

  // Web has no OS-level scheduled notifications at all (see
  // src/notifications.ts) — this starts the real substitute: a foreground
  // poll that fires an actual desktop notification + the alarm sound while
  // this tab/window stays open. No-ops immediately on native.
  useEffect(() => {
    if (!ready || Platform.OS !== 'web') return;
    startWebReminderAlerts(() => remindersRef.current);
    return () => stopWebReminderAlerts();
  }, [ready]);

  // Handle notification action buttons (Done / Snooze). expo-notifications
  // has no web implementation, and quests never schedule a real OS
  // notification on web, so there is nothing for this listener to receive
  // there — skipping registration entirely is safer than relying on an
  // unsupported-platform call being a harmless no-op.
  useEffect(() => {
    if (Platform.OS === 'web') return;
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

  /** Drag/resize on the Quest Calendar lands here. It is deliberately the
   * SAME applyReminderUpdate path as an editor save — moving a quest on the
   * calendar re-syncs its alarm exactly as editing it by hand would, so the
   * calendar can never drift out of step with what will actually fire. */
  const handleReschedule = useCallback(
    async (reminder: Reminder, next: { date: string; time: string; durationMin: number }) => {
      await applyReminderUpdate({ ...reminder, ...next });
    },
    []
  );

  // The single funnel every "I did this" moment goes through — swipe-done on
  // Home, the Quests of the Day checklist, the calendar block, the
  // notification's Done action, and the System's complete_quest tool all
  // call this same function.
  const completeReminder = async (id: string): Promise<CompletionResult | null> => {
    const target = remindersRef.current.find((r) => r.id === id);
    if (!target) return null;

    // One-off quests are done once fired; repeating ones stay scheduled —
    // completing today doesn't cancel tomorrow's occurrence.
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

  // Used by the System to register a quest directly (no editor confirmation
  // step — the model already resolved date/time/category, and the spoken
  // reply is the confirmation). Returns the new id so promote_idea can link
  // a project to its first quest.
  const handleSystemCreate = async (draft: ReminderDraft): Promise<string> => {
    const id = genId();
    await applyReminderUpdate({
      id,
      notificationId: null,
      createdAt: Date.now(),
      ...draft,
    });
    return id;
  };

  /** The System's propose_week tool lands here. This writes NOTHING to the
   * reminder store — it only parks an inert proposal for the Quest Calendar
   * to draw. Committing it is a separate, explicit user action below. */
  const handleProposeWeek = useCallback((blocks: unknown, summary: string) => {
    const { proposal: built, rejected } = buildProposal(blocks, summary, remindersRef.current);
    setProposal(built);
    return { count: built?.blocks.length ?? 0, rejected };
  }, []);

  /** ACCEPT — the only place a proposal becomes real. Each block goes
   * through the same create path as any other quest, so notifications,
   * storage and XP all behave identically. Existing quests are untouched:
   * a forge can only ever add. */
  const handleAcceptProposal = useCallback(async () => {
    const current = proposal;
    if (!current) return;
    for (const block of current.blocks) {
      await handleSystemCreate(blockToDraft(block));
    }
    setProposal(null);
  }, [proposal]);

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
          onOpenSystem={() => setScreen({ name: 'system' })}
          onOpenProgress={() => setScreen({ name: 'progress' })}
          onOpenIdeaVault={() => setScreen({ name: 'ideaVault' })}
          onOpenCalendar={() => setScreen({ name: 'calendar' })}
          hasProposal={!!proposal}
        />
      ) : screen.name === 'editor' ? (
        <EditorScreen
          initial={screen.reminder}
          prefill={screen.prefill}
          onSave={handleSave}
          onCancel={() => setScreen({ name: 'home' })}
          onDelete={handleDelete}
        />
      ) : screen.name === 'system' ? (
        <SystemScreen
          reminders={reminders}
          onCreate={handleSystemCreate}
          onComplete={completeReminder}
          onDelete={handleDelete}
          onProposeWeek={handleProposeWeek}
          onOpenSettings={() => setScreen({ name: 'settings', from: 'system' })}
          onOpenIdeaVault={() => setScreen({ name: 'ideaVault' })}
          onOpenCalendar={() => setScreen({ name: 'calendar' })}
          onBack={() => setScreen({ name: 'home' })}
          initialMode={screen.mode}
          activeProposal={proposal}
        />
      ) : screen.name === 'calendar' ? (
        <QuestCalendarScreen
          reminders={reminders}
          onBack={() => setScreen({ name: 'home' })}
          onOpenQuest={(r) => setScreen({ name: 'editor', reminder: r })}
          onCompleteQuest={(id) => { completeReminder(id); }}
          onReschedule={handleReschedule}
          onClaimAt={(dateISO, time) =>
            setScreen({
              name: 'editor',
              reminder: null,
              prefill: { title: '', date: dateISO, time, repeat: 'once', category: 'personal', enabled: true },
            })
          }
          onOpenSystem={() => setScreen({ name: 'system', mode: 'forge' })}
          proposal={proposal}
          onAcceptProposal={handleAcceptProposal}
          onRejectProposal={() => setProposal(null)}
          onReviseProposal={() => setScreen({ name: 'system', mode: 'forge' })}
        />
      ) : screen.name === 'settings' ? (
        <SettingsScreen
          onBack={() =>
            screen.from === 'system' ? setScreen({ name: 'system' }) : setScreen({ name: 'home' })
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
