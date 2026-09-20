#!/usr/bin/env node
/**
 * Rapport d'audit : que change ce build par rapport au precedent ?
 *
 * Le but est qu'un ajout massif ou une entree douteuse se voie AVANT le
 * deploiement. La reference est la version de extension/rules/hostnames.json
 * enregistree dans git (HEAD par defaut) : aucun stockage supplementaire.
 *
 * Usage :
 *   node tools/report-diff.mjs [--ref <commit>] [--limit <n>] [--json]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = 'extension/rules/hostnames.json';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const ref = arg('--ref', 'HEAD');
const limit = Number(arg('--limit', '40'));
const asJson = process.argv.includes('--json');

function readCurrent() {
  return JSON.parse(readFileSync(resolve(ROOT, ARTIFACT), 'utf8'));
}

function readPrevious() {
  try {
    const text = execFileSync('git', ['show', `${ref}:${ARTIFACT}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const current = readCurrent();
const previous = readPrevious();

if (previous === null) {
  const message = `Premiere generation : aucune version de ${ARTIFACT} dans ${ref}. ` +
    `${current.blocked.length} entrees bloquees, ${current.allowed.length} autorisees.`;
  console.log(asJson ? JSON.stringify({ firstBuild: true, blocked: current.blocked.length, allowed: current.allowed.length }, null, 2) : message);
  process.exit(0);
}

function diff(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((host) => !beforeSet.has(host)),
    removed: before.filter((host) => !afterSet.has(host)),
  };
}

const blockedDiff = diff(previous.blocked, current.blocked);
const allowedDiff = diff(previous.allowed, current.allowed);
const unchanged = current.digest === previous.digest;

if (asJson) {
  console.log(JSON.stringify({ unchanged, blocked: blockedDiff, allowed: allowedDiff }, null, 2));
  process.exit(0);
}

if (unchanged) {
  console.log(`\nAucun changement depuis ${ref} (empreinte ${current.digest.slice(0, 12)}).\n`);
  process.exit(0);
}

const show = (label, hosts) => {
  if (hosts.length === 0) return;
  console.log(`\n${label} (${hosts.length})`);
  for (const host of hosts.slice(0, limit)) console.log(`  ${host}`);
  if (hosts.length > limit) console.log(`  ... et ${hosts.length - limit} autres`);
};

console.log(`\nAudit du build  ${previous.digest.slice(0, 12)} -> ${current.digest.slice(0, 12)}`);
console.log(`  bloquees : ${previous.blocked.length} -> ${current.blocked.length} (+${blockedDiff.added.length} / -${blockedDiff.removed.length})`);
console.log(`  autorisees : ${previous.allowed.length} -> ${current.allowed.length} (+${allowedDiff.added.length} / -${allowedDiff.removed.length})`);

show('Domaines AJOUTES a la liste bloquee', blockedDiff.added);
show('Domaines RETIRES de la liste bloquee', blockedDiff.removed);
show('Domaines AJOUTES a l\'allowlist', allowedDiff.added);
show('Domaines RETIRES de l\'allowlist', allowedDiff.removed);

// Une variation brutale merite une relecture humaine avant deploiement.
const growth = current.blocked.length === 0 ? 0 : blockedDiff.added.length / current.blocked.length;
if (growth > 0.1) {
  console.log(`\n/!\\ ${Math.round(growth * 100)} % d'entrees nouvelles : relire cette liste avant de deployer.`);
}
console.log('');
