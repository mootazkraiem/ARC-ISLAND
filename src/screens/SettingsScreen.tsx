import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme, colors } from '../theme';
import { WorldBackground } from '../components/world/WorldBackground';
import { SystemGlyph } from '../components/SystemGlyph';
import { clearApiKey, getApiKey, setApiKey } from '../assistant/apiKeyStore';
import { PROVIDER_CONFIG } from '../assistant/providerConfig';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await getApiKey();
      if (existing) {
        setHasExisting(true);
        setKey(existing);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!key.trim()) return;
    await setApiKey(key.trim());
    setSaved(true);
    setHasExisting(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleClear = async () => {
    await clearApiKey();
    setKey('');
    setHasExisting(false);
  };

  return (
    <View style={styles.root}>
      <WorldBackground intensity={0.7} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <SystemGlyph name="back" size={17} color={colors.textDim} />
          </Pressable>

        <Text style={styles.heading}>System Settings</Text>
        <Text style={styles.subtitle}>
          The System uses OpenRouter to hear you and reply, defaulting to OpenRouter's free
          model router — no OpenAI account needed. Your key is stored only on this device and
          every call goes straight from your phone to OpenRouter — nothing passes through a
          server we run.
        </Text>

        {!hasExisting && !!PROVIDER_CONFIG.devDefaultApiKey && (
          <Text style={styles.devDefaultNote}>
            A local development key is pre-configured right now (from .env) — Arc Island is
            already online. Save a key below only if you want to override it.
          </Text>
        )}

        <Text style={styles.label}>OPENROUTER API KEY</Text>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="sk-or-v1-..."
          placeholderTextColor={theme.colors.textFaint}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Pressable style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{saved ? 'Saved ✓' : 'Save Key'}</Text>
        </Pressable>

        {hasExisting && (
          <Pressable style={[styles.btn, styles.clearBtn]} onPress={handleClear}>
            <Text style={styles.clearBtnText}>Remove Key</Text>
          </Pressable>
        )}

        <Pressable onPress={() => Linking.openURL('https://openrouter.ai/keys')}>
          <Text style={styles.link}>Get a free API key at openrouter.ai/keys ↗</Text>
        </Pressable>

        <View style={styles.costBox}>
          <Text style={styles.costTitle}>Roughly what this costs</Text>
          <Text style={styles.costBody}>
            Replies use OpenRouter's free model router by default — $0, capped at 50 requests/day
            (1000/day if you ever add $10 of OpenRouter credit).
            {Platform.OS === 'web'
              ? " Voice on the web uses your browser's own built-in speech recognition, not this key — it's always $0 and never sends audio anywhere."
              : " Voice transcription isn't free on OpenRouter yet — it's billed a small per-minute Whisper rate on this same key. A typical \"claim a quest\" exchange still costs well under a cent."}
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1, backgroundColor: 'transparent' },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
  },
  container: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: theme.spacing(4) },
  content: { paddingTop: theme.spacing(6), paddingBottom: theme.spacing(12) },
  backRow: { marginBottom: theme.spacing(4) },
  backText: { color: colors.signal, fontSize: 16, fontWeight: '600' },
  heading: { ...theme.font.title, color: theme.colors.text, marginBottom: theme.spacing(2) },
  subtitle: {
    ...theme.font.body,
    color: theme.colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing(6),
  },
  devDefaultNote: {
    ...theme.font.caption,
    color: theme.colors.success,
    backgroundColor: colors.signalSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(4),
  },
  label: { ...theme.font.label, color: theme.colors.textFaint, marginBottom: theme.spacing(2) },
  input: {
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3.5),
    color: theme.colors.text,
    fontSize: 15,
    marginBottom: theme.spacing(4),
  },
  btn: { borderRadius: theme.radius.pill, paddingVertical: theme.spacing(4), alignItems: 'center', marginBottom: theme.spacing(3) },
  saveBtn: { backgroundColor: colors.signal },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  clearBtn: { backgroundColor: theme.colors.dangerSoft },
  clearBtnText: { color: theme.colors.danger, fontWeight: '700', fontSize: 15 },
  link: { color: colors.signal, fontSize: 13, marginTop: theme.spacing(2), marginBottom: theme.spacing(6) },
  costBox: {
    backgroundColor: colors.holo,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    padding: theme.spacing(4),
  },
  costTitle: { ...theme.font.label, color: theme.colors.text, marginBottom: theme.spacing(1.5) },
  costBody: { ...theme.font.caption, color: theme.colors.textDim, lineHeight: 18 },
});
