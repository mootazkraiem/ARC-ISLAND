# Architecture: the progression layer, and the thought/idea/project layer

This document explains two layers built on top of the reminder engine:
progression (XP/skills/streaks/cards) and, further down, the thought/idea/
project intelligence layer (Arc Island deciding whether something you said is a
reminder, a task, an idea, or a project). Read this before adding a new
skill, card, challenge, idea kind, or hooking something new into completion
events.

## The AI layer: Arc Island is a client of Angelo

Added round 14. Arc Island's assistant ("the System") does not contain an
AI. It calls **Angelo**, a separate local AI core running as its own process
on the same machine, over loopback HTTP.

### The boundary, and what each side owns

| | Arc Island | Angelo |
|---|---|---|
| Quests, calendar, XP, streaks, cards, Idea Vault | **owns** | no access |
| Every write to that data | **owns** | cannot perform one |
| Validating a proposed change before committing it | **owns** | — |
| UI, rendering, notifications | **owns** | — |
| Conversation history with the model | — | **owns** |
| Which LLM answers, and model routing | — | **owns** |
| Durable memory about the user | — | **owns** |

The two projects share no code. Arc Island imports nothing from Angelo —
Angelo is Python, this is React Native, and the only thing crossing between
them is JSON over `127.0.0.1`.

### The call path

```
SystemScreen.tsx          UI + the System's persona and rules
      ↓                   (systemPrompt() builds context per turn)
aiClient.ts               stable entry point; describeFailure() for the UI
      ↓
providers/angelo.ts       THE ONLY FILE THAT KNOWS ANGELO'S HTTP SHAPE
      ↓
POST /v1/app/turn         {app, session, text?, context, tools, tool_results?}
      ↓
Angelo Core               conversation + memory + LLM
```

`aiClient.ts` holds the one line that picks the backend. Swapping the AI
layer again means writing one new file that implements `AIProvider` and
changing that line — not touching SystemScreen or tools.ts. That abstraction
is why the move off OpenRouter was a new file plus a line, and it survived
the migration deliberately.

### Angelo never touches Arc Island's data

This is the rule worth defending as this grows, and it is the same shape as
"the reminder engine does not know the progression system exists" above.

Angelo is handed **tool schemas**, not tool access. It replies with the
calls it *wants*; `src/assistant/tools.ts` — unchanged by the migration —
validates and executes each one and reports the result back. There is no
path from Angelo into AsyncStorage, SecureStore, or any Arc Island model.

```
Angelo: "call register_quest with {title, date, time}"
   ↓
Arc Island: validates the date/time format, rejects if malformed,
            executes against its own store, returns the outcome
   ↓
Angelo: reasons about the result and speaks
```

`propose_week` is the sharpest example of the principle, and it predates the
migration: Angelo can propose an entire week, and proposing **commits
nothing**. The blocks are inert until the user accepts them on the Quest
Calendar. AI reasoning and application-state mutation stay separate — the
model suggests, the user decides, Arc Island writes.

### Context is sent per turn and never stored

`systemPrompt(mode, reminders)` is rebuilt on every turn and passed as
`context`. Angelo uses it for that one call and does not append it to
history. A schedule snapshot is true at an instant and stale by the next
exchange; keeping a copy would mean reasoning from an old calendar
confidently. Arc Island's whole database is never sent — only the digest the
current request needs.

Angelo's own durable memory (what it remembers about the user across
applications) is a separate thing and stays on Angelo's side. Arc Island
does not duplicate it, and Angelo does not persist Arc Island's quests.

### One conversation, one owner

Angelo keeps the transcript, keyed by `(app, session)`. Arc Island keeps
only `messages` — the UI bubbles — and a session name. There is deliberately
no second copy of the conversation on this side; the `historyRef` that used
to hold one was removed, because two sources of truth for the same
conversation is exactly the failure this design avoids.

### Failure is classified, and there is no fallback

`AIProviderError` carries an `AIFailure` kind — `offline`,
`unauthorized`, `backend_unavailable`, `timeout`, `malformed`,
`bad_request` — and `describeFailure()` turns it into one sentence naming
the thing to fix. "Angelo is offline" and "Angelo is up but its model isn't"
send you to different windows, so they are different messages.

If Angelo is unavailable, Arc Island **stops**. It never silently routes the
user's data to a cloud model instead. A test asserts exactly one host is
ever contacted.

### The limitation to know about

Angelo's Core binds to loopback and refuses to bind anywhere else. Arc
Island's **web build on the same machine** can reach it; a **phone cannot**,
and no client-side change fixes that. See `src/assistant/providerConfig.ts`,
which documents it at the point where someone would otherwise try to
"fix" it by hardcoding a LAN address.

