import React from 'react';
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import { colors } from '../theme';

// ─────────────────────────────────────────────────────────────────────────
// ARC ISLAND — the system glyph set.
//
// One original icon language, not a grab-bag of emoji. Every glyph in this
// file obeys the same four construction rules, which is what makes them
// read as one system:
//
//   1. 24x24 grid, 1.5 stroke, round caps/joins, no fills except where a
//      shape is deliberately "charged" (completed, unlocked, active).
//   2. Every glyph is a CONTAINING FORM + an INNER MARK. The containing
//      form encodes the category:
//        diamond  -> a quest / an objective / something claimable
//        circle   -> the System itself, energy, progression
//        bracket  -> data, records, archives, surfaces
//        chevron  -> ascent, level, growth
//   3. The ARC — a partial circular sweep — recurs across the set. It is
//      the world's signature. Nothing here is a closed decorative circle
//      unless closure is the meaning (a seal, a completed ring).
//   4. Nothing is a recognizable real-world object drawn literally. No
//      bells, no clipboards, no trophies. These are system markings.
//
// All artwork here is original geometry authored for Arc Island.
// ─────────────────────────────────────────────────────────────────────────

export type GlyphName =
  // core nouns
  | 'quest'
  | 'questComplete'
  | 'questActive'
  | 'questOverdue'
  | 'xp'
  | 'level'
  | 'streak'
  | 'skills'
  | 'cards'
  | 'vault'
  | 'system'
  | 'calendar'
  | 'alarm'
  | 'locked'
  | 'warning'
  | 'progress'
  // actions / chrome
  | 'forge'
  | 'conflict'
  | 'claim'
  | 'back'
  | 'settings'
  | 'voice'
  | 'send'
  | 'close'
  | 'check'
  | 'repeat'
  | 'clock';

export interface SystemGlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
  /** Renders the glyph's "charged" state — the inner mark gains a fill and
   * the containing form brightens. Used for completed/unlocked/active. */
  charged?: boolean;
  strokeWidth?: number;
  opacity?: number;
}

/** The containing diamond used by every quest-family glyph. Drawn as a
 * polygon rather than a rotated square so the stroke joins stay sharp at
 * the four points at small sizes. */
const DIAMOND = '12,2.6 21.4,12 12,21.4 2.6,12';

export function SystemGlyph({
  name,
  size = 20,
  color = colors.text,
  charged = false,
  strokeWidth = 1.5,
  opacity = 1,
}: SystemGlyphProps) {
  const s = strokeWidth;
  const common = {
    stroke: color,
    strokeWidth: s,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
      <G>{renderGlyph(name, common, color, charged, s)}</G>
    </Svg>
  );
}

type Common = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: string;
};

