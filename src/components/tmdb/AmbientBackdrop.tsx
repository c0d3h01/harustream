import Image from 'next/image';
import { imageUrl } from '@/lib/media/images';

/** Full-viewport ambient backdrop — the hero banner artwork, heavily
 *  blurred + saturated, fixed behind all page content. The app background
 *  tints itself to the hero with zero scroll listeners: this is a plain
 *  `blur()` filter on a static layer (rasterized once, cached by the
 *  compositor), NOT `backdrop-filter`, so it costs nothing per scroll frame.
 *  Page content sits above it via `<Shell>`'s lifted `<main>`. */
export function AmbientBackdrop({ src }: { src: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Image
        src={imageUrl(src)}
        alt=""
        fill
        sizes="100vw"
        className="scale-125 object-cover opacity-40 blur-[90px] saturate-[1.5]"
      />
      {/* Readability fades — header island stays legible, page melts upward. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background" />
    </div>
  );
}
