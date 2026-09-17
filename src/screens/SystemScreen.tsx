import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
// expo-av was removed as of Expo SDK 55 — recording now lives in
// expo-audio, split out from playback/video.
// NOTE: an earlier pass here tried `new AudioRecorder(preset)` — that's
// wrong. `AudioRecorder` is exported from expo-audio only as a TypeScript
// *type*, not a constructable value. The hook is the only supported way to
// get an instance, so it's called once at the top of this component below.
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import { isWebSpeechSupported, startWebSpeechRecognition, WebSpeechSession } from '../webSpeechRecognition';
import { Reminder, ReminderDraft } from '../types';
import { fmtDate } from '../locale';
import { theme, colors, font, radii, spacing } from '../theme';
import { SystemOrb, OrbState } from '../components/SystemOrb';
import { SystemPanel } from '../components/SystemPanel';
import { SystemGlyph } from '../components/SystemGlyph';
import { WorldBackground } from '../components/world/WorldBackground';
import { ListeningWave } from '../components/NudgeVoiceViz';
import { resolveApiKey } from '../assistant/apiKeyStore';
import { ChatMessage, chatCompletion, transcribeAudio } from '../assistant/aiClient';
import { executeTool, toolDefinitions } from '../assistant/tools';
import { CompletionResult } from '../progression/types';
import { ForgeBlock, WeekProposal, describeConflicts } from '../system/forge';
import { occurrencesForDay, toISODate } from '../calendar/occurrences';

// ─────────────────────────────────────────────────────────────────────────
// THE SYSTEM — Arc Island's narrator.
//
// This is the renamed, rebuilt assistant screen. The conversation engine,
// tool-calling loop, $0 web voice path, and native voice path are all the
// same proven code; what changed is that the System is now a presence with
// four visible states, an actual spoken greeting when summoned, and a
// second mode — the OVERNIGHT SESSION — in which it listens to a long
// description of a week and forges a proposed schedule.
//
// $0 GUARANTEE (unchanged and re-verified): on web, voice capture AND
// speech-to-text both happen inside the browser via the Web Speech API
// (src/webSpeechRecognition.ts). No audio ever leaves the machine and
// transcribeAudio() throws if it is ever reached from web. Chat uses
// OpenRouter's free router only.
// ─────────────────────────────────────────────────────────────────────────

export type SystemMode = 'converse' | 'forge';

interface Props {
  reminders: Reminder[];
  onCreate: (draft: ReminderDraft) => Promise<string>;
  onComplete: (id: string) => Promise<CompletionResult | null>;
  onDelete: (id: string) => Promise<void>;
  onProposeWeek: (blocks: unknown, summary: string) => { count: number; rejected: number };
  onOpenSettings: () => void;
  onOpenIdeaVault: () => void;
  onOpenCalendar: () => void;
  onBack: () => void;
  /** Starts the screen in overnight/forge mode (entered from the calendar's
   * FORGE MY WEEK action rather than from the orb). */
  initialMode?: SystemMode;
  /** A proposal already on the table — the System acknowledges it instead
   * of forging blindly over the top of it. */
  activeProposal: WeekProposal | null;
}

interface Bubble {
  id: string;
  role: 'user' | 'system';
  text: string;
}

const GREETING_TEXT = 'Welcome to Arc Island system. Do you want to book a quest?';

function scheduleDigest(reminders: Reminder[]): string {
  // A compact, factual snapshot of the next seven days so the System can
  // reason over the user's REAL commitments instead of inventing them.
  const lines: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const occs = occurrencesForDay(reminders, d);
    const label = `${fmtDate(d, { weekday: 'long' })} ${toISODate(d)}`;
    if (occs.length === 0) {
      lines.push(`${label}: clear`);
    } else {
      lines.push(
        `${label}: ${occs.map((o) => `${o.reminder.time} ${o.reminder.title} (${o.durationMin}m)`).join('; ')}`
      );
    }
  }
  const conflicts = describeConflicts(reminders, today, 7);
  if (conflicts.length > 0) lines.push(`Existing conflicts: ${conflicts.join(' | ')}`);
  return lines.join('\n');
}

