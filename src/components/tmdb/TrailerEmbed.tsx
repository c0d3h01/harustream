'use client';

import { useEffect, useRef, useState } from 'react';

interface TrailerEmbedProps {
  trailerKey: string;
  muted: boolean;
  /** Wrapper positioning (default: fill the positioned parent, clipped). */
  wrapperClassName?: string;
  /** Player surface sizing (default: width-driven 16:9 cover-crop). */
  frameClassName?: string;
  /** Extra dimming/grade over the video (default: subtle black veil). */
  veilClassName?: string;
}

// ---------------------------------------------------------------------------
// YouTube IFrame API — loaded once per session, shared by hero + detail.
// ---------------------------------------------------------------------------
interface YTPlayer {
  mute: () => void;
  unMute: () => void;
  playVideo: () => void;
  seekTo: (seconds: number) => void;
  setSize: (width: number, height: number) => void;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeAPI(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error('youtube api failed'));
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        apiPromise = null;
        reject(new Error('youtube api load failed'));
      };
      document.head.appendChild(tag);
      // Never hang the UI if the API is blocked (ad-blockers do this).
      window.setTimeout(() => {
        if (!window.YT?.Player) {
          apiPromise = null;
          reject(new Error('youtube api timeout'));
        }
      }, 8000);
    });
  }
  return apiPromise;
}

/** Autoplaying muted looping trailer with ZERO player chrome.
 *  The IFrame API (no playlist param) is the only way to loop without
 *  YouTube's prev/next overlay — a plain `playlist=` embed always shows it.
 *  Perfect cover-crop: width-driven 16:9 surface, wrapper clips overflow.
 *  Mounts only while visible and never for reduced-motion users. */
export function TrailerEmbed({
  trailerKey,
  muted,
  wrapperClassName = 'absolute inset-0 overflow-hidden',
  frameClassName = 'pointer-events-none absolute left-1/2 top-1/2 aspect-video w-full -translate-x-1/2 -translate-y-1/2',
  veilClassName = 'pointer-events-none absolute inset-0 bg-black/20',
}: TrailerEmbedProps) {
  const [visible, setVisible] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = mountRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      threshold: 0.15,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Create the player once visible; destroy off-screen or on unmount.
  useEffect(() => {
    if (!visible) {
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }
    const host = hostRef.current;
    if (!host || playerRef.current) return;
    let cancelled = false;
    let player: YTPlayer | null = null;
    void loadYouTubeAPI()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        player = new YT.Player(host, {
          videoId: trailerKey,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            playsinline: 1,
            rel: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event) => {
              event.target.mute();
              event.target.playVideo();
            },
            onStateChange: (event) => {
              // Loop without the playlist param (which forces chrome).
              if (event.data === YT.PlayerState.ENDED) event.target.seekTo(0);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        // API blocked — the static artwork underneath stays. Nothing to do.
      });
    const onResize = () => {
      const hostEl = hostRef.current;
      const active = playerRef.current;
      if (hostEl && active) active.setSize(hostEl.clientWidth, hostEl.clientHeight);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      player?.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [visible, trailerKey]);

  // Sound toggle without remounting (no playback restart).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) player.mute();
    else player.unMute();
  }, [muted]);

  return (
    <div ref={mountRef} className={wrapperClassName}>
      {visible ? (
        <>
          {/* Cover box owns the geometry — the API swaps `hostRef` for an
              iframe, so sizing lives here + `.trailer-frame > iframe` CSS. */}
          <div className={`${frameClassName} trailer-frame`}>
            <div ref={hostRef} aria-hidden="true" className="size-full" />
          </div>
          <div aria-hidden="true" className={veilClassName} />
        </>
      ) : null}
    </div>
  );
}