---

## The one rule that matters

**The reminder engine does not know the progression system exists.**

`src/notifications.ts` and `src/storage.ts` (reminders) have zero imports
from `src/progression/*`. You could delete the entire `progression/`
directory and `AssistantScreen`'s XP-reporting lines, and the reminder app
underneath — create, edit, delete, schedule, notify — would work exactly as
it did before any of this was built. That independence is deliberate and is
the thing most worth preserving as this grows.

The only place the two systems touch is a single function in `App.tsx`:

```
completeReminder(id)
  1. reminder engine: disable if repeat === 'once' (existing logic, untouched)
  2. Progression.recordCompletion({ reminderId, title, category, at })
  3. if unlocks happened, queue a toast
```

Every "I did this" moment in the app — swipe-done on Home, the Today's Path
checklist, the notification's Done action, and Arc Island's `complete_reminder`
tool — all call this exact function. There is one funnel, not four separate
XP-granting code paths to keep in sync.

```
ReminderCompleted (from any of the 4 UI entry points)
        ↓
completeReminder()  [App.tsx — the only integration point]
        ↓
Progression.recordCompletion()  [src/progression/engine.ts]
        ↓
xpRules.computeBaseXp()            → base XP + skill keyword matches
        ↓
streak bookkeeping                 → currentStreak, longestStreak, comeback flag
        ↓
streakMultiplierFor(streak)        → applied to XP + skill gains together
        ↓
skillXp accumulation, dailyLog entry
        ↓
evaluateUnlocks()                  → checks every CardDefinition.getProgress()
        ↓
persisted to AsyncStorage (separate key from reminders)
        ↓
CompletionResult returned to caller (UI reacts: toast, haptics, Arc Island's reply)
```

## Domain models (`src/progression/types.ts`)

- **`UserProgress`** — the single persisted snapshot. Total XP, per-skill
  XP, streak counters, category history, a rolling `dailyLog` (last 60
  days), and `unlockedCards` (id → ISO timestamp). This is the entire state
  of the progression system; everything else is derived from it.
- **`CardDefinition`** — a pure description of one collectible: title,
  description, locked-state hint, rarity, which skill it's tied to, and a
  `getProgress(state) → { current, target }` function. A card is
  "unlocked" exactly when `current >= target`. There is no separate mutable
  "card state" object anywhere — unlocking is a pure function of the
  snapshot, which is what makes it safe to re-evaluate on every completion
  without drift.
- **`CompletionEvent`** — the input to the engine: reminderId, title,
  category, and the Date it happened. Deliberately minimal — the engine
  doesn't need to know about repeat mode, notification IDs, or anything
  else from the reminder model.
- **`CompletionResult`** — the output: XP gained, per-skill gains, whether
  the user leveled up, the new streak, and any cards unlocked this
  completion. Every caller (UI, Arc Island) reacts to this, never to internal
  engine state directly.

## Why challenges are just "featured locked cards," not a second system

The spec draft imagined Cards and Challenges as separate concepts. They're
implemented as one: every `CardDefinition` can optionally be
`challengeEligible: true`. `Progression.getActiveChallenges()` filters to
locked, challenge-eligible cards and sorts by proximity to completion.

This avoids the classic gamification-system bug: two places that both claim
to track "5 focused sessions completed" and quietly drift out of sync after
a few code changes. Here there is exactly one source of truth
(`getProgress()`), viewed two ways:

- **Collection screen**: shows the card as a mystery (`?`, a vague
  `lockedHint`, no numbers) — this is where discovery lives.
- **Progress screen's "Active Paths" section**: shows the *same* card with
  its `goalText` and a real progress bar — this is where direction lives.

Not every card needs to be a challenge. Most cards (the per-skill "Adept"
cards, the legendary long-term ones) are `challengeEligible: undefined` —
pure discoveries, never spoiled, which is what keeps the collection feeling
like an archive instead of a checklist.

## XP design (`src/progression/xpRules.ts`)

Base XP is small and keyed by task **category**, not by any user-set
"importance" field (there isn't one — keeping the reminder model
unchanged was a hard requirement). On top of that, up to two skill
keywords found in the title each add a flat bonus, and Discipline always
gets a small baseline for "you showed up." The streak multiplier — not raw
completion count — is what actually compounds, which is the direct answer
to "avoid rewarding meaningless task spam": creating and finishing ten
trivial one-off reminders in a sitting nets ten small base rewards, while
finishing one reminder a day for two weeks straight nets a 20% bonus on
everything, every day, indefinitely. Consistency is mechanically worth more
than volume.

