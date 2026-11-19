// Token radar entry: Node 22, standard library only.
// Reads the snapshot, scores it with lib/model.ts, writes the board, the data script, the dashboard,
// the screenshots and the dossier into the output directory.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIN_SCREENSHOTS = 3;
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

interface Options {
  input: string;
  output: string;
}

class Refusal extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

function parseOptions(argv: string[]): Options {
  const found: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > 0) found[token.slice(2, eq)] = token.slice(eq + 1);
    else if (i + 1 < argv.length) found[token.slice(2)] = argv[++i]!;
  }
  return {
    input: found.input ?? '/input',
    output: found.output ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output',
  };
}

function locateSnapshot(input: string): string {
  const path = resolve(input);
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, 'snapshot.json') : path;
  if (!existsSync(file)) throw new Refusal(`cannot find a snapshot at ${file}; use --input <file|dir>`, 2);
  return file;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && statSync(join(dir, name)).isFile())
    .sort();
}

function copyInto(from: string, to: string): string[] {
  const names = listFiles(from);
  if (names.length === 0) return names;
  mkdirSync(to, { recursive: true });
  for (const name of names) copyFileSync(join(from, name), join(to, name));
  return names;
}

function checkScreenshots(names: string[]): void {
  if (names.length < MIN_SCREENSHOTS) {
    throw new Refusal(`found ${names.length} screenshot(s) but at least ${MIN_SCREENSHOTS} are required`, 1);
  }
  const bad = names.find((name) => !SHOT_NAME.test(name));
  if (bad !== undefined) throw new Refusal(`screenshot name "${bad}" is not allowed`, 1);
}

function run(): void {
  const options = parseOptions(process.argv.slice(2));
  const snapshotFile = locateSnapshot(options.input);
  const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));

  const { board, radar } = buildRadar(snapshot);
  const problem = boardIssue(board, snapshot);
  if (problem !== null) throw new Refusal(`board rejected by the gate check: ${problem}`, 1);

  const out = resolve(options.output);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), JSON.stringify({ rows: board }) + '\n');
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const pages = copyInto(join(ROOT, 'dashboard'), join(out, 'dashboard'));
  const shots = copyInto(join(ROOT, 'screenshots'), join(out, 'screenshots'));
  checkScreenshots(shots);

  // Last, because the dossier hashes everything written above.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));

  console.log(
    `rows: ${board.length} scored of ${snapshot.protocols.length} protocols ` +
      `(watchlist ${snapshot.watchlist.length}, early ${radar.early_size}, live ${radar.live_size})`,
  );
  console.log(`output: ${out} with ${pages.length} dashboard files and ${shots.length} screenshots`);
}

try {
  run();
} catch (error) {
  if (error instanceof Refusal) {
    console.error(`radar refused: ${error.message}`);
    process.exit(error.code);
  }
  throw error;
}
