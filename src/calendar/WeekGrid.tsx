import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { safeHaptics } from '../haptics';
import { colors, font, radii, spacing, category as categoryTokens, motion } from '../theme';
import { SystemGlyph } from '../components/SystemGlyph';
import { Reminder } from '../types';
import { WEEKDAY_SHORT, mondayIndex } from '../locale';
import {
  LaidOutOccurrence,
  MIN_QUEST_MINUTES,
  QuestOccurrence,
  addDays,
  clampDuration,
  formatHour,
  isSameDay,
  layoutDay,
  occurrencesForDay,
  timeFromMinutes,
  toISODate,
} from './occurrences';

// ─────────────────────────────────────────────────────────────────────────
// The time grid — the map of the user's time.
//
// One component renders both the DAY view (columns = 1) and the WEEK view
// (columns = 7); they are the same object at different zoom levels, which
// is why they share code rather than being two screens.
//
// Drag semantics:
//   - Long-press (250ms) arms a drag. A plain tap still opens the quest,
//     and a plain vertical drag still scrolls the grid — arming on
//     long-press is what keeps all three gestures from fighting.
//   - While dragging, the real block follows the finger and a GHOST is
//     drawn at the snapped destination cell, so the user sees exactly
//     where it will land before releasing.
//   - On release the block springs into the ghost's position and the
//     change is committed through onReschedule, which routes back into
//     App.tsx's applyReminderUpdate → syncNotificationForReminder. The
//     alarm is rescheduled by the same code path as any manual edit.
//
// Resize drags the bottom edge only, snapping to 15 minutes, floored at
// MIN_QUEST_MINUTES.
// ─────────────────────────────────────────────────────────────────────────

export const HOUR_HEIGHT = 58;
const PX_PER_MIN = HOUR_HEIGHT / 60;
const SNAP_MIN = 15;
const GUTTER = 42;
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;

export interface WeekGridProps {
  reminders: Reminder[];
  /** First column's day. Week view renders this + 6; day view just this. */
  anchor: Date;
  columns: 1 | 7;
  completedDates: Record<string, string>;
  /** Commits a drag/resize. Receives the already-resolved new values. */
  onReschedule: (reminder: Reminder, next: { date: string; time: string; durationMin: number }) => void;
  onOpenQuest: (reminder: Reminder) => void;
  onCompleteQuest: (id: string) => void;
  /** Tapping empty space claims a quest in that slot. */
  onClaimAt: (dateISO: string, time: string) => void;
  /** Proposed (not yet committed) blocks from Forge My Week, drawn as
   * outlined phantoms alongside the real schedule. */
  proposals?: QuestOccurrence[];
  gridWidth: number;
}

