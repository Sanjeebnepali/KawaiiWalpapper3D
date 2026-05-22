# Architecture & Workflow — Kawaii Baby Wallpapers

How the app is put together and, especially, **how the automatic
wallpaper features actually work** end to end. Read `CLAUDE.md` for build
commands and dependency pins; read `KNOWN_ISSUES.md` for the honest list
of platform limits. This file is the "how does it work" map.

---

## 1. What it is

A dark-themed, Zedge-style wallpaper app for AI-generated baby characters.
The headline feature isn't browsing wallpapers — it's **automatically
changing the wallpaper on a schedule / by context, while the app is
closed.** That automation is the hard part and most of this document.

**Stack:** Expo SDK 55 · Expo Router (file-based) · React Native New
Architecture (Fabric/TurboModules) · Zustand state · React Native
Reanimated 4 · custom Kotlin native modules for the background work.

**Platform reality:** the automation is **Android-only**. iOS has no API
to set the wallpaper from an app, so every wallpaper-apply path degrades
to "save to Photos" on iOS.

---

## 2. The map (where things live)

```
app/                 Screens (Expo Router — file = route)
  (tabs)/            Bottom tabs: ai, couple, index(gallery), mood, profile
  shuffle/           Theme-shuffle editor + active screen
  mood/              Mood pools, pickers, history
  wallpapers/        video / dual / theme-packs hubs
  wallpaper/[id]     Full-screen preview (modal)
  (auth)/            Login / OTP / profile-setup (Supabase)

components/          Presentational UI (cards, toggles, sheets, grids)
contexts/            ThemeContext (app-wide theme from settings)
hooks/               useShuffleEngine, useFetchWallpapers, useMoodDetector…
constants/           theme, mockData, shuffle, moods, sleepWakePacks, couplePacks
store/               Zustand stores (the source of truth, see §3)
lib/                 Business logic + the automation glue (see §4)
modules/             Custom Android native modules (Kotlin) (see §4.4)
supabase/            SQL schema for auth + couple feature
changes/             Numbered change log (NNN-slug.md) — full history
```

---

## 3. State & data

All app state is **Zustand stores** in `store/`, each persisted to disk
(AsyncStorage or a JSON file) and hydrated once at startup.

| Store | Holds | Persist |
|-------|-------|---------|
| `settings` | theme, toggles, `maxGenPerDay`, `isPremium`, `bgAccessPrompted` | AsyncStorage |
| `shuffle` | collections, `activeCollectionId`, `currentIndex`, history, DND | JSON file in cache |
| `mood` | mood pool, `backgroundEnabled`, `friendCheckInEnabled`, `sleepWakeEnabled` + hours | AsyncStorage |
| `ai` | provider id, `hfToken`/`pollToken`, generation history | AsyncStorage |
| `couple` | partner link, GPS, proximity, pack | Supabase (server is source of truth) |
| `favorites` | hearted ids | in-memory (persist TODO) |
| `auth` | Supabase session/user | Supabase |

**Data seam:** `constants/mockData.ts` is the single source of placeholder
content. `pic(seed,w,h)` returns deterministic `picsum.photos` URLs;
`getPhotoById(id)` resolves any id to `{ id, image }`. Swap the URLs here
for real assets — no component changes needed. `hooks/useFetchWallpapers.ts`
is the seam for a future remote API (only the hook body changes).

---

## 4. The Automation Engine (the core)

This is the part the app lives or dies on. Four ways the wallpaper can
change by itself, plus the machinery that makes them survive a closed app
and an idle phone.

### 4.1 Mental model: ONE driver + layers

There are **continuous drivers** that autonomously change the wallpaper.
The rule (a product decision) is **exactly one driver runs at a time:**

- **Theme shuffle** — rotate a chosen album of up to 10 images on a timer.
  *(Day-based = the same shuffle in `day` mode: one image per weekday.)*
- **Mood-based** — rotate within a mood pool inferred from time-of-day.
- **Friend check-in** — periodically prompt "how are you feeling?" and
  apply a matching image when tapped.

Turning one ON automatically turns the other two OFF.

