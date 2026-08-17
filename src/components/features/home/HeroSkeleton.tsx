// Skeleton placeholder for the Hero while the featured feed is in flight.
// Matches Hero's fluid height so the page doesn't jump when real data
// arrives. Single element, no client state — the parent decides when to
// swap it for the real Hero.
export function HeroSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="mt-4 grid h-[clamp(320px,50svh,500px)] min-h-0 animate-pulse motion-reduce:animate-none place-items-end overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 sm:mt-5 sm:p-10 lg:p-12"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="h-3 w-32 rounded bg-secondary" />
        <div className="h-8 w-3/4 rounded bg-secondary sm:h-10" />
        <div className="h-3 w-full rounded bg-secondary" />
        <div className="h-3 w-5/6 rounded bg-secondary" />
        <div className="mt-1 flex gap-2">
          <div className="h-9 w-32 rounded-lg bg-secondary" />
          <div className="h-9 w-32 rounded-lg bg-secondary" />
        </div>
      </div>
    </section>
  );
}
