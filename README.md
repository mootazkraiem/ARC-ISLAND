# Arc Island — a reminder app with a real progression system

What started as a reminder MVP is now built around an original personal
progression system: completing reminders earns XP, grows nine different
skills, extends a streak, and unlocks an archive of discoverable cards —
architected as a layer that *observes* completions rather than one that's
tangled into the notification engine. See **ARCHITECTURE.md** for the full
design writeup (domain models, event flow, how to extend it). This file is
the setup/run guide; that one is the "how it's built and why" doc.

Still true: **native local notifications**, no backend, no accounts, no
cloud. As of round 14 that is now literal: the assistant runs on Angelo,
your own local AI core, so the only network call the app makes is to
`127.0.0.1` — nothing leaves the machine at all.

## 🧠 Arc Island now thinks through Angelo (round 14)

The System no longer calls a cloud model. Arc Island's assistant runs on
**Angelo** — the local AI core in the separate `ConsoleApp1` project — over
a loopback HTTP API. OpenRouter is gone from the runtime entirely: no cloud
account, no API key, no per-request cost, no daily cap, and nothing leaves
this machine.

### The boundary

```
        USER
          ↓
     ARC ISLAND          quests · calendar · XP · streaks · Idea Vault · UI
          ↓              (owns all application state, and every write to it)
   AngeloProvider        src/assistant/providers/angelo.ts — the ONLY file
          ↓              in Arc Island that knows Angelo's HTTP shape
      HTTP /v1
          ↓
     ANGELO CORE         conversation · context · memory · LLM · model choice
```

The two projects are **not merged and share no code**. Arc Island imports
nothing from Angelo; it is an HTTP client. Angelo has no access to Arc
Island's data — it is handed tool *schemas* and replies with the calls it
wants, and Arc Island validates and executes every one of them itself
(`src/assistant/tools.ts`, unchanged). Angelo owns the conversation; Arc
Island owns the quests.

### What you need to run it

1. **Start Angelo's Core** (in the Angelo project):
   ```powershell
   python -m angelo.core
   ```
   It prints where its token lives — `%LOCALAPPDATA%\Angelo\core.token`.
   Angelo's own backend must be up too: `ollama serve`, with the model its
   config names (`llama3.1:8b` by default — it must support tool calling).
2. **Give Arc Island the token**, either in Settings, or in `.env`:
   ```
   EXPO_PUBLIC_ANGELO_CORE_TOKEN=<contents of core.token>
   ```
3. **Run Arc Island's web build on the same computer**:
   ```bash
   npm install
   npx expo start --web
   ```

### ⚠️ This works on the web build, not on a phone

Angelo's Core binds to `127.0.0.1` and **refuses to bind anywhere else** —
that is deliberate in Angelo (`angelo/core/__main__.py` exits rather than
listen on a LAN address; a network-reachable Core is a different product
with a different threat model). So:

| Where Arc Island runs | Reaches Angelo? |
|---|---|
| Web build, same PC as Angelo | ✅ yes — the supported setup today |
| iPhone/Android via Expo Go | ❌ no — `localhost` on a phone means the phone |

There is no client-side trick that fixes this, and Arc Island does not
pretend otherwise: on a phone the System says **"Angelo is offline"**, which
is the truth. Pointing `EXPO_PUBLIC_ANGELO_CORE_URL` at the PC's LAN IP does
not help, because the Core will not listen on one. Making Angelo reachable
from another device is Angelo's decision to make, not Arc Island's.

### Voice

- **Web voice is unchanged and still free.** The browser's own Web Speech
  API captures the mic and returns text on-device; the transcript then goes
  to Angelo as ordinary text. No audio leaves the machine.
- **Native voice is disabled, and says so.** It used to upload a recording
  to OpenRouter's **paid** Whisper endpoint. Moving to Angelo removes that
  account, and rather than silently keeping a cloud dependency the whole
  migration exists to remove — or inventing an Angelo audio endpoint that
  does not exist — the path is switched off with a clear message. Angelo
  does have local speech-to-text, but its Core API exposes no audio route.
  Typing works everywhere. This is Phase 2.

### When something is wrong, it says which thing

Failures are classified rather than dumped as a status code, because
"Angelo is offline" and "Angelo is up but Ollama isn't" send you to two
different windows:

| What happened | What the System says |
|---|---|
| Nothing listening on the Core's port | Angelo is offline. Start the Core, then try again. |
| Token missing or rejected (401) | Angelo refused Arc Island's token. Re-enter it in Settings. |
| Core up, model backend down (503) | Angelo is running but its model is not responding. |
| Turn exceeded 120s | Angelo took too long to answer. |
| Unreadable/malformed reply | Angelo answered with something unreadable. |

**There is no fallback to another AI service.** If Angelo is unavailable Arc
Island fails gracefully and stops — it never quietly routes your data to a
cloud model instead. A test asserts this (`never falls back to another AI
service`).

### Testing

Arc Island now has a test suite (it had none before):

```bash
npm test          # 33 tests covering the Angelo adapter
npx tsc --noEmit  # clean
```

Angelo's own suite covers the Core side (`tests/test_core_app_turn.py`).

## ⬆️ Expo SDK 51 → 57 upgrade (round 6)

This build now targets **Expo SDK 57** (React Native 0.86, React 19.2) —
matching current Expo Go — instead of SDK 51. This was a compatibility
pass only: no screens, features, or visual design changed.

- **Every `expo-*` package, `react`, `react-native`, and the RN-ecosystem
  dependencies** (`react-native-svg`, `react-native-gesture-handler`,
  `react-native-safe-area-context`, `@react-native-community/datetimepicker`,
  `@react-native-async-storage/async-storage`, the two font packages) were
  bumped to the exact versions SDK 57 bundles.
