# WorkoutApp — Project Brief

## What this is
A daily workout guide app for personal use. The main path is picking a curated
workout from a library (currently 20) of defined exercise sequences — select
today's workout, then step through it one exercise at a time full-screen with
a 35-second timer and a "Next" button to advance. Over time, the goal is to
build strength by progressing to more difficult curated workouts rather than
just repeating the same one. A secondary option pulls 10 random exercises from
the full library, for variety or when not following a specific program.

## Architecture decision — already made, don't relitigate
Build this as a **PWA** (plain HTML/CSS/vanilla JS, no framework) — not native Swift.

Why: the two requirements that matter are multi-device (phone/tablet/laptop) and
cost-effective. Native Swift restricts you to iOS/Mac, needs Xcode, and needs a
$99/yr Apple Developer account for a persistent install. A PWA runs on anything
with a browser, costs nothing to host (GitHub Pages / Netlify / Cloudflare Pages),
and installs to the home screen like a native app.

Keep this to a small handful of files — no build step, no bundler, no React —
the app is simple enough that plain JS keeps it easy to hand-edit later. If
App Store presence is ever wanted, wrap this same codebase with Capacitor rather
than rewriting in Swift.

## Data files in this folder
- **`exercises_data.json`** — the exercise library + curated routines.
  - `exercises`: array of `{id, name, description, image, hasImage, hasDescription}`.
    `id` is a slug and matches the image filename (without extension).
    `description` and `image` are `null` for a small number of entries — see
    "Known data gaps" below. Handle these gracefully, don't invent content.
  - `routines`: array of `{id, title, meta, sequence}` — 20 curated workouts
    from the original source document. `sequence` is an ordered list of
    exercise `id`s. Some routines have fewer than 10 exercises and may repeat
    an exercise within the same routine — that's intentional (original circuit
    structure), not a bug to fix.
- **`exercise_images/`** — 69 `.jpg` photos, one per exercise that has one.
  Filename = `{id}.jpg`. Full original resolution.

Treat this library as a living dataset, not a fixed one. Missing photos will be
filled in over time, and new exercises/workouts will likely be added later — so
build assuming the counts (77 exercises, 20 routines, 69 photos) will change,
rather than hardcoding them.

## Core app behavior
- **Home / "today's workout" screen** — two options:
  1. **Curated workout (primary/default path)**: pick one of the 20 `routines`
     by name. This is how progression happens — the person moves to harder
     curated workouts over time as they build strength. If workout difficulty
     / level isn't already explicit in the data, surface whatever's in each
     routine's `meta` field (e.g. Beginner/Intermediate) so it's at least
     visible when choosing.
  2. **Random 10**: pull 10 random exercises from the full library, for
     variety or off-program days.
- **Session runner**: step through the selected list one exercise at a time.
  35 seconds per exercise, shown as a countdown. "Next" advances immediately
  regardless of where the timer is. Use the routine's actual `sequence` length
  for curated workouts — don't assume it's always 10.
- **Per-exercise display**: name, description (if present), photo (if present).
  Design a clean fallback for exercises missing a photo and/or description —
  don't break the layout, don't stub in placeholder text or images.
- **Persistence**: which workout was done and when (useful later for tracking
  progression through harder workouts). Use `localStorage` — this is a
  single-user personal app, no backend or database needed.

## Known data gaps (real gaps in the source material — expect these to shrink over time)
No photo yet for: Plank to Downward Dog, Dumbbell Deadlift, Leg Swings (Side to
Side), Superman Holds, Bear Plank, Reverse Lunges, Bridge Walkouts, Dumbbell
Plank Pull-Throughs.

No description yet for: Tricep Dips, Bicycle Crunches.

These will be filled in later — build the UI to degrade gracefully now, but
don't over-invest in elaborate fallback design since it's a temporary state.

## Constraints
- Free hosting only (GitHub Pages, Netlify, Cloudflare Pages). No paid backend.
- No build tooling / framework unless there's a strong reason to add one.
- iOS Safari throttles JS timers when the screen locks or the app backgrounds —
  don't rely on background timer accuracy; the user will be actively watching
  the screen during a session, so this isn't a real constraint in practice.
- Primary target is phone; should also work fine on tablet/laptop browsers.

## Suggested build order
1. Scaffold `index.html` / `style.css` / `app.js`, loading `exercises_data.json`.
2. Build the home screen (choose a curated workout, or random 10) and the
   session runner (countdown timer + Next button).
3. Once working locally, add a web app manifest + service worker so it installs
   to the home screen and works offline.
4. Deploy to a free static host and confirm it works across devices.
