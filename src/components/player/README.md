# `src/components/player/`

The client player. Built directly on `<video>` + hls.js/dash.js rather than
a general-purpose player library, so the app owns the lifecycle state
machine and the teardown contract instead of trusting an adapter
abstraction to get it right.

## Why this exists

The previous player wrapped Vidstack, which owns its own internal
provider-switching logic — exactly the kind of opaque automated behavior
this rebuild removes at every layer (proxy, resolution, and here). It also
kept per-episode source fallback in a module-level `SourceQueue`, whose
failure memory was a global `Map` shared by every concurrent user. Rebuilt
here as: an explicit state machine (`types.ts`), one small adapter per
format (`engines/`), and a hook that enforces strict teardown-before-attach
(`usePlayerEngine.ts`) — with provider/quality switching moved entirely into
explicit user clicks (`SourceSelector.tsx`).

## Files

- **`types.ts`** — `PlayerStatus` (`idle → loading → playing/paused/
  buffering/stalled → error`), the reducer, and the `Engine` adapter shape.
- **`engines/nativeEngine.ts`** — progressive mp4/mkv/other, and HLS on
  Safari (native HLS support, lowest latency where available).
- **`engines/hlsEngine.ts`** — hls.js for HLS where native support isn't
  available. Keeps hls.js's own transient segment-retry behavior; one
  recovery attempt for a fatal media error; anything beyond that is a
  terminal error, never a silent provider switch.
- **`engines/dashEngine.ts`** — dash.js for `.mpd` sources.
- **`usePlayerEngine.ts`** — the hook. Owns the reducer and the teardown
  contract (see below).
- **`PlayerEngine.tsx`** — the `<video>` wrapper: renders the element,
  subtitle `<track>`s, resume-from-progress, periodic progress save, the
  loading/stalled/error overlays, and `Controls`.
- **`Controls.tsx`** — play/pause, seek, volume, fullscreen, captions
  toggle, and the buttons that open `EpisodeSelector`/`SourceSelector`.
- **`SourceSelector.tsx`** — explicit, manual variant switcher. Shows a
  session-local "failed earlier" hint per variant; never switches anything
  on its own.
- **`EpisodeSelector.tsx`** — episode list, same UX as the previous
  player's panel.
- **`PlayerError.tsx`** — terminal-error UI. Classifies the error
  (expired/network/decode/unsupported) and always offers an explicit action.
- **`usePlaybackSession.ts`** — fetches episodes + variants for the current
  media, tracks the active episode/variant and which variants have failed
  this session, and exposes the callbacks `WatchExperience` wires to the UI.
- **`WatchExperience.tsx`** — top-level orchestrator mounted by the watch
  route: loading/error screens, then `PlayerEngine` + the two selector
  panels.

## Data flow

```
WatchExperience
  └─ usePlaybackSession           (fetch episodes + StreamVariant[] via /api/sources)
       └─ PlayerEngine             (one <video>, one active variant)
            └─ usePlayerEngine     (state machine + teardown contract)
                 └─ engines/*      (attaches hls.js/dash.js/native to the element)
       └─ SourceSelector / EpisodeSelector  (explicit user switches)
```

A variant's `playbackHref` (minted server-side by `services/sources.ts`) is
the only thing this tree ever passes to `<video src>`/hls.js/dash.js — no
component here ever constructs a proxy URL itself.

## The teardown contract

Switching variants or unmounting always runs, **in this order**:

1. Abort the in-flight attach (`AbortController`).
2. Run the previously-active engine's own cleanup (`hls.destroy()`,
   `player.destroy()`, or the native engine's src removal).
3. Flush the element (`video.removeAttribute('src')` + `video.load()`),
   which also releases any MSE `SourceBuffer`s the destroyed engine held.
4. Reset state to `idle`.

Only after all four steps does the next variant's engine ever attach. No
attach ever overlaps a previous one's teardown — this is the direct fix for
the previous player's cross-source bleed, where a stale engine instance
could still be feeding the `<video>` element after a source switch.

## Failure modes and recovery policy

| Condition | State | Recovery |
|---|---|---|
| A single segment fetch fails transiently | (invisible) | hls.js's own default backoff — this is segment-level resilience, not provider fallback |
| A fatal MSE/media error | `buffering` briefly | One `hls.recoverMediaError()` attempt; if it recurs, `error` |
| Token expired (`401`/`403` from the proxy) | `error`, kind `expired` | User must reopen `SourceSelector` or retry — never a silent re-resolve with stale credentials |
| Buffering stalls past ~8s | `stalled` → inline "switch source" hint | Still requires a click; never auto-switches |
| Every variant has failed this session | `error` after the last one, `SourceSelector` shows all as failed | User's call — pick a different provider/quality, or leave |

## Boundaries

- This directory never talks to a provider or to `/api/proxy` directly — it
  only ever receives already-minted `StreamVariant`s from
  `services/sources.ts` via `/api/sources`.
- No component here keeps state that outlives its own React lifetime.
  `failedVariantIds` lives in `usePlaybackSession`'s component state, reset
  every time `WatchExperience` mounts fresh — there is no cross-session,
  cross-user, or cross-tab memory of a "bad" source, unlike the previous
  implementation's module-level `SourceQueue`.
