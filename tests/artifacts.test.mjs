import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createPsl } from '../tools/lib/psl.mjs';
import { normalizeList } from '../tools/lib/normalize.mjs';
import { isCoveredBySet } from '../tools/lib/reduce.mjs';

const artifactUrl = new URL('../extension/rules/hostnames.json', import.meta.url);
if (!existsSync(artifactUrl)) {
  throw new Error('extension/rules/hostnames.json absent : lancer `npm run build:lists` avant les tests.');
}

const { blocked, allowed, digest } = JSON.parse(readFileSync(artifactUrl, 'utf8'));
const blockedSet = new Set(blocked);
const allowedSet = new Set(allowed);

const psl = createPsl(readFileSync(new URL('../lists/vendor/public_suffix_list.dat', import.meta.url), 'utf8'));
const optIn = normalizeList(readFileSync(new URL('../lists/public-suffix-block-optin.txt', import.meta.url), 'utf8')).hosts;

/** Precedence du moteur : l'allowlist prime toujours. */
function verdict(host) {
  if (isCoveredBySet(host, allowedSet)) return 'allowed';
  if (isCoveredBySet(host, blockedSet)) return 'blocked';
  return 'unknown';
}

test('les artefacts sont coherents', () => {
  assert.ok(blocked.length > 20000, `liste bloquee anormalement courte : ${blocked.length}`);
  assert.ok(allowed.length > 20, `allowlist anormalement courte : ${allowed.length}`);
  assert.match(digest, /^[0-9a-f]{64}$/);
});

test('NE DOIT JAMAIS ETRE BLOQUE : sites pedagogiques', () => {
  const fixtures = [
    'scratch.mit.edu',
    'geogebra.org',
    'www.geogebra.org',
    'code.org',
    'lumni.fr',
    'eduscol.education.fr',
    'fr.wikipedia.org',
    'learningapps.org',
    'kahoot.it',
    'index-education.net',
    'tinkercad.com',
  ];
  for (const host of fixtures) {
    assert.notEqual(verdict(host), 'blocked', `${host} ne doit pas etre bloque`);
  }
});

test('NE DOIT JAMAIS ETRE BLOQUE : environnements de code en ligne', () => {
  for (const host of ['replit.com', 'codesandbox.io', 'stackblitz.com', 'trinket.io']) {
    assert.notEqual(verdict(host), 'blocked', `${host} ne doit pas etre bloque`);
  }
});

test('DOIT ETRE BLOQUE : portails de jeux, sous-domaines compris', () => {
  const fixtures = ['poki.com', 'www.poki.com', 'crazygames.com', 'coolmathgames.com', 'y8.com', 'now.gg', 'jeux.fr'];
  for (const host of fixtures) {
    assert.equal(verdict(host), 'blocked', `${host} doit etre bloque`);
  }
});

test('NON-REGRESSION : aucun suffixe public bloque hors opt-in explicite', () => {
  const offenders = blocked.filter((host) => psl.isPublicSuffix(host) && !optIn.has(host));
  assert.deepEqual(offenders, [], `suffixes publics bloques sans opt-in : ${offenders.join(', ')}`);
});

test('NON-REGRESSION : les hebergeurs de la PSL ne sont pas bloques en bloc', () => {
  for (const host of ['github.io', 'pages.dev', 'netlify.app', 'herokuapp.com', 'web.app']) {
    assert.equal(blockedSet.has(host), false, `${host} ne doit jamais figurer dans la liste bloquee`);
  }
});
