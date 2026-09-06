# Streaming & Player Rebuild — Design Spec

Status: draft, pending review
Scope: full replacement of video delivery + player. Providers (scraping) are
out of scope — only how their output flows into caching, proxying, and
playback changes.

## 1. Problem

The current pipeline lets a user's click resolve to the wrong stream. Three
independent root causes, all confirmed by reading the code (not guessed):

1. **Cross-request global state.** `components/playback/queue.ts` keeps
   `failedSources` in a module-level `Map` shared by every concurrent
   request the server process handles. One user's failed source is silently
   "failed" for every other user hitting the same instance.
   `lib/media/streamProxy.ts`'s `proxyIdentityCache` has the same shape,
   keyed only by upstream hostname.
2. **Cache-then-lookup indirection.** `/api/proxy` resolves a stream *list*
   into a `TtlCache` keyed by `provider:ref:kind`, then looks up a specific
   stream by `sourceId` against whatever that cache currently holds. If the
   cache repopulates (TTL expiry, a re-scrape) between the player reading
   the list and a later request for that id, the same id can resolve against
   a different provider re-scrape — the proxy 404s in the best case, and in
   the worst case a colliding id (see `services/normalize.ts`'s occurrence
   counter) resolves to different content than what the user clicked.
3. **Opaque automatic fallback.** `SourceQueue.failCurrent()` silently
   advances to the next provider/quality with no user-visible signal about
   *why* or *that* it happened.

## 2. Goals

- A stream is identified by an explicit, stable triple:
  `(mediaId, providerId, variantId)`. Nothing is ever selected by cache
  lookup at proxy time.
- The proxy route is a **pure function of its request** — no shared mutable
  state, no in-process cache whose staleness can change which bytes get
  served. Correctness cannot depend on cache TTLs.
- Provider/quality switching is **explicit user action only**. Automatic
  recovery is limited to segment-level transient retry (a single flaky
  `.ts` fetch), never to silently swapping providers.
- Low latency: Edge runtime for the byte-streaming path, native HLS on
  Safari, minimal work per request.
- Every top-level concept directory carries a `README.md` explaining intent,
  data flow, connections to other parts, and failure modes — not API docs,
  developer orientation.

## 3. Non-goals

- Changing provider scraping (`src/providers/*`) or the fanout/resolve
  services (`services/fanout.ts`, `services/resolve.ts`).
- Building a cross-user CDN cache-key override. Vercel's edge network caches
  by full URL (query string included); achieving true multi-tenant segment
  dedup needs a CDN with custom cache-key support, which isn't part of this
  project's infrastructure today. The deterministic cache key this spec
  defines still guarantees per-user correctness, repeat-request caching, and
  zero cross-media collision — documented as a boundary, not solved by
  introducing new infra (Redis/KV) speculatively.
- Server-side transcoding, DRM, or ABR ladder generation. We proxy whatever
  format the provider serves.

## 4. Domain model — `src/lib/streaming/`

```ts
type StreamFormat = 'hls' | 'mpd' | 'mp4' | 'mkv' | 'other';

interface StreamVariant {
  mediaId: string;       // stable id of the episode/movie unit being played
  providerId: string;    // which provider resolved it
  variantId: string;     // quality + format + server, disambiguates options
                          // from the same provider for the same mediaId
  format: StreamFormat;
  quality?: string;
  label: string;         // provider's own server/quality label, shown in UI
  headers?: Record<string, string>;
  subtitles: SubtitleTrack[];
  skip?: SkipInterval[];
}
```

`mediaId` reuses the existing `idFor(providerId, ref)` convention already
used for `Media.id`/`Episode.id` — no new cross-provider canonical id is
invented; a provider's `ref` is provider-scoped already, so `mediaId` stays
provider-scoped too. This keeps the migration a rename/reshape of the
existing `StreamSource`, not a new concept the rest of the app must learn.

The full unique key for a piece of content is the concatenation
`${mediaId}:${providerId}:${variantId}` — satisfies the required
`(media_id, provider_id, quality/format)` uniqueness literally.

**Cache key builder** (`cacheKeys.ts`): given a `StreamVariant` and a chunk
descriptor (manifest name, segment sequence, or subtitle track id), produces
the deterministic path segment used by the proxy route:
`{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}`. `chunkId` for a
segment is a stable hash of the **upstream path only** (query string
excluded — providers sign query strings per-session, which would make the
same logical segment hash differently every resolution and defeat
determinism).

