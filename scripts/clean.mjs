/** scripts/clean.mjs — remove build output. */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await rm(path.join(ROOT, 'dist'), { recursive: true, force: true });
await rm(path.join(ROOT, 'coverage'), { recursive: true, force: true });
console.log('[clean] removed dist/ and coverage/');
