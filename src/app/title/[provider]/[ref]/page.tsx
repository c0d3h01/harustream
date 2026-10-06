import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TitleExperience } from '@/components/title/TitleExperience';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { LoadError } from '@/components/ui/LoadError';
import { decodeBase64Url } from '@/lib/base64url';
import { asAppError } from '@/lib/errors';
import { featured } from '@/services/catalog';
import { toMedia } from '@/services/normalize';
import { cached, callProvider } from '@/services/provider';
import type { Media } from '@/types/media';
import { rawInfoSchema } from '@/validations/provider';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ provider: string; ref: string }> };

export default async function TitlePage({ params }: Props) {
  const { provider, ref: encodedRef } = await params;
  // Independent of the item fetch below (only the post-fetch filter needs it),
  // so the provider fan-out starts now and is awaited late.
  const relatedPromise = featured();
  let item: Media;
  try {
    item = await cached(`media:${provider}:${encodedRef}`, 60_000, () =>
      callProvider({
        providerId: decodeURIComponent(provider),
        op: 'metadata',
        schema: rawInfoSchema,
        invoke: (p, signal) => p.getMeta({ link: decodeBase64Url(encodedRef), signal }),
        map: (parsed, p) => toMedia(parsed, p.id, decodeBase64Url(encodedRef)),
      }),
    );
  } catch (error) {
    const appError = asAppError(error);
    if (appError.code === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <DirectionalTransition>
          <LoadError />
        </DirectionalTransition>
      </Shell>
    );
  }
  const related = (await relatedPromise).rails
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
