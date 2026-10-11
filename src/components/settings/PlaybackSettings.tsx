type PlaybackSettingsProps = {
  autoAdvance: boolean;
  onAutoAdvanceChange: (enabled: boolean) => void;
};

export function PlaybackSettings({ autoAdvance, onAutoAdvanceChange }: PlaybackSettingsProps) {
  return (
    <div className="border-b border-border pb-6">
      <p className="pt-7 font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
        {'Playback'}
      </p>
      <label className="mt-3 flex cursor-pointer items-start justify-between gap-6">
        <span className="min-w-0">
          <span className="text-sm font-medium">{'Auto-play next episode'}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {
              'When an episode finishes, the next one starts playing right away — no need to tap anything.'
            }
          </span>
        </span>
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(event) => onAutoAdvanceChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
      </label>
    </div>
  );
}
