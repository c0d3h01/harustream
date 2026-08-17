import { spawn } from 'node:child_process';
import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { ffmpegBinary, planTranscode } from '@/lib/media/transcode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A transcode streams until the source is exhausted; the invocation must
// outlive it. 300s is the Vercel Hobby/Fluid maximum (Pro: 800s).
export const maxDuration = 300;

// How long ffmpeg may take to emit its first output byte before we give up.
// Startup failures (bad source, 404, codec init) surface as a proper HTTP
// error instead of a connection that hangs.
const FIRST_BYTE_TIMEOUT_MS = 20_000;

// GET /api/play?url=<encoded source>&start=<seconds>
//
// Proxies a non-browser-playable stream (typically MKV) through ffmpeg and
// returns a fragmented MP4 byte stream that the client feeds into MediaSource.
// The exact codec string is returned in the `X-Haru-Codec` header so the
// client can call addSourceBuffer() with the right value.
//
// The response status is deliberately gated on ffmpeg producing its first
// output byte: if ffmpeg fails during startup (bad source, network error,
// codec unsupported) we return the real error status rather than a 200 that
// immediately dies, which the client would otherwise interpret as a stall.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/play' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const source = url.searchParams.get('url')?.trim();
  const start = Math.max(0, Number(url.searchParams.get('start')) || 0);

  if (!source) {
    log.warn({ requestId }, 'missing url parameter');
    return new Response('Missing url parameter', { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    log.warn({ requestId, source }, 'invalid url parameter');
    return new Response('Invalid url parameter', { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    log.warn({ requestId, protocol: parsed.protocol }, 'non-http url rejected');
    return new Response('Only http(s) sources are allowed', { status: 400 });
  }

  log.debug({ requestId, source, start }, 'planning transcode');

  let plan: Awaited<ReturnType<typeof planTranscode>>;
  try {
    plan = await planTranscode(source, start, request.signal);
  } catch (error) {
    log.error(
      { requestId, source, error: error instanceof Error ? error.message : String(error) },
      'transcode planning failed',
    );
    return new Response('Could not prepare stream', { status: 502 });
  }
  if (!plan) {
    log.error({ requestId, source }, 'could not prepare transcode plan');
    return new Response('Could not prepare stream', { status: 502 });
  }

  // Capture stderr so ffmpeg failures are diagnosable from the logs instead
  // of silently producing a truncated stream.
  const child = spawn(ffmpegBinary, plan.args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const { signal } = request;

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 8192) stderr += String(chunk);
  });

  // Deferred so we can decide the HTTP status once we know the outcome.
  return new Promise<Response>((resolve) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let startedStreaming = false; // controller captured (Next.js began reading)
    let gateResolved = false;
    let aborted = false;
    // ffmpeg output arrives before Next.js starts reading the stream, so we
    // buffer everything until the controller exists, then replay it.
    const pending: Uint8Array[] = [];
    let firstByteTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (firstByteTimer) clearTimeout(firstByteTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    const settle = (fn: () => void) => {
      if (gateResolved) return;
      gateResolved = true;
      cleanup();
      fn();
    };

    const failStart = (message: string, status: number) => {
      settle(() => {
        log.error(
          { requestId, source, status, stderr: stderr.trim().split('\n').slice(-6).join('\n') },
          'ffmpeg failed before producing output',
        );
        child.kill('SIGKILL');
        resolve(new Response(message, { status }));
      });
    };

    // Terminal actions (end / error / close) may fire before Next.js captures
    // the controller, so we queue the action and apply it once `start` runs.
    let terminal: (() => void) | null = null;

    const flushPending = () => {
      if (!controller || !startedStreaming) return;
      for (const chunk of pending) {
        try {
          controller.enqueue(chunk);
        } catch {
          child.kill('SIGKILL');
          break;
        }
      }
      pending.length = 0;
    };

    const onAbort = () => {
      aborted = true;
      log.info({ requestId, source }, 'playback aborted, killing ffmpeg');
      child.kill('SIGKILL');
      settle(() => {
        try {
          controller?.error(new DOMException('Aborted', 'AbortError'));
        } catch {}
        // If the gate never opened, no Response was handed to Next.js yet —
        // resolve one so the handler doesn't hang waiting on the client.
        resolve(new Response(null, { status: 499 }));
      });
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    // ffmpeg failed to spawn at all (e.g. missing binary on the runtime).
    child.on('error', (error) => {
      log.error(
        { requestId, source, binary: ffmpegBinary, error: error.message },
        'ffmpeg failed to start',
      );
      settle(() => resolve(new Response('Transcode unavailable', { status: 502 })));
    });

    // The stream is built lazily; `start` captures the controller and replays
    // anything ffmpeg emitted (and any terminal action) while we were waiting
    // for Next.js to read.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        startedStreaming = true;
        flushPending();
        const action = terminal;
        terminal = null;
        action?.();
      },
      cancel() {
        aborted = true;
        child.kill('SIGKILL');
      },
    });

    child.stdout.on('data', (chunk: Uint8Array) => {
      if (aborted) return;
      if (!gateResolved) {
        // Hold chunks aside until the gate opens so the status is truthful.
        pending.push(chunk);
        settle(() => {
          log.info(
            {
              requestId,
              source,
              kind: plan.kind,
              codec: plan.codec,
              start,
              durationMs: Date.now() - started,
            },
            'transcode stream started',
          );
          const headers: Record<string, string> = {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-store',
            'X-Haru-Codec': plan.codec,
            'X-Haru-Kind': plan.kind,
            'X-Haru-Start': String(start),
          };
          if (plan.duration) headers['X-Haru-Duration'] = String(plan.duration);
          resolve(
            new Response(stream, {
              status: 200,
              headers,
            }),
          );
        });
        return;
      }
      // Gate already open: push (replayed once the controller is captured).
      pending.push(chunk);
      flushPending();
    });

    child.stdout.on('end', () => {
      // If the gate never opened, ffmpeg produced zero output — the `close`
      // handler owns that failure decision. Only queue a clean close when we
      // are already streaming.
      if (!gateResolved) return;
      const endAction = () => {
        try {
          controller?.close();
        } catch {}
      };
      if (startedStreaming) endAction();
      else terminal = endAction;
    });

    child.stdout.on('error', (error) => {
      log.error({ requestId, source, error: error.message }, 'transcode output stream failed');
      if (!gateResolved) {
        failStart('Transcode output failed', 502);
        return;
      }
      const errAction = () => {
        try {
          controller?.error(new Error('Transcode output error'));
        } catch {}
      };
      if (startedStreaming) errAction();
      else terminal = errAction;
    });

    child.on('close', (_code) => {
      if (aborted) return;
      if (!gateResolved) {
        // Exited before emitting any output — report the real failure.
        failStart(
          stderr
            ? `Transcode failed: ${stderr.trim().split('\n').slice(-3).join(' ')}`
            : 'Transcode failed',
          502,
        );
        return;
      }
      // A non-zero exit after streaming started means the transcode died
      // partway — error the controller so the client sees a real failure
      // instead of an infinite spinner.
      if (_code !== 0) {
        log.error(
          {
            requestId,
            source,
            code: _code,
            stderr: stderr.trim().split('\n').slice(-6).join('\n'),
          },
          'ffmpeg exited with an error after streaming started',
        );
        const closeAction = () => {
          try {
            controller?.error(new Error('Transcode stream ended unexpectedly'));
          } catch {}
        };
        if (startedStreaming) closeAction();
        else terminal = closeAction;
      }
    });

    // If ffmpeg produces nothing at all, fail instead of hanging forever.
    firstByteTimer = setTimeout(() => {
      if (!gateResolved) {
        failStart('Transcode timed out before producing output', 504);
      }
    }, FIRST_BYTE_TIMEOUT_MS);
  });
}