function systemPrompt(mode: SystemMode, reminders: Reminder[]): string {
  const now = new Date();
  const base = [
    'You are THE SYSTEM of Arc Island — the narrator and scheduling intelligence of a personal progression world. The user is the player. Their commitments are QUESTS; completing quests grants XP, raises skills, extends streaks, and unlocks an archive of discovery cards. A separate Idea Vault holds things that are not yet actionable.',
    'Voice: concise, calm, faintly formal, quietly authoritative. You are a system, not a chirpy assistant. Never say "assistant", "reminder", "to-do", or "task list" — say quest, schedule, the System. Do not over-roleplay, do not use theatrical fantasy language, and never use emoji or markdown. Every reply is read aloud, so keep it to one or two short sentences.',
    'Good phrasings: "Quest registered." "Welcome back." "You have unfinished quests." "I detected an opening in your schedule." "Your schedule contains a conflict. Would you like me to resolve it?"',
    `Right now it is ${now.toLocaleDateString('en-CA')} (YYYY-MM-DD) at ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} local time, which is a ${fmtDate(now, { weekday: 'long' })}.`,
    'Resolve relative dates/times ("tonight", "tomorrow morning", "in an hour", "next Friday") against that. Always pass concrete dates (YYYY-MM-DD) and 24h times (HH:mm) — never words.',
    // ---- classification: the core of this feature ----
    'Before acting, decide what kind of thing the user just said. Categories: QUEST (a concrete action with a specific or clearly implied time — schedule it), TASK/GOAL (a concrete thing they need to do but with no specific time, e.g. "I need to finish my report this week"), IDEA (a possibility, speculation, or "what if" — not a commitment), THOUGHT (a passing reflection worth keeping), NOTE (information to retain, "remember that..."), EXPERIMENT (something to try/test before committing), PROJECT (an explicit, committed, multi-step undertaking).',
    'QUEST: call register_quest directly. This is the only type you act on immediately without asking anything. Confirm with "Quest registered." plus the day and time.',
    'The "I need to..." phrasing does NOT automatically mean TASK/GOAL — check for a time first. "I need to wake up at 7am", "I need to leave for the airport by 5", "I need to take my medication tonight at 9" are all QUEST (they name a clock time or a clearly implied one) — call register_quest immediately, do not ask a clarifying question first. Only treat "I need to..." as TASK/GOAL when there truly is no time or clock hour anywhere in the sentence, e.g. "I need to finish my report this week".',
    'TASK/GOAL with no time given: do NOT silently create a quest at a guessed time. Say what you noticed and ask either what time works, or offer to hold it in the Idea Vault — let the user pick.',
    'IDEA / THOUGHT / NOTE / EXPERIMENT: call save_idea with the right kind. NEVER create a quest or project for these. After saving, briefly reflect it back and mention the Idea Vault.',
    'PROJECT: only call promote_idea when intent to commit is explicit. Ambiguous excitement ("what if we built...") is an IDEA. Never create a project silently. When you do promote, generate exactly ONE small first milestone and ONE tiny first quest.',
    'update_idea_status with status "dismissed": call it once WITHOUT confirmed:true first — it returns needsConfirmation and the exact title. Ask the user to confirm by that name, and only call again with confirmed:true after a clear yes.',
    'Use the tools to actually register, list, complete, or delete quests whenever asked — do not just say you will, call the tool.',
    'When complete_quest succeeds, its result includes xpGained, skillGains, newLevel, currentStreak, and possibly newlyUnlockedCards — state the concrete numbers naturally, e.g. "Quest complete. Thirty XP to Focus. Level four." If newlyUnlockedCards is non-empty, name the card as a genuine discovery. If the result says already_counted_today, say it already counted today rather than reporting XP.',
    'If asked about level, streak, or progress, call get_progress and answer with the real numbers, briefly. If asked about ideas, call list_ideas and read back a handful of titles plus the total.',
    'Never invent XP numbers, idea contents, quest details, or schedule contents — only report what a tool returned or what appears in the schedule snapshot given to you.',
  ];

  if (mode === 'forge') {
    base.push(
      '---- OVERNIGHT SESSION / FORGE MY WEEK ----',
      'You are now in an overnight planning session. The user is going to describe their week in loose, unstructured language: deadlines, recurring commitments, meetings, study, projects, appointments, personal goals, energy levels, times they want kept free, things they want to avoid.',
      'Your job in this mode is: LISTEN, then UNDERSTAND, then ORGANIZE, then PROPOSE. Do not call register_quest in this mode — proposing a week is done with propose_week and nothing else.',
      'Ask at most one or two short clarifying questions total, and only if a genuine blocker exists (e.g. you have no idea which days their gym sessions fall on). Do not interrogate the user. If you have enough to make a sensible first attempt, MAKE IT — the user reviews and revises it visually afterwards, so an imperfect first proposal is far more useful than more questions.',
      'When you have enough, call propose_week ONCE with the full set of blocks. Respect: stated fixed commitments land exactly where the user said; deep/creative work goes in longer blocks earlier in the day; admin and errands go in shorter blocks; protect any time the user asked to keep free and put nothing there; leave breathing room between blocks rather than packing the day wall-to-wall.',
      'You are given a snapshot of the schedule that already exists. Do NOT propose anything that duplicates a quest already there, and avoid placing blocks on top of existing ones unless the user explicitly asked you to double-book.',
      'propose_week does NOT change anything — it only draws a proposal onto the Quest Calendar for the user to accept, revise, or reject. Say so plainly afterwards, e.g. "I have forged your week. Review it on the Quest Calendar and accept when it looks right."',
      'If the user asks to change the proposal, call propose_week again with the COMPLETE revised set of blocks — it replaces the previous proposal rather than adding to it.',
      '---- CURRENT SCHEDULE SNAPSHOT (next 7 days) ----',
      scheduleDigest(reminders)
    );
  }

  base.push('If the user is just talking, answer briefly and naturally, in the System voice.');
  return base.join(' ');
}

