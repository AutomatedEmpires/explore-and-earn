import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localStorage, memoryStorage, type Storage } from './storage';

const BYTES = new Uint8Array([1]);
const ID = '0193a1b2-0000-7000-8000-000000000001';
const OTHER = '0193a1b2-0000-7000-8000-000000000002';

async function fill(storage: Storage): Promise<void> {
  for (const p of [
    `${ID}/parts/a.json`,
    `${ID}/parts/files/a/photo.webp`,
    `${ID}.zip`,
    `${OTHER}/parts/a.json`,
  ]) {
    await storage.write('privacy-exports', p, BYTES, 'application/octet-stream');
  }
}

const UNDER = [`${ID}/parts/a.json`, `${ID}/parts/files/a/photo.webp`];

describe('Storage.listUnder (issue 232)', () => {
  it('memory: lists every object under a folder at any depth, and nothing beside it', async () => {
    const storage = memoryStorage();
    await fill(storage);
    expect((await storage.listUnder('privacy-exports', ID)).sort()).toEqual(UNDER);
    expect(await storage.listUnder('privacy-exports', 'nothing-here')).toEqual([]);
    expect(await storage.listUnder('quarantine', ID)).toEqual([]);
  });

  it('local: lists every object under a folder at any depth, and nothing beside it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'storage-232-'));
    try {
      const storage = localStorage(dir, { baseUrl: 'http://localhost:3000', secret: 's'.repeat(32) });
      await fill(storage);
      expect((await storage.listUnder('privacy-exports', ID)).sort()).toEqual(UNDER);
      expect(await storage.listUnder('privacy-exports', 'nothing-here')).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a folder that climbs out of the bucket', async () => {
    await expect(memoryStorage().listUnder('privacy-exports', '../media-public')).rejects.toThrow(
      /Unsafe object path/,
    );
  });
});
