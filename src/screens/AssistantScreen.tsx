import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// expo-av was removed as of Expo SDK 55 — recording now lives in
// expo-audio, split out from playback/video.
// NOTE: an earlier pass here tried `new AudioRecorder(preset)` — that's
// wrong. `AudioRecorder` is exported from expo-audio only as a TypeScript
// *type*, not a constructable value; expo-audio's own source only ever
// instantiates it internally, via the native module's own AudioRecorder
// property, from inside the useAudioRecorder() hook. Calling `new` on the
// (undefined-at-runtime) type import is exactly what threw "undefined
// cannot be used as a constructor". The hook is the only supported way to
// get an instance, so it's called once at the top of this component below,
// and startRecording/stopRecordingAndRespond just call methods on it.
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Reminder, ReminderDraft } from '../types';
import { theme, colors } from '../theme';
import { PulseOrb, OrbState } from '../components/PulseOrb';
import { ListeningWave, ThinkingDots } from '../components/NudgeVoiceViz';
import { resolveApiKey } from '../assistant/apiKeyStore';
import { ChatMessage, chatCompletion, transcribeAudio } from '../assistant/aiClient';
import { executeTool, toolDefinitions } from '../assistant/tools';
import { CompletionResult } from '../progression/types';

interface Props {
  reminders: Reminder[];
  onCreate: (draft: ReminderDraft) => Promise<string>;
  onComplete: (id: string) => Promise<CompletionResult | null>;
  onDelete: (id: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenIdeaVault: () => void;
  onBack: () => void;
}

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

function systemPrompt(): string {
  const now = new Date();
  return [
    'You are Nudge, a tiny, warm, no-nonsense voice assistant built into a personal progression system — reminders feed XP, skills, streaks, and a collectible card archive, and a separate Idea Vault holds things that are not yet actionable.',
    'Keep every reply to one or two short sentences — it will be read aloud, so no lists, no markdown, no emoji.',
    `Right now it is ${now.toLocaleDateString('en-CA')} (YYYY-MM-DD) at ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} local time, which is a ${now.toLocaleDateString(undefined, { weekday: 'long' })}.`,
    'Resolve relative dates/times ("tonight", "tomorrow morning", "in an hour", "next Friday") against that. Always pass add_reminder a concrete date (YYYY-MM-DD) and 24h time (HH:mm) — never words.',
    // ---- classification: the core of this feature ----
    'Before acting, decide what kind of thing the user just said. Categories: REMINDER (a concrete action with a specific or clearly implied time — schedule it), TASK/GOAL (a concrete thing they need to do but with no specific time, e.g. "I need to finish my report this week"), IDEA (a possibility, speculation, or "what if" — not a commitment), THOUGHT (a passing reflection worth keeping), NOTE (information to retain, "remember that..."), EXPERIMENT (something to try/test before committing), PROJECT (an explicit, committed, multi-step undertaking — "let\'s build," "I\'m going to make," "turn that into a project").',
    'REMINDER: call add_reminder directly. This is the only type you act on immediately without asking anything.',
    'TASK/GOAL with no time given: do NOT silently create a reminder for a guessed time. Say what you noticed ("That sounds like something to get done rather than a scheduled reminder") and ask either what time works, or offer to save it as an idea/goal to organize later — let the user pick.',
    'IDEA / THOUGHT / NOTE / EXPERIMENT: call save_idea with the right kind. NEVER create a reminder or project for these. After saving, briefly reflect it back and mention it is in the Idea Vault — do not push the user to do anything with it. Phrases like "what if we...", "I have an idea...", "remember that...", "try..." usually signal these.',
    'PROJECT: only call promote_idea (or, if there is no matching saved idea yet, save_idea first and tell the user, then only promote after they confirm) when the user\'s intent to commit is explicit — "let\'s build X", "start the X project", "turn that into a project", "yes, make it a project". Ambiguous excitement ("what if we built...") is an IDEA, not a project, even if it sounds big. If someone describes something that is clearly multi-step but hasn\'t clearly committed, say so plainly — e.g. "That sounds bigger than a single task, more like a project. Want me to save it as an idea for now, or set it up as a project?" — and wait for their answer. Never create a project silently.',
    'When you do promote_idea, generate exactly ONE small, honest first milestone and ONE tiny first task — never a long plan or many tasks.',
    'update_idea_status with status "dismissed": call it once WITHOUT confirmed:true first — it will return needsConfirmation and the idea\'s exact title. Ask the user to confirm by that name ("Just to confirm, forget \'X\'?") and only call it again with confirmed:true after a clear yes. This mirrors how deleting a reminder always asks first.',
    'Use the tools to actually add, list, complete, or delete reminders whenever the user asks for one of those things — do not just say you will, call the tool.',
    'When complete_reminder succeeds, its result includes xpGained, skillGains, newLevel, currentStreak, and possibly newlyUnlockedCards — mention the concrete numbers naturally, e.g. "Nice, that\'s +30 XP toward Focus, level 4 now." If newlyUnlockedCards is non-empty, say the card name with a little warmth, like a real discovery. If the result says already_counted_today, tell them gently it already counted today rather than reporting XP.',
    'If asked how they are doing, their level, streak, or progress, call get_progress and answer with the real numbers, briefly. If asked to see their ideas, call list_ideas and read back just the titles, capped at a handful, plus the total count.',
    'Never invent XP numbers, idea contents, or project details yourself — only report what came back from a tool call.',
    'If the user is just chatting or asks something unrelated, answer briefly and naturally.',
  ].join(' ');
}

export function AssistantScreen({
  reminders,
  onCreate,
  onComplete,
  onDelete,
  onOpenSettings,
  onOpenIdeaVault,
  onBack,
}: Props) {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [messages, setMessages] = useState<Bubble[]>([
    { id: 'welcome', role: 'assistant', text: "Hey — I'm Nudge. Tap the orb and tell me what to remember." },
  ]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [capturedIdea, setCapturedIdea] = useState<string | null>(null);
  // One recorder instance for the component's whole lifetime — created
  // (correctly) via the hook, then reused across every tap-to-talk cycle
  // via prepareToRecordAsync()/record()/stop(), not recreated each time.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const historyRef = useRef<ChatMessage[]>([]);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const listRef = useRef<FlatList<Bubble>>(null);

  useEffect(() => {
    resolveApiKey().then((k) => setHasKey(!!k));
    return () => {
      Speech.stop();
      recorder.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!capturedIdea) return;
    const t = setTimeout(() => setCapturedIdea(null), 6000);
    return () => clearTimeout(t);
  }, [capturedIdea]);

  const pushBubble = (role: Bubble['role'], text: string) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${role}`, role, text }]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      setOrbState('speaking');
      Speech.stop();
      Speech.speak(text, {
        rate: 1.0,
        pitch: 1.02,
        onDone: () => {
          setOrbState('idle');
          resolve();
        },
        onStopped: () => {
          setOrbState('idle');
          resolve();
        },
        onError: () => {
          setOrbState('idle');
          resolve();
        },
      });
    });

  const runConversationTurn = async (userText: string, apiKey: string) => {
    historyRef.current.push({ role: 'user', content: userText });
    setOrbState('thinking');

    const buildMessages = (): ChatMessage[] => [
      { role: 'system', content: systemPrompt() },
      ...historyRef.current.slice(-10),
    ];

    try {
      let response = await chatCompletion(buildMessages(), toolDefinitions, apiKey);

      if (response.tool_calls && response.tool_calls.length > 0) {
        historyRef.current.push({
          role: 'assistant',
          content: response.content ?? null,
          tool_calls: response.tool_calls,
        });

        for (const call of response.tool_calls) {
          const result = await executeTool(call.function.name, call.function.arguments, {
            getReminders: () => remindersRef.current,
            onCreate,
            onComplete,
            onDelete,
          });
          if (call.function.name === 'save_idea' && (result as any).ok) {
            setCapturedIdea((result as any).saved as string);
          }
          historyRef.current.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        response = await chatCompletion(buildMessages(), toolDefinitions, apiKey);
      }

      const finalText = response.content?.trim() || "Done.";
      historyRef.current.push({ role: 'assistant', content: finalText });
      pushBubble('assistant', finalText);
      await speak(finalText);
    } catch (e: any) {
      const msg = e?.message || 'Something went wrong talking to the assistant.';
      pushBubble('assistant', `Hmm, I hit a snag: ${msg}`);
      setOrbState('idle');
    }
  };

  const startRecording = async () => {
    const key = await resolveApiKey();
    if (!key) {
      Alert.alert('No API key yet', 'Add an OpenRouter API key in Settings to turn the assistant on.');
      onOpenSettings();
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone blocked', 'Enable microphone access in Settings to talk to Nudge.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: false,
      });
      Speech.stop();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setOrbState('listening');
    } catch (e) {
      Alert.alert('Could not start recording', String(e));
    }
  };

  const stopRecordingAndRespond = async () => {
    // orbState already gates this: handleOrbPress only calls this function
    // while orbState === 'listening', i.e. only after startRecording above
    // actually got a recording going — so no extra "is one active" guard
    // is needed here the way the old ref-based version had one.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOrbState('thinking');

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio captured.');

      const key = await resolveApiKey();
      if (!key) throw new Error('Missing API key.');

      const transcript = await transcribeAudio(uri, key);
      if (!transcript) {
        pushBubble('assistant', "I didn't catch that — try again?");
        setOrbState('idle');
        return;
      }
      pushBubble('user', transcript);
      await runConversationTurn(transcript, key);
    } catch (e: any) {
      pushBubble('assistant', `Couldn't process that: ${e?.message ?? e}`);
      setOrbState('idle');
    }
  };