The one anti-spam guard that matters most: **a given reminder can only
grant XP once per calendar day** (`lastCompletedDate` in `UserProgress`).
Repeating reminders were previously blocked from ever granting XP at all;
now they grant it once per day, same as everything else, which is what
makes daily habits (the whole point of `repeat: 'daily'`) actually feed the
streak and skills.

## How to extend this

**Add a skill.** Add the id to `SkillId` and `SKILL_ORDER`/`SKILL_META` in
`types.ts`, add a keyword regex to `KEYWORD_SKILLS` in `xpRules.ts` (or
leave it keyword-less and only reachable via a category fallback), and
optionally add an `adept-<skill>` mastery card in `cardDefinitions.ts`
following the existing pattern. Nothing else needs to change — the
Progress screen's skill grid renders from `SKILL_ORDER` automatically.

**Add a card.** Add one object to `CARD_DEFINITIONS` in
`cardDefinitions.ts` with a `getProgress` function reading whatever
`UserProgress` fields it needs. If the field you need doesn't exist yet
(e.g. a new counter), add it to `UserProgress` in `types.ts`,
`createInitialProgress()`, and increment it in `engine.ts`'s
`recordCompletion()`. `storage.ts` merges old snapshots onto
`createInitialProgress()`, so adding new fields never breaks existing
users' saved data — they just start at the default.

**Add a challenge.** Same as adding a card, plus `challengeEligible: true`
and a `goalText` string for the Progress screen to show.

**Change the level curve.** Everything reads through `levelFromTotalXp()`
in `levels.ts` — one function, one place to change the curve. Skills use
the same curve applied to their own XP total.

**Let Arc Island do something new.** Add a tool definition to
`toolDefinitions` in `src/assistant/tools.ts`, handle it in `executeTool`,
and mention it in the system prompt in `AssistantScreen.tsx`. The tool
executor already has access to the reminders array and the same
`completeReminder`/create/delete callbacks the UI uses — Arc Island is not a
separate integration, it calls the exact same functions a button press
would.

**Cloud sync, later.** `storage.ts` is the only place that talks to
`AsyncStorage` for progression data. Swapping it for a remote-backed store
means changing `loadProgress`/`saveProgress` and nothing in `engine.ts`,
since the engine only calls those two functions and never touches
`AsyncStorage` directly.

**Seasonal/AI-generated challenges, later.** Because a challenge is just a
`CardDefinition` with a `getProgress` closure, a "seasonal" set could be
generated at runtime (e.g. fetched or computed at app start) and merged
into the array the engine evaluates against, rather than requiring a
hand-written list forever. The engine's `evaluateUnlocks()` loop doesn't
care where `CARD_DEFINITIONS` came from.

## Honest limitations of tonight's build

- **"The Finisher"** is defined as "3 separate days with 4+ completions,"
  which is honestly computable from the stored daily log. A stricter
  reading ("finish everything that was scheduled that day") isn't, because
  the app doesn't currently snapshot "what was due" independently of
  "what's still enabled right now" — that would need its own data
  structure. Noted here rather than silently faked.
- **The day recap is not a midnight job.** Expo Go can't run background
  JavaScript, so there is no way to generate "Day Complete" the moment a
  day ends. Instead, `consumeYesterdayRecapIfDue()` checks on every app
  launch whether the calendar day has changed since it last showed a
  recap, and if so shows yesterday's real logged data. This is honest and
  fully client-side, just not literally "at midnight."