// Web only: cached across the whole session (voice list doesn't change
// mid-session). undefined = not looked up yet, null = looked up and no
// English voice exists on this machine.
let cachedWebVoiceId: string | null | undefined;

function webSpeechSynthesis(): any {
  return (globalThis as any).window?.speechSynthesis;
}

// expo-speech's own getAvailableVoicesAsync() resolves as soon as
// speechSynthesis.getVoices() returns ANY non-empty array and never looks
// again — but Chrome/Edge report a small *local* voice list synchronously
// (which can be non-English) and only fire `onvoiceschanged` with the
// fuller list slightly later. Querying speechSynthesis directly and giving
// onvoiceschanged a grace window is what actually fixes that race.
async function getAllWebVoices(): Promise<any[]> {
  const synth = webSpeechSynthesis();
  if (!synth) return [];
  const first: any[] = synth.getVoices() ?? [];
  if (first.length > 0) {
    // Even when a list is already present it may be the partial local one,
    // so still wait briefly for a larger list — but don't block the
    // greeting for the full grace window if nothing more arrives.
    const quick = await new Promise<any[]>((resolve) => {
      let settled = false;
      const finish = (v: any[]) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const timer = setTimeout(() => finish(synth.getVoices() ?? []), 600);
      synth.onvoiceschanged = () => {
        clearTimeout(timer);
        finish(synth.getVoices() ?? []);
      };
    });
    return quick.length > first.length ? quick : first;
  }

  const later = await new Promise<any[]>((resolve) => {
    let settled = false;
    const finish = (v: any[]) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(synth.getVoices() ?? []), 1500);
    synth.onvoiceschanged = () => {
      clearTimeout(timer);
      finish(synth.getVoices() ?? []);
    };
  });

  return later.length > first.length ? later : first;
}

