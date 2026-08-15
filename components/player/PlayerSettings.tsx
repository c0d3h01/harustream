'use client';

import { Check, Gauge, Maximize2, RefreshCcw, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { PLAYBACK_RATES } from '@/lib/hooks/usePlaybackRate';

type Props = {
  open: boolean;
  rate: number;
  onRate: (rate: number) => void;
  autoAdvance: boolean;
  onAutoAdvance: (on: boolean) => void;
  onFullscreen: () => void;
  onRestart: () => void;
  onClose: () => void;
};

function Row({
  title,
  detail,
  selected,
  icon,
  onPress,
}: {
  title: string;
  detail?: string;
  selected?: boolean;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="mx-1 my-1 flex min-h-12 w-full items-center rounded-xl border px-3 py-2 text-left transition-colors"
      style={{
        backgroundColor: selected ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.045)',
        borderColor: selected ? 'rgb(99,102,241)' : 'rgba(255,255,255,0.07)',
      }}
    >
      <span className="mr-3 text-white/80">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-white">{title}</span>
        {detail && <span className="mt-0.5 block truncate text-xs text-white/55">{detail}</span>}
      </span>
      {selected && <Check className="ml-3 size-5 text-indigo-400" />}
    </button>
  );
}

export function PlayerSettings({
  open,
  rate,
  onRate,
  autoAdvance,
  onAutoAdvance,
  onFullscreen,
  onRestart,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'speed' | 'playback'>('speed');

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Playback settings"
      className="absolute inset-0 z-20 flex items-end justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="w-full max-w-[620px] rounded-t-3xl border border-white/10 bg-[#0d0d0d]/95 p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab('speed')}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === 'speed' ? 'bg-white/15 text-white' : 'text-white/50'
              }`}
            >
              Speed
            </button>
            <button
              type="button"
              onClick={() => setTab('playback')}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === 'playback' ? 'bg-white/15 text-white' : 'text-white/50'
              }`}
            >
              Playback
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {tab === 'speed' && (
          <div className="grid max-h-[280px] grid-cols-1 gap-1 overflow-y-auto">
            {PLAYBACK_RATES.map((r) => (
              <Row
                key={r}
                title={`${r}x`}
                selected={rate === r}
                icon={<Gauge className="size-5" />}
                onPress={() => {
                  onRate(r);
                  onClose();
                }}
              />
            ))}
          </div>
        )}

        {tab === 'playback' && (
          <div className="grid max-h-[280px] grid-cols-1 gap-1 overflow-y-auto">
            <Row
              title={autoAdvance ? 'Auto-advance on' : 'Auto-advance off'}
              detail="Automatically start the next episode"
              selected={autoAdvance}
              icon={<Settings2 className="size-5" />}
              onPress={() => onAutoAdvance(!autoAdvance)}
            />
            <Row
              title="Fullscreen"
              icon={<Maximize2 className="size-5" />}
              onPress={() => {
                onFullscreen();
                onClose();
              }}
            />
            <Row
              title="Restart from beginning"
              icon={<RefreshCcw className="size-5" />}
              onPress={() => {
                onRestart();
                onClose();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
