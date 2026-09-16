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
import { theme } from '../theme';
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.heading}>Assistant Settings</Text>
        <Text style={styles.subtitle}>
          The assistant uses OpenRouter to hear you and reply, defaulting to OpenRouter's free
          model router — no OpenAI account needed. Your key is stored only on this device and
          every call goes straight from your phone to OpenRouter — nothing passes through a
          server we run.
        </Text>

        {!hasExisting && !!PROVIDER_CONFIG.devDefaultApiKey && (
          <Text style={styles.devDefaultNote}>
            A local development key is pre-configured right now (from .env) — Arc Island is
            already working. Save a key below only if you want to override it.
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
            (1000/day if you ever add $10 of OpenRouter credit). Voice transcription isn't free on
            OpenRouter yet, but it's billed the same small per-minute rate Whisper always was, on
            this same key — a typical "add a reminder" exchange still costs well under a cent.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bg },
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.spacing(5) },
  content: { paddingTop: theme.spacing(6), paddingBottom: theme.spacing(12) },
  backRow: { marginBottom: theme.spacing(4) },
  backText: { color: theme.colors.accent, fontSize: 16, fontWeight: '600' },
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
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(4),
  },
  label: { ...theme.font.label, color: theme.colors.textFaint, marginBottom: theme.spacing(2) },
  input: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3.5),
    color: theme.colors.text,
    fontSize: 15,
    marginBottom: theme.spacing(4),
  },
  btn: { borderRadius: theme.radius.pill, paddingVertical: theme.spacing(4), alignItems: 'center', marginBottom: theme.spacing(3) },
  saveBtn: { backgroundColor: theme.colors.accent },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  clearBtn: { backgroundColor: theme.colors.dangerSoft },
  clearBtnText: { color: theme.colors.danger, fontWeight: '700', fontSize: 15 },
  link: { color: theme.colors.accent, fontSize: 13, marginTop: theme.spacing(2), marginBottom: theme.spacing(6) },
  costBox: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: theme.spacing(4),
  },
  costTitle: { ...theme.font.label, color: theme.colors.text, marginBottom: theme.spacing(1.5) },
  costBody: { ...theme.font.caption, color: theme.colors.textDim, lineHeight: 18 },
});
