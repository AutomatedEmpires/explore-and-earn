import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BANNED = ['Tx', 'DbOrTx', 'withTx', '.transaction(', '.insert(', '.update(', '.delete('];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) out.push(...filesUnder(file));
    else if (file.endsWith('.ts')) out.push(file);
  }
  return out;
}

describe('SP5 architecture', () => {
  it('keeps fit pure and the import direction one way', () => {
    for (const file of filesUnder('src/modules/hiring/fit')) {
      const source = readFileSync(file, 'utf8');
      for (const token of BANNED) expect(source, file).not.toContain(token);
    }
    for (const file of filesUnder('src/modules/hiring')) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/type FitInputs|interface FitInputs/);
    }
    for (const file of filesUnder('src/modules/messaging')) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/@\/modules\/(hiring|analytics)/);
    }
    for (const file of filesUnder('src/modules/hiring')) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/@\/modules\/analytics/);
    }
  });
});
