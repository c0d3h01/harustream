import { cva, type VariantProps } from 'class-variance-authority';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const glassVariants = cva('', {
  variants: {
    variant: {
      base: 'glass',
      strong: 'glass-strong',
      subtle: 'glass-subtle',
      clear: 'glass-clear',
      header: 'glass-header',
      dock: 'glass-dock',
      card: 'glass-card',
      panel: 'glass-panel',
      overlay: 'glass-overlay',
      chip: 'glass-chip',
      input: 'glass-input',
    },
    shape: {
      pill: 'rounded-full',
      card: 'rounded-3xl',
      tile: 'rounded-2xl',
      sheet: 'rounded-[1.75rem]',
      rect: 'rounded-xl',
      flat: 'rounded-lg',
    },
    interactive: {
      true: 'glass-interactive',
      false: '',
    },
    // Specular ring is chrome-only (header/dock). Never default it on —
    // each ::before is an extra masked layer that repaints on scroll.
    specular: {
      true: 'glass-specular',
      false: '',
    },
    // Escape hatch: live backdrop blur on a scrolling surface. Opt in only
    // for hero-adjacent panels; every instance costs a scroll-frame blur.
    live: {
      true: 'glass-live',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'base',
    shape: 'tile',
    interactive: false,
    specular: false,
    live: false,
  },
});

export interface GlassSurfaceProps extends VariantProps<typeof glassVariants> {
  children: ReactNode;
  className?: string;
  /** Override any single glass token locally, e.g. { '--glass-opacity': '55%' }. */
  tokens?: Record<string, string>;
  as?: 'div' | 'section' | 'header' | 'footer' | 'span' | 'li';
}

/**
 * Modular Liquid Glass surface — single control plane is `:root --glass-*`
 * in `src/app/globals.css`. Change one token there to retune the whole app.
 * Use `tokens` only for one-off local overrides.
 *
 * Scroll rule: content-tier variants (card/subtle/clear/chip) are static
 * fills with NO backdrop-filter so vertical scroll stays at 60fps. Live
 * blur belongs to fixed chrome (header/dock/panel/overlay). Pass `live`
 * only to opt a scrolling surface back into backdrop blur, and `specular`
 * only for header/dock chrome.
 */
export function GlassSurface({
  children,
  className,
  variant,
  shape,
  interactive,
  specular,
  live,
  tokens,
  as = 'div',
}: GlassSurfaceProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(glassVariants({ variant, shape, interactive, specular, live }), className)}
      style={tokens as CSSProperties | undefined}
    >
      {children}
    </Tag>
  );
}

export { glassVariants };
