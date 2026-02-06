/**
 * Local development server entry point.
 *
 * Starts the Heat WebSocket server on a configurable port.
 *
 * Usage:
 *   npx tsx src/server/dev.ts
 *   PORT=9000 npx tsx src/server/dev.ts
 */

import { createHeatServer } from './ws-server.js';

const port = parseInt(process.env['PORT'] ?? '3000', 10);

const server = createHeatServer({
  port,
  defaultTurnTimeoutMs: 60_000,
  roomCleanupMs: 10 * 60_000, // clean up stale rooms after 10 minutes
});

console.log(`Heat WebSocket server listening on ws://localhost:${port}`);
console.log('Press Ctrl+C to stop.');

function shutdown() {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
