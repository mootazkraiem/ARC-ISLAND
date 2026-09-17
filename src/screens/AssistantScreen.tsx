import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import { isWebSpeechSupported, startWebSpeechRecognition, WebSpeechSession } from '../webSpeechRecognition';
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
    'You are Arc Island, a tiny, warm, no-nonsense voice assistant built into a personal progression system — reminders feed XP, skills, streaks, and a collectible card archive, and a separate Idea Vault holds things that are not yet actionable.',
    'Keep every reply to one or two short sentences — it will be read aloud, so no lists, no markdown, no emoji.',
    `Right now it is ${now.toLocaleDateString('en-CA')} (YYYY-MM-DD) at ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} local time, which is a ${now.toLocaleDateString(undefined, { weekday: 'long' })}.`,
    'Resolve relative dates/times ("tonight", "tomorrow morning", "in an hour", "next Friday") against that. Always pass add_reminder a concrete date (YYYY-MM-DD) and 24h time (HH:mm) — never words.',
    // ---- classification: the core of this feature ----
    'Before acting, decide what kind of thing the user just said. Categories: REMINDER (a concrete action with a specific or clearly implied time — schedule it), TASK/GOAL (a concrete thing they need to do but with no specific time, e.g. "I need to finish my report this week"), IDEA (a possibility, speculation, or "what if" — not a commitment), THOUGHT (a passing reflection worth keeping), NOTE (information to retain, "remember that..."), EXPERIMENT (something to try/test before committing), PROJECT (an explicit, committed, multi-step undertaking — "let\'s build," "I\'m going to make," "turn that into a project").',
    'REMINDER: call add_reminder directly. This is the only type you act on immediately without asking anything.',
    'The "I need to..." phrasing does NOT automatically mean TASK/GOAL — check for a time first. "I need to wake up at 7am", "I need to leave for the airport by 5", "I need to take my medication tonight at 9" are all REMINDER (they name a clock time or a clearly implied one like "tonight"/"tomorrow morning") — call add_reminder immediately, do not ask a clarifying question first. Only treat "I need to..." as TASK/GOAL when there truly is no time or clock hour anywhere in the sentence, e.g. "I need to finish my report this week" (no specific hour given).',
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

// Web only: cached across the whole session (voice list doesn't change
// mid-session) so this lookup only ever runs once. undefined = not looked
// up yet, null = looked up and no English voice was found on this machine
// (falls back to the browser's own default rather than forcing anything).
let cachedWebVoiceId: string | null | undefined;

function webSpeechSynthesis(): any {
  return (globalThis as any).window?.speechSynthesis;
}

