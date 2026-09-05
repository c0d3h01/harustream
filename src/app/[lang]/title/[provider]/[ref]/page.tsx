import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TitleExperience } from '@/components/title/TitleExperience';
import { TitleLoadError } from '@/components/title/TitleLoadError';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { asAppError } from '@/lib/errors';
import { decodeRef } from '@/lib/refs';
import { featured } from '@/services/catalog';
import { media } from '@/services/media';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ provider: string; ref: string }> };

export default async function TitlePage({ params }: Props) {
  const { provider, ref: encodedRef } = await params;
  let item: Awaited<ReturnType<typeof media>>;
  try {
    item = await media(decodeURIComponent(provider), decodeRef(encodedRef));
  } catch (error) {
    const appError = asAppError(error);
    if (appError.code === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <DirectionalTransition>
          <TitleLoadError />
        </DirectionalTransition>
      </Shell>
    );
  }
  const related = (await featured()).rails
    .flatMap((rail) => rail.items)
    .filter((candidate) => candidate.id !== item.id && candidate.providerId === item.providerId);

  // Same-route title → title (related picks) swaps subtrees keyed by segment,
  // so directional enter/exit is unreliable there. The stable `name` +
  // `key` crossfades same-place content swaps while hierarchical
  // list → detail still slides via `DirectionalTransition` + shared morph.
  const contentKey = `${item.providerId}:${item.ref}`;

  return (
    <Shell>
      <DirectionalTransition>
        <div className="pt-6 sm:pt-10">
          <Suspense fallback={null}>
            <ViewTransition
              key={contentKey}
              name="title-content"
              share="auto"
              enter="auto"
              default="none"
            >
              <TitleExperience item={item} related={related} />
            </ViewTransition>
          </Suspense>
        </div>
      </DirectionalTransition>
    </Shell>
  );
}
