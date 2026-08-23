export function shouldOfferResume(
  position: number | undefined,
  duration: number | undefined,
): boolean {
  return (
    position !== undefined &&
    duration !== undefined &&
    Number.isFinite(position) &&
    Number.isFinite(duration) &&
    position >= 5 &&
    duration > 0 &&
    position / duration >= 0.01 &&
    position / duration <= 0.95
  );
}

export function nextEpisode<T>(
  episodes: T[],
  currentIndex: number,
  autoAdvance: boolean,
): T | undefined {
  if (!autoAdvance || currentIndex < 0 || currentIndex >= episodes.length - 1) return undefined;
  return episodes[currentIndex + 1];
}
