'use client';

import { AlertTriangle, Server, X } from 'lucide-react';
import type { StreamVariant } from '@/lib/streaming/types';

export interface SourceSelectorProps {
  open: boolean;
  variants: readonly StreamVariant[];
  activeVariantId: string;
  failedVariantIds: ReadonlySet<string>;
  onSelect: (variantId: string) => void;
  onClose: () => void;
}

export function SourceSelector({
  open,
  variants,
  activeVariantId,
  failedVariantIds,
  onSelect,
  onClose,
}: SourceSelectorProps) {
  return (
    <div
      className={`fixed inset-y-0 right-0 z-drawer flex w-[min(22rem,85vw)] flex-col rounded-l-xl border border-r-0 border-border bg-card shadow-[0_24px_64px_-16px_rgba(23,23,26,0.25)] transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
      role="listbox"
      aria-label={'Source'}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex items-center justify-between border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{'Source'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={'Close'}
          tabIndex={open ? undefined : -1}
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain py-1">
        {variants.map((variant) => {
          const key = `${variant.providerId}:${variant.variantId}`;
          const isActive = variant.variantId === activeVariantId;
          const failed = failedVariantIds.has(variant.variantId);
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => onSelect(variant.variantId)}
              tabIndex={open ? undefined : -1}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-md ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {failed ? (
                  <AlertTriangle size={14} className="text-pastel-red-fg" />
                ) : (
                  <Server size={14} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{variant.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-mono uppercase">
                    {[variant.providerId, variant.quality, variant.format]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  {failed ? <span className="text-pastel-red-fg">failed earlier</span> : null}
                </div>
              </div>
              {isActive ? (
                <div className="h-2 w-2 flex-none rounded-full bg-pastel-green-fg" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
