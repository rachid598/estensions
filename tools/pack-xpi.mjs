#!/usr/bin/env node
/**
 * Empaquetage auto-heberge pour Firefox ESR.
 *
 * Produit dans dist/ :
 *   - filtre_jeux-<version>.xpi  l'extension
 *   - updates.json               le manifeste de mise a jour interroge par Firefox
 *
 * La signature n'est PAS faite ici : elle passe par `npm run sign`, qui appelle
 * `web-ext sign --channel=unlisted`. Mozilla signe alors le XPI sans le publier
 * ni le referencer sur le store public. La distribution reste auto-hebergee ;
 * seule la signature est deleguee, parce que Firefox l'exige.
 *
 * Usage :
 *   node tools/pack-xpi.mjs [--version 2026.9.20] [--xpi dist/deja-signe.xpi]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MANIFEST = join(ROOT, 'extension', 'manifest.json');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const config = JSON.parse(readFileSync(join(ROOT, 'config', 'deploiement.json'), 'utf8'));
const baseUrl = String(config.baseUrl).replace(/\/+$/, '');

if (baseUrl.includes('example.fr')) {
  console.warn(
    "\n/!\\ config/deploiement.json contient encore l'URL d'exemple.\n" +
    "    Le manifeste et updates.json pointeront vers un serveur inexistant.\n",
  );
}

// --- 1. Manifeste : identite et URL de mise a jour --------------------------
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const version = arg('--version') ?? manifest.version;

manifest.version = version;
manifest.browser_specific_settings.gecko.id = config.extensionId;
manifest.browser_specific_settings.gecko.strict_min_version = config.firefoxMinVersion;
// Auto-hebergement : Firefox interroge cette URL pour les mises a jour. Elle ne
// doit jamais pointer vers AMO.
manifest.browser_specific_settings.gecko.update_url = `${baseUrl}/updates.json`;

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifeste : version ${version}, id ${config.extensionId}`);

// --- 2. Construction du XPI -------------------------------------------------
mkdirSync(DIST, { recursive: true });

let xpiPath = arg('--xpi');
if (xpiPath === undefined) {
  execFileSync(
    'npx',
    ['web-ext', 'build', '--source-dir', 'extension', '--artifacts-dir', 'dist', '--overwrite-dest'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  const candidates = readdirSync(DIST).filter((name) => name.endsWith('.xpi') || name.endsWith('.zip'));
  if (candidates.length === 0) throw new Error('aucun XPI produit dans dist/');

  // web-ext build produit un .zip. On renomme en .xpi : un serveur qui sert un
  // .zip le donnerait avec un type MIME que Firefox refuse d'installer.
  const produced = join(DIST, candidates.sort().at(-1));
  xpiPath = produced.replace(/\.zip$/, '.xpi');
  if (produced !== xpiPath) renameSync(produced, xpiPath);
} else {
  xpiPath = resolve(ROOT, xpiPath);
}

if (!existsSync(xpiPath)) throw new Error(`XPI introuvable : ${xpiPath}`);

// --- 3. Manifeste de mise a jour -------------------------------------------
const bytes = readFileSync(xpiPath);
const hash = createHash('sha256').update(bytes).digest('hex');

const updates = {
  addons: {
    [config.extensionId]: {
      updates: [
        {
          version,
          update_link: `${baseUrl}/${basename(xpiPath)}`,
          update_hash: `sha256:${hash}`,
        },
      ],
    },
  },
};

writeFileSync(join(DIST, 'updates.json'), `${JSON.stringify(updates, null, 2)}\n`);

console.log(`\nXPI        ${basename(xpiPath)} (${(bytes.length / 1024).toFixed(0)} Ko)`);
console.log(`empreinte  sha256:${hash.slice(0, 16)}...`);
console.log(`updates    ${baseUrl}/updates.json`);
console.log('\nA deposer sur le serveur du college : le XPI et updates.json.');
console.log('Le XPI doit etre celui SIGNE par AMO (`npm run sign`), pas la version brute.\n');