On top of that, **Sleep/Wake** is a *layer*, not a driver — it applies a
"wake" image and a "sleep" image at two fixed clock times per day and is
allowed to run alongside whichever driver is active. The daily reminder
notification is also a layer.

```
   ┌─────────────────── pick exactly ONE ───────────────────┐
   │  Theme shuffle      Mood-based       Friend check-in    │   ← drivers (mutually exclusive)
   └─────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────┐
   │  Sleep/Wake   +   Daily reminder                         │   ← layers (always allowed)
   └─────────────────────────────────────────────────────────┘
```

### 4.2 The coordinator — `lib/automationMode.ts`

The single source of truth for the rule above.

- `getActiveDrivers()` — which drivers are on, from live store state.
- `enforceSingleDriver(keep)` — turns OFF every driver except `keep`
  (by flipping its store flag), returns the labels it stopped (for a
  toast), and **never touches Sleep/Wake**. A re-entrancy guard
  (`isExclusivitySuppressed`) stops the "A turns off B turns off A" loop
  when flipping flags cascades through the store subscribers.

It's *invoked* from the store subscribers in `lib/moodBootstrap.ts`
(which fire whenever a driver flag changes) and surfaced to the user via
toasts in the mood / shuffle / theme-packs screens.

### 4.3 How a wallpaper is actually set

