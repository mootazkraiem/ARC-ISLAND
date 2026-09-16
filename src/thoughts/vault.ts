// ─────────────────────────────────────────────────────────────────────────
// The Idea Vault store — same shape as progression/engine.ts (init/
// getSnapshot/subscribe), because that pattern already works well for "a
// small persisted store that both a screen and Arc Island's tools need to read
// and mutate." This one is intentionally much simpler: no XP math, no
// unlock evaluation — just capture, list, status changes, and promotion.
// ─────────────────────────────────────────────────────────────────────────

import { loadVault, saveVault } from './storage';
import {
  Complexity,
  Idea,
  IdeaStatus,
  Potential,
  Project,
  ThoughtKind,
  ThoughtVaultState,
} from './types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Listener = () => void;

export interface SaveIdeaInput {
  title: string;
  originalText: string;
  kind: ThoughtKind;
  tags?: string[];
  complexity?: Complexity | null;
  potential?: Potential | null;
  reviewInDays?: number | null;
}

class ThoughtVault {
  private state: ThoughtVaultState | null = null;
  private listeners = new Set<Listener>();
  private readyPromise: Promise<void> | null = null;

  async init(): Promise<ThoughtVaultState> {
    if (!this.readyPromise) {
      this.readyPromise = loadVault().then((s) => {
        this.state = s;
      });
    }
    await this.readyPromise;
    return this.state!;
  }

  getSnapshot(): ThoughtVaultState {
    if (!this.state) throw new Error('ThoughtVault used before init()');
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async persist() {
    await saveVault(this.getSnapshot());
    this.listeners.forEach((l) => l());
  }

  async saveIdea(input: SaveIdeaInput): Promise<Idea> {
    const state = this.getSnapshot();
    let reviewAt: string | null = null;
    if (input.reviewInDays && input.reviewInDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + input.reviewInDays);
      reviewAt = toISODate(d);
    }
    const idea: Idea = {
      id: genId('idea'),
      title: input.title.trim(),
      originalText: input.originalText.trim(),
      kind: input.kind,
      tags: input.tags ?? [],
      complexity: input.complexity ?? null,
      potential: input.potential ?? null,
      status: 'captured',
      createdAt: new Date().toISOString(),
      reviewAt,
      promotedProjectId: null,
    };
    state.ideas.unshift(idea);
    await this.persist();
    return idea;
  }

  listIdeas(status?: IdeaStatus | 'active'): Idea[] {
    const all = this.getSnapshot().ideas;
    if (!status) return all;
    if (status === 'active') return all.filter((i) => i.status === 'captured' || i.status === 'review');
    return all.filter((i) => i.status === status);
  }

  /** Fuzzy title/text match, preferring ideas that are still active
   * (captured/review) over ones already promoted/archived/dismissed —
   * "that idea" almost always means the most recent live one. */
  findIdeaByQuery(query: string): Idea | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const all = this.getSnapshot().ideas;
    const score = (idea: Idea) => {
      const t = idea.title.toLowerCase();
      const body = idea.originalText.toLowerCase();
      if (t === q) return 0;
      if (t.includes(q) || q.includes(t)) return 1;
      if (body.includes(q)) return 2;
      return null;
    };
    const candidates = all
      .map((idea) => ({ idea, s: score(idea) }))
      .filter((c): c is { idea: Idea; s: number } => c.s !== null)
      .sort((a, b) => {
        const activeA = a.idea.status === 'captured' || a.idea.status === 'review' ? 0 : 1;
        const activeB = b.idea.status === 'captured' || b.idea.status === 'review' ? 0 : 1;
        if (activeA !== activeB) return activeA - activeB;
        return a.s - b.s;
      });
    return candidates[0]?.idea ?? null;
  }

  async setIdeaStatus(id: string, status: IdeaStatus, reviewInDays?: number): Promise<Idea | null> {
    const state = this.getSnapshot();
    const idea = state.ideas.find((i) => i.id === id);
    if (!idea) return null;
    idea.status = status;
    if (status === 'review' && reviewInDays && reviewInDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + reviewInDays);
      idea.reviewAt = toISODate(d);
    }
    await this.persist();
    return idea;
  }

  /** Records the project once its first-task Reminder has already been
   * created elsewhere (see assistant/tools.ts's promote_idea case) — the
   * vault never creates reminders itself, keeping the reminder engine as
   * the single owner of that concern. */
  async promoteIdea(
    ideaId: string,
    info: { objective: string; firstMilestone: string; firstTaskReminderId: string | null }
  ): Promise<Project> {
    const state = this.getSnapshot();
    const idea = state.ideas.find((i) => i.id === ideaId);
    const project: Project = {
      id: genId('project'),
      title: idea?.title ?? 'Untitled project',
      objective: info.objective,
      firstMilestone: info.firstMilestone,
      firstTaskReminderId: info.firstTaskReminderId,
      sourceIdeaId: ideaId,
      createdAt: new Date().toISOString(),
    };
    state.projects.unshift(project);
    if (idea) {
      idea.status = 'promoted';
      idea.promotedProjectId = project.id;
    }
    await this.persist();
    return project;
  }

  getDueForReview(): Idea[] {
    const todayISO = toISODate(new Date());
    return this.getSnapshot().ideas.filter(
      (i) => i.status === 'review' && i.reviewAt !== null && i.reviewAt <= todayISO
    );
  }
}

export const Vault = new ThoughtVault();
