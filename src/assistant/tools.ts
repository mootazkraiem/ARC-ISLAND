import { Category, Reminder, ReminderDraft, RepeatMode } from '../types';
import { formatRelativeDay, formatTime, getNextOccurrence, repeatLabel } from '../reminderLogic';
import { Progression } from '../progression/engine';
import { levelFromTotalXp } from '../progression/levels';
import { CompletionResult, SKILL_META } from '../progression/types';
import { Vault } from '../thoughts/vault';
import { Complexity, IdeaStatus, Potential, ThoughtKind } from '../thoughts/types';

export const CATEGORY_VALUES: Category[] = ['personal', 'work', 'health', 'errand', 'other'];
export const REPEAT_VALUES: RepeatMode[] = ['once', 'daily', 'weekly'];
export const THOUGHT_KIND_VALUES: ThoughtKind[] = ['idea', 'thought', 'note', 'experiment', 'goal'];
export const COMPLEXITY_VALUES: Complexity[] = ['small', 'medium', 'large'];
export const POTENTIAL_VALUES: Potential[] = ['low', 'medium', 'high'];

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'add_reminder',
      description:
        'Create a new reminder that will fire a native phone notification at the given date/time.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short reminder text, e.g. "Walk the dog".' },
          date: { type: 'string', description: 'ISO date the reminder is anchored to, YYYY-MM-DD.' },
          time: { type: 'string', description: '24-hour time, HH:mm, e.g. "22:00".' },
          repeat: { type: 'string', enum: REPEAT_VALUES, description: 'How often it repeats.' },
          category: {
            type: 'string',
            enum: CATEGORY_VALUES,
            description: 'Best-guess category for this reminder.',
          },
        },
        required: ['title', 'date', 'time', 'repeat', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: "List the user's current reminders, optionally filtered.",
      parameters: {
        type: 'object',
        properties: {
          when: {
            type: 'string',
            enum: ['today', 'upcoming', 'all'],
            description: 'Time window to filter by. Defaults to "upcoming".',
          },
          category: {
            type: 'string',
            enum: [...CATEGORY_VALUES, 'any'],
            description: 'Category to filter by, or "any".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_reminder',
      description: 'Mark a reminder as done by matching its title (fuzzy/substring match).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words from the reminder title to match against.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_reminder',
      description: 'Permanently delete a reminder by matching its title (fuzzy/substring match).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words from the reminder title to match against.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_progress',
      description:
        "Get the user's current level, XP, per-skill breakdown, and streak in the progression system.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_idea',
      description:
        'Capture something as an idea/thought/note/experiment/goal in the Idea Vault WITHOUT creating a reminder or project. Use this for anything that is not a concrete, schedulable action — never call this and add_reminder for the same input.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title, a few words, e.g. "Global progression world".' },
          originalText: { type: 'string', description: "The user's original phrasing, close to verbatim." },
          kind: {
            type: 'string',
            enum: THOUGHT_KIND_VALUES,
            description:
              'idea = a concept/possibility ("what if..."); thought = a passing reflection; note = information to retain; experiment = something to test before committing; goal = a desired outcome without a single concrete action yet.',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional short topic tags.' },
          complexity: { type: 'string', enum: COMPLEXITY_VALUES, description: 'Optional rough size estimate.' },
          potential: { type: 'string', enum: POTENTIAL_VALUES, description: 'Optional rough value/excitement estimate.' },
          reviewInDays: { type: 'number', description: 'Optional: if the user wants to revisit this in N days.' },
        },
        required: ['title', 'originalText', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ideas',
      description: "List the user's captured ideas from the Idea Vault.",
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'captured', 'review', 'promoted', 'archived', 'dismissed', 'all'],
            description: '"active" = captured + review (the default, what "my ideas" usually means).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'promote_idea',
      description:
        "Turn an existing idea into a real project: creates a Project record plus exactly ONE first actionable task (a real reminder). Only call this after the user has clearly said to build/start/promote it — never automatically after just saving an idea. Generate a small, honest first milestone and first task, not a full plan.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words matching the idea to promote.' },
          objective: { type: 'string', description: 'One sentence: what this project is trying to achieve.' },
          firstMilestone: {
            type: 'string',
            description: 'One small, concrete first milestone — e.g. "Validate whether the core loop is fun," not the whole project.',
          },
          firstTaskTitle: { type: 'string', description: 'One tiny, concrete first task title for a reminder.' },
          firstTaskDate: { type: 'string', description: 'ISO date (YYYY-MM-DD) for the first task, usually soon.' },
          firstTaskTime: { type: 'string', description: '24-hour time (HH:mm) for the first task.' },
        },
        required: ['query', 'objective', 'firstMilestone', 'firstTaskTitle', 'firstTaskDate', 'firstTaskTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_idea_status',
      description:
        'Change an idea\'s status: "review" (revisit later), "archived" (parked, kept), or "dismissed" (no longer wanted). Dismissing is a soft, reversible action (status change, nothing is erased) but still ask the user to confirm by name before calling this with status "dismissed" — call it once without confirmed:true to look the idea up and get its title back, then only actually dismiss after the user clearly says yes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words matching the idea.' },
          status: { type: 'string', enum: ['review', 'archived', 'dismissed'] },
          reviewInDays: { type: 'number', description: 'Only used when status is "review".' },
          confirmed: { type: 'boolean', description: 'Only relevant for status "dismissed" — pass true only after the user confirmed by name.' },
        },
        required: ['query', 'status'],
      },
    },
  },
] as const;

