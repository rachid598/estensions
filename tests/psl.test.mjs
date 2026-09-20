import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPsl } from '../tools/lib/psl.mjs';

const psl = createPsl(readFileSync(new URL('../lists/vendor/public_suffix_list.dat', import.meta.url), 'utf8'));

test('un suffixe public n\'a pas de domaine enregistrable', () => {
  assert.equal(psl.registrableDomain('github.io'), null);
  assert.equal(psl.registrableDomain('co.uk'), null);
  assert.equal(psl.registrableDomain('com'), null);
});

test('NON-REGRESSION : jeu123.github.io ne remonte jamais a github.io', () => {
  assert.equal(psl.registrableDomain('jeu123.github.io'), 'jeu123.github.io');
  assert.equal(psl.registrableDomain('a.b.jeu123.github.io'), 'jeu123.github.io');
  assert.equal(psl.publicSuffix('jeu123.github.io'), 'github.io');
});

test('meme protection pour les autres hebergeurs presents dans la PSL', () => {
  assert.equal(psl.registrableDomain('jeu.pages.dev'), 'jeu.pages.dev');
  assert.equal(psl.registrableDomain('jeu.netlify.app'), 'jeu.netlify.app');
  assert.equal(psl.registrableDomain('jeu.herokuapp.com'), 'jeu.herokuapp.com');
});

test('domaines ordinaires', () => {
  assert.equal(psl.registrableDomain('www.exemple.com'), 'exemple.com');
  assert.equal(psl.registrableDomain('a.b.c.exemple.fr'), 'exemple.fr');
  assert.equal(psl.registrableDomain('foo.co.uk'), 'foo.co.uk');
});

test('regles joker et regles d\'exception', () => {
  // *.ck est un joker, !www.ck une exception.
  assert.equal(psl.publicSuffix('quelquechose.ck'), 'quelquechose.ck');
  assert.equal(psl.publicSuffix('www.ck'), 'ck');
  assert.equal(psl.registrableDomain('www.ck'), 'www.ck');
  assert.equal(psl.publicSuffix('city.kawasaki.jp'), 'kawasaki.jp');
});