  const handleOrbPress = () => {
    if (orbState === 'idle') startRecording();
    else if (orbState === 'listening') stopRecordingAndRespond();
    else if (orbState === 'speaking') {
      Speech.stop();
      setOrbState('idle');
    }
  };

  const orbLabel =
    orbState === 'idle'
      ? 'Tap to talk'
      : orbState === 'listening'
      ? 'Listening… tap to stop'
      : orbState === 'thinking'
      ? 'Thinking…'
      : 'Speaking… tap to stop';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.title}>Nudge</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={onOpenIdeaVault} hitSlop={12}>
            <Text style={styles.settingsIcon}>💡</Text>
          </Pressable>
          <Pressable onPress={onOpenSettings} hitSlop={12}>
            <Text style={styles.settingsIcon}>⚙︎</Text>
          </Pressable>
        </View>
      </View>

      {capturedIdea && (
        <Pressable
          style={styles.ideaBanner}
          onPress={() => {
            setCapturedIdea(null);
            onOpenIdeaVault();
          }}
        >
          <Text style={styles.ideaBannerTitle}>💡 IDEA CAPTURED</Text>
          <Text style={styles.ideaBannerText} numberOfLines={1}>
            "{capturedIdea}" saved to your Idea Vault.
          </Text>
          <Text style={styles.ideaBannerLink}>View Idea →</Text>
        </Pressable>
      )}

      {hasKey === false && (
        <Pressable style={styles.keyBanner} onPress={onOpenSettings}>
          <Text style={styles.keyBannerText}>Add your OpenRouter API key to turn me on →</Text>
        </Pressable>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>
              {item.text}
            </Text>
          </View>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.orbArea}>
        <View style={styles.orbRow}>
          <Pressable onPress={handleOrbPress} disabled={orbState === 'thinking'}>
            <PulseOrb state={orbState} size={78} />
          </Pressable>
          <View style={styles.orbTextCol}>
            <Text style={styles.orbEyebrow}>NUDGE · {orbState.toUpperCase()}</Text>
            <Text style={styles.orbHeadline}>{orbLabel}</Text>
          </View>
        </View>
        {orbState === 'listening' && <ListeningWave />}
        {orbState === 'thinking' && <ThinkingDots />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing(5),
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(3),
  },
  backText: { color: theme.colors.accent, fontSize: 16, fontWeight: '600' },
  title: { ...theme.font.heading, color: theme.colors.text },
  settingsIcon: { color: theme.colors.textDim, fontSize: 20 },
  keyBanner: {
    marginHorizontal: theme.spacing(5),
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(2),
  },
  keyBannerText: { color: theme.colors.accent, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  ideaBanner: {
    marginHorizontal: theme.spacing(5),
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(2),
  },
  ideaBannerTitle: { ...theme.font.caption, color: '#FFC94E', fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  ideaBannerText: { ...theme.font.body, color: theme.colors.text, fontSize: 13, marginBottom: 2 },
  ideaBannerLink: { ...theme.font.caption, color: theme.colors.accent, fontWeight: '700' },
  chatContent: { paddingHorizontal: theme.spacing(5), paddingVertical: theme.spacing(3), gap: theme.spacing(2) },
  bubble: { maxWidth: '82%', borderRadius: theme.radius.lg, paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(3), marginBottom: theme.spacing(2) },
  bubbleUser: { backgroundColor: theme.colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bubbleAssistant: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  bubbleUserText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  bubbleAssistantText: { color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  orbArea: {
    paddingHorizontal: theme.spacing(5),
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(9),
    gap: theme.spacing(3),
    backgroundColor: colors.sheet,
    borderTopWidth: 1,
    borderTopColor: theme.colors.accentSoft,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    shadowColor: colors.signal,
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -20 },
  },
  orbRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(4) },
  orbTextCol: { flex: 1, gap: 4 },
  orbEyebrow: { ...theme.font.label, fontSize: 10, color: colors.signal },
  orbHeadline: { ...theme.font.heading, fontSize: 17, color: theme.colors.text },
  orbLabel: { ...theme.font.caption, color: theme.colors.textFaint, marginTop: theme.spacing(3) },
});
