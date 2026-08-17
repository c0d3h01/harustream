// Next.js instrumentation hook (runs once when the server boots).
// Used to surface process-level lifecycle events in the structured log.

export async function register() {
  const { logger } = await import('@/lib/log');
  // The instrumentation hook runs in both the Node.js and edge runtimes.
  // Keep node-only fields in a separate branch so the edge static analyzer
  // never sees `process.version`.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    logger.info(
      {
        node: process.version,
        runtime: 'nodejs',
        env: process.env.NODE_ENV ?? 'development',
      },
      'server instance booted',
    );
    return;
  }
  logger.info(
    { runtime: 'edge', env: process.env.NODE_ENV ?? 'development' },
    'server instance booted',
  );
}
