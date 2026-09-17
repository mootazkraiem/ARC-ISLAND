import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import { colors, font, radii, spacing } from '../theme';
import { Reminder } from '../types';
import { fmtDate } from '../locale';
import { WorldBackground } from '../components/world/WorldBackground';
import { SystemPanel } from '../components/SystemPanel';
import { SystemGlyph } from '../components/SystemGlyph';
import { WeekGrid } from '../calendar/WeekGrid';
import { MonthGrid } from '../calendar/MonthGrid';
import {
  addDays,
  fromISODate,
  isSameDay,
  startOfWeek,
  toISODate,
} from '../calendar/occurrences';
import { WeekProposal, proposalOccurrences, proposalStats } from '../system/forge';
import { useProgress } from '../progression/useProgress';

// ─────────────────────────────────────────────────────────────────────────
// THE QUEST CALENDAR — the map of the user's time.
//
// Week is the primary view and the default. Day is week zoomed in; Month is
// the record of consistency. All three read the same derived occurrences
// over the one reminder store — there is no second calendar data model.
//
// A live Forge proposal renders as phantom blocks INSIDE this map with an
// accept/edit/reject bar pinned to the bottom, rather than in a separate
// confirmation screen — the user judges a proposed week against their real
// week, in place, which is the only way the decision is actually informed.
// ─────────────────────────────────────────────────────────────────────────

type ViewMode = 'day' | 'week' | 'month';

interface Props {
  reminders: Reminder[];
  onBack: () => void;
  onOpenQuest: (r: Reminder) => void;
  onCompleteQuest: (id: string) => void;
  onReschedule: (r: Reminder, next: { date: string; time: string; durationMin: number }) => void;
  onClaimAt: (dateISO: string, time: string) => void;
  onOpenSystem: () => void;
  proposal: WeekProposal | null;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
  /** Sends the user into the System to revise the proposal in conversation
   * — "edit" on a forged week means talking to the System again, not
   * hand-editing twelve blocks in a form. */
  onReviseProposal: () => void;
}

