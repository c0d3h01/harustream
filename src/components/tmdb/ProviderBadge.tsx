'use client';

import { memo } from 'react';

/** Short code for a provider id (`movieBoxWeb` → `MB`). */
export function providerShortCode(providerId: string): string {
  const letters = providerId.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 2) return (letters[0] + letters[letters.length - 1]).toUpperCase();
  return (letters || providerId).slice(0, 2).toUpperCase();
}

/** Deterministic hue per provider id — stable without a lookup table. */
export function providerHue(providerId: string): number {
  let hash = 0;
  for (let index = 0; index < providerId.length; index += 1) {
    hash = Math.imul(hash ^ providerId.charCodeAt(index), 2654435761);
  }
  return Math.abs(hash) % 360;
}

/** Glanceable provider mark: colored dot + short code + full name on hover. */
function ProviderBadgeInner({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName: string;
}) {
  const hue = providerHue(providerId);
  return (
    <span
      title={providerName}
      className="glass-chip inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 font-mono text-[11px] font-semibold tracking-wide text-foreground"
    >
      <span
        aria-hidden="true"
        className="size-4 rounded-full"
        style={{ backgroundColor: `hsl(${hue} 65% 55%)` }}
      />
      {providerShortCode(providerId)}
    </span>
  );
}

export const ProviderBadge = memo(ProviderBadgeInner);