- **`expo-av` is gone.** Expo fully removed it in SDK 55, splitting it into
  `expo-video` and `expo-audio`. Arc Island only ever used the recording half, so
  `AssistantScreen.tsx` now uses `expo-audio`'s `AudioRecorder` class
  (`new AudioRecorder(...)` → `prepareToRecordAsync()` → `record()` →
  `stop()` → `.uri` → `.release()`) in place of
  `Audio.Recording.createAsync(...)` / `stopAndUnloadAsync()` / `getURI()`.
  Permission + audio-mode calls moved from `Audio.requestPermissionsAsync`
  / `Audio.setAudioModeAsync` to `expo-audio`'s
  `requestRecordingPermissionsAsync` / `setAudioModeAsync`. `app.json`'s
  `expo-av` plugin entry became an `expo-audio` one with the same
  microphone permission text.
- **`react-native-reanimated` 3 → 4.** The JS animation API this app uses
  (`useSharedValue`, `useAnimatedStyle`, `useAnimatedProps`, `withTiming`,
  `withRepeat`, `withSequence`, `withDelay`, `cancelAnimation`) is
  unchanged — none of the progress-ring/XP-bar/Arc Island-orb/level-up motion
  code needed to change. What did change: Reanimated 4 moved its Babel
  plugin into a new `react-native-worklets` package, so `babel.config.js`
  now points at `'react-native-worklets/plugin'` instead of
  `'react-native-reanimated/plugin'`, and `react-native-worklets` was added
  as a dependency.
- **`expo-notifications`'s trigger shape is now typed.** SDK 51 accepted a
  bare `{ hour, minute, repeats: true }` object; SDK 57 expects a
  discriminated `{ type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour, minute }` (and `.WEEKLY` / `.DATE` for the other two cases).
  `src/notifications.ts`'s `buildTrigger()` was updated for all three
  reminder-repeat cases plus the snooze trigger — this is the one change in
  this round that touches notification-scheduling logic itself, and it was
  necessary for reminders to keep firing correctly, not optional.
- **`expo-asset` added as a direct dependency.** `expo-audio` depends on it
  natively, and `expo-doctor` flags it as a missing peer dependency if it's
  only present transitively — declaring it directly avoids that warning (and
  the native-build risk it warns about) on a fresh install.