async function pickWebEnglishVoiceId(): Promise<string | null> {
  if (cachedWebVoiceId !== undefined) return cachedWebVoiceId;
  try {
    const voices = await getAllWebVoices();
    const isEnglish = (v: any) =>
      v.lang?.toLowerCase?.().startsWith('en') || v.name?.toLowerCase?.().includes('english');
    const english = voices.filter(isEnglish);
    const preferred =
      english.find((v: any) => v.lang?.toLowerCase() === 'en-gb' || v.name?.toLowerCase?.().includes('uk english')) ??
      english.find((v: any) => v.lang?.toLowerCase?.().startsWith('en')) ??
      english[0] ??
      null;
    // expo-speech's web `voice` option matches SpeechSynthesisVoice.voiceURI
    // (see ExponentSpeech.web.ts) — not `identifier`.
    cachedWebVoiceId = preferred?.voiceURI ?? null;
  } catch {
    cachedWebVoiceId = null;
  }
  return cachedWebVoiceId ?? null;
}

export function SystemScreen({
  reminders,
  onCreate,
  onComplete,
  onDelete,
  onProposeWeek,
  onOpenSettings,
  onOpenIdeaVault,
  onOpenCalendar,
  onBack,
  initialMode = 'converse',
  activeProposal,
}: Props) {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [mode, setMode] = useState<SystemMode>(initialMode);
  const [messages, setMessages] = useState<Bubble[]>([
    { id: 'welcome', role: 'system', text: GREETING_TEXT },
  ]);
  const [typedText, setTypedText] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [capturedIdea, setCapturedIdea] = useState<string | null>(null);
  const [forgeNotice, setForgeNotice] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const webSpeechRef = useRef<WebSpeechSession | null>(null);
  const webSpeechGotResultRef = useRef(false);
  const historyRef = useRef<ChatMessage[]>([]);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const listRef = useRef<FlatList<Bubble>>(null);
  const greetedRef = useRef(false);

  useEffect(() => {
    resolveApiKey().then((k) => setHasKey(!!k));
    return () => {
      Speech.stop();
      recorder.stop().catch(() => {});
      webSpeechRef.current?.stop();
    };
  }, []);

  // ── THE SUMMONING ──────────────────────────────────────────────────────
  // Opening the System speaks. This is the moment the product promises:
  // the System is a presence that greets you, not a text box that waits.
  // Guarded by a ref so a re-render never re-greets, and deliberately not
  // awaited — if speech synthesis is unavailable the screen still works.
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    const greeting =
      initialMode === 'forge'
        ? 'The System is ready. Describe your week and I will forge it.'
        : GREETING_TEXT;
    if (initialMode === 'forge') {
      setMessages([{ id: 'welcome', role: 'system', text: greeting }]);
    }
    // A small delay lets the screen paint and the orb settle before the
    // voice starts — speaking into a half-rendered screen feels broken.
    const t = setTimeout(() => {
      speak(greeting).catch(() => {});
    }, 420);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!capturedIdea) return;
    const t = setTimeout(() => setCapturedIdea(null), 6000);
    return () => clearTimeout(t);
  }, [capturedIdea]);

  useEffect(() => {
    if (!forgeNotice) return;
    const t = setTimeout(() => setForgeNotice(null), 12000);
    return () => clearTimeout(t);
  }, [forgeNotice]);

  const pushBubble = (role: Bubble['role'], text: string) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${role}-${Math.random()}`, role, text }]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const speak = async (text: string) => {
    // Web only: setting `language` on expo-speech's options only sets
    // SpeechSynthesisUtterance.lang, which several Chromium/Edge builds
    // treat as a hint that does NOT by itself change which system voice
    // reads the text. So on web, look up a real English voice by hand and
    // pass its identifier explicitly. Native doesn't have this quirk.
    let webVoiceId: string | undefined;
    if (Platform.OS === 'web') {
      webVoiceId = (await pickWebEnglishVoiceId()) ?? undefined;
    }

    return new Promise<void>((resolve) => {
      setOrbState('speaking');
      Speech.stop();
      Speech.speak(text, {
        language: 'en-GB',
        ...(webVoiceId ? { voice: webVoiceId } : {}),
        rate: 0.98,
        pitch: 1.0,
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
  };

  const runConversationTurn = async (userText: string, apiKey: string) => {
    historyRef.current.push({ role: 'user', content: userText });
    setOrbState('thinking');

    const buildMessages = (): ChatMessage[] => [
      { role: 'system', content: systemPrompt(modeRef.current, remindersRef.current) },
      // Forge sessions are long by nature — keep more turns than a normal
      // exchange so the System still remembers what was said at the start
      // of the planning conversation when it finally proposes.
      ...historyRef.current.slice(modeRef.current === 'forge' ? -24 : -10),
    ];

    try {
      let response = await chatCompletion(buildMessages(), toolDefinitions, apiKey);

      // Allow a short chain of tool rounds — forging often needs to read
      // progress or list quests before proposing. Hard-capped so a
      // confused free model can never spin.
      let rounds = 0;
      while (response.tool_calls && response.tool_calls.length > 0 && rounds < 3) {
        rounds += 1;
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
            onProposeWeek,
          });
          if (call.function.name === 'save_idea' && (result as any).ok) {
            setCapturedIdea((result as any).saved as string);
          }
          if (call.function.name === 'propose_week' && (result as any).ok) {
            setForgeNotice(
              `${(result as any).proposed} quests proposed — review them on the Quest Calendar.`
            );
          }
          historyRef.current.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        response = await chatCompletion(buildMessages(), toolDefinitions, apiKey);
      }

      const finalText = response.content?.trim() || 'Acknowledged.';
      historyRef.current.push({ role: 'assistant', content: finalText });
      pushBubble('system', finalText);
      await speak(finalText);
    } catch (e: any) {
      const msg = e?.message || 'The connection to the System failed.';
      pushBubble('system', `Signal lost: ${msg}`);
      setOrbState('idle');
    }
  };

  const startRecording = async () => {
    const key = await resolveApiKey();
    if (!key) {
      safeAlert('The System is dormant', 'Add an OpenRouter API key in Settings to bring the System online.');
      onOpenSettings();
      return;
    }

    // ---- WEB: browser SpeechRecognition, strictly $0, no audio upload ----
    // Voice on web never touches expo-audio, never records a file, and
    // never calls OpenRouter's paid Whisper endpoint — the browser itself
    // captures the mic and returns text directly.
    if (Platform.OS === 'web') {
      if (!isWebSpeechSupported()) {
        safeAlert(
          'This browser cannot carry your voice',
          'Use Chrome, Edge or Safari to speak to the System — or type to it below.'
        );
        return;
      }
      Speech.stop();
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
      webSpeechGotResultRef.current = false;
      setOrbState('listening');
      webSpeechRef.current = startWebSpeechRecognition({
        onResult: (transcript) => {
          webSpeechGotResultRef.current = true;
          pushBubble('user', transcript);
          runConversationTurn(transcript, key);
        },
        onError: (message) => {
          pushBubble('system', `I could not resolve that: ${message}`);
        },
        onEnd: () => {
          webSpeechRef.current = null;
          if (!webSpeechGotResultRef.current) setOrbState('idle');
        },
      });
      return;
    }

    // ---- NATIVE (iOS/Android): unchanged ----
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        safeAlert('Microphone blocked', 'Enable microphone access in Settings to speak to the System.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: false,
      });
      Speech.stop();
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setOrbState('listening');
    } catch (e) {
      safeAlert('Could not open the channel', String(e));
    }
  };

  const stopRecordingAndRespond = async () => {
    safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === 'web') {
      webSpeechRef.current?.stop();
      return;
    }

    // ---- NATIVE (iOS/Android): unchanged ----
    setOrbState('thinking');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio captured.');
      const key = await resolveApiKey();
      if (!key) throw new Error('Missing API key.');
      const transcript = await transcribeAudio(uri, key);
      if (!transcript) {
        pushBubble('system', 'I did not catch that.');
        setOrbState('idle');
        return;
      }
      pushBubble('user', transcript);
      await runConversationTurn(transcript, key);
    } catch (e: any) {
      pushBubble('system', `I could not resolve that: ${e?.message ?? e}`);
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

  const submitTyped = async () => {
    const trimmed = typedText.trim();
    if (!trimmed || orbState === 'thinking') return;
    const key = await resolveApiKey();
    if (!key) {
      safeAlert('The System is dormant', 'Add an OpenRouter API key in Settings to bring the System online.');
      onOpenSettings();
      return;
    }
    setTypedText('');
    pushBubble('user', trimmed);
    await runConversationTurn(trimmed, key);
  };

  // See the TextInput below: a multiline field swallows Enter, so the send
  // shortcut has to be wired by hand. `shiftKey` is only present on web's
  // synthetic keyboard event; on native this handler never sees 'Enter'
  // because the single-line field submits through onSubmitEditing instead.
  const handleKeyPress = (e: any) => {
    const native = e?.nativeEvent ?? {};
    if (native.key !== 'Enter') return;
    if (native.shiftKey) return;
    e.preventDefault?.();
    submitTyped();
  };

  const toggleMode = () => {
    safeHaptics.selection();
    const next: SystemMode = mode === 'converse' ? 'forge' : 'converse';
    setMode(next);
    if (next === 'forge') {
      pushBubble(
        'system',
        'Overnight session open. Tell me everything your week holds — deadlines, fixed commitments, what you want protected — and I will forge it.'
      );
    } else {
      pushBubble('system', 'Overnight session closed.');
    }
  };

  // Each state says something the eyebrow above it does not, so the two
  // lines never just repeat each other.
  const statusLine =
    orbState === 'idle'
      ? mode === 'forge'
        ? 'Describe your week'
        : 'Speak, or write below'
      : orbState === 'listening'
      ? 'Listening…'
      : orbState === 'thinking'
      ? 'Working through it…'
      : 'Speaking…';

  return (
    <View style={styles.root}>
      <WorldBackground intensity={0.85} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {/* ── header ── */}
          <View style={styles.header}>
            <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
              <SystemGlyph name="back" size={18} color={colors.textDim} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.eyebrow}>ARC ISLAND</Text>
              <Text style={styles.title}>THE SYSTEM</Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable onPress={onOpenCalendar} hitSlop={10} style={styles.iconBtn}>
                <SystemGlyph name="calendar" size={17} color={colors.textDim} />
              </Pressable>
              <Pressable onPress={onOpenSettings} hitSlop={10} style={styles.iconBtn}>
                <SystemGlyph name="settings" size={17} color={colors.textDim} />
              </Pressable>
            </View>
          </View>

          {/* ── mode switch ── */}
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => mode !== 'converse' && toggleMode()}
              style={[styles.modeChip, mode === 'converse' && styles.modeChipActive]}
            >
              <SystemGlyph
                name="system"
                size={13}
                color={mode === 'converse' ? colors.signal : colors.textFaint}
              />
              <Text style={[styles.modeText, mode === 'converse' && styles.modeTextActive]}>
                CONVERSE
              </Text>
            </Pressable>
            <Pressable
              onPress={() => mode !== 'forge' && toggleMode()}
              style={[styles.modeChip, mode === 'forge' && styles.modeChipForge]}
            >
              <SystemGlyph name="forge" size={13} color={mode === 'forge' ? colors.xp : colors.textFaint} />
              <Text style={[styles.modeText, mode === 'forge' && styles.modeTextForge]}>
                FORGE MY WEEK
              </Text>
            </Pressable>
          </View>

          {/* ── notices ── */}
          {forgeNotice && (
            <Animated.View entering={FadeInDown.duration(260)}>
              <Pressable onPress={onOpenCalendar}>
                <SystemPanel tone="xp" lit bracket={12} style={styles.notice}>
                  <View style={styles.noticeHead}>
                    <SystemGlyph name="forge" size={14} color={colors.xp} charged />
                    <Text style={styles.noticeTitle}>WEEK FORGED</Text>
                  </View>
                  <Text style={styles.noticeText}>{forgeNotice}</Text>
                  <Text style={styles.noticeLink}>OPEN QUEST CALENDAR →</Text>
                </SystemPanel>
              </Pressable>
            </Animated.View>
          )}

          {activeProposal && !forgeNotice && (
            <Pressable onPress={onOpenCalendar}>
              <SystemPanel tone="xp" bracket={12} style={styles.notice}>
                <Text style={styles.noticeText}>
                  A forged week is awaiting your decision.
                </Text>
                <Text style={styles.noticeLink}>REVIEW ON QUEST CALENDAR →</Text>
              </SystemPanel>
            </Pressable>
          )}

          {capturedIdea && (
            <Pressable onPress={() => { setCapturedIdea(null); onOpenIdeaVault(); }}>
              <SystemPanel tone="signal" bracket={12} style={styles.notice}>
                <View style={styles.noticeHead}>
                  <SystemGlyph name="vault" size={14} color={colors.signal} />
                  <Text style={[styles.noticeTitle, { color: colors.signal }]}>SEALED IN THE VAULT</Text>
                </View>
                <Text style={styles.noticeText} numberOfLines={1}>"{capturedIdea}"</Text>
                <Text style={[styles.noticeLink, { color: colors.signal }]}>OPEN VAULT →</Text>
              </SystemPanel>
            </Pressable>
          )}

          {hasKey === false && (
            <Pressable onPress={onOpenSettings}>
              <SystemPanel tone="danger" bracket={12} style={styles.notice}>
                <Text style={styles.noticeText}>
                  The System is dormant. Add an OpenRouter key to bring it online.
                </Text>
              </SystemPanel>
            </Pressable>
          )}

          {/* ── transcript ── */}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Animated.View entering={FadeIn.duration(220)}>
                {item.role === 'user' ? (
                  <View style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userText}>{item.text}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.systemRow}>
                    <View style={styles.systemMark}>
                      <SystemGlyph name="system" size={13} color={colors.signal} />
                    </View>
                    <View style={styles.systemBubble}>
                      <Text style={styles.systemText}>{item.text}</Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            )}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />

          {/* ── the System console ── */}
          <SystemPanel
            tone={orbState === 'listening' ? 'cyan' : orbState === 'speaking' ? 'done' : 'signal'}
            lit
            scan={orbState === 'thinking'}
            bracket={18}
            radius={radii.xl}
            style={styles.console}
          >
            <View style={styles.orbRow}>
              <Pressable onPress={handleOrbPress} disabled={orbState === 'thinking'}>
                <SystemOrb state={orbState} size={54} />
              </Pressable>
              <View style={styles.orbTextCol}>
                <Text style={styles.orbEyebrow}>{mode === 'forge' ? 'OVERNIGHT SESSION' : 'THE SYSTEM'}</Text>
                <Text style={styles.orbHeadline}>{statusLine}</Text>
                {orbState === 'listening' && (
                  <View style={styles.waveWrap}>
                    <ListeningWave bars={16} />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.typedRow}>
              <TextInput
                value={typedText}
                onChangeText={setTypedText}
                placeholder={mode === 'forge' ? 'Describe your week…' : 'Speak, or write to the System…'}
                placeholderTextColor={colors.textFainter}
                style={styles.typedInput}
                returnKeyType="send"
                onSubmitEditing={submitTyped}
                editable={orbState !== 'thinking'}
                // Forge sessions are long, unstructured descriptions, so the
                // field goes multiline there. But a multiline TextInput never
                // fires onSubmitEditing — pressing Enter just inserted a
                // newline, which silently stranded the user's whole week in
                // the box with no obvious way to send it. Enter sends,
                // Shift+Enter breaks the line.
                onKeyPress={handleKeyPress}
                multiline={mode === 'forge'}
              />
              <Pressable
                style={[styles.sendBtn, !typedText.trim() && styles.sendBtnDisabled]}
                disabled={!typedText.trim() || orbState === 'thinking'}
                onPress={submitTyped}
              >
                <SystemGlyph name="send" size={16} color={typedText.trim() ? colors.void : colors.textFaint} strokeWidth={2} />
              </Pressable>
            </View>
          </SystemPanel>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(4),
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerRight: { flexDirection: 'row', gap: spacing(2) },
  eyebrow: { ...font.label, fontSize: 9, color: colors.arcCyan, letterSpacing: 2.4 },
  title: { ...font.title, fontSize: 19, color: colors.text, letterSpacing: 1.5, marginTop: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
  },

  modeRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    backgroundColor: colors.holo,
  },
  modeChipActive: { borderColor: 'rgba(124,92,255,0.55)', backgroundColor: colors.signalSoft },
  modeChipForge: { borderColor: 'rgba(255,198,92,0.5)', backgroundColor: 'rgba(255,198,92,0.1)' },
  modeText: { ...font.label, fontSize: 9, color: colors.textFaint, letterSpacing: 1.3 },
  modeTextActive: { color: colors.signal },
  modeTextForge: { color: colors.xp },

  notice: { marginTop: spacing(2.5), padding: spacing(3), gap: 4 },
  noticeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  noticeTitle: { ...font.label, fontSize: 9, color: colors.xp, letterSpacing: 1.6 },
  noticeText: { ...font.body, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  noticeLink: { ...font.label, fontSize: 9, color: colors.xp, letterSpacing: 1.2, marginTop: 2 },

  chatContent: {
    // flexGrow + flex-end keeps a short conversation pinned just above the
    // console instead of stranding one bubble at the top of an empty screen.
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingVertical: spacing(4),
    gap: spacing(2.5),
  },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '84%',
    backgroundColor: colors.signal,
    borderRadius: radii.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2.5),
    shadowColor: colors.signal,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  userText: { color: '#FFFFFF', fontSize: 14.5, lineHeight: 20, fontWeight: '600', fontFamily: theme.fontFamily.manropeSemiBold },
  systemRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start', maxWidth: '92%' },
  systemMark: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.signalSoft,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.3)',
    marginTop: 2,
  },
  systemBubble: {
    flex: 1,
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: radii.lg,
    borderTopLeftRadius: 6,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2.5),
  },
  systemText: { color: colors.text, fontSize: 14.5, lineHeight: 21, fontFamily: theme.fontFamily.manropeMedium },

  console: {
    marginBottom: Platform.OS === 'web' ? spacing(4) : spacing(8),
    padding: spacing(3.5),
    gap: spacing(3),
  },
  orbRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  orbTextCol: { flex: 1, gap: 2 },
  orbEyebrow: { ...font.label, fontSize: 9, color: colors.arcCyan, letterSpacing: 1.8 },
  orbHeadline: { ...font.heading, fontSize: 16, color: colors.text },
  waveWrap: { height: 22, marginTop: 2, opacity: 0.8 },

  typedRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'flex-end' },
  typedInput: {
    flex: 1,
    backgroundColor: 'rgba(4,4,7,0.45)',
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    color: colors.text,
    fontSize: 14.5,
    fontFamily: theme.fontFamily.manropeMedium,
    maxHeight: 110,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.holoRaise, opacity: 0.6 },
});