Every apply ultimately calls the `wallpaper-setter` native module →
Android `WallpaperManager.setBitmap(... FLAG_SYSTEM | FLAG_LOCK)`. Remote
image URLs are downloaded to the app cache first (`downloadToCache`, which
is cache-aware so it doesn't re-download), because the background services
decode local `file://` paths.

### 4.4 The reliability stack (why it keeps working when closed)

This is the machinery, layered defenses, oldest at the bottom:

```
  ┌──────────────────────────────────────────────────────────────┐
  │ BOOT_COMPLETED receivers   → re-arm after a phone reboot       │  ← survives restart
  ├──────────────────────────────────────────────────────────────┤
  │ AlarmManager.setAndAllowWhileIdle → fires THROUGH Doze         │  ← survives screen-off/idle
  │   + manifest BroadcastReceiver (revives a killed process)      │
  ├──────────────────────────────────────────────────────────────┤
  │ Foreground service + ongoing notification                      │  ← survives OEM killers
  │   (Vivo/MIUI/ColorOS exempt FGS-with-notification from kills)   │
  ├──────────────────────────────────────────────────────────────┤
  │ User enables battery "No restrictions" + Autostart             │  ← the human step (see §4.6)
  └──────────────────────────────────────────────────────────────┘
```

**Why AlarmManager and not a timer:** the old design used
`Handler.postDelayed`, which **Android Doze suspends** when the screen is
off and the phone is idle — the timer froze and "caught up" only when the
app was reopened. `AlarmManager.setAndAllowWhileIdle` is the one timer
Android lets through Doze and needs no special permission (unlike
`setExactAndAllowWhileIdle`). Trade-off: in deep Doze it's throttled to
~1 fire / 9 min, so sub-9-min intervals stretch a little — fine for
wallpapers. *(changes/081, 082.)*

**The native modules (Kotlin, `modules/`):**

| Module | Role |
|--------|------|
| `wallpaper-setter` | the actual `WallpaperManager.setBitmap` call |
| `shuffle-foreground` | shuffle: scheduler + tick receiver + boot receiver |
| `sleep-wake-foreground` | wake/sleep clock alarms + receivers |
| `friend-checkin-foreground` | friend cadence alarm + receivers |
| `context-mood-foreground` | mood-based tick (emits event to JS) |
| `usage-stats` | (legacy app-usage signal, mostly unused) |

Each foreground module follows the same shape: a `Service` (holds the
notification, keeps the process alive), a `Scheduler`/companion (state in
SharedPreferences + `setAndAllowWhileIdle`), a `*TickReceiver`/`*AlarmReceiver`
(does the work on a worker thread, re-arms the next alarm), and a
`*BootReceiver` (re-arms after reboot).

**Single source of truth between native and JS:** the shuffle service
writes back the index/timestamp/uri it applied to SharedPreferences. JS
reads that on resume (`getLastApplied()` → `syncFromNativeShuffle()`) and
matches its in-app "current image" to reality — instead of recomputing its
own index and re-applying a different photo. On Android the **native
service is the only applier** (the JS ticker just mirrors it for the
countdown); this is what fixed the "app shows a different image than the
actual wallpaper" bug. *(changes/081.)*

### 4.5 Feature flows (end to end)

**Theme shuffle / Day-based**
```
User: Theme Packs → "Shuffle" a pack (or build a custom collection)
  → coordinator stops mood/friend
  → JS instantly applies image 0 (instant feedback) + records currentIndex/lastChangedAt
  → starts shuffle FGS: precache photos → file:// uris → ShuffleScheduler.start()
  → ShuffleScheduler arms setAndAllowWhileIdle(now + interval)
  ... phone locked, screen off ...
  → alarm fires → ShuffleTickReceiver → next index → setBitmap → write back → re-arm
  → (reboot) ShuffleBootReceiver re-arms the alarm → keeps going
```

**Mood-based**
```
User: Mood tab → pick a pool → "Auto-change in background" ON
  → coordinator stops theme/friend
  → context-mood FGS ticks ~every 30 min → emits onTick → JS runMoodBackgroundOnce()
  → infer mood from time-of-day → pick a photo from the pool's matching bucket → apply
```

**Friend check-in**
```
User: Mood tab → "Friend check-in" ON (interval N min)
  → coordinator stops theme/mood
  → friend FGS keeps JS alive; FriendAlarmReceiver fires every N min (through Doze)
  → invokes JS tickCallback → posts the 7-mood prompt notification
  → user taps a mood in the shade → wallpaper changes to a matching image
```

**Sleep/Wake (layer)**
```
User: Mood tab → Sleep/Wake ON, pick wake/sleep images + hours
  → SleepWakeForegroundService computes the next wake/sleep clock time
  → arms setAndAllowWhileIdle(absolute time) → SleepWakeAlarmReceiver applies natively
  → arms the following boundary; SleepWakeBootReceiver re-arms after reboot
  (runs ALONGSIDE whatever driver is active)
```

### 4.6 Background-access shortcut — `lib/backgroundAccess.ts`

On Vivo/MIUI/ColorOS/OneUI the OEM kills background work unless the user
flips two device settings (battery "No restrictions" + Autostart). The app
deep-links them there in one tap:

- `openBatteryOptimization()` — one-tap system dialog
  (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) → battery list → app-info.
- `openAutostartSettings()` — tries each OEM's autostart screen by name
  (Vivo first) → app-info fallback.
- `maybePromptBackgroundAccess()` — a one-time nudge the first time any
  background feature is enabled (gated by `settings.bgAccessPrompted`).

Surfaced in **Settings → "Background Access"** and auto-prompted on first
enable. *(changes/083.)*

### 4.7 JS vs native split

- **JS owns**: UI, the rule/coordinator, instant-apply on activation,
  mood inference, scheduling decisions, and applying on iOS.
- **Native (Kotlin) owns**: the timers (AlarmManager), keeping the process
  alive (FGS), applying the bitmap while closed, and surviving reboots.
- The seam is small: JS calls `start/stop` on each module and reads back
  `isRunning()` / `getLastApplied()`.

---

## 5. AI image generation

```
ai.tsx → generateImage(req)  (lib/ai/client.ts)
  → daily cap check (settings.maxGenPerDay)
  → active provider (store/ai.providerId) from the registry
      • pollinations (default, free): rate-gated to the free tier, referrer,
        optional token, 402/429 → friendly countdown   (lib/ai/providers/pollinations.ts)
      • huggingface (optional, token):                  (lib/ai/providers/huggingface.ts)
  → image bytes → cacheDirectory file:// → recorded in ai.history
```

The provider abstraction (`lib/ai/types.ts` + `registry.ts`) means adding
DALL-E/Stability/etc. is one new file + one registry row. The 402 fix and
the free-tier rate gate are documented in changes/079.

---

## 6. Couple proximity (brief)

A separate, account-bound feature (`store/couple`, `lib/couple*`,
`app/couple/*`): two users pair via a LOVE-XXXX code, share GPS through
Supabase Realtime, and the wallpaper swaps to a shared "couple" image when
they're within ~100 m and back to a solo image when apart. It is *not* in
the single-driver exclusive set today (it's GPS-driven with cross-partner
side effects). See changes/077–078 + `supabase/couple_schema*.sql`.

---

## 7. Startup sequence

```
app/_layout.tsx mounts
  → GestureHandlerRootView > ThemeProvider > BottomSheetModalProvider > RootStack
  → hydrate stores (settings, shuffle, mood, ai, auth)
  → bootstrapMoodFeature()  (lib/moodBootstrap.ts):
      - normalize to single-driver rule (legacy multi-driver state)
      - install FGS tick listeners
      - restart whatever was active (FGS + notifications) from persisted flags
      - subscribe to store changes (enforce exclusivity + lifecycle + bg-access prompt)
  → bootstrapCoupleFeature()  (if signed in)
  → <ShuffleEngineHost/> mounted once (foreground ticker + resume sync)
```

---

## 8. Platform limits (the honest boundary)

- **Powered-OFF phone runs nothing.** Reboot resume is the closest we can
  get, and it's implemented.
- **iOS can't set wallpaper** from an app — Android only.
- **Deep Doze** caps `setAndAllowWhileIdle` at ~1 fire / 9 min.
- **OEM killers** still need the user's one-time battery/autostart opt-in
  (now a one-tap shortcut, §4.6).
- **The ongoing notification is mandatory** — it's Android's contract for
  "allowed to keep running while closed."

See `KNOWN_ISSUES.md` for the full, current list with what's fixed vs not.

---

## 9. One-glance data flow

```
       USER ACTION (toggle a feature)
              │
              ▼
   store flag flips ──► moodBootstrap subscriber
              │              │
              │              ├─► enforceSingleDriver()  (stop other drivers)
              │              ├─► start/stop native FGS + arm AlarmManager
              │              └─► maybePromptBackgroundAccess()  (first time)
              ▼
   ┌────────────────── while app closed ──────────────────┐
   │  AlarmManager (through Doze) ─► *Receiver ─► setBitmap │
   │                              └─► write back state      │
   └───────────────────────────────────────────────────────┘
              │
              ▼  (app reopened)
   syncFromNativeShuffle() ─► store catches up ─► UI shows the real wallpaper
```

---

## 10. Extending the app — "where do I add X?"

The codebase is built around a few seams so most changes touch one place.

| I want to… | Edit | Notes |
|------------|------|-------|
| Add / change wallpaper images | `constants/mockData.ts` | Swap `pic()` URLs for real assets; every screen reads through `getPhotoById`. No component changes. |
| Add a built-in theme pack | `constants/mockData.ts` (`themePacks`) | Appears in the Theme Packs hub automatically. |
| Add an AI provider (DALL-E, Stability…) | new file in `lib/ai/providers/` + one row in `lib/ai/registry.ts` | Implement the `AIProvider` interface. Zero changes to the screen or client. |
| Change AI daily cap / quality options | `store/settings.ts` + the Settings UI | `maxGenPerDay` is enforced in `lib/ai/client.ts`. |
| Add a shuffle timer / mode option | `constants/shuffle.ts` (`TIMER_OPTIONS` / `SHUFFLE_MODES`) | The native scheduler reads the resolved minutes; mirror any new *mode* in both `pickNextShuffleIndex` (JS) and `ShuffleScheduler.nextIndex` (Kotlin). |
| Add a new automation **driver** | `lib/automationMode.ts` (add to `DriverId` + `DRIVERS` + the two switch statements) | Then wire its on/off + foreground service like the others. The exclusivity rule then covers it for free. |
| Change the mutual-exclusivity rule | `lib/automationMode.ts` only | Single source of truth. |
| Add a new screen / route | new file under `app/` | Expo Router is file-based; cast `as Href` until `.expo/types` regenerates (see CLAUDE.md). |
| Change how a wallpaper is set | `lib/wallpaperActions.ts` + `modules/wallpaper-setter` | The one Kotlin path all features funnel through. |
| Add new background behavior that runs while closed | clone a `modules/*-foreground` module | Follow the Service + Scheduler + `*AlarmReceiver` + `*BootReceiver` shape (§4.4). |
| Add a Settings toggle | `store/settings.ts` (field + DEFAULTS) + a `SettingsRow` in `app/(tabs)/profile.tsx` | The generic `set(key, value)` persists it. |
| Add a new OEM autostart target | `lib/backgroundAccess.ts` (`AUTOSTART_TARGETS`) | Order matters — first match wins. |
| Re-theme the app | `constants/theme.ts` (`Themes`) + `contexts/ThemeContext.tsx` | Components read `useTheme()`. |

**Golden rules** (from `CLAUDE.md`): images always use `expo-image`; toggles
use `SmoothToggle`; never edit `android/` directly (go through Expo
config / a module manifest); after any code change add a `changes/NNN-*.md`
entry + a README row.

---

## 11. Sequence diagram — a shuffle tick while the phone is locked

The hardest flow to reason about: what happens between two wallpaper
changes when the app is closed and the screen is off. Swim lanes are
User → JS (RN) → Android OS (AlarmManager) → Native module → WallpaperManager.

```
USER            JS (React Native)        Android OS              Native module (Kotlin)        WallpaperManager
 │                    │                       │                          │                            │
 │ tap "Shuffle"      │                       │                          │                            │
 ├───────────────────►│                       │                          │                            │
 │              enforceSingleDriver()          │                          │                            │
 │              (stop mood/friend)             │                          │                            │
 │              applyCollectionPhoto(idx 0)    │                          │                            │
 │              (instant feedback) ────────────┼──────────────────────────┼───────────────────────────►│ setBitmap(img0)
 │              startForegroundShuffleForCollection()                      │                            │
 │                    ├── precache → file:// uris ─────────────────────────►│ ShuffleScheduler.start()   │
 │                    │                       │   arm setAndAllowWhileIdle  │  (persist uris/idx/running │
 │                    │                       │◄──(now + interval)──────────┤   to SharedPreferences)    │
 │                    │                       │                          │                            │
 │  🔒 screen off, app closed, phone idle (Doze) — JS is asleep            │                            │
 │                    ╎                       │                          │                            │
 │                    ╎          ⏰ interval elapses                       │                            │
 │                    ╎                       ├── deliver alarm broadcast ─►│ ShuffleTickReceiver        │
 │                    ╎                       │   (revives process if killed) goAsync → worker thread   │
 │                    ╎                       │                          │  next index (mode)         │
 │                    ╎                       │                          ├── decode file:// ──────────►│ setBitmap(imgN)
 │                    ╎                       │                          │  write back idx/at/uri     │
 │                    ╎                       │◄── arm next alarm ─────────┤  (SharedPreferences)       │
 │                    ╎                       │                          │                            │
 │  ... repeats every interval, through Doze, with no app/JS involvement ...                           │
 │                    ╎                       │                          │                            │
 │  📱 user reopens app                        │                          │                            │
 ├───────────────────►│ AppState→active        │                          │                            │
 │              syncFromNativeShuffle()         │                          │                            │
 │                    ├── getLastApplied() ─────┼──────────────────────────►│ read SharedPreferences     │
 │                    │◄── { index, at, uri } ──┼──────────────────────────┤                            │
 │              store.recordChange(...)         │  (NO re-apply — just mirror)                           │
 │              UI shows the real wallpaper + correct countdown            │                            │
 │                    │                       │                          │                            │
 │  🔁 phone reboots                           │                          │                            │
 │                    │                       ├── BOOT_COMPLETED ─────────►│ ShuffleBootReceiver        │
 │                    │                       │◄── re-arm alarm ───────────┤  → rotation resumes        │
```

Key takeaways from the diagram:
- The **instant apply** is JS (so the user sees an immediate change); every
  subsequent tick is **native**, so it survives the app being closed.
- The **alarm** — not a JS timer — is what fires through Doze.
- The **write-back + sync-on-resume** is what keeps the in-app image and the
  real wallpaper identical (no double-apply, no "wrong image").
- The **boot receiver** is what makes it survive a restart.

Mood / Friend / Sleep-Wake follow the same skeleton; only the "what to do
on each tick" differs (infer mood / post a prompt / apply the wake-or-sleep
image at a clock time).

