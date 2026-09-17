import React, { useState } from 'react';
import {
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Reminder, ReminderDraft } from '../types';
import { fmtDate, fmtTime } from '../locale';
import { colors, font, radii, spacing, theme } from '../theme';
import { WorldBackground } from '../components/world/WorldBackground';
import { SystemPanel } from '../components/SystemPanel';
import { SystemGlyph } from '../components/SystemGlyph';
import { RepeatSelector } from '../components/RepeatSelector';
import { CategorySelector } from '../components/CategorySelector';
import { DEFAULT_QUEST_MINUTES, clampDuration } from '../calendar/occurrences';
import { computeBaseXp } from '../progression/xpRules';
import { SKILL_META, SkillId } from '../progression/types';

// ─────────────────────────────────────────────────────────────────────────
// CLAIM A QUEST — the registration rite.
//
// Deliberately still FAST: title, when, how long, how often, which skill
// path — five fields, all visible at once, no wizard, no steps. The
// atmosphere comes from the framing and the live XP readout, not from
// making the user work harder for a simple quest.
//
// @react-native-community/datetimepicker ships no web implementation at
// all (its own docs list Android/iOS/Windows only) — importing it is safe
// on web, but mounting <DateTimePicker> there would throw at render time.
// On web only, the date/time fields render plain HTML inputs instead —
// same surface, same state, same validation. Native keeps the exact
// existing DateTimePicker code, untouched.
// ─────────────────────────────────────────────────────────────────────────

const isWeb = Platform.OS === 'web';
// A plain DOM style object (not an RN StyleSheet) since this only ever
// renders inside the `isWeb` branch. `colorScheme: 'dark'` makes Chrome/Edge
// draw the native date/time picker popup in dark mode, matching the app's
// `themeVariant="dark"` on the native picker.
const webDateTimeInputStyle: any = {
  backgroundColor: 'transparent',
  border: 'none',
  outline: 'none',
  color: colors.text,
  fontSize: 15,
  fontWeight: '600',
  fontFamily: theme.fontFamily.manropeSemiBold,
  width: '100%',
  colorScheme: 'dark',
};

/** Quest lengths offered as presets. Anything finer is available by
 * dragging the block's edge on the Quest Calendar, which is a better tool
 * for the job than a number field. */
const DURATIONS = [15, 30, 45, 60, 90, 120];

interface Props {
  initial: Reminder | null;
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
  const [durationMin, setDurationMin] = useState<number>(
    source?.durationMin ?? DEFAULT_QUEST_MINUTES
  );
  const [repeat, setRepeat] = useState<Reminder['repeat']>(source?.repeat ?? 'once');
  const [category, setCategory] = useState<Reminder['category']>(source?.category ?? 'personal');
  const [enabled] = useState(initial?.enabled ?? true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const combined = combine(dateISO, time);
  // Live reward readout — the user sees what the quest is worth before
  // committing to it, which is the whole point of a progression system.
  const xp = computeBaseXp(title.trim() || 'Quest', category);
  // Name the two largest skill gains — listing all of them turns a one-line
  // readout into a paragraph.
  const skillNames = (Object.entries(xp.skillGains) as [SkillId, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => SKILL_META[id].label);

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
      setError('A quest needs a name.');
      return;
    }
    if (repeat === 'once' && combine(dateISO, time).getTime() < Date.now() - 60000) {
      setError('That hour has already passed. Choose a future one.');
      return;
    }
    safeHaptics.notification(Haptics.NotificationFeedbackType.Success);
    onSave({
      title: trimmed,
      date: dateISO,
      time,
      durationMin: clampDuration(durationMin),
      repeat,
      category,
      enabled,
    });
  };

