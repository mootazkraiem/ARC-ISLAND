// ─────────────────────────────────────────────────────────────────────────
// Thought/Idea/Project domain — the "what kind of thing is this" layer.
//
// This module is deliberately separate from both the reminder engine and
// the progression engine. It captures things that are NOT yet reminders:
// ideas, thoughts, notes, experiments, loosely-defined goals. Nothing here
// grants XP — see the project principle in ARCHITECTURE.md: capture
// everything, commit to very little, act on what matters. The moment
// something here is promoted to a real task, it becomes an ordinary
// Reminder and re-enters the existing CompletionEvent → ProgressionEngine
// pipeline unchanged. This module never talks to the progression engine
// directly.
// ─────────────────────────────────────────────────────────────────────────

/** What Arc Island decided a piece of input "is." Reminder and Task both flow
 * straight into the existing reminder engine (see assistant/tools.ts's
 * add_reminder) and never touch this module at all — they're listed here
 * only so the taxonomy is documented in one place. */
export type ThoughtKind = 'idea' | 'thought' | 'note' | 'experiment' | 'goal';

export type IdeaStatus = 'captured' | 'review' | 'promoted' | 'archived' | 'dismissed';

export type Complexity = 'small' | 'medium' | 'large';
export type Potential = 'low' | 'medium' | 'high';

export interface Idea {
  id: string;
  title: string;
  originalText: string;
  kind: ThoughtKind;
  tags: string[];
  complexity: Complexity | null;
  potential: Potential | null;
  status: IdeaStatus;
  createdAt: string; // ISO
  reviewAt: string | null; // ISO date, optional
  promotedProjectId: string | null;
}

export interface Project {
  id: string;
  title: string;
  objective: string;
  firstMilestone: string;
  /** The id of the Reminder created as this project's first actionable
   * task — the project doesn't own its own task list, it hands off to the
   * existing reminder engine immediately, on purpose. */
  firstTaskReminderId: string | null;
  sourceIdeaId: string | null;
  createdAt: string; // ISO
}

export interface ThoughtVaultState {
  ideas: Idea[];
  projects: Project[];
}

export function createInitialVaultState(): ThoughtVaultState {
  return { ideas: [], projects: [] };
}
