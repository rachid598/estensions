import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatcher, normalizeHostname } from '../extension/src/core/matcher.js';

const matcher = () => createMatcher({
  blocked: ['poki.com', 'jeu123.github.io', 'jeux.larousse.fr', 'itch.io'],
  allowed: ['scratch.mit.edu', 'larousse.fr'],
});

test('normalisation des hostnames', () => {
  assert.equal(normalizeHostname('  EXEMPLE.COM.  '), 'exemple.com');
  assert.equal(normalizeHostname('exemple.com..'), 'exemple.com');
  assert.equal(normalizeHostname(undefined), '');
});

test('une entree couvre ses sous-domaines', () => {
  const m = matcher();
  assert.equal(m.verdict('poki.com'), 'blocked');
  assert.equal(m.verdict('www.poki.com'), 'blocked');
  assert.equal(m.verdict('a.b.poki.com'), 'blocked');
  assert.equal(m.verdict('poki.com.'), 'blocked');
  assert.equal(m.verdict('POKI.COM'), 'blocked');
});

test('un domaine voisin n\'est pas capture', () => {
  const m = matcher();
  assert.equal(m.verdict('poki.community'), 'unknown');
  assert.equal(m.verdict('notpoki.com'), 'unknown');
  assert.equal(m.verdict('exemple.fr'), 'unknown');
});

test('PRECEDENCE : l\'allowlist prime toujours', () => {
  const m = matcher();
  // larousse.fr est allowliste, jeux.larousse.fr est bloque : l'allowlist gagne.
  assert.equal(m.verdict('jeux.larousse.fr'), 'allowed');
  assert.equal(m.verdict('scratch.mit.edu'), 'allowed');
});

test('la policy d\'etablissement ajoute sans rebuild', () => {
  const m = matcher();
  assert.equal(m.verdict('nouveau-jeu.fr'), 'unknown');

  m.setPolicyLists({ block: ['nouveau-jeu.fr'], allow: ['poki.com'] });
  assert.equal(m.verdict('nouveau-jeu.fr'), 'blocked');
  assert.equal(m.verdict('www.nouveau-jeu.fr'), 'blocked');
  // Une allowlist de policy prime aussi sur la liste compilee.
  assert.equal(m.verdict('poki.com'), 'allowed');
  assert.deepEqual(m.counts.policyAllow, 1);
});

test('la policy est nettoyee avant usage', () => {
  const m = matcher();
  m.setPolicyLists({ block: ['  JEU.FR  ', '', 42, null], allow: undefined });
  assert.equal(m.verdict('jeu.fr'), 'blocked');
  assert.equal(m.counts.policyBlock, 1);
});

test('les hostnames sans point ne sont jamais filtres', () => {
  const m = createMatcher({ blocked: ['localhost'], allowed: [] });
  assert.equal(m.verdict('localhost'), 'unknown');
  assert.equal(m.verdict(''), 'unknown');
});

test('NON-REGRESSION : bloquer jeu123.github.io ne bloque pas github.io', () => {
  const m = matcher();
  assert.equal(m.verdict('jeu123.github.io'), 'blocked');
  assert.equal(m.verdict('sous.jeu123.github.io'), 'blocked');
  assert.equal(m.verdict('github.io'), 'unknown');
  assert.equal(m.verdict('projet-eleve.github.io'), 'unknown');
});
