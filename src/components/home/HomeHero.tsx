'use client';

import { ArrowRight, Info, Play } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useMemo } from 'react';
import { EASE } from '@/components/motion/transitions';
import { usePrefersReducedMotion } from '@/components/motion/usePrefersReducedMotion';
import { fadeIn, fadeUp, staggerContainer } from '@/components/motion/variants';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';

/**
 * Cinematic hero. Two passes of motion:
 *
 *  1. Entrance — a stagger container orchestrates the eyebrow, headline words,
 *     sub-text, meta, and CTAs via `motion/react` variants.
 *  2. Scroll exit — a CSS `animation-timeline: scroll()` parallaxes the copy
 *     up + fades while a subtle scale pulls the backdrop (Chrome/Edge;
 *     graceful no-op in Safari/Firefox).
 *
 * Reduced-motion users get the plain layout (instant reveal, no scroll effect).
 */
export function HomeHero() {
  const t = useT();
  const { locale } = useLocale();
  const reduced = usePrefersReducedMotion();

  // Split the headline into words once per render for staggered animation.
  const headingWords = useMemo(() => {
    const seen = new Map<string, number>();
    return t('home.heroHeading')
      .split(' ')
      .map((word) => {
        const count = seen.get(word) ?? 0;
        seen.set(word, count + 1);
        return { text: word, key: `${word}-${count}` };
      });
  }, [t]);

  // Reduced-motion: use fade-only, no transforms.
  const entrance = reduced ? fadeIn : fadeUp;

  return (
    <section
      className="hero-root relative -mx-4 min-h-[540px] overflow-hidden sm:-mx-6 lg:-mx-10 lg:min-h-[620px]"
      aria-labelledby="hero-heading"
    >
      {/* Backdrop: ambient glow + soft horizontal grade. Scroll-scaled via CSS. */}
      <div className="hero-backdrop absolute inset-0" aria-hidden="true">
        <motion.div
          className="hero-glow absolute left-[55%] top-[30%] -ml-40 size-[30rem] rounded-full bg-primary/18 blur-[120px]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: [0.33, 1, 0.68, 1] }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_38%,transparent_20%,var(--background)_100%),linear-gradient(90deg,var(--background)_8%,color-mix(in_oklch,var(--background)_72%,transparent)_46%,transparent_100%)]" />
      </div>

      <motion.div
        className="hero-inner relative mx-auto flex min-h-[540px] max-w-[1440px] items-end px-4 pb-16 sm:px-10 sm:pb-20 lg:min-h-[620px]"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="max-w-2xl">
          <motion.p
            className="hero-eyebrow mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary backdrop-blur"
            id="hero-eyebrow"
            variants={entrance}
          >
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            {t('home.heroEyebrow')}
          </motion.p>

          <h1
            id="hero-heading"
            className="mt-2 text-[2.6rem] font-bold leading-[0.98] tracking-[-0.05em] text-balance sm:text-6xl lg:text-[5.25rem]"
          >
            {/* Each word sits in an overflow mask so it can rise in place. */}
            <motion.span
              className="block overflow-hidden pb-1"
              aria-hidden="true"
              variants={staggerContainer}
            >
              {headingWords.map((word, i) => (
                <motion.span
                  key={word.key}
                  className="inline-block will-change-transform"
                  variants={{
                    hidden: { opacity: 0, y: reduced ? 0 : '110%' },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.7, ease: EASE },
                    },
                  }}
                >
                  {word.text}
                  {i < headingWords.length - 1 ? '\u00A0' : ''}
                </motion.span>
              ))}
            </motion.span>
            <span className="sr-only">{t('home.heroHeading')}</span>
          </h1>

          <motion.div
            className="hero-meta mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px] tracking-[0.08em] text-muted-foreground"
            variants={entrance}
          >
            <span className="font-semibold text-foreground">FEATURED</span>
            <span aria-hidden="true" className="text-white/25">
              /
            </span>
            <span aria-hidden="true">2026</span>
            <span aria-hidden="true" className="text-white/25">
              /
            </span>
            <span aria-hidden="true">16+</span>
            <span aria-hidden="true" className="text-white/25">
              /
            </span>
            <span aria-hidden="true">4K</span>
            <span aria-hidden="true" className="text-white/25">
              /
            </span>
            <span aria-hidden="true">Drama · Action</span>
          </motion.div>

          <motion.p
            className="hero-sub mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
            id="hero-description"
            variants={entrance}
          >
            {t('home.heroSub')}
          </motion.p>

          <motion.div
            className="hero-ctas mt-9 flex flex-wrap items-center gap-3"
            variants={entrance}
          >
            <Button
              render={<Link href={localeHref(locale, '/search')} />}
              nativeButton={false}
              className="group h-auto gap-3 rounded-full bg-primary pl-5 pr-1.5 py-1.5 text-[0.95rem] font-semibold text-primary-foreground shadow-[0_12px_32px_-12px_rgba(255,255,255,0.4)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary active:scale-[0.98]"
            >
              <Play className="size-4 fill-current" />
              {t('home.heroCtaBrowse')}
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-[1px] group-hover:scale-105">
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Button>
            <Button
              variant="ghost"
              className="h-auto gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[0.95rem] font-semibold backdrop-blur transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/10 active:scale-[0.98]"
            >
              <Info className="size-4" aria-hidden="true" />
              {t('home.heroCtaMoreInfo')}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
