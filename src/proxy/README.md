# harustream media proxy (Cloudflare Worker)

Streams provider media through Cloudflare so viewers avoid CDN rules that
block Vercel's datacenter ranges, and so provider-required headers
(`Referer`, `Origin`, `User-Agent`, `Cookie`) can be injected — browsers
cannot set those themselves.

## Deploy

```sh
cd src/proxy
npx wrangler login   # once
npx wrangler deploy
```

Then point the app at it:

```sh
# Vercel project env (and .env.local for dev)
NEXT_PUBLIC_STREAM_PROXY_URL=https://proxy.<your-subdomain>.workers.dev
```

Unset (or in local dev), the app falls back to its built-in `/api/proxy`.

## What it handles

- `GET /?url=<encoded upstream>&referer=&origin=&userAgent=&cookie=`
- `Range` pass-through (seeking works), status/`Content-Range` preserved
- HLS manifests rewritten so every segment/key loops back through the worker
- CORS-open responses for hls.js / dash.js
- DASH (`.mpd`) sources do **not** use this worker at all — they play directly
  from the viewer's connection (their CDNs are embed-friendly by design)

## Signing (optional)

Set `STREAM_PROXY_SECRET` on both the Next app and this worker to enforce
HMAC-signed passthrough targets. When enabled, only URLs minted by this app
(through `/api/proxy`, `/api/sources`, or a prior worker hop) are fetchable —
the endpoint stops being an open relay.

Secret is a plain string (e.g. `openssl rand -hex 32`). Tokens carry an
`exp` parameter (default 12 h, tunable via `STREAM_PROXY_TOKEN_TTL_MS`).

## 📄 License

Distributed under the [GNU AGPL-3.0](../../LICENSE).
