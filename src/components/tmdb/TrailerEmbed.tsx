interface TrailerEmbedProps {
  trailerKey: string;
  muted: boolean;
  name?: string;
}

export function TrailerEmbed({ trailerKey, muted, name }: TrailerEmbedProps) {
  return (
    <div className="relative aspect-video w-full">
      <iframe
        src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}`}
        title={name ? `Trailer: ${name}` : 'Trailer'}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