export function QuestCalendarScreen({
  reminders,
  onBack,
  onOpenQuest,
  onCompleteQuest,
  onReschedule,
  onClaimAt,
  onOpenSystem,
  proposal,
  onAcceptProposal,
  onRejectProposal,
  onReviseProposal,
}: Props) {
  const { width } = useWindowDimensions();
  const progress = useProgress();
  const [mode, setMode] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const proposalOccs = useMemo(() => proposalOccurrences(proposal), [proposal]);

  // A forged week is useless if the user cannot see it. When a proposal
  // arrives, jump the calendar to the week it covers and scroll the grid to
  // its earliest block — otherwise the review bar announces "8 quests" over
  // what looks like an empty grid, because the grid is still parked at the
  // current hour.
  const firstProposedMin = useMemo(() => {
    if (proposalOccs.length === 0) return null;
    return Math.min(...proposalOccs.map((o) => o.startMin));
  }, [proposalOccs]);

  useEffect(() => {
    if (!proposal) return;
    setMode('week');
    setCursor(fromISODate(proposal.weekAnchor));
  }, [proposal?.id]);

  // Content width available to the grid, minus the screen's own padding.
  const pad = spacing(4);
  const gridWidth = Math.min(width, 1100) - pad * 2 - 2;

  const weekAnchor = startOfWeek(cursor);
  const anchor = mode === 'day' ? cursor : weekAnchor;

  const step = (dir: -1 | 1) => {
    safeHaptics.selection();
    if (mode === 'day') setCursor((c) => addDays(c, dir));
    else if (mode === 'week') setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  };

  const goToday = () => {
    safeHaptics.selection();
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  };

  const rangeLabel = useMemo(() => {
    if (mode === 'day') {
      return fmtDate(cursor, { weekday: 'long', month: 'long', day: 'numeric' });
    }
    if (mode === 'month') {
      return fmtDate(cursor, { month: 'long', year: 'numeric' });
    }
    const end = addDays(weekAnchor, 6);
    const sameMonth = weekAnchor.getMonth() === end.getMonth();
    const a = fmtDate(weekAnchor, { month: 'short', day: 'numeric' });
    const b = fmtDate(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
    return `${a} — ${b}`;
  }, [mode, cursor, weekAnchor]);

  const stats = proposal ? proposalStats(proposal) : null;

  const handleAccept = () => {
    if (!stats) return;
    const warn =
      stats.collisions > 0
        ? `\n\n${stats.collisions} of these overlap quests already in your world. They will be added anyway — nothing existing is removed.`
        : '';
    safeAlert(
      'Commit this week?',
      `${stats.count} quests across ${stats.days} days will be registered with the System.${warn}`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Commit',
          onPress: () => {
            safeHaptics.notification(Haptics.NotificationFeedbackType.Success);
            onAcceptProposal();
          },
        },
      ]
    );
  };

  const handleReject = () => {
    safeAlert('Discard this forged week?', 'The proposal is dropped. Nothing in your world changes.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onRejectProposal },
    ]);
  };

  return (
    <View style={styles.root}>
      {/* The world stays visible behind the grid, dimmed so the dense
          timeline keeps its contrast. */}
      <WorldBackground animated={false} intensity={0.55} />

      <View style={[styles.content, { paddingHorizontal: pad }]}>
        {/* ── header ── */}
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
            <SystemGlyph name="back" size={18} color={colors.textDim} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.eyebrow}>QUEST CALENDAR</Text>
            <Text style={styles.rangeLabel}>{rangeLabel}</Text>
          </View>
          <Pressable onPress={onOpenSystem} hitSlop={12} style={styles.iconBtn}>
            <SystemGlyph name="system" size={19} color={colors.signal} />
          </Pressable>
        </View>

        {/* ── controls ── */}
        <View style={styles.controls}>
          <View style={styles.modeRow}>
            {(['day', 'week', 'month'] as ViewMode[]).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    safeHaptics.selection();
                    setMode(m);
                  }}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.navRow}>
            <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.navBtn}>
              <SystemGlyph name="back" size={14} color={colors.textDim} />
            </Pressable>
            <Pressable onPress={goToday} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>NOW</Text>
            </Pressable>
            <Pressable onPress={() => step(1)} hitSlop={10} style={styles.navBtn}>
              <View style={{ transform: [{ rotate: '180deg' }] }}>
                <SystemGlyph name="back" size={14} color={colors.textDim} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── the grid ── */}
        <SystemPanel
          tone={proposal ? 'due' : 'cyan'}
          lit={!!proposal}
          bracket={16}
          style={styles.gridPanel}
        >
          {mode === 'month' ? (
            <MonthGrid
              reminders={reminders}
              anchor={cursor}
              completedDates={progress.lastCompletedDate}
              selected={cursor}
              onPickDay={(d) => {
                safeHaptics.selection();
                setCursor(d);
                setMode('day');
              }}
            />
          ) : (
            <WeekGrid
              reminders={reminders}
              anchor={anchor}
              columns={mode === 'day' ? 1 : 7}
              completedDates={progress.lastCompletedDate}
              onReschedule={onReschedule}
              onOpenQuest={onOpenQuest}
              onCompleteQuest={onCompleteQuest}
              onClaimAt={onClaimAt}
              proposals={proposalOccs}
              scrollToMin={firstProposedMin}
              gridWidth={gridWidth}
            />
          )}
        </SystemPanel>

        {/* ── forged-week review bar ── */}
        {proposal && stats && (
          <SystemPanel tone="xp" lit bracket={14} style={styles.reviewBar}>
            <View style={styles.reviewHead}>
              <SystemGlyph name="forge" size={17} color={colors.xp} charged />
              <Text style={styles.reviewTitle}>WEEK FORGED · NOT YET COMMITTED</Text>
            </View>
            <Text style={styles.reviewSummary} numberOfLines={3}>
              {proposal.summary}
            </Text>
            <Text style={styles.reviewStats}>
              {stats.count} quests · {stats.days} days
              {stats.collisions > 0 ? ` · ${stats.collisions} overlap existing` : ' · no conflicts'}
            </Text>
            <View style={styles.reviewActions}>
              <Pressable style={[styles.reviewBtn, styles.acceptBtn]} onPress={handleAccept}>
                <SystemGlyph name="check" size={14} color={colors.void} strokeWidth={2.2} />
                <Text style={styles.acceptBtnText}>ACCEPT</Text>
              </Pressable>
              <Pressable style={[styles.reviewBtn, styles.editBtn]} onPress={onReviseProposal}>
                <SystemGlyph name="system" size={14} color={colors.signal} />
                <Text style={styles.editBtnText}>REVISE</Text>
              </Pressable>
              <Pressable style={[styles.reviewBtn, styles.rejectBtn]} onPress={handleReject}>
                <SystemGlyph name="close" size={13} color={colors.danger} strokeWidth={2} />
                <Text style={styles.rejectBtnText}>REJECT</Text>
              </Pressable>
            </View>
          </SystemPanel>
        )}

        {!proposal && (
          <Pressable style={styles.forgeCta} onPress={onOpenSystem}>
            <SystemGlyph name="forge" size={22} color={colors.xp} strokeWidth={1.6} />
            <Text style={styles.forgeCtaText}>FORGE MY WEEK</Text>
            <Text style={styles.forgeCtaHint}>Tell the System what your week holds</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  content: { flex: 1, paddingTop: Platform.OS === 'web' ? spacing(4) : spacing(3), maxWidth: 1100, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  headerCenter: { alignItems: 'center', flex: 1 },
  eyebrow: { ...font.label, fontSize: 9.5, color: colors.arcCyan, letterSpacing: 2.2 },
  rangeLabel: { ...font.heading, fontSize: 16, color: colors.text, marginTop: 2 },
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

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2.5) },
  modeRow: { flexDirection: 'row', gap: spacing(1.5) },
  modeChip: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    backgroundColor: colors.holo,
  },
  modeChipActive: { borderColor: colors.arcCyan, backgroundColor: colors.arcCyanSoft },
  modeChipText: { ...font.label, fontSize: 9, letterSpacing: 1.4, color: colors.textFaint },
  modeChipTextActive: { color: colors.arcCyan },

  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.holoBorder,
    backgroundColor: colors.holo,
  },
  todayBtn: {
    paddingHorizontal: spacing(3),
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.arcCyanSoft,
    borderWidth: 1,
    borderColor: 'rgba(92,225,255,0.4)',
  },
  todayBtnText: { ...font.label, fontSize: 9, color: colors.arcCyan, letterSpacing: 1.4 },

  gridPanel: { flex: 1, paddingTop: spacing(2), paddingHorizontal: 1, paddingBottom: spacing(1), overflow: 'hidden' },

  reviewBar: { marginTop: spacing(2.5), marginBottom: spacing(3), padding: spacing(3.5), gap: spacing(2) },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  reviewTitle: { ...font.label, fontSize: 9.5, color: colors.xp, letterSpacing: 1.8 },
  reviewSummary: { ...font.body, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  reviewStats: { ...font.caption, fontSize: 11, color: colors.textFaint },
  reviewActions: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1) },
  reviewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2.5),
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  acceptBtn: { backgroundColor: colors.done, borderColor: colors.done },
  acceptBtnText: { ...font.label, fontSize: 10, color: colors.void, letterSpacing: 1.2 },
  editBtn: { backgroundColor: colors.signalSoft, borderColor: 'rgba(124,92,255,0.45)' },
  editBtnText: { ...font.label, fontSize: 10, color: colors.signal, letterSpacing: 1.2 },
  rejectBtn: { backgroundColor: 'transparent', borderColor: 'rgba(255,92,108,0.4)' },
  rejectBtnText: { ...font.label, fontSize: 10, color: colors.danger, letterSpacing: 1.2 },

  forgeCta: {
    marginTop: spacing(2.5),
    marginBottom: spacing(3),
    paddingVertical: spacing(3),
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,198,92,0.28)',
    backgroundColor: 'rgba(255,198,92,0.06)',
    alignItems: 'center',
    gap: 3,
  },
  forgeCtaText: { ...font.label, fontSize: 11, color: colors.xp, letterSpacing: 2 },
  forgeCtaHint: { ...font.caption, fontSize: 11, color: colors.textFaint },
});
