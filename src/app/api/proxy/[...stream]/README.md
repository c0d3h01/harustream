# `src/app/api/proxy/[...stream]/`

The edge streaming proxy. This is the only route that ever fetches provider
media — everything else in the app talks to providers through
`services/sources.ts` on the Node runtime, which mints the tokens this route
consumes.

## Route shape

```
GET /api/proxy/{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}?exp=&token=
```

`kind` is one of `manifest` | `binary` | `subtitle`. There is a second,
narrower path shape for DASH `SegmentTemplate` manifests — see "Template
mode" below.

`{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}` is both the route's
addressing scheme *and* the deterministic cache key
(`media_id:provider_id:chunk_hash` from the design brief) — see
`../../../lib/streaming/README.md` for why that matters and its documented
limits.

## Request handling, in order

Cheapest checks first, so a malformed or expired request never pays for a
decrypt or a network round-trip:

1. Parse the path shape. Malformed → `400`, before any crypto.
2. Cleartext `exp` query param: already expired → `401`, no decrypt
   attempted.
3. Decrypt `token` (`verifyProxyToken`, Web Crypto `AES-GCM`), passing the
   canonical path as AAD. Failure — tampered ciphertext *or* a token
   replayed on a different path — → `403`.
4. `fetchUpstream` (`lib/streaming/upstream.ts`) — SSRF guard, then the
   actual fetch with the identity-retry ladder.
5. Dispatch by `kind`:
   - `manifest` → `rewriteHlsManifest`/`rewriteDashManifest`, short private
     `Cache-Control` (manifests are cheap to re-fetch, and each client's
     rewritten body differs since it embeds fresh per-client tokens).
   - `binary` → passthrough body stream, long immutable `Cache-Control`
     (segments/init/key blobs never change once published — this is the
     actual latency win: seek-back, retries, and range requests hit cache).
   - `subtitle` → `srtToVtt`/`ttmlToVtt` if the token says conversion is
     needed, else passthrough.

## Template mode (DASH `SegmentTemplate`)

```
GET /api/proxy/{mediaId}/{providerId}/{variantId}/binary/template/{token}/{...rest}
```

`rest` is whatever relative segment path the DASH client (dash.js) appended
when it expanded the manifest's `SegmentTemplate` and resolved it against
the proxy's rewritten `<BaseURL>`. The token here authorizes the whole
representation's base, not one chunk — see
`../../../lib/streaming/README.md`'s "DASH `SegmentTemplate` boundary" for
why a per-chunk token can't work for this addressing scheme.

## Why this route has no module-level state

Everything needed to serve a request lives in the request itself: the path
identifies *what*, the token (decrypted) says *where to actually fetch it
and how*. There is no cache this route consults to decide what to serve —
correctness never depends on a TTL, a cache eviction order, or which
concurrent request happened to populate a shared entry last. Any future
performance optimization here must be pure HTTP caching via the
`Cache-Control` headers already set (which any CDN in front of this route
can honor), or an explicit external store — never an in-process object. That
in-process-object shape is exactly what this rebuild removed (see the
streaming module's README for the specific bugs it caused).

## Runtime note

`export const runtime = 'edge'`. This route never imports `pino`
(`@/lib/log`) or anything Node-only — pino is Node-only and would fail to
load on the Edge runtime. Structured request logging here is a plain
`console.log`/`console.error` JSON line, the same edge-safe pattern already
used by the top-level request-logging middleware (`src/proxy.ts`).

## Failure modes surfaced to the client

| Condition | Status | Client-visible meaning |
|---|---|---|
| Malformed path | 400 | Bad link — never a "wrong stream" |
| `exp` (cleartext or authenticated) has passed | 401 | Link expired — player should re-resolve, not retry the same URL |
| Token fails to decrypt/authenticate | 403 | Tampered or replayed-on-wrong-path token |
| Upstream CDN rejects both header variants | upstream's own status | Passed through as-is, so the player's error UI can distinguish an expired provider-side signature from a provider outage |
| Network failure reaching upstream | 502 | Provider unreachable |