**Token** (`token.ts`): AES-256-GCM via `crypto.subtle` (Web Crypto — works
identically on Node ≥ 19 and Edge, replacing the old `node:crypto` HMAC,
which is Edge-incompatible). Encrypts `{ url, headers, exp }` under a key
derived from `STREAM_PROXY_SECRET` (existing env var, reused). GCM's
authentication tag makes the token self-authenticating: any tampering with
the ciphertext fails decryption outright, so there is no separate
`signature` field to validate — the token *is* the signature. A cleartext
`exp` query param rides alongside purely so an expired request can be
rejected synchronously before paying for a decrypt (cheap-check-before-async
work); the authoritative expiry is the one sealed inside the ciphertext,
never the cleartext hint.

**Path binding.** A token decrypts on its own terms regardless of which URL
it's presented on unless something ties it to that URL. Without that tie, a
validly-minted token for `(mediaId-A, providerId-A, variantId-A)` could be
replayed on a request path claiming `(mediaId-B, ...)`: decryption would
still succeed (it only proves the token wasn't tampered with, not that it
belongs on this path) and the proxy would fetch A's content but cache and
label it under B's deterministic key — precisely the cache-mislabeling
failure this rebuild exists to remove. `token.ts` therefore passes the
canonical `{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}` string as
AES-GCM's `additionalData` (AAD) on both encrypt and decrypt. AAD is
authenticated but not encrypted: the route recomputes it from the parsed
path and decryption fails outright if it doesn't match what the token was
sealed with. A token is therefore only ever valid on the exact path it was
minted for.

When `STREAM_PROXY_SECRET` is unset (local dev), tokens are signed with an
ephemeral in-process key generated at boot — playback still works, but
tokens don't survive a restart, matching today's "permissive local dev"
behavior for `verifyProxyTarget`.

**Manifest rewriter** (`manifestRewriter.ts`): pure functions,
`rewriteHlsManifest` and `rewriteDashManifest`, taking the raw manifest text
+ its upstream URL + variant context, returning the rewritten text where
every segment/key/init/sub-playlist URI points at
`/api/proxy/{mediaId}/{providerId}/{variantId}/segment/{chunkId}?exp=&token=`.
Same non-URI-line-preservation behavior as today (comments/attributes
without `URI=` pass through untouched).

**Subtitles** (`subtitles.ts`): `srtToVtt`, `ttmlToVtt` — moved verbatim
(pure, already well-tested), no behavior change.

## 5. Edge proxy — `src/app/api/proxy/[...stream]/`

`route.ts`, `runtime = 'edge'`. Path: `/api/proxy/[mediaId]/[providerId]/[variantId]/[kind]/[...chunk]`.

