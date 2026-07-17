/** Dev entry point: boot a single-process STARWEFT server. */

import { GameServer } from './game.js';
import { JsonFileSnapshotStore } from './persistence/snapshot.js';

const port = Number(process.env['PORT'] ?? 8777);
const snapshotPath = process.env['SNAPSHOT_PATH'] ?? '.snapshots/world.json';

const store = new JsonFileSnapshotStore(snapshotPath);
const server = await GameServer.start({ port }, store);

console.log(`STARWEFT server listening on ws://localhost:${server.port}`);
console.log(`universe: ${server.world.pack.seed} (${server.world.pack.systems.length} systems)`);
console.log(`starter system: ${server.world.starterSystem.name} / ${server.world.starterStation.name}`);

const shutdown = async (): Promise<void> => {
  console.log('snapshotting world and shutting down…');
  server.saveTo(store);
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Periodic snapshot flush (doc 09 §3).
setInterval(() => server.saveTo(store), 30_000);