function renderGlyph(name: GlyphName, c: Common, color: string, charged: boolean, s: number) {
  switch (name) {
    // ── QUEST FAMILY — the diamond ───────────────────────────────────────
    // An unclaimed quest is an empty diamond: a slot in the world waiting
    // to be filled. Everything that happens to a quest happens INSIDE it.
    case 'quest':
      return (
        <>
          <Polygon points={DIAMOND} {...c} />
          <Circle cx="12" cy="12" r="2.6" {...c} fill={charged ? color : 'none'} />
        </>
      );

    // Completed: the diamond is sealed and the inner mark becomes a struck
    // check. The check is drawn slightly off-centre-low so it reads as
    // "stamped into" the diamond rather than floating in it.
    case 'questComplete':
      return (
        <>
          <Polygon points={DIAMOND} {...c} fill={charged ? color : 'none'} fillOpacity={0.16} />
          <Path d="M7.9 12.1 L10.9 15.1 L16.3 9.2" {...c} strokeWidth={s + 0.3} />
        </>
      );

    // Active / in progress: the diamond gains an orbiting arc on its upper
    // right — the System is currently tracking this one.
    case 'questActive':
      return (
        <>
          <Polygon points={DIAMOND} {...c} />
          <Circle cx="12" cy="12" r="2.6" {...c} fill={color} fillOpacity={0.9} />
          <Path d="M16.4 6.4 A 8 8 0 0 1 18.6 11.2" {...c} strokeOpacity={0.75} />
        </>
      );

    // Overdue: the diamond is broken at the bottom-left — a gap in the
    // containing form. Reads as "this slot failed to close".
    case 'questOverdue':
      return (
        <>
          <Path d="M12 2.6 L21.4 12 L12 21.4 L5.4 14.8" {...c} />
          <Path d="M2.6 12 L6.6 8" {...c} strokeOpacity={0.45} />
          <Path d="M12 8.2 L12 13" {...c} strokeWidth={s + 0.3} />
          <Circle cx="12" cy="15.9" r="0.95" fill={color} stroke="none" />
        </>
      );

    // ── PROGRESSION FAMILY — circle and chevron ──────────────────────────
    // XP: an energy quantum. A small solid core inside an open arc that
    // does not close — energy in transit, not a stored total.
    case 'xp':
      return (
        <>
          <Path d="M12 3.4 A 8.6 8.6 0 1 1 5.2 17.4" {...c} />
          <Path d="M12.7 7.6 L9.1 12.8 L12.1 12.8 L11.3 16.9 L14.9 11.4 L11.9 11.4 Z" {...c} fill={color} fillOpacity={charged ? 1 : 0.85} strokeWidth={s * 0.8} />
        </>
      );

    // Level: the ascending chevron, stacked. Three ranks, the topmost
    // brightest — the direction of travel is always up.
    case 'level':
      return (
        <>
          <Path d="M5.6 10.4 L12 4.6 L18.4 10.4" {...c} strokeWidth={s + 0.35} />
          <Path d="M5.6 15 L12 9.2 L18.4 15" {...c} strokeOpacity={0.62} />
          <Path d="M5.6 19.6 L12 13.8 L18.4 19.6" {...c} strokeOpacity={0.3} />
        </>
      );

    // Streak: a chain of linked arcs. Unbroken repetition, drawn as three
    // interlocking sweeps rather than literal chain links.
    case 'streak':
      return (
        <>
          {/* Four links of a chain of days, each one taller than the last —
              consistency that compounds. The final link is sealed shut. */}
          <Path d="M3.8 16.2 L3.8 18.8" {...c} strokeWidth={s + 0.6} strokeOpacity={0.4} />
          <Path d="M8.6 13.4 L8.6 18.8" {...c} strokeWidth={s + 0.6} strokeOpacity={0.6} />
          <Path d="M13.4 9.8 L13.4 18.8" {...c} strokeWidth={s + 0.6} strokeOpacity={0.8} />
          <Path d="M18.2 5.6 L18.2 18.8" {...c} strokeWidth={s + 0.6} />
          <Circle cx="18.2" cy="4" r="1.6" {...c} fill={charged ? color : 'none'} strokeWidth={s} />
        </>
      );

    // Skills: a radial lattice — four vectors from a common core, each a
    // different length. A capability profile, not a star rating.
    case 'skills':
      return (
        <>
          <Path d="M12 12 L12 4.2" {...c} />
          <Path d="M12 12 L18.6 15.4" {...c} strokeOpacity={0.75} />
          <Path d="M12 12 L5.4 15.4" {...c} strokeOpacity={0.55} />
          <Path d="M12 4.2 L18.6 15.4 L5.4 15.4 Z" {...c} strokeOpacity={0.35} fill={charged ? color : 'none'} fillOpacity={0.14} />
          <Circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
        </>
      );

    // ── RECORD FAMILY — brackets ─────────────────────────────────────────
    // Cards: layered plates seen at a slight offset. The front plate carries
    // the diamond mark, tying the archive back to quests.
    case 'cards':
      return (
        <>
          <Rect x="7.4" y="3.6" width="12.2" height="15.6" rx="2.2" {...c} strokeOpacity={0.4} />
          <Rect x="4.4" y="6.2" width="12.2" height="15.6" rx="2.2" {...c} fill={charged ? color : 'none'} fillOpacity={0.12} />
          <Polygon points="10.5,10.6 13.6,14 10.5,17.4 7.4,14" {...c} strokeWidth={s * 0.9} />
        </>
      );

    // Vault: a sealed bracket with a single suspended point inside — a
    // holding place for things not yet actionable.
    case 'vault':
      return (
        <>
          <Path d="M8 3.6 L4.4 3.6 L4.4 20.4 L8 20.4" {...c} />
          <Path d="M16 3.6 L19.6 3.6 L19.6 20.4 L16 20.4" {...c} />
          <Circle cx="12" cy="12" r="3.1" {...c} fill={charged ? color : 'none'} fillOpacity={0.18} />
          <Path d="M12 8.9 L12 6.4" {...c} strokeOpacity={0.6} />
        </>
      );

    // ── THE SYSTEM ITSELF ────────────────────────────────────────────────
    // A closed inner core inside two concentric partial rings, rotated so
    // the ring gaps sit opposite each other. This is the only glyph in the
    // set with a fully solid centre — the System is the one closed thing.
    case 'system':
      return (
        <>
          <Circle cx="12" cy="12" r="3.2" fill={color} stroke="none" opacity={charged ? 1 : 0.9} />
          <Path d="M12 5.4 A 6.6 6.6 0 0 1 18.6 12" {...c} />
          <Path d="M12 18.6 A 6.6 6.6 0 0 1 5.4 12" {...c} />
          <Path d="M12 2.2 A 9.8 9.8 0 0 1 21.8 12" {...c} strokeOpacity={0.38} />
          <Path d="M12 21.8 A 9.8 9.8 0 0 1 2.2 12" {...c} strokeOpacity={0.38} />
        </>
      );

    // ── TIME ─────────────────────────────────────────────────────────────
    // Calendar: a bracketed field divided by a single horizon line, with
    // three quest points sitting on the grid. Not a literal wall calendar.
    case 'calendar':
      return (
        <>
          <Rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" {...c} />
          <Path d="M3.4 10 L20.6 10" {...c} />
          <Path d="M8 3.4 L8 6.6" {...c} />
          <Path d="M16 3.4 L16 6.6" {...c} />
          <Circle cx="8.2" cy="13.8" r="1.25" fill={color} stroke="none" opacity={0.9} />
          <Circle cx="12" cy="17.2" r="1.25" fill={color} stroke="none" opacity={0.55} />
          <Circle cx="15.8" cy="13.8" r="1.25" fill={color} stroke="none" opacity={0.75} />
        </>
      );

    // Clock: an arc-hand dial. The hand is a vector from the core, the dial
    // is deliberately open at the top so it matches the arc motif.
    case 'clock':
      return (
        <>
          <Path d="M12 3.6 A 8.4 8.4 0 1 1 11.2 3.64" {...c} />
          <Path d="M12 7.4 L12 12 L15.4 14.1" {...c} strokeWidth={s + 0.15} />
        </>
      );

    // Repeat: a closed loop with a directional break — recurrence.
    case 'repeat':
      return (
        <>
          <Path d="M6.4 9.2 A 7 7 0 0 1 18.4 8.4" {...c} />
          <Path d="M17.6 14.8 A 7 7 0 0 1 5.6 15.6" {...c} />
          <Path d="M18.6 4.6 L18.6 8.6 L14.6 8.6" {...c} />
          <Path d="M5.4 19.4 L5.4 15.4 L9.4 15.4" {...c} />
        </>
      );

    // ── THE ALARM / SUMMONS SEAL ─────────────────────────────────────────
    // This is the most important glyph in the set: it is what the System
    // shows when it summons the user. A sealed ring with an ascending
    // chevron struck through it and four radiating marks — a signal being
    // broadcast outward, not a bell being rung.
    case 'alarm':
      return (
        <>
          <Circle cx="12" cy="12" r="6.4" {...c} fill={charged ? color : 'none'} fillOpacity={0.14} />
          <Circle cx="12" cy="12" r="3.3" {...c} strokeOpacity={0.55} />
          <Path d="M8.9 13.5 L12 9.9 L15.1 13.5" {...c} strokeWidth={s + 0.35} />
          <Path d="M12 2.4 L12 4.6" {...c} strokeOpacity={0.85} />
          <Path d="M12 19.4 L12 21.6" {...c} strokeOpacity={0.85} />
          <Path d="M2.4 12 L4.6 12" {...c} strokeOpacity={0.85} />
          <Path d="M19.4 12 L21.6 12" {...c} strokeOpacity={0.85} />
        </>
      );

    // ── STATES ───────────────────────────────────────────────────────────
    // Locked discovery: the diamond containing form, but sealed shut with a
    // horizontal bar and no inner mark — something is there, unreadable.
    case 'locked':
      return (
        <>
          <Polygon points={DIAMOND} {...c} strokeOpacity={0.5} strokeDasharray="2.4 2.2" />
          <Path d="M9.2 12.4 L14.8 12.4" {...c} strokeWidth={s + 0.4} />
          <Path d="M10.4 12.4 A 1.6 1.6 0 0 1 13.6 12.4" {...c} strokeOpacity={0.7} />
        </>
      );

    // Warning: an upward triangle, the one containing form reserved for
    // things the user must resolve.
    case 'warning':
      return (
        <>
          <Path d="M12 3.9 L21.2 19.6 L2.8 19.6 Z" {...c} fill={charged ? color : 'none'} fillOpacity={0.14} />
          <Path d="M12 9.6 L12 14.1" {...c} strokeWidth={s + 0.3} />
          <Circle cx="12" cy="16.9" r="0.95" fill={color} stroke="none" />
        </>
      );

    // Conflict: two diamonds overlapping — two quests contesting the same
    // slot in the world. The overlap region is the charged part.
    case 'conflict':
      return (
        <>
          <Polygon points="8.6,3.6 15.4,10.4 8.6,17.2 1.8,10.4" {...c} strokeOpacity={0.8} />
          <Polygon points="15.4,6.8 22.2,13.6 15.4,20.4 8.6,13.6" {...c} strokeOpacity={0.8} />
          <Path d="M15.4 10.4 L12 13.8 L8.6 10.4" {...c} strokeWidth={s + 0.2} strokeOpacity={0.45} />
        </>
      );

    // Progress: a partially-filled arc gauge, open at the bottom.
    case 'progress':
      return (
        <>
          <Path d="M4.3 17.7 A 10 10 0 1 1 19.7 17.7" {...c} strokeOpacity={0.28} />
          <Path d="M4.3 17.7 A 10 10 0 0 1 6.9 5.4" {...c} strokeWidth={s + 0.5} />
          <Circle cx="12" cy="12" r="1.5" fill={color} stroke="none" opacity={0.8} />
        </>
      );

    // ── ACTIONS ──────────────────────────────────────────────────────────
    // Forge: an arc being struck — three converging vectors meeting a curve
    // and throwing a spark. Used for "Forge My Week".
    case 'forge':
      return (
        <>
          {/* A week being struck into shape: the arc is the raw span, the
              vector drives down into it, and the point of impact ignites. */}
          <Path d="M3.2 17.6 A 10 10 0 0 1 20.8 17.6" {...c} strokeWidth={s + 0.4} />
          <Path d="M12 2.6 L12 10.4" {...c} strokeWidth={s + 0.4} />
          <Path d="M8.7 7.4 L12 10.7 L15.3 7.4" {...c} strokeOpacity={0.55} />
          <Circle cx="12" cy="13.8" r="2.4" {...c} fill={charged ? color : 'none'} fillOpacity={0.8} />
          <Path d="M12 20.2 L12 21.8" {...c} strokeOpacity={0.5} />
        </>
      );

    // Claim: the quest diamond with a vector entering it from outside —
    // registering something new into the world.
    case 'claim':
      return (
        <>
          <Polygon points={DIAMOND} {...c} strokeOpacity={0.55} />
          <Path d="M12 7.6 L12 16.4" {...c} strokeWidth={s + 0.4} />
          <Path d="M7.6 12 L16.4 12" {...c} strokeWidth={s + 0.4} />
        </>
      );

    case 'voice':
      return (
        <>
          <Path d="M12 4.2 L12 19.8" {...c} strokeWidth={s + 0.4} />
          <Path d="M8 7.8 L8 16.2" {...c} strokeOpacity={0.8} />
          <Path d="M16 7.8 L16 16.2" {...c} strokeOpacity={0.8} />
          <Path d="M4.2 10.4 L4.2 13.6" {...c} strokeOpacity={0.5} />
          <Path d="M19.8 10.4 L19.8 13.6" {...c} strokeOpacity={0.5} />
        </>
      );

    case 'send':
      return (
        <>
          <Path d="M3.4 12 L20.6 12" {...c} strokeWidth={s + 0.2} />
          <Path d="M14.4 5.8 L20.6 12 L14.4 18.2" {...c} />
        </>
      );

    case 'back':
      return (
        <>
          <Path d="M20.6 12 L3.4 12" {...c} strokeWidth={s + 0.2} />
          <Path d="M9.6 5.8 L3.4 12 L9.6 18.2" {...c} />
        </>
      );

    case 'close':
      return (
        <>
          <Path d="M6.2 6.2 L17.8 17.8" {...c} strokeWidth={s + 0.2} />
          <Path d="M17.8 6.2 L6.2 17.8" {...c} strokeWidth={s + 0.2} />
        </>
      );

    case 'check':
      return <Path d="M4.6 12.4 L9.6 17.4 L19.4 6.8" {...c} strokeWidth={s + 0.5} />;

    // Settings: concentric arcs with a slider node — configuration as
    // "tuning the System", matching the system glyph's ring language.
    case 'settings':
      return (
        <>
          <Path d="M4.4 7.6 L19.6 7.6" {...c} />
          <Path d="M4.4 16.4 L19.6 16.4" {...c} />
          <Circle cx="9.2" cy="7.6" r="2.3" {...c} fill={colors.void} />
          <Circle cx="15.2" cy="16.4" r="2.3" {...c} fill={colors.void} />
        </>
      );

    default:
      return <Circle cx="12" cy="12" r="6" {...c} />;
  }
}
