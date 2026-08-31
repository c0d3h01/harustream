import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger, SERVER_NAME, SERVER_VERSION, server } from './core.js';

// Import tool modules for their registration side effects
import './agent.js';
import './codebase.js';
import './dependencies.js';
import './files.js';
import './git.js';
import './health.js';
import './ops.js';
import './planning.js';
import './quality.js';

// ============================================
// BOOT SERVER
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info({
    event: 'server_ready',
    name: SERVER_NAME,
    version: SERVER_VERSION,
    pid: process.pid,
  });
}

let shuttingDown = false;
let transportClosed = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'shutdown', signal });

  if (!transportClosed) {
    try {
      await server.close();
      transportClosed = true;
    } catch (err) {
      logger.error({ event: 'shutdown_error', error: String(err) });
    }
  }

  setTimeout(() => process.exit(0), 100).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ event: 'fatal', error: String(err) });
  process.exit(1);
});