  const confirmDelete = () => {
    if (!initial) return;
    safeAlert('Release this quest?', `"${initial.title}" leaves the world and its summons is cancelled.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Release',
        style: 'destructive',
        onPress: () => {
          safeHaptics.notification(Haptics.NotificationFeedbackType.Warning);
          onDelete(initial.id);
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <WorldBackground intensity={0.7} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={12} style={styles.iconBtn}>
              <SystemGlyph name="back" size={18} color={colors.textDim} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.eyebrow}>{initial ? 'AMEND' : 'REGISTER'}</Text>
              <Text style={styles.heading}>{initial ? 'Edit Quest' : 'Claim a Quest'}</Text>
            </View>
            <View style={styles.iconBtnGhost} />
          </View>

          {prefill && !initial && (
            <Animated.View entering={FadeInDown.duration(240)}>
              <SystemPanel tone="cyan" bracket={12} style={styles.banner}>
                <SystemGlyph name="system" size={14} color={colors.arcCyan} />
                <Text style={styles.bannerText}>
                  The System parsed this from your words. Confirm the hour before sealing it.
                </Text>
              </SystemPanel>
            </Animated.View>
          )}

          <SystemPanel tone="signal" lit bracket={16} style={styles.formPanel}>
            <Text style={styles.label}>QUEST NAME</Text>
            <TextInput
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                if (error) setError(null);
              }}
              placeholder="Walk the dog"
              placeholderTextColor={colors.textFainter}
              style={styles.input}
              autoFocus={!initial}
              returnKeyType="done"
            />

            <View style={styles.whenRow}>
              <View style={styles.whenCol}>
                <Text style={styles.label}>DAY</Text>
                {isWeb ? (
                  <View style={styles.field}>
                    {React.createElement('input', {
                      type: 'date',
                      value: dateISO,
                      onChange: (e: any) => e.target.value && setDateISO(e.target.value),
                      style: webDateTimeInputStyle,
                    })}
                  </View>
                ) : (
                  <>
                    <Pressable style={styles.field} onPress={() => setShowDatePicker(true)}>
                      <Text style={styles.fieldText}>
                        {fmtDate(combined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
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
                  </>
                )}
              </View>

              <View style={styles.whenCol}>
                <Text style={styles.label}>HOUR</Text>
                {isWeb ? (
                  <View style={styles.field}>
                    {React.createElement('input', {
                      type: 'time',
                      value: time,
                      onChange: (e: any) => e.target.value && setTime(e.target.value),
                      style: webDateTimeInputStyle,
                    })}
                  </View>
                ) : (
                  <>
                    <Pressable style={styles.field} onPress={() => setShowTimePicker(true)}>
                      <Text style={styles.fieldText}>
                        {fmtTime(combined, { hour: 'numeric', minute: '2-digit' })}
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
                  </>
                )}
              </View>
            </View>

            <Text style={styles.label}>DURATION</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => {
                const active = durationMin === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      safeHaptics.selection();
                      setDurationMin(d);
                    }}
                    style={[styles.durChip, active && styles.durChipActive]}
                  >
                    <Text style={[styles.durChipText, active && styles.durChipTextActive]}>
                      {d < 60 ? `${d}m` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h${d % 60}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>RECURRENCE</Text>
            <RepeatSelector value={repeat} onChange={setRepeat} />

            <Text style={styles.label}>PATH</Text>
            <CategorySelector value={category} onChange={setCategory} />
          </SystemPanel>

          {/* live reward readout */}
          <View style={styles.rewardRow}>
            <SystemGlyph name="xp" size={16} color={colors.xp} charged />
            <Text style={styles.rewardText}>
              Sealing this quest grants <Text style={styles.rewardXp}>+{xp.totalXp} XP</Text>
              {skillNames.length > 0 ? ` toward ${skillNames.join(' and ')}` : ''}
            </Text>
          </View>

          {error && (
            <View style={styles.errorRow}>
              <SystemGlyph name="warning" size={14} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.saveBtn, pressed && styles.btnPressed]}
              onPress={handleSave}
            >
              <SystemGlyph name="claim" size={17} color="#FFFFFF" strokeWidth={1.9} />
              <Text style={styles.saveBtnText}>{initial ? 'SAVE QUEST' : 'CLAIM QUEST'}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.cancelBtn]} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </Pressable>
            {initial && (
              <Pressable style={[styles.btn, styles.deleteBtn]} onPress={confirmDelete}>
                <Text style={styles.deleteBtnText}>RELEASE QUEST</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing(4),
    paddingTop: spacing(5),
    paddingBottom: spacing(12),
    gap: spacing(3),
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center', flex: 1 },
  eyebrow: { ...font.label, fontSize: 9, color: colors.arcCyan, letterSpacing: 2.4 },
  heading: { ...font.title, fontSize: 21, color: colors.text, marginTop: 1 },
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
  iconBtnGhost: { width: 36, height: 36 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), padding: spacing(3) },
  bannerText: { ...font.caption, flex: 1, color: colors.textDim, fontSize: 11.5, lineHeight: 16 },

  formPanel: { padding: spacing(4), gap: spacing(1) },
  label: {
    ...font.label,
    fontSize: 9,
    color: colors.textFainter,
    letterSpacing: 2,
    marginBottom: spacing(1.5),
    marginTop: spacing(3),
  },
  input: {
    backgroundColor: 'rgba(4,4,7,0.5)',
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3.5),
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    fontFamily: theme.fontFamily.manropeSemiBold,
  },
  whenRow: { flexDirection: 'row', gap: spacing(3) },
  whenCol: { flex: 1 },
  field: {
    backgroundColor: 'rgba(4,4,7,0.5)',
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3.25),
    justifyContent: 'center',
    minHeight: 48,
  },
  fieldText: { ...font.body, color: colors.text, fontSize: 15, fontWeight: '600' },

  durationRow: { flexDirection: 'row', gap: spacing(1.5), flexWrap: 'wrap' },
  durChip: {
    flex: 1,
    minWidth: 46,
    paddingVertical: spacing(2.25),
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    backgroundColor: 'rgba(4,4,7,0.4)',
    alignItems: 'center',
  },
  durChipActive: { borderColor: 'rgba(92,225,255,0.5)', backgroundColor: colors.arcCyanSoft },
  durChipText: { ...font.caption, fontSize: 12, color: colors.textFaint, fontWeight: '700' },
  durChipTextActive: { color: colors.arcCyan },

  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingHorizontal: spacing(1),
  },
  rewardText: { ...font.caption, flex: 1, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  rewardXp: { color: colors.xp, fontWeight: '800' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  error: { ...font.caption, color: colors.danger, fontSize: 12 },

  actions: { marginTop: spacing(2), gap: spacing(2) },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    borderRadius: radii.pill,
    paddingVertical: spacing(4),
  },
  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  saveBtn: {
    backgroundColor: colors.signal,
    shadowColor: colors.signal,
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  saveBtnText: { ...font.label, fontSize: 11.5, color: '#FFFFFF', letterSpacing: 2 },
  cancelBtn: {
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    paddingVertical: spacing(3.25),
  },
  cancelBtnText: { ...font.label, fontSize: 10, color: colors.textDim, letterSpacing: 1.6 },
  deleteBtn: { backgroundColor: 'transparent', paddingVertical: spacing(3) },
  deleteBtnText: { ...font.label, fontSize: 10, color: colors.danger, letterSpacing: 1.6 },
});
