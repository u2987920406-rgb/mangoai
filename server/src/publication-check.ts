import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { QAVerdict } from './mangoqa.js';

const EXCLUDED = new Set(['node_modules', 'dist', 'build', 'coverage', 'test-results']);
/** Fingerprint source/config/assets, excluding runtime metadata and build output. */
export function publicationFingerprint(dir: string): string {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  function walk(base: string, prefix = ''): void {
    for (const name of fs.readdirSync(base).sort()) {
      if (EXCLUDED.has(name) || name.startsWith('.')) continue;
      const file = path.join(base, name), rel = `${prefix}${name}`;
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Publication : les liens symboliques doivent être remplacés par des fichiers.');
      if (stat.isDirectory()) walk(file, `${rel}/`);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 256 * 1024 * 1024) throw new Error('Projet trop volumineux pour la vérification (256 Mo hors dépendances).');
        hash.update(JSON.stringify(rel)); hash.update(crypto.createHash('sha256').update(fs.readFileSync(file)).digest());
      }
    }
  }
  walk(dir); return hash.digest('hex');
}

export function assertSourcesUnchanged(dir: string, expected: string): void {
  if (publicationFingerprint(dir) !== expected) throw new Error('Le projet a changé pendant la vérification. Relance la publication pour vérifier cette version.');
}

export async function verifyPublication(dir: string, deps: {
  active: () => boolean;
  audit: () => Promise<QAVerdict | null>;
  test: () => Promise<void>;
}): Promise<string> {
  if (!deps.active()) throw new Error('Publication suspendue : démarre MangoQA pour vérifier ton application.');
  const fingerprint = publicationFingerprint(dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (typeof pkg.scripts?.test === 'string') await deps.test();
  const verdict = await deps.audit();
  if (!verdict || verdict.verdict !== 'green') {
    throw new Error(verdict?.verdict === 'red'
      ? `Publication suspendue : ${verdict.rejection?.corrective_action || 'corrige les problèmes signalés par MangoQA.'}`
      : 'Publication suspendue : audit incomplet ou indisponible. Réessaie lorsque MangoQA peut terminer ses vérifications.');
  }
  assertSourcesUnchanged(dir, fingerprint);
  return fingerprint;
}