export interface ToolContext {
  getReminders: () => Reminder[];
  onCreate: (draft: ReminderDraft) => Promise<string>;
  onComplete: (id: string) => Promise<CompletionResult | null>;
  onDelete: (id: string) => Promise<void>;
}

function findByQuery(reminders: Reminder[], query: string): Reminder | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = reminders.find((r) => r.title.toLowerCase() === q);
  if (exact) return exact;
  const partial = reminders
    .filter((r) => r.title.toLowerCase().includes(q) || q.includes(r.title.toLowerCase()))
    .sort((a, b) => a.title.length - b.title.length);
  return partial[0] ?? null;
}

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  let args: any = {};
  try {
    args = JSON.parse(rawArgs || '{}');
  } catch {
    return { error: 'bad_arguments' };
  }

  switch (name) {
    case 'add_reminder': {
      const draft: ReminderDraft = {
        title: String(args.title ?? '').trim() || 'Reminder',
        date: String(args.date ?? ''),
        time: String(args.time ?? ''),
        repeat: (REPEAT_VALUES as readonly string[]).includes(args.repeat) ? args.repeat : 'once',
        category: (CATEGORY_VALUES as readonly string[]).includes(args.category)
          ? args.category
          : 'personal',
        enabled: true,
      };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}$/.test(draft.time)) {
        return { error: 'invalid_date_or_time', received: { date: draft.date, time: draft.time } };
      }
      const id = await ctx.onCreate(draft);
      return { ok: true, created: draft, reminderId: id };
    }

    case 'list_reminders': {
      const when = args.when ?? 'upcoming';
      const category = args.category ?? 'any';
      let list = ctx.getReminders().filter((r) => r.enabled);
      if (category !== 'any') list = list.filter((r) => r.category === category);
      if (when === 'today') {
        list = list.filter((r) => formatRelativeDay(getNextOccurrence(r)) === 'Today');
      }
      const summary = list
        .sort((a, b) => getNextOccurrence(a).getTime() - getNextOccurrence(b).getTime())
        .slice(0, 12)
        .map((r) => ({
          title: r.title,
          when: `${formatRelativeDay(getNextOccurrence(r))} ${formatTime(r.time)}`,
          repeat: repeatLabel(r.repeat),
          category: r.category,
        }));
      return { count: summary.length, reminders: summary };
    }

    case 'complete_reminder': {
      const match = findByQuery(ctx.getReminders(), String(args.query ?? ''));
      if (!match) return { error: 'not_found', query: args.query };
      const result = await ctx.onComplete(match.id);
      if (!result) return { ok: true, completed: match.title };
      if (result.alreadyCompletedToday) {
        return { ok: true, completed: match.title, note: 'already_counted_today_no_extra_xp' };
      }
      return {
        ok: true,
        completed: match.title,
        xpGained: result.xpGained,
        skillGains: result.skillGains,
        newLevel: result.newLevel.level,
        xpIntoLevel: result.newLevel.xpIntoLevel,
        xpForThisLevel: result.newLevel.xpForThisLevel,
        leveledUp: result.leveledUp,
        currentStreak: result.newStreak,
        newlyUnlockedCards: result.unlockedCards.map((c) => c.title),
      };
    }

    case 'delete_reminder': {
      const match = findByQuery(ctx.getReminders(), String(args.query ?? ''));
      if (!match) return { error: 'not_found', query: args.query };
      await ctx.onDelete(match.id);
      return { ok: true, deleted: match.title };
    }

    case 'get_progress': {
      const p = Progression.getSnapshot();
      const level = levelFromTotalXp(p.totalXp);
      const skills = Object.entries(p.skillXp)
        .filter(([, xp]) => (xp ?? 0) > 0)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 4)
        .map(([skill, xp]) => ({ skill: SKILL_META[skill as keyof typeof SKILL_META].label, xp }));
      return {
        level: level.level,
        xpIntoLevel: level.xpIntoLevel,
        xpForThisLevel: level.xpForThisLevel,
        currentStreak: p.currentStreak,
        longestStreak: p.longestStreak,
        totalCompletions: p.completedCount,
        topSkills: skills,
        cardsUnlocked: Object.keys(p.unlockedCards).length,
      };
    }

    case 'save_idea': {
      const title = String(args.title ?? '').trim();
      const originalText = String(args.originalText ?? '').trim() || title;
      if (!title) return { error: 'missing_title' };
      const kind = (THOUGHT_KIND_VALUES as readonly string[]).includes(args.kind) ? args.kind : 'idea';
      const idea = await Vault.saveIdea({
        title,
        originalText,
        kind,
        tags: Array.isArray(args.tags) ? args.tags.map((t: unknown) => String(t)) : [],
        complexity: (COMPLEXITY_VALUES as readonly string[]).includes(args.complexity) ? args.complexity : null,
        potential: (POTENTIAL_VALUES as readonly string[]).includes(args.potential) ? args.potential : null,
        reviewInDays: typeof args.reviewInDays === 'number' ? args.reviewInDays : null,
      });
      return { ok: true, saved: idea.title, kind: idea.kind, ideaId: idea.id };
    }

    case 'list_ideas': {
      const status = args.status ?? 'active';
      const ideas = status === 'all' ? Vault.listIdeas() : Vault.listIdeas(status as any);
      return {
        count: ideas.length,
        ideas: ideas.slice(0, 10).map((i) => ({ title: i.title, kind: i.kind, status: i.status, createdAt: i.createdAt })),
      };
    }

    case 'promote_idea': {
      const idea = Vault.findIdeaByQuery(String(args.query ?? ''));
      if (!idea) return { error: 'not_found', query: args.query };
      if (idea.status === 'promoted') {
        return { error: 'already_promoted', title: idea.title };
      }
      const date = String(args.firstTaskDate ?? '');
      const time = String(args.firstTaskTime ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return { error: 'invalid_date_or_time', received: { date, time } };
      }
      const reminderId = await ctx.onCreate({
        title: String(args.firstTaskTitle ?? idea.title),
        date,
        time,
        repeat: 'once',
        category: 'work',
        enabled: true,
      });
      const project = await Vault.promoteIdea(idea.id, {
        objective: String(args.objective ?? ''),
        firstMilestone: String(args.firstMilestone ?? ''),
        firstTaskReminderId: reminderId,
      });
      return {
        ok: true,
        promoted: idea.title,
        project: { title: project.title, objective: project.objective, firstMilestone: project.firstMilestone },
        firstTask: args.firstTaskTitle,
      };
    }

    case 'update_idea_status': {
      const idea = Vault.findIdeaByQuery(String(args.query ?? ''));
      if (!idea) return { error: 'not_found', query: args.query };
      const status = args.status as IdeaStatus;

      if (status === 'dismissed' && !args.confirmed) {
        return { needsConfirmation: true, matchedTitle: idea.title, action: 'dismiss' };
      }

      await Vault.setIdeaStatus(idea.id, status, args.reviewInDays);
      return { ok: true, title: idea.title, newStatus: status };
    }

    default:
      return { error: 'unknown_tool', name };
  }
}
