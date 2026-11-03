// `pnpm db:local`: a local Postgres (PGlite with PostGIS) on the wire protocol, for dev and e2e
// runs without Docker. Data persists in .pglite/. Then run `pnpm db:migrate` in another shell.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dataDir = path.resolve(process.env.PGLITE_DATA_DIR ?? '.pglite');
const port = Number(process.env.PGLITE_PORT ?? 5433);
const host = '127.0.0.1';

mkdirSync(dataDir, { recursive: true });
const db = await PGlite.create({ dataDir, extensions: { postgis } });

// PGlite is single-session; the server multiplexes connections and keeps an open
// transaction on the connection that started it.
const server = new PGLiteSocketServer({ db, port, host, maxConnections: 20 });
await server.start();
console.log(
  `PGlite (PostGIS) listening on postgres://postgres:postgres@localhost:${port}/postgres`,
);
console.log(`data: ${dataDir}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