export function WeekGrid({
  reminders,
  anchor,
  columns,
  completedDates,
  onReschedule,
  onOpenQuest,
  onCompleteQuest,
  onClaimAt,
  proposals = [],
  gridWidth,
}: WeekGridProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [now, setNow] = useState(new Date());

  // The current-time indicator has to actually track time or it is a lie.
  // 30s is frequent enough that the line never looks stale and cheap
  // enough that it costs nothing.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(
    () => Array.from({ length: columns }, (_, i) => addDays(anchor, i)),
    [anchor, columns]
  );

  const colWidth = Math.max(44, (gridWidth - GUTTER) / columns);

  const laidOut = useMemo(
    () =>
      days.map((d) =>
        layoutDay(occurrencesForDay(reminders, d, { completedDates, now, includeDisabled: true }))
      ),
    [days, reminders, completedDates, now]
  );

  const proposalsByDay = useMemo(() => {
    const map: Record<string, QuestOccurrence[]> = {};
    for (const p of proposals) (map[p.dateISO] ??= []).push(p);
    return map;
  }, [proposals]);

  // Open on the working day, not on midnight — landing at 00:00 every time
  // makes the grid feel dead.
  useEffect(() => {
    const target = Math.max(0, (now.getHours() - 2) * HOUR_HEIGHT);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: target, animated: false }), 60);
    return () => clearTimeout(t);
  }, [columns]);

  const totalHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIdx = days.findIndex((d) => isSameDay(d, now));

  return (
    <View style={styles.wrap}>
      {/* Day header — stays pinned above the scrolling grid */}
      <View style={[styles.headerRow, { paddingLeft: GUTTER }]}>
        {days.map((d, i) => {
          const isToday = isSameDay(d, now);
          return (
            <View key={toISODate(d)} style={[styles.headerCell, { width: colWidth }]}>
              <Text style={[styles.headerDow, isToday && styles.headerDowToday]}>
                {WEEKDAY_SHORT[mondayIndex(d)]}
              </Text>
              <View style={[styles.headerDateWrap, isToday && styles.headerDateWrapToday]}>
                <Text style={[styles.headerDate, isToday && styles.headerDateToday]}>{d.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ height: totalHeight + 10, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hour rules + gutter labels. Drawn once behind everything. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => {
            const hour = DAY_START_HOUR + i;
            // Night hours are dimmer — the grid should read as a day/night
            // cycle in the world, not a uniform spreadsheet.
            const night = hour < 6 || hour >= 22;
            return (
              <View key={hour} style={[styles.hourRow, { top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }]}>
                <Text style={[styles.hourLabel, night && styles.hourLabelNight]}>{formatHour(hour)}</Text>
                <View style={[styles.hourLine, night && styles.hourLineNight]} />
              </View>
            );
          })}
        </View>

        {/* Column separators */}
        <View style={[StyleSheet.absoluteFill, { left: GUTTER, flexDirection: 'row' }]} pointerEvents="none">
          {days.map((d, i) => (
            <View
              key={`sep-${i}`}
              style={[
                styles.colSep,
                { width: colWidth },
                todayIdx === i && styles.colSepToday,
              ]}
            />
          ))}
        </View>

        {/* Tap-to-claim layer, per column. Sits under the blocks so an
            existing block always wins the tap. */}
        <View style={[StyleSheet.absoluteFill, { left: GUTTER, flexDirection: 'row' }]}>
          {days.map((d) => (
            <ClaimColumn
              key={`claim-${toISODate(d)}`}
              width={colWidth}
              height={totalHeight}
              onClaim={(min) => onClaimAt(toISODate(d), timeFromMinutes(min))}
            />
          ))}
        </View>

        {/* Proposal phantoms — drawn beneath real quests */}
        {days.map((d, dayIdx) =>
          (proposalsByDay[toISODate(d)] ?? []).map((p) => (
            <ProposalBlock
              key={`p-${p.key}`}
              occ={p}
              left={GUTTER + dayIdx * colWidth}
              width={colWidth}
            />
          ))
        )}

        {/* Real quest blocks */}
        {laidOut.map((dayOccs, dayIdx) =>
          dayOccs.map((occ) => (
            <QuestBlock
              key={occ.key}
              occ={occ}
              dayIdx={dayIdx}
              colWidth={colWidth}
              columns={columns}
              anchor={anchor}
              onOpen={() => onOpenQuest(occ.reminder)}
              onComplete={() => onCompleteQuest(occ.reminder.id)}
              onReschedule={onReschedule}
            />
          ))
        )}

        {/* Current-time indicator, last so it sits above every block */}
        {todayIdx >= 0 && (
          <View
            style={[styles.nowRow, { top: nowMin * PX_PER_MIN }]}
            pointerEvents="none"
          >
            <Text style={styles.nowLabel}>{timeFromMinutes(nowMin)}</Text>
            <View style={styles.nowLineWrap}>
              <View style={styles.nowDot} />
              <View style={styles.nowLine} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Transparent per-column press target that converts a tap's y offset into
 * a snapped time and claims a quest there. */
function ClaimColumn({
  width,
  height,
  onClaim,
}: {
  width: number;
  height: number;
  onClaim: (min: number) => void;
}) {
  return (
    <Pressable
      style={{ width, height }}
      onPress={(e) => {
        const y = e.nativeEvent.locationY;
        const raw = y / PX_PER_MIN;
        onClaim(Math.round(raw / 30) * 30);
      }}
    />
  );
}

function ProposalBlock({
  occ,
  left,
  width,
}: {
  occ: QuestOccurrence;
  left: number;
  width: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.proposal,
        {
          top: occ.startMin * PX_PER_MIN,
          height: Math.max(22, occ.durationMin * PX_PER_MIN - 2),
          left: left + 2,
          width: width - 4,
        },
      ]}
    >
      <Text style={styles.proposalText} numberOfLines={1}>
        {occ.reminder.title}
      </Text>
    </View>
  );
}

const STATE_TONE: Record<string, string> = {
  completed: colors.done,
  active: colors.arcCyan,
  overdue: colors.due,
  upcoming: colors.signal,
  dormant: colors.textFainter,
};

function QuestBlock({
  occ,
  dayIdx,
  colWidth,
  columns,
  anchor,
  onOpen,
  onComplete,
  onReschedule,
}: {
  occ: LaidOutOccurrence;
  dayIdx: number;
  colWidth: number;
  columns: 1 | 7;
  anchor: Date;
  onOpen: () => void;
  onComplete: () => void;
  onReschedule: WeekGridProps['onReschedule'];
}) {
  // Overlapping lanes rather than equal columns: each additional lane is
  // stepped right by a small inset and the block keeps most of the column
  // width, so a contested slot stays readable. Later lanes draw on top.
  const laneInset = occ.laneCount > 1 ? Math.min(16, colWidth * 0.28) : 0;
  const laneWidth = colWidth - laneInset * (occ.laneCount - 1);
  const baseLeft = GUTTER + dayIdx * colWidth + occ.lane * laneInset;
  const baseTop = occ.startMin * PX_PER_MIN;
  const baseHeight = Math.max(24, occ.durationMin * PX_PER_MIN - 2);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dh = useSharedValue(0);
  const dragging = useSharedValue(0);
  const resizing = useSharedValue(0);

  // Ghost destination, in plain React state so it can render normal views.
  const [ghost, setGhost] = useState<{ top: number; left: number; height: number; label: string } | null>(
    null
  );

  const tone = STATE_TONE[occ.state] ?? colors.signal;
  const catTone = categoryTokens[occ.reminder.category]?.dot ?? colors.signal;

  const commit = (dxCols: number, dyMin: number, extraMin: number) => {
    const newDayIdx = Math.max(0, Math.min(columns - 1, dayIdx + dxCols));
    const newDate = toISODate(addDays(anchor, newDayIdx));
    const rawMin = occ.startMin + dyMin;
    const snapped = Math.max(0, Math.min(24 * 60 - SNAP_MIN, Math.round(rawMin / SNAP_MIN) * SNAP_MIN));
    const newDuration = clampDuration(occ.durationMin + extraMin);

    const unchanged =
      newDate === occ.reminder.date &&
      timeFromMinutes(snapped) === occ.reminder.time &&
      newDuration === (occ.reminder.durationMin ?? occ.durationMin);

    if (!unchanged) {
      safeHaptics.notification(Haptics.NotificationFeedbackType.Success);
      onReschedule(occ.reminder, {
        date: newDate,
        time: timeFromMinutes(snapped),
        durationMin: newDuration,
      });
    }
    setGhost(null);
  };

  const updateGhost = (dxPx: number, dyPx: number, dhPx: number) => {
    const dxCols = columns === 1 ? 0 : Math.round(dxPx / colWidth);
    const newDayIdx = Math.max(0, Math.min(columns - 1, dayIdx + dxCols));
    const rawMin = occ.startMin + dyPx / PX_PER_MIN;
    const snapped = Math.max(0, Math.min(24 * 60 - SNAP_MIN, Math.round(rawMin / SNAP_MIN) * SNAP_MIN));
    const dur = clampDuration(occ.durationMin + dhPx / PX_PER_MIN);
    setGhost({
      top: snapped * PX_PER_MIN,
      left: GUTTER + newDayIdx * colWidth + 2,
      height: Math.max(24, dur * PX_PER_MIN - 2),
      label: timeFromMinutes(snapped),
    });
  };

  // Plain JS callback hopped to from inside the gesture worklets. Defined
  // as a normal function (not a worklet) on purpose — runOnJS is what
  // crosses the boundary, and safeHaptics already no-ops on web.
  const pulse = () => safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);

  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      dragging.value = withTiming(1, { duration: 120 });
      runOnJS(pulse)();
    })
    .onUpdate((e) => {
      tx.value = columns === 1 ? 0 : e.translationX;
      ty.value = e.translationY;
      runOnJS(updateGhost)(e.translationX, e.translationY, 0);
    })
    .onEnd((e) => {
      const dxCols = columns === 1 ? 0 : Math.round(e.translationX / colWidth);
      const dyMin = e.translationY / PX_PER_MIN;
      runOnJS(commit)(dxCols, dyMin, 0);
    })
    .onFinalize(() => {
      dragging.value = withTiming(0, { duration: 160 });
      tx.value = withSpring(0, motion.micro);
      ty.value = withSpring(0, motion.micro);
    });

  const resize = Gesture.Pan()
    .onStart(() => {
      resizing.value = withTiming(1, { duration: 120 });
      runOnJS(pulse)();
    })
    .onUpdate((e) => {
      dh.value = e.translationY;
      runOnJS(updateGhost)(0, 0, e.translationY);
    })
    .onEnd((e) => {
      runOnJS(commit)(0, 0, e.translationY / PX_PER_MIN);
    })
    .onFinalize(() => {
      resizing.value = withTiming(0, { duration: 160 });
      dh.value = withSpring(0, motion.micro);
    });

  const tap = Gesture.Tap().maxDuration(240).onEnd((_e, success) => {
    if (success) runOnJS(onOpen)();
  });

  const composed = Gesture.Exclusive(pan, tap);

  const blockStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: 1 + dragging.value * 0.03 },
    ],
    height: Math.max(24, baseHeight + dh.value),
    zIndex: dragging.value > 0 || resizing.value > 0 ? 50 : 2 + occ.lane,
    opacity: 1 - dragging.value * 0.15,
    shadowOpacity: 0.25 + dragging.value * 0.5,
  }));

  const short = baseHeight < 40;
  // Week view gets much narrower columns than day view, so it needs its own
  // type scale — one size for both is why titles were breaking mid-word.
  const dense = columns === 7;

  return (
    <>
      {ghost && (
        <View
          pointerEvents="none"
          style={[
            styles.ghost,
            { top: ghost.top, left: ghost.left, height: ghost.height, width: colWidth - 4, borderColor: tone },
          ]}
        >
          <Text style={[styles.ghostLabel, { color: tone }]}>{ghost.label}</Text>
        </View>
      )}

      <GestureDetector gesture={composed}>
        <Animated.View
          style={[
            styles.block,
            {
              top: baseTop,
              left: baseLeft + 2,
              width: laneWidth - 4,
              borderColor: tone,
              backgroundColor: occ.state === 'completed' ? 'rgba(55,225,180,0.10)' : colors.holoRaise,
              shadowColor: tone,
            },
            occ.state === 'dormant' && styles.blockDormant,
            blockStyle,
          ]}
        >
          {/* Category spine — the left edge carries the category hue so a
              week of blocks reads as a colour rhythm at a glance. */}
          <View style={[styles.spine, { backgroundColor: catTone }]} />

          {occ.conflict && (
            <View style={styles.conflictBadge}>
              <SystemGlyph name="conflict" size={11} color={colors.due} strokeWidth={1.7} />
            </View>
          )}

          <View style={styles.blockBody}>
            <Text
              style={[
                styles.blockTitle,
                dense && styles.blockTitleDense,
                short && styles.blockTitleShort,
                occ.state === 'completed' && styles.blockTitleDone,
              ]}
              numberOfLines={short ? 1 : dense ? 3 : 2}
              ellipsizeMode="tail"
            >
              {occ.reminder.title}
            </Text>
            {!short && !dense && (
              <Text style={[styles.blockTime, { color: tone }]} numberOfLines={1}>
                {timeFromMinutes(occ.startMin)}
              </Text>
            )}
          </View>

          {occ.state === 'completed' ? (
            <View style={styles.blockMark}>
              <SystemGlyph name="questComplete" size={13} color={colors.done} charged strokeWidth={1.6} />
            </View>
          ) : occ.state === 'overdue' ? (
            <View style={styles.blockMark}>
              <SystemGlyph name="questOverdue" size={13} color={colors.due} strokeWidth={1.6} />
            </View>
          ) : occ.state === 'active' ? (
            <View style={styles.blockMark}>
              <SystemGlyph name="questActive" size={13} color={colors.arcCyan} strokeWidth={1.6} />
            </View>
          ) : null}

          {/* Resize handle — only when the block is tall enough to grab
              without swallowing the whole block's tap target. */}
          {!short && occ.state !== 'completed' && (
            <GestureDetector gesture={resize}>
              <Animated.View style={styles.resizeHandle}>
                <View style={[styles.resizeBar, { backgroundColor: tone }]} />
              </Animated.View>
            </GestureDetector>
          )}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.holoBorder,
    paddingBottom: spacing(1.5),
  },
  headerCell: { alignItems: 'center', gap: 3 },
  headerDow: { ...font.label, fontSize: 9, letterSpacing: 1.4, color: colors.textFainter },
  headerDowToday: { color: colors.arcCyan },
  headerDateWrap: {
    minWidth: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDateWrapToday: {
    backgroundColor: colors.arcCyanSoft,
    borderWidth: 1,
    borderColor: 'rgba(92,225,255,0.45)',
  },
  headerDate: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 13, color: colors.textDim },
  headerDateToday: { color: colors.arcCyan },

  scroll: { flex: 1 },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLabel: {
    width: GUTTER,
    ...font.caption,
    fontSize: 9.5,
    color: colors.textFainter,
    textAlign: 'right',
    paddingRight: 6,
    // Pulled up to sit ON the hour rule, but not so far that the first
    // label (12A) clips against the top of the scroll container.
    marginTop: -4,
  },
  hourLabelNight: { color: 'rgba(122,122,146,0.45)' },
  hourLine: { flex: 1, height: 1, backgroundColor: 'rgba(124,158,255,0.09)' },
  hourLineNight: { backgroundColor: 'rgba(124,158,255,0.045)' },
  colSep: { borderLeftWidth: 1, borderLeftColor: 'rgba(124,158,255,0.07)', height: '100%' },
  colSepToday: { backgroundColor: 'rgba(92,225,255,0.035)' },

  block: {
    position: 'absolute',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderLeftWidth: 0,
    paddingVertical: 3,
    paddingLeft: 6,
    paddingRight: 3,
    overflow: 'hidden',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  blockDormant: { opacity: 0.4, borderStyle: 'dashed' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: radii.sm, borderBottomLeftRadius: radii.sm },
  blockBody: { flex: 1 },
  blockTitle: { ...font.rowTitle, fontSize: 12.5, lineHeight: 15, color: colors.textSecondary },
  blockTitleDense: { fontSize: 9.5, lineHeight: 11.5, letterSpacing: -0.1 },
  blockTitleShort: { fontSize: 10.5, lineHeight: 12 },
  blockTitleDone: { color: colors.textFainter, textDecorationLine: 'line-through' },
  blockTime: { ...font.caption, fontSize: 9.5, marginTop: 1 },
  blockMark: { position: 'absolute', top: 3, right: 3 },
  conflictBadge: { position: 'absolute', bottom: 3, right: 3 },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  resizeBar: { width: 20, height: 2, borderRadius: 2, opacity: 0.6 },

  ghost: {
    position: 'absolute',
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(124,158,255,0.07)',
    zIndex: 40,
    paddingLeft: 6,
    paddingTop: 2,
  },
  ghostLabel: { ...font.caption, fontSize: 9.5, fontWeight: '800' },

  proposal: {
    position: 'absolute',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.xp,
    backgroundColor: 'rgba(255,198,92,0.08)',
    paddingLeft: 6,
    paddingTop: 3,
    zIndex: 0,
  },
  proposalText: { ...font.caption, fontSize: 9.5, color: colors.xp, fontWeight: '700' },

  nowRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 60 },
  nowLabel: {
    width: GUTTER,
    ...font.caption,
    fontSize: 9,
    fontWeight: '800',
    color: colors.arcCyan,
    textAlign: 'right',
    paddingRight: 6,
  },
  nowLineWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  nowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.arcCyan,
    shadowColor: colors.arcCyan,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  nowLine: { flex: 1, height: 1, backgroundColor: colors.arcCyan, opacity: 0.55 },
});