Request handling, in order (cheap checks before expensive ones):
1. Parse path segments; malformed shape → `400` before any crypto.
2. Cleartext `exp` param: expired → `401` immediately, no decrypt attempted.
3. Decrypt `token` (Web Crypto), passing the canonical path string as AAD
   (see §4's "Path binding"). Failure — bad auth tag from either tampering
   *or* a token replayed on a different path — → `403`. Success gives
   `{ url, headers, exp }`; re-check `exp` from the authenticated payload
   as the source of truth.
4. SSRF guard (`lib/net/ssrf.ts`, shared with `/api/image`) on the decrypted
   `url`'s host → reject internal targets.
5. Fetch upstream with `Range` passthrough, provider headers
   (`referer`/`origin`/`userAgent`/`cookie`) injected from the decrypted
   payload — never from client-supplied query params (today's proxy trusts
   client-supplied header overrides for the passthrough mode; that trust
   boundary goes away entirely since headers now live only inside the
   encrypted payload minted server-side).
6. `kind === 'manifest'`: rewrite via `manifestRewriter`, `Content-Type:
   application/vnd.apple.mpegurl` or `application/dash+xml`,
   `Cache-Control: private, max-age=4` (manifests are cheap to re-fetch and
   near-static for VOD, but not worth caching aggressively since each
   client's rewritten URLs are session-scoped).
7. `kind === 'segment'`: passthrough body stream, `Cache-Control: public,
   max-age=21600, immutable` (segments are byte-immutable once published —
   long-lived caching is safe and is the actual latency win: repeat GETs,
   scrub/seek-back, and adjacent range requests hit cache instead of the
   provider).
8. `kind === 'subtitle'`: convert via `subtitles.ts` if needed, `text/vtt`.
9. No module-level cache, no module-level mutable state anywhere in this
   file or anything it imports at request-handling time. Any future
   performance cache must be either (a) pure HTTP caching via the headers
   above, keyed by the deterministic path, or (b) an explicit external store
   (KV/Redis) — never an in-process object, which is exactly what caused the
   cross-user contamination this rebuild removes.

Zod validates the path shape; failures return the existing
`apiErrorResponse` shape (kept for client compatibility with
`lib/api/client.ts`'s `ApiError`).

## 6. Resolution stays Node — `services/sources.ts`

Resolution (calling into `src/providers/*`, which use cheerio/axios) cannot
run on Edge and isn't moving. What changes: instead of returning
`StreamSource[]` with a `playbackHref` built from `(provider, ref, kind,
sourceId)` query params resolved *again* at proxy time, `services/sources.ts`
now:
1. Calls the provider exactly as today.
2. Maps each `RawStream` to a `StreamVariant` (via an updated
   `services/normalize.ts`).
3. For the main media and each subtitle, **mints the encrypted token right
   here** (`lib/streaming/token.ts`, Node-side `crypto.subtle` — same code
   path as Edge, no `node:crypto`) and builds the final proxy href using the
   cache-key builder.
4. Returns `StreamVariant[]` with `playbackHref` already resolved — the
   client never builds a proxy URL itself, matching today's
   server-authoritative-href principle, just with a stronger contract behind
   it.

`app/api/sources/route.ts` shrinks: minting moves into the service so it's
covered by the same unit tests as resolution instead of being a separate
per-route concern (today's `mediaPlaybackHref`/`subtitlePlaybackHref` calls
in the route handler move into `services/sources.ts`).

## 7. Client player — `src/components/player/`

Drops Vidstack as the playback engine (kept nowhere in the new tree). Files:

- **`types.ts`** — explicit state machine:
  `Idle | Resolving | Loading | Playing | Paused | Buffering | Stalled |
  Error`, plus the action union driving a `useReducer`.
- **`engines/`** — one small adapter per format, each exposing the same
  `attach(video, variant, signal): Cleanup` shape:
  - `nativeEngine.ts` — progressive mp4/mkv/other, plain `video.src`.
  - `hlsEngine.ts` — native HLS on Safari (`canPlayType`) else dynamic
    `import('hls.js')`. hls.js keeps its own default transient-retry
    behavior for a flaky segment fetch — that's segment-level resilience,
    not provider fallback, and stays.
  - `dashEngine.ts` — dynamic `import('dashjs')`.
- **`usePlayerEngine.ts`** — the hook. Owns the reducer, an
  `AbortController` per resolution, and the teardown contract: switching
  variants or unmounting always runs, in order — abort in-flight fetches,
  call the active engine's cleanup, `video.removeAttribute('src')` +
  `video.load()` to flush MSE buffers, reset reducer state — *before*
  attaching the next variant. No engine attach ever overlaps a previous
  one's teardown.
- **`PlayerEngine.tsx`** — the `<video>` wrapper component consuming the
  hook.
- **`SourceSelector.tsx`** — explicit UI: lists every available
  `StreamVariant` grouped by provider, tagged with a session-local (not
  server, not cross-user) health hint — last observed latency/error for that
  variant *this playback session only*, reset on navigation. Selecting is
  always a deliberate click; nothing here auto-switches.
  Replaces `PlayerOverlay`'s `ServerPanel`.
- **`EpisodeSelector.tsx`** — replaces `EpisodePanel`, same UX, new home.
- **`Controls.tsx`** — play/pause, seek, volume, fullscreen, subtitle menu,
  the button that opens `SourceSelector`. Rebuilt on the existing
  shadcn/lucide/motion primitives so the UI doesn't visually regress.
- **`PlayerError.tsx`** — classifies terminal errors (source exhausted,
  expired token/`403`, decode error, network failure) and always offers an
  explicit action (retry this variant, open the source selector, go back).
  Buffer stalls surface as `Stalled` state with a manual "still stuck?
  switch source" affordance after a bounded wait — never a silent
  auto-switch.

`WatchExperience.tsx` is replaced by a slimmer version that fetches
variants once (via the updated `/api/sources`) and hands them to
`usePlayerEngine` + the new components — the per-session `SourceQueue`
concept disappears entirely (superseded by explicit `SourceSelector`
clicks); there is no automatic "next source" step anywhere in the client.

## 8. Migration / deletions

Deleted outright:
- `src/components/playback/` (all of it: `PlayerView.tsx`,
  `WatchExperience.tsx`, `WatchLoadError.tsx`, `proxy.ts`, `queue.ts`,
  `usePlaybackSession.ts`)
- `src/lib/media/` (all of it: `streamProxy.ts`, `proxyToken.ts`,
  `playbackHref.ts`, `playbackHref.server.ts`) — `images.ts` in the same
  directory is unrelated (image proxy) and stays, but moves to
  `src/lib/media/images.ts` unchanged (already there, untouched).
- `src/app/api/proxy/route.ts` (replaced by the new `[...stream]` route)
- `src/components/title/SourceList.tsx` — confirmed dead code (only
  self-reference in a project-wide search), references the old
  `StreamSource` type, deleted rather than migrated.
- `tests/streamProxy.test.ts`, `tests/proxyRoute.test.ts`,
  `tests/proxyToken.test.ts`, `tests/playback.test.ts` — replaced by tests
  colocated with the new modules (see §9).

Extracted (not deleted): `isInternalHost` moves to `src/lib/net/ssrf.ts` (new
tiny shared module) since `/api/image` depends on it too and shouldn't
import from a streaming-specific module for an unrelated SSRF guard.

Updated call sites:
- `src/types/media.ts` — `StreamSource` → `StreamVariant` (see §4), used by
  `SearchResult`/`Media`/`Episode` remain unchanged.
- `services/normalize.ts` — `toStreamSource` → `toStreamVariant`, mints the
  href via the new token/cache-key builders instead of the id-only shape.
- `services/sources.ts` — see §6.
- `app/api/sources/route.ts` — shrinks per §6.
- `lib/api/client.ts` — `sources()` return type becomes `StreamVariant[]`.
- `app/[lang]/watch/[provider]/[ref]/page.tsx` — import path updates to the
  new `components/player` tree, no behavior change.
- `vercel.json` — no change needed (headers there are static-asset/image
  rules, unrelated to the proxy).

## 9. Testing

Vitest, same runner, tests move to sit next to what they cover per this
project's existing convention (colocated `*.test.ts` at `tests/` root,
named after the module):
- `tests/streamingToken.test.ts` — encrypt/decrypt round trip, tamper
  rejection, expiry (cleartext hint vs. authenticated value), missing-secret
  dev fallback.
- `tests/manifestRewriter.test.ts` — HLS + DASH rewriting, migrated from
  today's `streamProxy.test.ts` HLS cases, DASH cases new.
- `tests/cacheKeys.test.ts` — determinism (same input → same key), no
  collision across differing `mediaId`/`providerId`/`chunkId`, upstream
  query string excluded from the hash.
- `tests/proxyRoute.test.ts` — rewritten against the new path-based route:
  expired `exp` short-circuits before decrypt, tampered token → `403`,
  Range passthrough, SSRF rejection.
- `tests/subtitles.test.ts` — `srtToVtt`/`ttmlToVtt`, moved verbatim.
- `tests/playerEngine.test.tsx` — state machine transitions, teardown
  ordering on source switch (mocked engines asserting cleanup-before-attach).
- `tests/sourceSelector.test.tsx` — renders variants, selection is a plain
  click handler call, no automatic behavior.

## 10. Comment style

Existing comments lean on decorative ASCII separators (`// ── Mode 1 ──`)
and long prose blocks. New code uses concise, single-purpose comments only
where the "why" isn't obvious from the code itself (e.g. why query string is
excluded from the chunk hash) — no separator art, no restating what the
code already says.

## 11. Provider resolution & source picker (discovery layer)

This project is an aggregator: TMDB supplies metadata (poster, banner, cast,
synopsis) purely for browsing chrome. The actual content is served by
provider modules under `src/providers/`, each a distinct "channel." A title
the user browses via TMDB has to be *matched* against every channel's own
catalog before anything can play, and that match is fuzzy text scoring
(`services/resolve.ts`) — it can be wrong (remakes, dubs, wrong season). The
same principle driving §1-§7 (explicit user control over automated
resolution) extends one layer up: matching a channel is also a decision the
user makes, not one the app makes silently on their behalf.

**Current state, confirmed by reading the code:** `TmdbPlayButton` (used on
`TmdbHero`, `TmdbMediaCard`, and the detail page hero) calls `/api/resolve`
and, when the top-scored candidate clears `RESOLVE_AUTO_THRESHOLD` (0.62),
navigates straight to `/watch/[provider]/[ref]` and starts playback with no
confirmation. Below that threshold it instead redirects to the detail page,
where a second, separate component (`TmdbPicker`) requires its own extra
"Find stream" click before showing candidates. This is almost certainly the
literal "clicking a card plays the wrong stream" bug: a fuzzy score above an
arbitrary cutoff is not certainty, and the user never gets a chance to catch
a bad match before it's already playing. `resolveCandidates` also pools every
provider's hits together and keeps the global top 6 by score — one
provider's near-duplicate hits can crowd every other channel out of the list
entirely, which is backwards for an aggregator whose whole value is showing
what every channel carries.

### Fix

1. **No path ever auto-navigates.** The auto-play branch in
   `TmdbPlayButton` is deleted outright. Clicking Play always fetches
   candidates and always shows them before anything plays.
2. **One candidate per provider, not global top-N.** `resolveCandidates`
   groups raw hits by `providerId`, keeps each provider's single
   best-scoring hit, and lists every provider whose best hit clears a low
   sanity floor (filters total noise, not near-misses) — sorted best first.
   The picker becomes "which channels carry this," not "the 6 highest-scoring
   rows regardless of channel." `RESOLVE_AUTO_THRESHOLD` stops gating
   navigation; it only marks the single top-ranked card "Best match."
3. **Rich, channel-branded candidate cards**, not a plain text list. Each
   card shows the provider's badge/name, the provider's own scraped poster
   thumbnail (`SearchResult.posterUrl` — already captured per-hit today,
   currently unused in any picker) falling back to the TMDB poster only when
   a channel didn't return one, and the provider's raw matched title
   (quality/dub/season noise in the raw title is useful disambiguating
   signal here, unlike in the cleaned `displayTitle` used elsewhere). This is
   the actual disambiguator — a mismatched thumbnail is visible before the
   user ever presses play.
4. **One component, two presentations**, replacing both `TmdbPlayButton` and
   `TmdbPicker`:
   - *Popover mode* (`TmdbSourcePicker` with `presentation="popover"`) on
     `TmdbHero` and `TmdbMediaCard`: click Play → popover of channel cards
     opens in place → click one → `/watch/[provider]/[ref]`. No detail-page
     round-trip for the common case.
   - *Inline mode* (`presentation="inline"`) on the TMDB detail page's
     "Available on" section: same cards, fetched automatically on mount (the
     user already navigated there with intent to watch — this is a
     prefetch, not a hidden auto-play) instead of today's gated "Find
     stream" click.
5. **Session-scoped client cache** of resolve results keyed by
   `(kind, tmdbId)`: a plain browser-tab-local `Map`, not shared across
   users or requests, so reopening a popover is instant without
   reintroducing any of the cross-request state problems from §1.

### Files touched

- `services/resolve.ts` — `resolveCandidates` regrouped per-provider (§2
  above); `ResolveResult.best` kept only as "which candidate to badge," never
  consumed for navigation.
- `src/components/tmdb/TmdbSourcePicker.tsx` — new, replaces both
  `TmdbPlayButton.tsx` and `TmdbPicker.tsx` (deleted).
- `TmdbHero.tsx`, `TmdbMediaCard.tsx`, `TmdbDetail.tsx` — call sites updated
  to the new component.
- `tests/resolve.test.ts` — extended for per-provider grouping.

## 12. Documentation

`README.md` in each concept directory (`src/lib/streaming/`,
`src/app/api/proxy/[...stream]/`, `src/components/player/`), each covering:
what the directory is for, how data flows through it, how it connects to
the directories on either side of it, its failure modes, and any
non-obvious developer notes (e.g. the Vercel cache-key boundary from §3).
