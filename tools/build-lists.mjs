#!/usr/bin/env node
/**
 * Compile les listes amont en `extension/rules/hostnames.json`, consomme par le
 * moteur a Set de l'extension (webRequest bloquant, Firefox ESR).
 *
 * Historique : ce script emettait aussi des regles declarativeNetRequest pour
 * Chromium. La mesure du 2026-09-20 a montre 33 758 regles pour 30 000 garanties
 * par extension ; le parc ayant ete recentre sur Firefox ESR seul, le volet DNR a
 * ete retire plutot que maintenu a vide. Voir README.md.
 *
 * Usage : node tools/build-lists.mjs [--offline] [--quiet]
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPsl } from './lib/psl.mjs';
import { normalizeList } from './lib/normalize.mjs';
import { reduce, isCoveredBySet } from './lib/reduce.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');
const OUT_DIR = join(ROOT, 'extension', 'rules');

const OFFLINE = process.argv.includes('--offline');
const QUIET = process.argv.includes('--quiet');
const log = (...args) => { if (!QUIET) console.log(...args); };

async function fetchSource({ id, url }) {
  const cachePath = join(CACHE_DIR, `${id}.txt`);

  if (OFFLINE) {
    if (!existsSync(cachePath)) {
      throw new Error(`--offline demande mais aucun cache pour "${id}" (${cachePath}). Lancer un build en ligne d'abord.`);
    }
    log(`  ${id.padEnd(24)} cache local`);
    return readFile(cachePath, 'utf8');
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${id} : HTTP ${response.status} sur ${url}`);
  const text = await response.text();

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, text);
  log(`  ${id.padEnd(24)} ${text.split('\n').length} lignes`);
  return text;
}

const readLocalList = (relPath) => readFile(join(ROOT, relPath), 'utf8');

async function main() {
  const sources = JSON.parse(await readLocalList('lists/sources.json'));

  log('\nSources amont');
  const upstream = new Map();
  for (const source of sources.upstream) upstream.set(source.id, await fetchSource(source));

  const psl = createPsl(await readLocalList('lists/vendor/public_suffix_list.dat'));
  log(`  public suffix list       ${psl.ruleCount} regles`);

  const sharedHosts = normalizeList(await readLocalList('lists/shared-hosts.txt')).hosts;
  const publicSuffixOptIn = normalizeList(await readLocalList('lists/public-suffix-block-optin.txt')).hosts;

  // --- Etape 1 : agregation brute et normalisation -------------------------
  let rawCount = 0;
  const skipped = new Map();
  const blocked = new Set();

  for (const text of [upstream.get('ut1-games'), await readLocalList('lists/custom-block.txt')]) {
    const result = normalizeList(text);
    rawCount += result.rawCount;
    for (const host of result.hosts) blocked.add(host);
    for (const [reason, n] of result.skipped) skipped.set(reason, (skipped.get(reason) ?? 0) + n);
  }

  const allowed = new Set();
  for (const text of [upstream.get('ut1-educational-games'), await readLocalList('lists/allowlist.txt')]) {
    for (const host of normalizeList(text).hosts) allowed.add(host);
  }

  const uniqueCount = blocked.size;

  // --- Etape 2 : garde-fou suffixes publics --------------------------------
  // Bloquer un suffixe public (github.io, pages.dev...) bloquerait des milliers
  // de sites independants. Refus par defaut ; opt-in explicite possible.
  const publicSuffixRefused = [];
  const publicSuffixAccepted = [];
  for (const host of blocked) {
    if (!psl.isPublicSuffix(host)) continue;
    if (publicSuffixOptIn.has(host)) publicSuffixAccepted.push(host);
    else { publicSuffixRefused.push(host); blocked.delete(host); }
  }

  // --- Etape 3 : reduction (verrous PSL et parent liste) -------------------
  const reduced = reduce(blocked, psl, sharedHosts);

  // --- Etape 4 : soustraction de l'allowlist, prioritaire ------------------
  const allowReduced = reduce(allowed, psl, sharedHosts);
  const finalBlocked = new Set();
  const droppedByAllowlist = [];
  for (const host of reduced) {
    if (isCoveredBySet(host, allowReduced)) droppedByAllowlist.push(host);
    else finalBlocked.add(host);
  }

  const sharedHostsBlocked = [...finalBlocked].filter((host) => sharedHosts.has(host));

  // --- Etape 5 : artefacts -------------------------------------------------
  const blockedSorted = [...finalBlocked].sort();
  const allowedSorted = [...allowReduced].sort();

  const generatedAt = new Date().toISOString();
  const digest = createHash('sha256')
    .update(`${blockedSorted.join('\n')}\u0000${allowedSorted.join('\n')}`)
    .digest('hex');

  await mkdir(OUT_DIR, { recursive: true });

  // hostnames.json : artefact d'audit, versionne, lu par tools/report-diff.mjs.
  await writeFile(
    join(OUT_DIR, 'hostnames.json'),
    `${JSON.stringify({ generatedAt, digest, blocked: blockedSorted, allowed: allowedSorted })}\n`,
  );

  // hostnames.js : meme contenu, mais en module ES.
  // L'extension DOIT l'importer statiquement plutot que de le charger par fetch :
  // une event page MV3 peut redemarrer a tout moment, et un chargement asynchrone
  // laisserait passer les requetes arrivant avant la fin du chargement. Un import
  // statique est resolu avant l'execution du corps du script, donc avant
  // l'enregistrement du listener webRequest.
  await writeFile(
    join(OUT_DIR, 'hostnames.js'),
    [
      '// Genere par tools/build-lists.mjs - ne pas editer a la main.',
      `export const generatedAt = ${JSON.stringify(generatedAt)};`,
      `export const digest = ${JSON.stringify(digest)};`,
      `export const blocked = ${JSON.stringify(blockedSorted)};`,
      `export const allowed = ${JSON.stringify(allowedSorted)};`,
      '',
    ].join('\n'),
  );
  const report = {
    generatedAt,
    digest,
    pipeline: {
      raw: rawCount,
      unique: uniqueCount,
      afterReduction: reduced.size,
      afterAllowlist: blockedSorted.length,
    },
    counts: { blocked: blockedSorted.length, allowed: allowedSorted.length },
    warnings: { publicSuffixRefused, publicSuffixAccepted, sharedHostsBlocked, droppedByAllowlist: droppedByAllowlist.sort() },
    skipped: Object.fromEntries(skipped),
  };
  await writeFile(join(OUT_DIR, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  // --- Etape 6 : rapport ----------------------------------------------------
  log('\nPipeline');
  log(`  ${rawCount} brut -> ${uniqueCount} uniques -> ${reduced.size} apres reduction -> ${blockedSorted.length} apres allowlist`);
  log(`            -> ${blockedSorted.length} hostnames bloques + ${allowedSorted.length} autorises`);

  if (skipped.size > 0) {
    log('\nLignes ecartees a la normalisation');
    for (const [reason, n] of [...skipped].sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(6)}  ${reason}`);
  }

  if (publicSuffixRefused.length > 0) {
    log(`\n/!\\ ${publicSuffixRefused.length} entree(s) amont sont des suffixes publics : REFUSEES.`);
    log('    Les bloquer bloquerait tous les sites independants qu\'ils hebergent.');
    log('    Opt-in explicite possible dans lists/public-suffix-block-optin.txt :');
    for (const host of publicSuffixRefused.slice(0, 20)) log(`      ${host}`);
  }
  if (publicSuffixAccepted.length > 0) {
    log(`\n  ${publicSuffixAccepted.length} suffixe(s) public(s) bloque(s) en entier par opt-in explicite :`);
    for (const host of publicSuffixAccepted) log(`      ${host}`);
  }
  if (sharedHostsBlocked.length > 0) {
    log(`\n/!\\ ${sharedHostsBlocked.length} hebergeur(s) mutualise(s) bloque(s) en entier par une liste amont.`);
    log('    Decision honoree, mais a valider explicitement par l\'etablissement :');
    for (const host of sharedHostsBlocked) log(`      ${host}`);
  }
  if (droppedByAllowlist.length > 0) {
    log(`\n  ${droppedByAllowlist.length} entree(s) bloquee(s) en amont retiree(s) par l'allowlist :`);
    for (const host of droppedByAllowlist.slice(0, 20)) log(`      ${host}`);
    if (droppedByAllowlist.length > 20) log(`      ... et ${droppedByAllowlist.length - 20} autres (voir build-report.json)`);
  }

  // heuristics.js : reglages de l'heuristique, recompiles en module ES pour que
  // le service de fond les importe statiquement, comme les listes.
  const heuristics = JSON.parse(await readLocalList('lists/heuristics.json'));
  await writeFile(
    join(OUT_DIR, 'heuristics.js'),
    [
      '// Genere par tools/build-lists.mjs depuis lists/heuristics.json.',
      '// Ne pas editer a la main : regler dans lists/heuristics.json.',
      `export const heuristics = ${JSON.stringify(heuristics, null, 2)};`,
      '',
    ].join('\n'),
  );

  log('\nArtefacts dans extension/rules/ : hostnames.json, hostnames.js, heuristics.js, build-report.json\n');
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}\n`);
  process.exit(1);
});
