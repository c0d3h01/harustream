import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger, SERVER_NAME, SERVER_VERSION, server } from './server.js';

// Import tool modules for their registration side effects.
import './tools/agent.js';
import './tools/codebase.js';
import './tools/dependencies.js';
import './tools/files.js';
import './tools/git.js';
import './tools/health.js';
import './tools/ops.js';
import './tools/planning.js';
import './tools/quality.js';

// ============================================
// BOOT
// ============================================

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info({
    event: 'server_ready',
    transport: 'stdio',
    name: SERVER_NAME,
    version: SERVER_VERSION,
    pid: process.pid,
  });
}

async function runHttp(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const maxBody = 1_000_000;
  const httpServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(req.method === 'POST' ? 404 : 405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Use POST /mcp' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBody) req.destroy();
    });
    req.on('end', () => {
      void (async () => {
        try {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          res.on('close', () => void transport.close());
          await server.connect(transport);
          await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
        } catch (err) {
          logger.error({ event: 'http_request_error', error: String(err) });
          if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'MCP request failed' }));
          }
        }
      })();
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
  logger.info({
    event: 'server_ready',
    transport: 'streamable-http',
    name: SERVER_NAME,
    version: SERVER_VERSION,
    pid: process.pid,
    port,
  });
}

async function main(): Promise<void> {
  const transport = (process.env.TRANSPORT ?? 'stdio').toLowerCase();
  if (transport === 'http') await runHttp();
  else await runStdio();
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'shutdown', signal });
  try {
    await server.close();
  } catch (err) {
    logger.error({ event: 'shutdown_error', error: String(err) });
  }
  setTimeout(() => process.exit(0), 100).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ event: 'fatal', error: String(err) });
  process.exit(1);
});
