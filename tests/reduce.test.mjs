import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPsl } from '../tools/lib/psl.mjs';
import { reduce, isCoveredByAncestor, isCoveredBySet } from '../tools/lib/reduce.mjs';

const psl = createPsl(readFileSync(new URL('../lists/vendor/public_suffix_list.dat', import.meta.url), 'utf8'));
const shared = new Set(['itch.io', 'glitch.me', 'neocities.org']);
const sorted = (set) => [...set].sort();

test('un parent liste absorbe ses sous-domaines', () => {
  const hosts = new Set(['exemple.com', 'www.exemple.com', 'a.b.exemple.com']);
  assert.deepEqual(sorted(reduce(hosts, psl, shared)), ['exemple.com']);
});

test('VERROU 2 : sans parent liste, le hostname exact est conserve', () => {
  const hosts = new Set(['a.exemple.com', 'b.exemple.com']);
  assert.deepEqual(sorted(reduce(hosts, psl, shared)), ['a.exemple.com', 'b.exemple.com']);
  assert.equal(isCoveredByAncestor('a.exemple.com', hosts, psl, shared), false);
});

test('VERROU 1 : aucune fusion au-dessus d\'un suffixe public', () => {
  const hosts = new Set(['jeu123.github.io', 'autre.github.io', 'jeu.pages.dev']);
  assert.deepEqual(sorted(reduce(hosts, psl, shared)), ['autre.github.io', 'jeu.pages.dev', 'jeu123.github.io']);
});

test('aucune fusion dans un hebergeur mutualise absent de la PSL', () => {
  const hosts = new Set(['jeu.itch.io', 'autre.itch.io']);
  assert.deepEqual(sorted(reduce(hosts, psl, shared)), ['autre.itch.io', 'jeu.itch.io']);
});

test('un hebergeur mutualise liste en amont n\'absorbe pas ses sous-domaines', () => {
  // Legere redondance assumee : la correction primant sur le volume, on refuse
  // de fusionner dans un hote mutualise meme lorsqu'il est lui-meme liste.
  const hosts = new Set(['itch.io', 'jeu.itch.io']);
  assert.deepEqual(sorted(reduce(hosts, psl, shared)), ['itch.io', 'jeu.itch.io']);
});

test('isCoveredBySet applique la semantique du moteur : une entree couvre ses sous-domaines', () => {
  const set = new Set(['larousse.fr']);
  assert.equal(isCoveredBySet('larousse.fr', set), true);
  assert.equal(isCoveredBySet('jeux.larousse.fr', set), true);
  assert.equal(isCoveredBySet('larousse.com', set), false);
  // Contrairement a la reduction, cette couverture n'est bornee ni par la PSL
  // ni par les hebergeurs mutualises : c'est ce que fait le moteur a l'execution.
  assert.equal(isCoveredBySet('jeu.itch.io', new Set(['itch.io'])), true);
});
