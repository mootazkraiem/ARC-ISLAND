// ─────────────────────────────────────────────────────────────────────────
// Design system — source of truth for every visual constant in the app.
//
// These values are transcribed from the approved Claude Design artifact
// ("Codename ORBIT — first pass"). The artifact's own token panel names
// them: void/sheet/card/raise (surfaces), signal/done/xp/due (the four
// accent hues), Sora (display/numerals/eyebrows) + Manrope (body/UI type).
// Glow is a signal, not decoration — see `glow()` below, and use it on at
// most the one or two things on screen that just changed.
//
// Everything downstream (screens, components) reads from this file only.
// No screen should hardcode a hex color, font size, or radius directly.
// ─────────────────────────────────────────────────────────────────────────

export const colors = {
  // Surfaces, darkest to lightest — the artifact's "void / sheet / card / raise" stack.
  void: '#040407',
  sheet: '#0B0B12',
  card: '#11111A',
  raise: '#1B1B27',

  // The four accent hues. Each one means one thing — never mix their roles.
  signal: '#7C5CFF', // primary accent / brand — Arc Island, active states, rare rarity
  signalSoft: 'rgba(124, 92, 255, 0.16)',
  done: '#37E1B4', // completion, streaks, success, uncommon rarity
  doneSoft: 'rgba(55, 225, 180, 0.14)',
  xp: '#FFC65C', // XP, currency, legendary rarity
  xpSoft: 'rgba(255, 198, 92, 0.14)',
  due: '#FF7A59', // due-soon warmth, epic rarity
  dueSoft: 'rgba(255, 122, 89, 0.14)',

  // Destructive actions get their own hue — distinct from "due" warmth.
  danger: '#FF5C6C',
  dangerSoft: 'rgba(255, 92, 108, 0.14)',

  // Ink, brightest to quietest.
  text: '#F4F4FB',
  textSecondary: '#EDEDF6',
  textDim: '#A0A0B8',
  textFaint: '#7A7A92',
  textFainter: '#6C6C86',

  divider: 'rgba(255, 255, 255, 0.07)',
  dividerStrong: 'rgba(255, 255, 255, 0.12)',

  // Legacy aliases — kept so every existing screen/component that reads
  // theme.colors.bg / .bgElevated / .cardBorder / .accent / .success
  // picks up the new palette with zero call-site changes.
  bg: '#040407',
  bgElevated: '#0B0B12',
  cardBorder: 'rgba(255, 255, 255, 0.07)',
  accent: '#7C5CFF',
  accentSoft: 'rgba(124, 92, 255, 0.16)',
  success: '#37E1B4',
};

// Category tints reuse the same four accent hues rather than inventing a
// fifth palette — "glow is earned, never decorative" applies here too.
export const category: Record<string, { dot: string; label: string }> = {
  personal: { dot: colors.signal, label: 'Personal' },
  work: { dot: colors.due, label: 'Work' },
  health: { dot: colors.done, label: 'Health' },
  errand: { dot: colors.xp, label: 'Errand' },
  other: { dot: colors.textFainter, label: 'Other' },
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22, // the artifact's card radius
  xl: 26, // discovery card radius
  pill: 999,
};
// Legacy alias.
export const radius = radii;

export const spacing = (n: number) => n * 4;

// Sora (display / numerals / eyebrows) + Manrope (body / UI copy). Loaded
// via expo-font in App.tsx (see fonts.ts) — if a font hasn't finished
// loading yet, React Native silently falls back to the system font and
// still honors fontWeight, so every style below degrades safely.
export const fontFamily = {
  soraRegular: 'Sora_400Regular',
  soraMedium: 'Sora_500Medium',
  soraSemiBold: 'Sora_600SemiBold',
  soraBold: 'Sora_700Bold',
  soraExtraBold: 'Sora_800ExtraBold',
  manropeMedium: 'Manrope_500Medium',
  manropeSemiBold: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  manropeExtraBold: 'Manrope_800ExtraBold',
};

export const font = {
  // Sora 30/34 · screen-level display copy ("Three left before noon, Kai.")
  display: { fontFamily: fontFamily.soraSemiBold, fontSize: 27, lineHeight: 30, fontWeight: '600' as const, letterSpacing: -0.4, color: colors.text },
  // Sora 22 · screen title
  title: { fontFamily: fontFamily.soraSemiBold, fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text },
  heading: { fontFamily: fontFamily.soraSemiBold, fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.2, color: colors.text },
  // Sora 11 eyebrow · 0.2em tracking
  label: { fontFamily: fontFamily.soraBold, fontSize: 11, fontWeight: '700' as const, letterSpacing: 2, color: colors.textFainter },
  // Manrope 17 semibold — row titles, primary actions
  rowTitle: { fontFamily: fontFamily.manropeSemiBold, fontSize: 15.5, fontWeight: '600' as const, color: colors.textSecondary },
  // Manrope 14 medium — body copy, Arc Island speech, card descriptions
  body: { fontFamily: fontFamily.manropeMedium, fontSize: 14, fontWeight: '500' as const, color: colors.textDim },
  // Manrope 12 — metadata, times, skill tags
  caption: { fontFamily: fontFamily.manropeMedium, fontSize: 12, fontWeight: '500' as const, color: colors.textFaint },
  // Numerals are always Sora 800 — XP totals, level numbers, streak counts.
  numeral: { fontFamily: fontFamily.soraExtraBold, fontWeight: '800' as const, color: colors.text },
};

// Reanimated timing/spring presets, named by the artifact's motion spec —
// pick the bucket that matches what just happened, not the one that looks
// most impressive. Values are plain numbers so they work with both
// react-native-reanimated's withSpring/withTiming and the Animated API.
export const motion = {
  micro: { damping: 24, stiffness: 320, mass: 1 }, // tap / press — scale to .96
  short: { duration: 300 }, // card entrance, nav transition
  medium: { duration: 700 }, // XP bar / ring fill — cubic-bezier(.2,.8,.2,1)
  mediumEasing: [0.2, 0.8, 0.2, 1] as const,
  signature: { duration: 900 }, // level-up ring sweep, discovery reveal
  burst: { duration: 600 }, // level-up burst / discovery ring burst
  breathe: { duration: 3200 }, // Arc Island orb idle loop, ±8% scale
};

/** A glow is a shadow, not a blur filter — RN has no CSS `box-shadow`.
 * Use sparingly: the artifact's rule is "max two glowing elements per
 * frame". `elevation` gives Android a rough equivalent. */
export function glow(color: string, radius = 20, opacity = 0.5) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
    elevation: Math.max(2, Math.round(radius / 3)),
  };
}

export const theme = {
  colors,
  category,
  radius: radii,
  spacing,
  font,
  fontFamily,
  motion,
  glow,
};