- **Sanity-checked, not device-tested.** I don't have a phone or an npm
  registry in this sandbox (same standing limitation as every round), so I
  cross-referenced Expo's actual SDK 57 `bundledNativeModules.json` and the
  `expo-audio`/`expo-notifications` docs for the exact versions and API
  shapes above, then re-ran the project's static TypeScript check — it
  passed with only the same handful of shim-only false positives as every
  previous round (Swipeable-as-type, `Animated` namespace, etc. — artifacts
  of this sandbox's hand-written type shims, not real errors). Running
  `npm install` on your machine is still the first real execution of this
  code, and this is the step most likely to surface anything I couldn't
  catch statically (e.g. a minor prop-shape difference in
  `@react-native-community/datetimepicker` 8→9, which I didn't find any
  reported breaking changes for but didn't have a way to execute against).

## 🔔 Alarm-style reminder notifications (round 7)

Reminders used to fire on the same soft, generic channel as any chat app's
message ping. They now use a dedicated **`reminders-alarm`** Android channel
and matching iOS content settings, built to feel like something that needs
attention, not a passing ping — and Arc Island/chat notifications were never on
this pipeline in the first place (`AssistantScreen.tsx` speaks its replies
out loud via `expo-speech`, it never calls `scheduleNotificationAsync`), so
there's nothing to accidentally cross-wire.

- **Max-importance Android channel** (was `HIGH`) — heads-up + sound even
  over other apps, instead of a quiet drawer entry.
- **A longer, four-pulse "insistent" vibration pattern** (`[0, 400, 200, 400,
  200, 400, 200, 400]`), replacing the old gentle double-pulse.
- **A dedicated 3-beep alarm tone** (`assets/sounds/reminder_alarm.wav`, a
  short synthesized tone, not a licensed sound file) instead of the system
  default, wired in via the `expo-notifications` config plugin's `sounds`
  option in `app.json` and referenced by both the Android channel and the
  iOS notification content.
- **iOS `interruptionLevel: 'timeSensitive'`** on every reminder/snooze
  notification — the strongest interruption level Expo/iOS allow without a
  special Apple entitlement (`critical` exists but has to be requested from
  and approved by Apple per-app, which is out of reach here).
- **New channel id, not a renamed one.** Android permanently locks a
  channel's sound/importance/vibration to whatever they were the first time
  that id was created on a given device — editing the old `reminders-soft`
  channel's settings in code would have silently done nothing on any phone
  that had already run an earlier build. `reminders-alarm` is a fresh id so
  it's guaranteed to pick up the new settings.
- **Done/Snooze actions unchanged** — same `CATEGORY_REMINDER` with the same
  two buttons; only the channel/sound/vibration/interruption config around
  them changed.
- Everything above lives in the same `src/notifications.ts` this app always
  had — no second notification system, no new dependency.

**One real limitation, not a bug**: Expo Go can't include a project's custom
native assets (it's a single generic app Expo pre-builds and ships), so the
custom `reminder_alarm.wav` tone only plays in a development/EAS build — in
Expo Go it falls back to the platform's default notification sound. The
channel's max importance, the heads-up behavior, and the alarm vibration
pattern are all set via runtime API calls with plain JS values, so those
work fully in Expo Go today; the custom tone is the one piece that needs a
real build to actually hear.

## What's in this build, in one paragraph
Create reminders (typed, quick-added from natural language, or spoken to
Arc Island) that fire real native notifications with Done/Snooze actions, even
fully closed. Completing one earns XP toward a global level and toward
whichever of nine skills the task actually touched (Focus, Fitness,
Learning, Discipline, etc.), tracked via keyword detection — "study
cybersecurity" grows Learning and Focus, "walk the dog" grows Fitness and
Discipline, a plain errand mostly just grows Discipline. Streaks compound
your XP. Twenty-one original cards — achievements, streak milestones, and
per-skill mastery — sit in a Collection archive, shown as mysteries until
you earn them. A handful are also surfaced as directed "Active Paths" with
real progress bars. Arc Island, the voice assistant, understands all of this and
reports real numbers after each completion — never invented ones.

## Where to find it in the app
- **Home**: the reminder list you already know, plus a "LV n" pill (top
  right) into the progression screens, and a **Today's Path** card showing
  today's reminders as a checklist with a projected XP total.
- **Progress screen** (tap "LV n"): global level, all nine skills with
  their own mini-levels, your streak with a 7-day activity strip, and
  "Active Paths" — the challenges currently worth chasing.
- **Collection screen** (from Progress): the full card archive, filterable,
  locked cards shown as deliberate mysteries.
- A toast pops up from the bottom whenever a card unlocks, from anywhere in
  the app. Once a day, opening the app shows yesterday's recap if you were
  active — XP earned, skill breakdown, any new discoveries, current streak.

## Run it on your iPhone in ~2 minutes (Expo Go)

There is no real "drag and drop" install on iOS without a Mac + Xcode + a paid
Apple Developer account (for TestFlight) — that's an iOS platform limit, not
an app limitation. The fastest real path to a native notification test is
**Expo Go**, which loads this app instantly over a QR code:

1. On your iPhone, install **Expo Go** from the App Store (free).
2. On a computer with internet access (this needs to be run from YOUR
   machine — this build environment has no npm registry access):
   ```bash
   cd reminder-app
   npm install
   npx expo install --fix   # auto-aligns package versions to your Expo SDK — do this if you see any version-mismatch warnings
   npx expo start --tunnel  # --tunnel works even if phone/computer are on different networks
   ```
3. Scan the QR code that appears with your iPhone's Camera app (it'll open
   in Expo Go automatically).
4. Grant the notification permission prompt when asked.

### Testing the actual notification (do this before judging the UI)
1. Tap **+ Add**, title it "Walk the dog", set the time to ~2 minutes from
   now, repeat = Once, Save.
2. Press the home button (or swipe away) to fully background/close the app.
3. Wait — at the scheduled time your phone should show a native banner:
   **"Reminder" / "Walk the dog"** with **Done** / **Snooze 10m** actions,
   plus a soft double-pulse vibration (Android) instead of the harsh default.
4. Long-press a reminder on the home screen to delete it. Use the switch to
   enable/disable (this cancels/reschedules the underlying OS notification).

## What's implemented (Phase 1 — functionality)
- Create / edit / delete reminders: title, date, time, repeat (Once/Daily/Weekly)
- Local notifications scheduled directly via `expo-notifications`
  (`scheduleNotificationAsync`) — fire even if the app is killed, because
  they're owned by the OS, not the app process
- Enable/disable toggle that correctly cancels and reschedules the OS-level
  notification (`src/notifications.ts: syncNotificationForReminder`)
- Editing a reminder cancels the old notification and schedules a fresh one
- Persistence via `AsyncStorage` (`src/storage.ts`) — reminders reload on relaunch
- Notification action buttons: **Done** (disables a one-off reminder) and
  **Snooze 10m** (reschedules a one-off follow-up notification), handled in
  `App.tsx` via `addNotificationResponseReceivedListener` so they work even
  from a killed-app relaunch
- Android notification channel with a **soft custom vibration pattern**
  (short double-pulse) instead of the default long buzz

## 🎙️ Arc Island — the real talking assistant (round 3)

Tap the mic icon next to "+ Add" on Home to open **Arc Island**, a proper
voice conversation, not a keyboard trick:

- **Tap the orb, talk, tap again** — it records your voice
- Your speech is transcribed via **OpenRouter** (real speech-to-text, not
  the OS dictation trick from round 2)
- The transcript goes to **OpenRouter's free model router** (`openrouter/free`
  by default — no paid model, no OpenAI account) with tool-calling wired to
  your actual reminders — it can genuinely **add, list, complete, or delete**
  reminders, not just chat about them
- It **speaks its reply back to you** out loud using the phone's built-in
  text-to-speech (`expo-speech` — free, on-device, works in plain Expo Go)
- Try: *"Remind me to call the landlord tomorrow at 9"*, *"What do I have
  today?"*, *"Mark walk the dog as done"*, *"Delete the dentist reminder"*

### Why this needed a real decision, not just more code
True speech-to-text needs either (a) a native on-device module, which can't
run in Expo Go and would've meant you couldn't test anything tonight, or (b)
sending your recorded voice to a cloud transcription API. You picked (b), so
that's what's built: **every voice/chat call goes straight from your phone to
openrouter.ai using your own API key — there is no server of ours in the
middle, no account, no data collected by us.** Chat replies default to
OpenRouter's free model router, so there's no billing to accept for those;
transcription isn't free on OpenRouter yet, so that half still costs a small
per-minute amount on the same key (see "Cost, roughly" below).

### One-time setup (2 minutes)
1. Get a free key at openrouter.ai/keys (no card required to use the free
   chat router — only needed if you ever add credit for transcription).
2. In the app: tap the mic icon → gear icon (⚙︎) → paste the key → **Save
   Key**. It's stored on-device only via `expo-secure-store` (iOS Keychain /
   Android Keystore) — never written to disk in plaintext, never sent
   anywhere but OpenRouter.
3. Grant the microphone permission prompt the first time you tap the orb.

You can skip pasting the key in-app every fresh install — see "Local dev key"
right below.

### Local dev key (skip pasting it every install) — round 8
For your own private dev build only: create a file named **`.env`** in the
project root (same folder as `package.json`, next to `.env.example` which
shows the exact format) containing:
```
EXPO_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-your-real-key-here
```
Restart `npx expo start` (or just reload the app — shake the phone → Reload,
or press `r` in the terminal running Metro) after creating/editing it.