- **XP numbers are tunable, not scientifically derived.** They're
  deliberately simple (see `xpRules.ts`'s comments) so they stay easy to
  reason about and adjust after real usage, rather than an opaque formula
  tuned to look sophisticated on day one.
- **No retroactive re-evaluation warning.** If you add a new card whose
  condition could theoretically already be true for existing users (e.g. a
  card requiring "10 completions," added after someone already has 15),
  it unlocks immediately the next time *any* completion happens, with a
  timestamp of that moment rather than whenever the real threshold was
  first crossed historically. This is normal and expected — same as any
  achievement system — just worth knowing before assuming unlock dates are
  perfectly retroactive.

---

## The thought/idea/project layer (`src/thoughts/`)

The problem this solves: not everything you tell Arc Island is a reminder.
"Walk the dog at 10" and "what if we built a global progression world" are
completely different kinds of input, and treating both as "create a
reminder" either spams your schedule with vague non-actionable junk, or
mangles a real idea into a fake task with a made-up due date.

### Where classification actually happens

There is no separate classifier function, model, or module. **Classification
is Arc Island's system prompt plus which tools are available**, not a deterministic
parser. This was a deliberate architectural choice: the spec calls for using
"the LLM classification capability already available through Arc Island," and
building a second, rule-based classifier alongside it would be exactly the
kind of duplicated business logic the brief warned against. The taxonomy
(Reminder / Task-Goal / Idea / Thought / Note / Experiment / Project) is
spelled out in `AssistantScreen.tsx`'s `systemPrompt()`, along with the
behavioral rules — when to act immediately (only Reminder), when to ask
before creating anything (Task/Goal without a time, ambiguous Project
intent), and when to just capture and reflect back without pushing further
action (Idea/Thought/Note/Experiment). The taxonomy lives in exactly one
place: that prompt. If you want to change how something is classified, that
is the only file to edit.

### Domain model (`src/thoughts/types.ts`, `vault.ts`)

- **`Idea`** — title, original phrasing, `kind` (idea/thought/note/
  experiment/goal), optional tags/complexity/potential, a `status`
  (captured → review → promoted/archived/dismissed), and an optional
  `reviewAt` date. This is the entire "capture" side.
- **`Project`** — title, objective, one first milestone, and a
  `firstTaskReminderId`. A Project does **not** own a task list. The moment
  an idea is promoted, exactly one real `Reminder` is created through the
  existing reminder engine (the same `onCreate` used by `add_reminder`) and
  the project just stores its id. This means a project's first task
  automatically gets real scheduling, real notifications, and — when
  completed — flows through the exact same `CompletionEvent` →
  `ProgressionEngine` pipeline as any other reminder, with zero new code in
  either of those systems. Ideas themselves never touch the progression
  engine at all; `Vault` has no import from `progression/`.
- **`Vault`** (`vault.ts`) is a small store shaped exactly like
  `progression/engine.ts` (`init`/`getSnapshot`/`subscribe`) on purpose —
  once one small-persisted-store-with-subscribers pattern existed in this
  codebase, the second one reuses it rather than inventing a different
  shape.

### Why promotion doesn't create "30 fake tasks"

`promote_idea`'s tool schema requires exactly one `firstMilestone` and one
`firstTaskTitle` — there is no way for the model to pass an array of tasks,
because the parameters don't accept one. This is enforced by the tool
schema, not just requested in prose, which is a stronger guarantee than a
prompt instruction alone.

### Why "dismiss" asks twice

Voice interfaces can't show a modal `Alert.alert()` mid-conversation the way
a button press can. Instead, `update_idea_status` with `status: "dismissed"`
is a two-call protocol: the first call (no `confirmed` flag) looks the idea
up and returns `{ needsConfirmation: true, matchedTitle }` without changing
anything; the system prompt instructs Arc Island to read that name back and ask
for a clear yes; only a second call with `confirmed: true` actually changes
the status. This is the same underlying principle as the existing
`Alert.alert` confirmation on deleting a reminder from the UI — "destructive
things ask first" — implemented in whatever form fits the interface making
the request. Note "dismissed" is still just a status, not a hard delete;
nothing in the vault is ever permanently erased by voice.

### Why the Idea Vault UI's "Promote" isn't a button that does the work

The Idea Vault screen's `[Archive]`/`[Dismiss]` buttons act directly on the
store (no LLM needed — a status change is trivial). Promotion is different:
generating a good, small, honest first milestone and first task is exactly
the kind of judgment call an LLM is suited for and a hand-written template
isn't, so the screen intentionally doesn't duplicate that logic — it points
back to "ask Arc Island to promote this." One place generates project structure,
not two.

### Extending this layer

**Add a new idea kind.** Add it to `ThoughtKind` in `types.ts` and to the
enum list passed to the `save_idea` tool schema in `assistant/tools.ts`.
Nothing else needs to change — the Vault screen renders whatever kind comes
back.

**Add idea-vault UI actions** (e.g. a manual "snooze review 7 days"
button). Call `Vault.setIdeaStatus(id, 'review', days)` directly from
`IdeaVaultScreen.tsx` — no new plumbing needed, the method already exists
because Arc Island's `update_idea_status` tool uses it too.

**Let projects grow real task lists later.** Right now a Project has one
task by design (the brief explicitly warns against generating a fake full
plan). If that changes, the natural extension is a `taskReminderIds:
string[]` on `Project` instead of a single id — everything else (each task
being a normal Reminder, XP flowing through the untouched progression
pipeline) stays exactly the same.
