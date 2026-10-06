import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';

import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default:
    'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] aria-expanded:bg-primary/90',
  outline:
    'border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
  ghost: 'text-foreground hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
};

const sizes: Record<string, string> = {
  default:
    'h-9 gap-1.5 rounded-lg px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
  sm: "h-8 gap-1 rounded-md px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Polymorphic render target (e.g. Next Link); cloned with button props. */
  render?: ReactElement;
  /** View-transition types forwarded to the render target (e.g. Next Link). */
  transitionTypes?: string[];
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  render,
  transitionTypes,
  ...props
}: ButtonProps) {
  const merged = cn(
    "group/button inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variants[variant],
    sizes[size],
    className,
  );
  if (render) {
    if (isValidElement(render)) {
      return cloneElement(render, {
        ...(render.props as object),
        ...props,
        ...(transitionTypes ? { transitionTypes } : null),
        className: cn((render.props as { className?: string }).className, merged),
      } as object);
    }
  }
  return <button data-slot="button" className={merged} {...props} />;
}

export { Button };