**How it's loaded**: Expo's bundler automatically inlines any `EXPO_PUBLIC_`-
prefixed variable from `.env` into the app's JS at bundle time — no extra
package, no server. `src/assistant/providerConfig.ts` reads it once as
`PROVIDER_CONFIG.devDefaultApiKey`. `src/assistant/apiKeyStore.ts`'s
`resolveApiKey()` is what Arc Island actually calls for every chat/transcription
request: it uses whatever's manually saved in Settings if anything, and only
falls back to this `.env` value if Settings is empty. So on a fresh install
with `.env` set up, Arc Island works immediately with no Settings visit; pasting
a different key into Settings still overrides it, exactly like before; and
tapping "Remove Key" in Settings falls back to the `.env` key again rather
than leaving you with nothing, since that's the whole point of a personal
dev default.

`.env` is gitignored — it will never get committed, and OpenRouter's key
value never appears in any log this app writes. One honest caveat, not a
bug: `EXPO_PUBLIC_` variables get compiled into the app's plaintext JS
bundle (that's simply how a phone can call OpenRouter directly with no
server of ours relaying it) — fine for a private, undistributed dev build
you run yourself, but this is not a secure secret store. Never publish or
share a build with a real key baked in this way.

### $0, no-Mac, no-Apple-fee install via GitHub Actions + SideStore — round 11
The EAS path below (round 10) needs a paid Apple Developer Program
membership. If you don't want to pay that, `.github/workflows/build-unsigned-ipa.yml`
is a genuinely free alternative that needs **no Mac, no Apple account of any
kind, and no EAS** at build time:

1. **GitHub Actions compiles the app**, on GitHub's free hosted macOS
   runner (free on a public repo; a limited free quota on a private one —
   see the walkthrough this was delivered alongside for exact numbers).
   It runs `expo prebuild` to generate the native iOS project, then
   `xcodebuild` with `CODE_SIGNING_ALLOWED=NO` — a normal, supported Xcode
   mode that compiles a real, device-targeted (arm64) `.app` **without any
   Apple ID or signing identity at all**. That gets zipped into
   `ArcIsland-unsigned.ipa` and uploaded as a downloadable build artifact.
2. **SideStore, on your iPhone, does the actual signing** — the one place
   in this whole pipeline an Apple account is used, and it's your own free
   Apple ID, entered directly into SideStore, never through this project or
   anyone else. SideStore then self-refreshes that signature on-device
   roughly every 7 days, no PC involved after the one-time SideStore setup.

Nothing about the app itself changed for this — same UI, same reminder
engine, same OpenRouter provider, same `.env` dev key, same everything.
This is purely a different way to get the already-existing app onto a
physical iPhone without Expo Go or Apple's yearly fee.

### Real standalone install via EAS (no Expo Go) — round 10
`eas.json` now defines three build profiles for `eas build --platform ios`:
- **`preview`** — a real, standalone signed app (no dev client, no Metro
  needed after install), distributed "internal" (ad-hoc — installs straight
  onto your registered iPhone via a link, no App Store review). This is the
  one that matches "install once, PC can be off, use it like a normal app."
- **`development`** — a dev-client build (still connects to Metro for live
  JS reload) for if you ever want to iterate against a real build instead of
  Expo Go.
- **`production`** — for eventually submitting to TestFlight/the App Store.

This only changes build configuration — no app code, UI, or provider logic
changed. Building and signing for a physical iPhone requires **your own**
Apple Developer Program membership and Apple ID login, entered directly by
you in your own terminal during `eas build` (never through this assistant) —
see the walkthrough this was delivered alongside for the exact commands.

