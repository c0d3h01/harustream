'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Info, Play, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { fadeUp, staggerContainer } from '@/components/motion/variants';
import { localeHref, useLocale, useT } from '@/lib/i18n';

const posterTiles = [
  { label: 'NOCTURNE', tone: 'bg-primary' },
  { label: 'SILENT\nWAVES', tone: 'bg-secondary' },
  { label: 'AFTER\nLIGHT', tone: 'bg-accent' },
  { label: 'ECHO\nROOM', tone: 'bg-muted' },
];

export function HomeHero() {
  const t = useT();
  const { locale } = useLocale();
  const reducedMotion = useReducedMotion();

  return (
    <section
      className="relative -mx-4 overflow-hidden sm:-mx-6 lg:-mx-10"
      aria-labelledby="hero-heading"
    >
      <div
        className="absolute inset-0 bg-[linear-gradient(115deg,var(--background)_15%,color-mix(in_oklch,var(--background)_76%,transparent)_57%,transparent),radial-gradient(circle_at_75%_25%,color-mix(in_oklch,var(--primary)_23%,transparent),transparent_35%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid min-h-[620px] max-w-[1440px] items-center gap-12 px-4 py-16 sm:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:py-20">
        <motion.div
          className="relative z-10 max-w-2xl"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            variants={fadeUp}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary backdrop-blur"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t('home.heroEyebrow')}
          </motion.div>
          <motion.h1
            variants={fadeUp}
            id="hero-heading"
            className="max-w-3xl text-5xl font-black leading-[0.94] tracking-[-0.065em] text-balance sm:text-7xl lg:text-8xl"
          >
            {t('home.heroHeading')}
          </motion.h1>
          <motion.div
            variants={fadeUp}
            className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            <span className="text-primary">Featured</span>
            <span aria-hidden="true">•</span>
            <span>2026</span>
            <span>16+</span>
            <span>4K</span>
            <span>Drama · Action</span>
          </motion.div>
          <motion.p
            variants={fadeUp}
            id="hero-description"
            className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
          >
            {t('home.heroSub')}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
            <Button
              render={<Link href={localeHref(locale, '/search')} />}
              nativeButton={false}
              className="h-12 gap-2 rounded-full px-6 font-bold shadow-lg shadow-primary/20"
              aria-label={t('home.heroCtaBrowse')}
            >
              <Play className="size-4 fill-current" aria-hidden="true" />
              {t('home.heroCtaBrowse')}
            </Button>
            <Button
              variant="secondary"
              render={<Link href={localeHref(locale, '/library')} />}
              nativeButton={false}
              className="h-12 gap-2 rounded-full px-6 font-bold"
              aria-label={t('home.heroCtaLibrary')}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('home.heroCtaLibrary')}
            </Button>
            <Button
              variant="ghost"
              className="h-12 gap-2 rounded-full px-5"
              aria-label={t('home.heroCtaMoreInfo')}
            >
              <Info className="size-4" aria-hidden="true" />
              {t('home.heroCtaMoreInfo')}
            </Button>
          </motion.div>
        </motion.div>

        <div className="relative mx-auto h-[360px] w-full max-w-xl sm:h-[440px]" aria-hidden="true">
          <motion.div
            className="absolute inset-x-8 top-8 bottom-8 rounded-[2rem] border border-border/70 bg-card/70 shadow-2xl shadow-primary/10 backdrop-blur-sm"
            initial={{ opacity: 0, rotate: -5, y: 30 }}
            animate={{ opacity: 1, rotate: -5, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            className="absolute inset-x-4 top-4 bottom-4 rounded-[2rem] border border-border bg-secondary/80 p-3 shadow-2xl backdrop-blur"
            initial={{ opacity: 0, rotate: 4, y: 40 }}
            animate={{ opacity: 1, rotate: 4, y: 0 }}
            transition={{ delay: 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid h-full grid-cols-2 gap-3 overflow-hidden rounded-[1.4rem]">
              {posterTiles.map((tile, index) => (
                <motion.div
                  key={tile.label}
                  className={`${tile.tone} relative flex items-end overflow-hidden p-4 text-xl font-black leading-none tracking-[-0.06em] text-primary-foreground sm:text-3xl`}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: reducedMotion ? 0 : 0.35 + index * 0.08, duration: 0.6 }}
                >
                  <span className="whitespace-pre-line">{tile.label}</span>
                  <span className="absolute right-3 top-3 text-[10px] font-medium tracking-[0.2em] opacity-70">
                    0{index + 1}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
          <motion.div
            className="absolute -right-1 bottom-8 rounded-full border border-border bg-background/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary shadow-xl backdrop-blur"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          >
            Curated for you
          </motion.div>
        </div>
      </div>
    </section>
  );
}
