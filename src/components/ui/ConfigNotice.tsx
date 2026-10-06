interface ConfigNoticeProps {
  error?: unknown;
}

export function ConfigNotice({ error }: ConfigNoticeProps = {}) {
  return (
    <section className="mx-auto grid max-w-2xl place-items-center px-6 py-24 text-center">
      <div>
        <p className="font-heading text-2xl tracking-[-0.01em] text-foreground">
          {error ? 'Catalog error' : 'Catalog unavailable'}
        </p>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {error
            ? 'Something went wrong loading catalog data. Please try again later.'
            : 'Add TMDB_API_KEY to the server environment to load artwork and listings.'}
        </p>
      </div>
    </section>
  );
}
