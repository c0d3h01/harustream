import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { TitleExperience } from '@/components/title/TitleExperience';
import { TitleLoadError } from '@/components/title/TitleLoadError';
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
        <TitleLoadError />
      </Shell>
    );
  }
  const related = (await featured()).rails
    .flatMap((rail) => rail.items)
    .filter((candidate) => candidate.id !== item.id && candidate.providerId === item.providerId);

  return (
    <Shell>
      <div className="pt-6 sm:pt-10">
        <TitleExperience item={item} related={related} />
      </div>
    </Shell>
  );
}