### Fixed: "Unsupported FormDataPart implementation" on voice (round 9)
Talking to Arc Island on SDK 57 could fail with this error after recording. Root
cause: SDK 57 made a new, spec-compliant `fetch` (`expo/fetch`) the app's
*global* fetch, replacing React Native's old one — and its `FormData` only
accepts string/Blob parts, not the old React-Native-only upload shape
(`{ uri, name, type }`) that `transcribeAudio()` in
`src/assistant/providers/openrouter.ts` was using to attach the recording.
Fixed by wrapping the recording in `expo-file-system`'s `File` class (`new
File(uri)`), which implements the real `Blob` interface and can be appended
to `FormData` directly — same OpenRouter request, same transcription model,
nothing else about the request changed. Added `expo-file-system` as an
explicit dependency for this. No UI, tool-calling, or provider changes.

### Cost, roughly
Chat replies: **$0**, via OpenRouter's free model router (`openrouter/free`)
— capped at 50 requests/day, or 1000/day if you ever add $10 of OpenRouter
credit. Voice transcription: OpenRouter has no free STT model yet, so it's
billed the same small per-minute rate Whisper always was, on this same key.
A typical "add a reminder" round-trip still costs well under a cent.

### What it can't do (yet)
- No wake word / always-listening — you must have the app open and tap the
  orb. True background "Hey Arc Island" listening needs a native dev build.
- No offline mode — no internet, no assistant (the rest of the app, adding
  reminders manually, still works fully offline).
- History resets when you close the app (not persisted) — only your
  reminders themselves are saved.
- If you'd rather have this be free and fully offline instead, the honest
  alternative is on-device speech recognition, which needs a one-time custom
  build (`eas build`) — a bigger, different task from tonight's.

### Still available: typing/dictating (round 2, no API key needed)
The **Quick Add** bar on Home still works completely free and offline: type
or use your keyboard's own 🎤 dictation icon, e.g. *"call mom tomorrow
6pm"* — it's parsed locally by `src/nlParse.ts`, no API key, no network. Good
fallback if you don't want to set up an OpenRouter key at all right now.

## 🎨 Visual system — implemented from the approved design (round 5)

The app's presentation layer was rebuilt to match an approved Claude Design
artifact ("Codename ORBIT"), without touching any domain logic — reminders,
notifications, XP, streaks, cards, and Idea Vault behavior are byte-for-byte
the same engines as before, just rendered through a new design system.

- **`src/theme.ts`** is now the single source of truth for every color,
  type style, radius, and motion preset — the artifact's own token names
  (void/sheet/card/raise surfaces; signal/done/xp/due accents; Sora +
  Manrope type) are transcribed directly. Every screen already imported
  `theme` for its styling, so this cascades everywhere with no per-screen
  rewiring.
- **New dependencies** (added to `package.json`, pulled in by
  `npm install` — nothing new to configure by hand): `react-native-reanimated`
  (the motion system), `react-native-svg` (the level ring — RN has no CSS
  conic-gradient), `expo-linear-gradient` (the Arc Island orb / card marks),
  `expo-font` + `@expo-google-fonts/sora` + `@expo-google-fonts/manrope`
  (the two typefaces). A `babel.config.js` was added since Reanimated
  needs its babel plugin.
- **New components**: `CircularRing` (SVG progress ring, Reanimated-driven),
  `StreakChain` (14-day chain grid), `LevelUpModal` (the one other
  full-screen celebration besides card discovery — real `leveledUp`/`newLevel`
  from `CompletionResult`, nothing invented), `NudgeVoiceViz` (listening
  waveform / thinking dots). `PulseOrb` and `ProgressBar` were rewritten on
  Reanimated instead of the old `Animated` API, same public props.
- **Reworked for the new look**: `ReminderCard` (checkbox + XP amount per
  row, tap-to-complete added alongside the existing swipe/edit gestures),
  `TodaysPath` (now leads with the level ring + XP bar, matching the
  artifact's Home screen), `ProgressScreen` (big level ring, skill bars
  with glow, streak chain), `CardTile` (rarity glow, gradient mark),
  `CardDetailSheet`, `UnlockToast`, `AssistantScreen`'s Arc Island sheet (state
  eyebrow/headline, waveform/dots per state).
- **What did not change**: `notifications.ts`, `storage.ts`,
  `reminderLogic.ts`, the entire `progression/` engine, `thoughts/vault.ts`,
  and every tool executor in `assistant/tools.ts` — this was a
  presentation-layer pass, not a rewrite.
- **Known deviations from the artifact** (documented rather than faked):
  the artifact's "tomorrow's challenge" card has Accept/Later buttons —
  the real challenge system evaluates automatically from actual progress,
  so no accept/decline mechanic was invented; there's no dedicated
  full-screen "card discovery reveal" moment yet (today's `CardDetailSheet`
  + `UnlockToast` cover it, `LevelUpModal` is the one signature full-screen
  moment that shipped this round); the Idea Vault screen kept its existing
  layout rather than being redrawn to the artifact (it wasn't one of the
  artifact's five reference screens). None of this has run on a real
  device — same standing limitation as every round, see below.

## 💡 Idea Vault — thought/idea/task intelligence (round 4)

Arc Island no longer treats everything you say as a reminder to schedule. It now
tells apart four different things you might mean:

- **"Remind me to call the landlord tomorrow at 9"** → a **REMINDER**, created
  immediately, same as always.
- **"I need to finish my cybersecurity report"** → a **TASK/GOAL** with no
  explicit time — Arc Island asks whether you want it scheduled rather than
  guessing a time for you.
- **"What if we built a global anonymous progression world"** → an **IDEA**.
  Arc Island does **not** create a project. It captures the idea into the new
  **Idea Vault** and says so out loud — nothing else happens.
- **"Let's actually build the global progression world"** → committed
  language, so Arc Island recognizes possible **PROJECT** intent, explains its
  reasoning, and confirms with you before creating anything.

### The Idea Vault
Tap the 💡 icon (next to the mic on Home, or next to ⚙︎ inside Arc Island) to open
it. Every captured idea/thought/note/experiment/goal lives here with its
original wording, a kind label, tags, and a status: **Captured → Review →
Promoted / Archived / Dismissed**. Filter chips switch between Active,
Promoted, Archived, Dismissed, and All. You can Archive or Dismiss an idea
right from the card (Dismiss asks for confirmation first) — but promoting an
idea into a project is deliberately **not** a button in this screen; you ask
Arc Island to do it, because that's a judgment call, not a form submission.

### Promoting an idea → a project
Say *"turn that idea into a project"* and Arc Island will generate exactly **one**
small first milestone and **one** first actionable task — never a fake
30-item task list. That first task is created as a completely ordinary
Reminder, so it fires a real notification and, when you complete it, flows
through the exact same unmodified XP/streak/card pipeline as everything else.

### What never happens
- Ideas, thoughts, notes, and experiments **never earn XP** and never unlock
  cards — the Vault has zero connection to the progression engine on
  purpose. Capturing more ideas is not something the app rewards or nudges
  you to do more of.
- Arc Island never silently turns an idea into a project, and never silently
  creates a project's tasks in bulk — promotion always requires you to ask
  for it, and it always produces exactly one milestone + one task.
- "Forget that idea" always asks you to confirm the exact idea by name
  before marking it dismissed (which is reversible — it's a status change,
  not a delete, so it's never permanently gone).
- Ask *"show me my ideas"* any time for a quick spoken list — Arc Island reports
  a few titles and a total count, never inventing contents.

See **ARCHITECTURE.md** for the full design writeup: why classification
lives entirely in Arc Island's prompt rather than a separate rule-based module,
why the Vault mirrors the Progression store's shape, and how to extend this
layer (new idea kinds, multi-task projects, etc.) later.

## New: organize-your-life features (round 2)
- **Quick Add with natural-language parsing** — one text field, no forms,
  understands relative days (today/tomorrow/weekday names), relative time
  ("in 20 minutes"), clock time, and repeat keywords ("daily", "every week")
- **Categories** (Personal/Work/Health/Errand/Other) with a color dot on each
  card, auto-guessed by the quick-add parser from keywords, editable in the
  full editor
- **Filter chips** on Home to see just Work, just Health, etc.
- **Swipe gestures** on cards: swipe right → mark Done (disables one-offs),
  swipe left → Delete — on top of the existing tap-to-edit and the enable
  switch

## What's implemented (Phase 2 — UI polish)
- Dark, high-contrast theme with a single accent color (`src/theme.ts`)
- Custom reminder cards (time block + divider + title + repeat pill + switch)
- Empty state with icon + copy
- Pill-style repeat selector, native date/time pickers themed dark
- Subtle press feedback (scale/opacity) on buttons and cards

## Known limitations (be upfront about these)
- **This build environment could not reach the npm registry** (blocked by
  network policy), so the app was hand-written and statically checked but
  never executed here. You must run `npm install` yourself — that's also
  the only realistic way to test real device notification delivery, since
  this session has no phone attached to it.
- **Custom alarm sound needs a real build**: both platforms are configured
  for the bundled `reminder_alarm.wav` tone (Android via the notification
  channel, iOS via per-notification content — see "Alarm-style reminder
  notifications" above), but Expo Go can't include a project's custom native
  assets, so in Expo Go both platforms fall back to their system default
  sound. It'll actually play once this is built with `eas build` or a
  development client. The alarm **vibration pattern** works today in Expo
  Go, but only on **Android** — iOS doesn't expose a public API for custom
  vibration patterns on notifications at all, build or no build.
- **Exact-time delivery while fully closed**: both platforms deliver
  OS-scheduled local notifications while the app is killed, but Android may
  delay by a few minutes under aggressive battery optimization on some
  OEMs (Samsung, Xiaomi, etc.) — if a notification is late, check the app's
  battery settings and disable optimization for it.
- **Reboot survival**: Android requires `RECEIVE_BOOT_COMPLETED` +
  `SCHEDULE_EXACT_ALARM` (both declared in `app.json`) to reschedule exact
  alarms after a reboot; this works in a standalone build but Expo Go itself
  doesn't survive a phone reboot as an installed app in the traditional
  sense — for guaranteed reboot survival, build a standalone app with
  `eas build` later.
- No calendar/list view beyond "sorted upcoming" — out of scope for MVP.
- Arc Island's assistant requires **Angelo's Core running on the same
  machine**, plus Angelo's own model backend (`ollama serve`). It costs
  nothing and needs no internet — but it does not work from a phone, because
  Angelo's Core is loopback-only by design. See round 14 above.
- Native voice input is disabled pending an audio route on Angelo's Core
  API. Web voice (browser Web Speech API) is unaffected. Typing works
  everywhere.
- The progression system's edge cases (what exactly "The Finisher" counts,
  why the day recap isn't a literal midnight job, why unlock timestamps
  aren't retroactive) are documented honestly in **ARCHITECTURE.md** rather
  than glossed over here.

## Setup checklist (do this once, in order)
```bash
cd reminder-app
npm install
npx expo install --fix   # aligns every package to your exact Expo SDK version
npx expo start --tunnel
```
Scan the QR with your iPhone camera → opens in Expo Go → grant notifications
permission. Reminders, quests, XP and the Idea Vault all work fully offline
on a phone.

**The System (the AI assistant) will not work on a phone** — it needs
Angelo's Core, which only listens on its own machine. For the assistant, run
the web build on the same computer as Angelo instead:
```bash
python -m angelo.core   # in the Angelo project, first
npx expo start --web    # here
```
See round 14 at the top of this file for the token setup and why the phone
limitation is structural rather than a missing feature.

## Project structure
```
App.tsx                        — app shell, state, notification response listener, screen router
src/types.ts                   — Reminder model (title/date/time/repeat/category/enabled)
src/theme.ts                   — colors/spacing/typography/category tokens
src/storage.ts                  — AsyncStorage persistence
src/notifications.ts            — permission + scheduling + channel/category setup
src/reminderLogic.ts            — next-occurrence math, formatting, sorting
src/nlParse.ts                  — free/offline quick-add natural-language parser
src/screens/HomeScreen.tsx       — list + empty state + quick add + filters + add button
src/screens/EditorScreen.tsx     — create/edit form
src/screens/AssistantScreen.tsx  — Arc Island: record → transcribe → chat+tools → speak
src/screens/SettingsScreen.tsx   — Angelo Core token entry (SecureStore)
src/assistant/provider.ts        — AIProvider interface + turn/tool/failure types (backend-agnostic)
src/assistant/providerConfig.ts  — where Angelo is, + optional .env dev token; the mobile limitation is documented here
src/assistant/providers/angelo.ts — Angelo Core adapter: the ONLY file that knows Angelo's HTTP shape
src/assistant/aiClient.ts        — stable entry point SystemScreen calls through, + describeFailure()
src/assistant/__tests__/angelo.test.ts — 33 tests over the adapter contract
src/assistant/tools.ts           — add/list/complete/delete tool schemas + executor
src/assistant/apiKeyStore.ts     — SecureStore wrapper + resolveApiKey() (manual key, else .env default)
src/components/*                — ReminderCard, EmptyState, RepeatSelector, CategorySelector, PulseOrb

Progression layer (see ARCHITECTURE.md for the full design writeup):
src/progression/types.ts         — UserProgress, CardDefinition, CompletionEvent/Result — the domain model
src/progression/engine.ts        — the only place that mutates progression state; recordCompletion()
src/progression/xpRules.ts       — base XP by category, skill-keyword detection, streak multiplier
src/progression/levels.ts        — the XP→level curve, shared by global level and every skill
src/progression/cardDefinitions.ts — the 21-card catalog (achievements/streaks/milestones/skills)
src/progression/storage.ts       — AsyncStorage persistence, separate key from reminders
src/progression/useProgress.ts   — React hook subscribing a screen to the progression store
src/screens/ProgressScreen.tsx   — level, skills, streak, active challenges
src/screens/CollectionScreen.tsx — the full card archive with filters + locked mysteries
src/components/CardTile.tsx, CardDetailSheet.tsx, UnlockToast.tsx, DayRecapModal.tsx,
  ProgressBar.tsx, TodaysPath.tsx — progression-specific UI
```

## Everything built across tonight's passes, in order
1. **Functionality MVP**: create/edit/delete/enable-disable reminders, real
   scheduled local notifications with Done/Snooze actions, AsyncStorage
   persistence.
2. **UI polish**: dark theme, custom cards, empty state, themed pickers.
3. **Soft vibration**: custom Android notification channel with a gentle
   double-pulse instead of the harsh default buzz.
4. **Organize-your-life round**: natural-language Quick Add, categories with
   color coding, filter chips, swipe-to-complete/swipe-to-delete gestures.
5. **Arc Island, the talking assistant**: voice recording, OpenRouter transcription,
   OpenRouter's free model router with real tool-calling against your
   reminders, spoken replies, a settings screen for your API key, a custom
   animated mic orb.
6. **Safety + finishing polish**: delete now asks for confirmation everywhere
   (editor button and swipe-left both do), swiping "Done" on a repeating
   reminder explains itself instead of silently no-oping, a small "today ·
   active" stat line, haptic feedback on save/toggle/complete/delete, and a
   real app icon + Android adaptive icon (`assets/icon.png`,
   `assets/adaptive-icon.png`) instead of Expo's default gray placeholder.
7. **The progression system** (this session): a from-scratch architecture
   audit and design pass (see ARCHITECTURE.md), then XP, nine skills with
   keyword-based detection, a linear level curve shared by the global level
   and every skill, streaks with a "comeback" mechanic for resuming after a
   break, a 21-card original collectible archive (achievements, streak
   milestones, per-skill mastery) with locked cards shown as genuine
   mysteries, a Collection screen, a Progress screen with an
   "Active Paths" challenge view built from the *same* card data (not a
   parallel system), a Today's Path daily checklist on Home, an unlock
   toast, a once-per-day yesterday recap, and Arc Island upgraded to read and
   report real XP/skill/streak numbers after every completion via a new
   `get_progress` tool — never invented ones. The reminder engine itself
   (`notifications.ts`, `storage.ts`) was not modified at all in this pass;
   the progression layer only observes completions through one funnel
   function in `App.tsx`.
8. **Thought/idea/task intelligence** (this session): a new `src/thoughts/`
   layer (an `Idea`/`Project` domain model plus a `Vault` store mirroring
   `Progression`'s init/subscribe shape) and four new Arc Island tools
   (`save_idea`, `list_ideas`, `promote_idea`, `update_idea_status`) so Arc Island
   can tell reminders, tasks, ideas, and committed projects apart instead of
   scheduling everything it hears. Classification lives entirely in Arc Island's
   system prompt and available tools — no separate rule-based classifier —
   to avoid a second copy of that logic. Promotion is schema-limited to
   exactly one milestone + one first task (a real Reminder, so it still
   flows through the untouched completion → progression pipeline).
   Dismissing an idea by voice uses a two-step confirm-by-name protocol
   mirroring the existing UI delete-confirmation pattern, and nothing in
   this layer ever earns XP or unlocks a card — on purpose. New: the Idea
   Vault screen (💡 icon on Home and inside Arc Island).
9. **Alarm-style reminder notifications** (round 7): a dedicated max-importance
   Android channel, a four-pulse alarm vibration pattern, a bundled custom
   alert tone via the `expo-notifications` config plugin, and
   `interruptionLevel: 'timeSensitive'` on iOS — see the dedicated section
   above. Existing Done/Snooze actions and the reminder engine itself were
   left untouched; only the channel/sound/vibration config changed.
10. **Voice bug fix** (round 9): fixed "Unsupported FormDataPart
    implementation" when talking to Arc Island on SDK 57, caused by the new
    global `expo/fetch`'s stricter `FormData` — see the dedicated section
    above. One file changed (`openrouter.ts`'s `transcribeAudio()`); no UI
    or architecture changes.

Every static-analysis pass I could run without real npm access (manual
TypeScript syntax/type checks with the project's own `typescript` package
and shimmed native modules) came back clean at each stage — but none of this
has run on an actual device yet, since this build environment has no npm
registry access and no phone attached. The `npm install` step above is not
just a formality — it's the first time this code will actually execute.

## Temporary web preview (round 12)

The native iOS/Android app is still the real target — this section documents
a **temporary** `npx expo start --web` path added for one night's use,
without redesigning any screen or touching native behavior.

**Why this needed real code changes, not just config:** several native
modules this app already depends on have no web implementation at all — not
"works differently," genuinely absent — and calling them there throws or
silently does nothing:

- `expo-notifications` — no Web platform in its own docs, for any API used
  here, including the module-level `setNotificationHandler()` call that used
  to run unconditionally at import time. Guarded in `src/notifications.ts`:
  every exported function now returns early on web (reminders still save and
  show in the list; they just don't schedule an OS-level alert). Android/iOS
  code is byte-for-byte the same as before.
- `expo-secure-store` — no web backend at all. `apiKeyStore.ts` now reads/
  writes through `@react-native-async-storage/async-storage` (already a
  dependency, has an official localStorage-backed web implementation) only
  on web; native keeps using the OS keychain via SecureStore exactly as
  before.
- **`Alert.alert` itself** — confirmed against react-native-web's own
  source: its `alert()` is a literal no-op (`static alert() {}`). This one
  matters most: every delete-reminder and dismiss-idea confirmation in this
  app is an `Alert.alert` with Cancel/destructive buttons, and on web none of
  it would have shown *or* fired the action's `onPress` — delete would have
  silently done nothing. New `src/alert.ts` (`safeAlert`) passes straight
  through to the real `Alert.alert` on native, and on web uses the browser's
  own `window.alert`/`window.confirm` instead. Every call site in App.tsx,
  AssistantScreen, EditorScreen, ReminderCard, IdeaVaultScreen, and HomeScreen
  now goes through it.
- `expo-haptics` — no Web platform listed for any method. New `src/haptics.ts`
  (`safeHaptics`) no-ops on web, real haptics unchanged on native. Swapped in
  at every call site (ReminderCard, HomeScreen, EditorScreen, AssistantScreen).
- `@react-native-community/datetimepicker` — no web build (Android/iOS/
  Windows only per its own docs). `EditorScreen.tsx`'s DATE/TIME fields now
  branch on `Platform.OS === 'web'`: web renders a plain HTML
  `<input type="date">` / `<input type="time">` styled to match the existing
  dark "fieldBtn" look (via `React.createElement`, not JSX, so it never needs
  DOM typings and never touches the native branch below it); native keeps the
  exact original `<DateTimePicker>` code.
- Voice (mic → transcription) — `expo-audio` *can* record on web (it's
  backed by `MediaRecorder` there), but the very next step, wrapping that
  recording for upload, uses `expo-file-system`'s `File` class, which has
  **no** web implementation (Android/iOS/tvOS only per its docs). Rather than
  let every voice attempt record successfully and then fail on upload,
  `AssistantScreen.tsx`'s mic button shows a one-line "voice needs the native
  app" message on web and doesn't attempt to record. Nothing about native
  voice changed. Reminders don't need voice — Home's own quick-add field and
  the Editor screen fully cover adding/editing/deleting on web.
- `app.json` gained a `"web"` block (`bundler: metro`, favicon, background
  color) — the standard, minimal config Expo's own web guide asks for.
  `bundleIdentifier`/`android.package`/`slug` untouched.

**Confirmed fine, no changes made** (checked against each library's current
docs rather than assumed): `expo-speech` (Web is an officially listed
platform for both `speak()`/`stop()`), `react-native-reanimated` 4 +
`react-native-worklets` (has a documented pure-JS web mode, wired up
automatically by `babel-preset-expo` + Metro — no manual webpack config
needed the way a non-Expo RN-web project would), `@react-native-async-storage/
async-storage`, `react-native-svg`, `react-native-gesture-handler`,
`expo-linear-gradient`, `expo-blur` (CSS `backdrop-filter`-backed on web —
may render very slightly differently than the native blur, not a functional
break).

**What still needs installing before `--web` works, on your machine, not
in this build environment:** `react-dom`, `react-native-web`, and
`@expo/metro-runtime` aren't in `package.json` yet — Expo's own guide says to
add them with `npx expo install ...` rather than hand-pin versions, so that's
one extra command before `expo start --web` (see below). This build
environment also has no npm registry access at all, so none of this has
actually executed yet — same caveat as every other round in this README.

**Native-only, cannot work in a browser tonight, by platform design, not a
bug:** OS-level scheduled reminder alerts/sounds/vibration while the tab
isn't focused (`expo-notifications`), the custom `reminder_alarm.wav` tone,
Done/Snooze from a notification, and voice chat with Arc Island. Everything
else — adding, editing, completing, deleting, and filtering reminders,
XP/streaks/level-ups/cards, and the Idea Vault — works the same as native.

## Round 13 — real voice on web, real reminder alerts while the tab is open

Two follow-ups after round 12, once "make it fully usable tonight" replaced
"just make it not crash":

- **Voice now actually works on web.** The blocker wasn't `expo-audio`
  (which already records fine on web via `MediaRecorder`) — it was
  `openrouter.ts`'s `transcribeAudio()` wrapping the recording in
  `expo-file-system`'s `File` class to upload it, and that class has no web
  implementation at all. On web only, `transcribeAudio()` now does
  `await (await fetch(uri)).blob()` instead — a `blob:` URI (what
  expo-audio's web recorder returns) is directly fetchable in any browser,
  and the resulting real `Blob` is exactly what `FormData` has always
  accepted. Whisper accepts the `webm` format `MediaRecorder` produces.
  Native iOS/Android still use the original `File`-based path, unchanged.
  `AssistantScreen.tsx`'s mic button is no longer disabled on web.
- **Reminders now actually alert you while the app is open, on web.** New
  `src/webReminderAlerts.ts`: since `expo-notifications` has zero web
  support (see round 12), this polls enabled reminders every 15s against
  the current time and fires a real browser `Notification` (an actual OS
  toast, not an in-page element) plus the bundled `reminder_alarm.wav` the
  moment one is due, deduped per reminder per day via `localStorage`. Wired
  into `App.tsx` behind `Platform.OS === 'web'`, started once reminders
  finish loading. **Hard limit, not a bug:** this only fires while the
  tab/window is open and the machine is awake — a web page cannot wake
  itself after being fully closed without a push server, which is out of
  scope (no backend). First load will show a one-time browser prompt
  asking to allow notifications — accept it or this can't fire anything.
- **To run it as a standalone window instead of a browser tab:** no code
  change needed for this — Chrome and Edge can both install any page as a
  windowed app via the install icon in the address bar, or the ⋮ menu →
  "Cast, save, and share" → "Install page as app" (Edge: "Apps" → "Install
  this site as an app"). Pointed at `http://localhost:8081` while `expo
  start --web` is running, this gives a real separate window with its own
  taskbar/Start Menu icon — no address bar, no tabs.
- Still true from round 12: this only runs while `npx expo start --web` is
  running on this machine (nothing is deployed anywhere), and native
  iOS/Android are the real target — nothing here touches that build.
