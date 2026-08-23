export type ResumeProgress = {
  position: number;
  duration: number;
};

export type ResumeOfferState = {
  episodeKey: string;
  saved?: ResumeProgress;
  visible: boolean;
};

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

export function updateResumeOffer(
  current: ResumeOfferState | undefined,
  episodeKey: string,
  saved: ResumeProgress | undefined,
): ResumeOfferState {
  if (current?.episodeKey === episodeKey) return current;
  return {
    episodeKey,
    saved,
    visible: shouldOfferResume(saved?.position, saved?.duration),
  };
}

export function dismissResumeOffer(
  current: ResumeOfferState,
  episodeKey: string,
): ResumeOfferState {
  if (current.episodeKey !== episodeKey || !current.visible) return current;
  return { ...current, visible: false };
}

export function nextEpisode<T>(
  episodes: T[],
  currentIndex: number,
  autoAdvance: boolean,
): T | undefined {
  if (!autoAdvance || currentIndex < 0 || currentIndex >= episodes.length - 1) return undefined;
  return episodes[currentIndex + 1];
}