// expo-speech's own getAvailableVoicesAsync() (see its web source) resolves
// as soon as speechSynthesis.getVoices() returns ANY non-empty array and
// never looks again — but on some machines Chrome/Edge report a small
// *local* voice list synchronously (which can be non-English, as it was
// here — this machine's local voices turned out to be French-only) and
// only fire `onvoiceschanged` with the fuller list (including English)
// slightly later. Querying speechSynthesis directly and giving
// onvoiceschanged a short grace window — instead of trusting whichever
// list happens to load first — is what actually fixes that race.
async function getAllWebVoices(): Promise<any[]> {
  const synth = webSpeechSynthesis();
  if (!synth) return [];
  const first: any[] = synth.getVoices() ?? [];

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
    // Match by `.lang` first; also accept a voice whose `.name` says
    // "english" even if its `.lang` tag is missing/inconsistent — a small
    // extra net for remote/network voices some browsers list oddly.
    const isEnglish = (v: any) =>
      v.lang?.toLowerCase?.().startsWith('en') || v.name?.toLowerCase?.().includes('english');
    const english = voices.filter(isEnglish);
    const preferred =
      english.find((v: any) => v.lang?.toLowerCase() === 'en-gb' || v.name?.toLowerCase?.().includes('uk english')) ??
      english.find((v: any) => v.lang?.toLowerCase?.().startsWith('en')) ??
      english[0] ??
      null;
    // expo-speech's web `voice` option matches against SpeechSynthesisVoice's
    // own `voiceURI` field (see ExponentSpeech.web.ts) — not `identifier`,
    // which only exists on expo-speech's own normalized Voice type.
    cachedWebVoiceId = preferred?.voiceURI ?? null;
  } catch {
    cachedWebVoiceId = null;
  }
  // The `?? null` isn't redundant here: TypeScript can't carry the
  // narrowing from the module-level `let` across the `await` points above
  // (a concurrent call could reassign it in between), so it still sees the
  // full `string | null | undefined` type at this line without this.
  return cachedWebVoiceId ?? null;
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
    { id: 'welcome', role: 'assistant', text: 'Welcome to Arc Island — want to add a mission to your list?' },
  ]);
  const [typedText, setTypedText] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [capturedIdea, setCapturedIdea] = useState<string | null>(null);
  // One recorder instance for the component's whole lifetime — created
  // (correctly) via the hook, then reused across every tap-to-talk cycle
  // via prepareToRecordAsync()/record()/stop(), not recreated each time.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Web-only: the in-flight browser SpeechRecognition session (see
  // startRecording's web branch below). Always null on native.
  const webSpeechRef = useRef<WebSpeechSession | null>(null);
  // Web-only: set true the instant a result comes back, so the session's
  // onEnd callback (which always fires after onresult, per spec) knows not
  // to reset orbState back to 'idle' out from under runConversationTurn.
  const webSpeechGotResultRef = useRef(false);
  const historyRef = useRef<ChatMessage[]>([]);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const listRef = useRef<FlatList<Bubble>>(null);

  useEffect(() => {
    resolveApiKey().then((k) => setHasKey(!!k));
    return () => {
      Speech.stop();
      recorder.stop().catch(() => {});
      webSpeechRef.current?.stop();
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

  const speak = async (text: string) => {
    // Web only: setting `language` on expo-speech's options only sets
    // SpeechSynthesisUtterance.lang, which several Chromium/Edge builds
    // treat as a hint that does NOT by itself change which system voice
    // reads the text — without an explicit `voice`, it can keep using
    // whatever the OS reports as its "default" voice (which depends on
    // installed language packs and is not necessarily English at all).
    // So on web, look up a real English voice by hand and pass its
    // identifier explicitly. Native platforms don't have this quirk —
    // `language` alone reliably picks an English system voice there.
    let webVoiceId: string | undefined;
    if (Platform.OS === 'web') {
      webVoiceId = (await pickWebEnglishVoiceId()) ?? undefined;
    }

    return new Promise<void>((resolve) => {
      setOrbState('speaking');
      Speech.stop();
      Speech.speak(text, {
        // Nudge's replies are always English (see systemPrompt above).
        // British English for the persona's voice.
        language: 'en-GB',
        ...(webVoiceId ? { voice: webVoiceId } : {}),
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
  };

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
      safeAlert('No API key yet', 'Add an OpenRouter API key in Settings to turn the assistant on.');
      onOpenSettings();
      return;
    }

    // ---- WEB: browser SpeechRecognition, strictly $0, no audio upload ----
    // Voice on web never touches expo-audio, never records a file, and
    // never calls OpenRouter's paid Whisper endpoint — the browser itself
    // captures the mic and returns text directly. See
    // src/webSpeechRecognition.ts. Native (iOS/Android) is handled entirely
    // below this block and is unaffected.
    if (Platform.OS === 'web') {
      if (!isWebSpeechSupported()) {
        safeAlert(
          "Voice isn't supported in this browser",
          'Try Chrome or Edge for voice input, or just type into the chat below instead.'
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
          pushBubble('assistant', `Couldn't process that: ${message}`);
        },
        onEnd: () => {
          webSpeechRef.current = null;
          // runConversationTurn already owns the state transition
          // (thinking → speaking/idle) once a result comes in — only reset
          // here when the session ended without one (error, silence, or a
          // manual stop before anything was heard).
          if (!webSpeechGotResultRef.current) {
            setOrbState('idle');
          }
        },
      });
      return;
    }

    // ---- NATIVE (iOS/Android): unchanged from before tonight ----
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        safeAlert('Microphone blocked', 'Enable microphone access in Settings to talk to Arc Island.');
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
      safeAlert('Could not start recording', String(e));
    }
  };

  const stopRecordingAndRespond = async () => {
    // orbState already gates this: handleOrbPress only calls this function
    // while orbState === 'listening', i.e. only after startRecording above
    // actually got a recording going — so no extra "is one active" guard
    // is needed here the way the old ref-based version had one.
    safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);

    // ---- WEB: stop the browser's own recognizer early ----
    // Its onresult/onerror/onend callbacks (wired in startRecording above)
    // drive every state transition from here — including moving into
    // 'thinking' if speech was captured. Nothing else to do on this path.
    if (Platform.OS === 'web') {
      webSpeechRef.current?.stop();
      return;
    }

    // ---- NATIVE (iOS/Android): unchanged from before tonight ----
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

  // Typed fallback alongside voice — same runConversationTurn as the voice
  // path (add_reminder/tool-calling behaves identically either way), so
  // this doubles as a quick way to check whether Nudge is actually acting
  // on a request or just failing to hear it correctly via the mic.
  const submitTyped = async () => {
    const trimmed = typedText.trim();
    if (!trimmed || orbState === 'thinking') return;
    const key = await resolveApiKey();
    if (!key) {
      safeAlert('No API key yet', 'Add an OpenRouter API key in Settings to turn the assistant on.');
      onOpenSettings();
      return;
    }
    setTypedText('');
    pushBubble('user', trimmed);
    await runConversationTurn(trimmed, key);
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
        <Text style={styles.title}>Arc Island</Text>
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
        <View style={styles.typedRow}>
          <TextInput
            value={typedText}
            onChangeText={setTypedText}
            placeholder="Or type to Nudge…"
            placeholderTextColor={theme.colors.textFaint}
            style={styles.typedInput}
            returnKeyType="send"
            onSubmitEditing={submitTyped}
            editable={orbState !== 'thinking'}
          />
          <Pressable
            style={[styles.typedSendBtn, !typedText.trim() && styles.typedSendBtnDisabled]}
            disabled={!typedText.trim() || orbState === 'thinking'}
            onPress={submitTyped}
          >
            <Text style={styles.typedSendBtnText}>Send</Text>
          </Pressable>
        </View>
        <View style={styles.orbRow}>
          <Pressable onPress={handleOrbPress} disabled={orbState === 'thinking'}>
            <PulseOrb state={orbState} size={78} />
          </Pressable>
          <View style={styles.orbTextCol}>
            <Text style={styles.orbEyebrow}>ARC ISLAND · {orbState.toUpperCase()}</Text>
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
  typedRow: { flexDirection: 'row', gap: theme.spacing(2) },
  typedInput: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    color: theme.colors.text,
    fontSize: 15,
  },
  typedSendBtn: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    justifyContent: 'center',
  },
  typedSendBtnDisabled: { opacity: 0.4 },
  typedSendBtnText: { color: theme.colors.accent, fontWeight: '700', fontSize: 14 },
  orbRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(4) },
  orbTextCol: { flex: 1, gap: 4 },
  orbEyebrow: { ...theme.font.label, fontSize: 10, color: colors.signal },
  orbHeadline: { ...theme.font.heading, fontSize: 17, color: theme.colors.text },
  orbLabel: { ...theme.font.caption, color: theme.colors.textFaint, marginTop: theme.spacing(3) },
});
