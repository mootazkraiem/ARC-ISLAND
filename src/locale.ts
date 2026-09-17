// ─────────────────────────────────────────────────────────────────────────
// One locale for the whole world.
//
// Every date/weekday/month label in Arc Island used to be formatted with
// `toLocaleDateString(undefined, …)`, which resolves to the BROWSER's
// locale. On a machine set to French that rendered the Quest Calendar as
// "LUN MAR MER JEU VEN SAM DIM / septembre 2026" while every other word in
// the app — including the System's spoken voice, which is hard-pinned to
// en-GB — stayed English. A world that half-translates itself is not one
// world.
//
// So the UI locale is pinned here, alongside the System's voice, and every
// formatter in the app goes through these helpers rather than calling
// toLocale* directly. If Arc Island is ever genuinely localized, this is
// the single place that changes.
// ─────────────────────────────────────────────────────────────────────────

export const UI_LOCALE = 'en-GB';

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString(UI_LOCALE, opts);
}

export function fmtTime(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleTimeString(UI_LOCALE, opts);
}

export function fmtNumber(n: number): string {
  return n.toLocaleString(UI_LOCALE);
}

/** Fixed Monday-first weekday initials/abbreviations. Derived from a known
 * Monday rather than hardcoded strings so they stay correct if UI_LOCALE
 * ever changes, but never depend on the device's locale. */
const KNOWN_MONDAY = new Date(2024, 0, 1); // 1 Jan 2024 was a Monday

export const WEEKDAY_SHORT: string[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(KNOWN_MONDAY);
  d.setDate(d.getDate() + i);
  return fmtDate(d, { weekday: 'short' }).slice(0, 3).toUpperCase();
});

export const WEEKDAY_INITIAL: string[] = WEEKDAY_SHORT.map((s) => s.slice(0, 1));

/** Monday-first index (0 = Monday) for a Date. */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}
