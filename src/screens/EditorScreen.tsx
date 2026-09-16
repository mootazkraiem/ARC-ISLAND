import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Reminder, ReminderDraft } from '../types';
import { theme } from '../theme';
import { RepeatSelector } from '../components/RepeatSelector';
import { CategorySelector } from '../components/CategorySelector';

interface Props {
  initial: Reminder | null;
  /** Pre-fills a brand-new reminder (e.g. from the quick-add natural-language
   * parser) without it being an edit of an existing one. */
  prefill?: ReminderDraft | null;
  onSave: (draft: ReminderDraft) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combine(dateISO: string, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

export function EditorScreen({ initial, prefill, onSave, onCancel, onDelete }: Props) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5, 0, 0);
  const source = initial ?? prefill ?? null;

  const [title, setTitle] = useState(source?.title ?? '');
  const [dateISO, setDateISO] = useState(source?.date ?? toISODate(now));
  const [time, setTime] = useState(source?.time ?? toHHmm(now));
  const [repeat, setRepeat] = useState<Reminder['repeat']>(source?.repeat ?? 'once');
  const [category, setCategory] = useState<Reminder['category']>(source?.category ?? 'personal');
  const [enabled] = useState(initial?.enabled ?? true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const combined = combine(dateISO, time);

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    if (selected) setDateISO(toISODate(selected));
    if (Platform.OS === 'android') setShowDatePicker(false);
  };

  const handleTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (event.type === 'dismissed') {
      setShowTimePicker(false);
      return;
    }
    if (selected) setTime(toHHmm(selected));
    if (Platform.OS === 'android') setShowTimePicker(false);
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give your reminder a title.');
      return;
    }
    if (repeat === 'once' && combine(dateISO, time).getTime() < Date.now() - 60000) {
      setError('Pick a time in the future.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({ title: trimmed, date: dateISO, time, repeat, category, enabled });
  };

  const confirmDelete = () => {
    if (!initial) return;
    Alert.alert('Delete this reminder?', `"${initial.title}" will be removed and its notification cancelled.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onDelete(initial.id);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>{initial ? 'Edit Reminder' : 'New Reminder'}</Text>

        {prefill && !initial && (
          <View style={styles.prefillBanner}>
            <Text style={styles.prefillBannerText}>
              Parsed from what you typed — double-check the time before saving.
            </Text>
          </View>
        )}

        <Text style={styles.label}>TITLE</Text>
        <TextInput
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            if (error) setError(null);
          }}
          placeholder="Walk the dog"
          placeholderTextColor={theme.colors.textFaint}
          style={styles.input}
          autoFocus={!initial}
          returnKeyType="done"
        />

        <Text style={styles.label}>DATE</Text>
        <Pressable style={styles.fieldBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.fieldBtnText}>
            {combined.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={combined}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date(new Date().setHours(0, 0, 0, 0))}
            themeVariant="dark"
          />
        )}

        <Text style={styles.label}>TIME</Text>
        <Pressable style={styles.fieldBtn} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.fieldBtnText}>
            {combined.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </Pressable>
        {showTimePicker && (
          <DateTimePicker
            value={combined}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
            themeVariant="dark"
          />
        )}

        <Text style={styles.label}>REPEAT</Text>
        <RepeatSelector value={repeat} onChange={setRepeat} />

        <Text style={styles.label}>CATEGORY</Text>
        <CategorySelector value={category} onChange={setCategory} />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Reminder</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.cancelBtn]} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          {initial && (
            <Pressable style={[styles.btn, styles.deleteBtn]} onPress={confirmDelete}>
              <Text style={styles.deleteBtnText}>Delete Reminder</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bg },
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.spacing(5) },
  content: { paddingTop: theme.spacing(6), paddingBottom: theme.spacing(12) },
  heading: { ...theme.font.title, color: theme.colors.text, marginBottom: theme.spacing(4) },
  prefillBanner: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(4),
  },
  prefillBannerText: { ...theme.font.caption, color: theme.colors.accent, lineHeight: 18 },
  label: {
    ...theme.font.label,
    color: theme.colors.textFaint,
    marginBottom: theme.spacing(2),
    marginTop: theme.spacing(5),
  },
  input: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3.5),
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  fieldBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3.5),
  },
  fieldBtnText: { ...theme.font.body, color: theme.colors.text, fontSize: 16 },
  error: {
    ...theme.font.caption,
    color: theme.colors.danger,
    marginTop: theme.spacing(4),
  },
  actions: { marginTop: theme.spacing(8), gap: theme.spacing(3) },
  btn: {
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(4),
    alignItems: 'center',
  },
  saveBtn: { backgroundColor: theme.colors.accent },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  cancelBtn: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder },
  cancelBtnText: { color: theme.colors.textDim, fontWeight: '600', fontSize: 16 },
  deleteBtn: { backgroundColor: theme.colors.dangerSoft },
  deleteBtnText: { color: theme.colors.danger, fontWeight: '700', fontSize: 15 },
});
