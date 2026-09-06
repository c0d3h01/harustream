# `src/lib/streaming/`

Pure domain logic for stream identity, tokens, manifest rewriting, and
subtitle conversion. Nothing in this directory does I/O — every function
here takes data in and returns data out, which is what makes the edge proxy
route (`src/app/api/proxy/[...stream]/`) a thin orchestration layer over it
and makes everything here trivially unit-testable without a live provider.

## Why this exists

The previous implementation let a stream be selected by cache lookup: the
proxy resolved a provider's stream *list* into a TTL cache, then looked up a
requested id against whatever that cache currently held. If the cache
repopulated between the player reading the list and a later request for
that id, the id could resolve against different content than what the user
clicked — and a module-level `Map` tracking "failed sources" was shared
across every concurrent user on the same server process, so one user's
failure silently affected everyone else's.

This module exists to make that class of bug structurally impossible: a
stream is identified by an explicit triple, and the proxy is a pure function
of an encrypted token — never a lookup.

## Files

- **`types.ts`** — `StreamVariant`, the unique-key triple
  `(mediaId, providerId, variantId)`, `SubtitleTrack`, `ResolvedTarget` (what
  a token seals), `ProxyResourceKind`.
- **`cacheKeys.ts`** — `chunkIdFor` (stable hash of an upstream URL's
  origin+pathname, deliberately excluding the query string — providers sign
  query strings per session, so including it would make the same logical
  segment hash differently on every resolution), `canonicalPath` (the string
  bound into a token's AAD), `proxyPath` (the `/api/proxy/...` href builder).
- **`token.ts`** — `mintProxyToken`/`verifyProxyToken`. AES-256-GCM via
  `crypto.subtle`, chosen over `node:crypto` specifically because it's the
  one crypto API with an identical surface on both Node and the Edge
  runtime — minting happens in a Node process (`services/sources.ts`, where
  provider scraping happens), verification happens in the Edge proxy, and
  they need to derive the exact same key without any shared memory between
  them.
- **`manifestRewriter.ts`** — `rewriteHlsManifest`, `rewriteDashManifest`,
  `manifestKind`. Rewrites every nested reference in a fetched manifest to
  point back at the proxy.
- **`subtitles.ts`** — `srtToVtt`, `ttmlToVtt`. Browsers only render WebVTT
  natively; anything a provider serves as SRT/TTML is converted here.
- **`upstream.ts`** — `fetchUpstream`. The actual upstream HTTP call, with
  the SSRF guard (`@/lib/net/ssrf`) and the identity-retry ladder (some
  provider CDNs reject a request carrying headers they don't expect; retry
  once bare).

## Data flow

```
services/sources.ts (Node)               src/app/api/proxy/[...stream]/route.ts (Edge)
  resolve provider → upstream URL           parse path → (mediaId, providerId, variantId, kind, chunkId)
  mintProxyToken({url, headers}, path) ──▶  verifyProxyToken(token, path)
  build href via proxyPath()                fetchUpstream(decrypted url)
  ship StreamVariant to client              kind===manifest → rewriteHlsManifest/rewriteDashManifest
                                                              (which itself calls mintProxyToken again,
                                                               for every nested segment/sub-playlist)
                                             kind===binary   → passthrough, long Cache-Control
                                             kind===subtitle → srtToVtt/ttmlToVtt if needed
```

Every href a client ever sees was minted server-side, either by
`services/sources.ts` for the top-level media/subtitle entry or by
`manifestRewriter.ts` for everything a manifest references. The client never
constructs a proxy URL itself.

## Path binding (why AAD, not just encryption)

A token that only proves "not tampered with" isn't enough: a validly-minted
token for `(mediaId-A, providerId-A, variantId-A)` could be replayed on a
request path claiming `(mediaId-B, ...)`. Decryption would still succeed —
it only checks the ciphertext, not which path it's presented on — and the
proxy would fetch A's content while caching and labeling it under B's
deterministic key. That's the exact cache-mislabeling failure this rebuild
exists to remove.

`token.ts` closes this by passing the canonical
`{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}` string as AES-GCM's
`additionalData` on both encrypt and decrypt. AAD is authenticated but not
encrypted: the route recomputes it from the parsed path, and decryption
fails outright if it doesn't match what the token was sealed with. A token
is only ever valid on the exact path it was minted for.

## Failure modes

- **Tampered or replayed-on-a-different-path token** → decryption fails →
  proxy returns `403`. Indistinguishable from each other by design; both
  mean "this token doesn't authorize what's being asked."
- **Expired token** → rejected in two stages: a cheap synchronous check
  against the cleartext `exp` query hint (before paying for a decrypt), then
  an authoritative check against the `exp` sealed inside the token itself.
  The cleartext copy is a fast-reject optimization only — it is never
  trusted for authorization.
- **Upstream rejects both the "provider" and "bare" header variants** →
  `UpstreamError` with the upstream's own status code, surfaced to the
  client as-is (a `403` from the provider's CDN reaches the player as a
  `403`, so the client's error UI can distinguish "token expired" from
  "provider CDN rejected us" from "provider is down").
- **`STREAM_PROXY_SECRET` unset in production** → `token.ts` throws a
  `CONFIG` error rather than silently using a predictable key. In
  development it falls back to a fixed, publicly-visible dev secret — this
  is intentionally not a random per-boot value, because minting (Node) and
  verification (Edge) are separate isolates with no shared memory in
  production; a random secret could never agree between them. The fixed dev
  fallback provides zero real security, matching this project's existing
  posture of "permissive when unconfigured in dev, fail closed in prod."

## Known boundary: cross-user CDN cache sharing

The deterministic path (`{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}`)
guarantees per-request correctness and enables repeat-request/seek-back
caching for one user. It does **not**, by itself, achieve cross-*user*
cache sharing on Vercel: the token lives in the query string, and Vercel's
edge network caches by full URL including the query string, so two
different users' tokens for "the same" chunk don't collide into one cache
entry today. Achieving that would need a CDN with custom cache-key support
(keying on the path only, ignoring the query) — not part of this project's
infrastructure. This is a documented boundary, not an oversight: introducing
a new cache infrastructure (Redis/KV) speculatively, before it's needed, was
explicitly out of scope for this rebuild.

## DASH `SegmentTemplate` boundary

`SegmentTemplate`-style DASH manifests address segments via URL templates
(`$Number$`, `$Time$`, …) the client expands itself — there's no single
literal URL to rewrite per segment ahead of time. `rewriteDashManifest`
detects this and rewrites `<BaseURL>` into a proxy *prefix* instead: one
token authorizes the whole representation's segment set, carried as a path
segment (not a query parameter, which the client's own relative-URL
resolution against the base would silently drop). This is necessarily less
granular than the per-chunk token used everywhere else, but it's what
`SegmentTemplate`'s own addressing scheme allows. `SegmentList`-style DASH
(explicit `<SegmentURL>`/`sourceURL` literals) uses the normal per-chunk path.
