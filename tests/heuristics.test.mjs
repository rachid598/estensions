import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scorePage } from '../extension/src/core/heuristics.js';

const config = JSON.parse(readFileSync(new URL('../lists/heuristics.json', import.meta.url), 'utf8'));
const score = (input) => scorePage({ ...input, config });

test('un moteur de jeu SEUL ne bloque jamais', () => {
  // Une simulation pedagogique Unity sur un site academique.
  const result = score({
    url: 'https://sciences.ac-exemple.fr/simulation/pendule',
    title: 'Simulation du pendule simple',
    signals: { engineGlobal: true, bigCanvas: true },
  });
  assert.equal(result.hasEngine, true);
  assert.equal(result.hasLexical, false);
  assert.equal(result.shouldBlock, false);
});

test('un signal lexical SEUL ne bloque jamais', () => {
  const result = score({
    url: 'https://www.exemple.fr/jeux/regles',
    title: 'Les jeux en ligne : un dossier pédagogique',
    signals: {},
  });
  assert.equal(result.hasLexical, true);
  assert.equal(result.hasEngine, false);
  assert.equal(result.shouldBlock, false);
});

test('moteur ET lexical : blocage', () => {
  const result = score({
    url: 'https://exemple.fr/unblocked/tetris',
    title: 'Unblocked Games - play free games',
    signals: { engineDom: true, bigCanvas: true },
  });
  assert.equal(result.shouldBlock, true);
  assert.ok(result.score >= config.threshold);
});

test('FAUX POSITIF EVITE : « jeu » ne declenche pas sur « enjeux »', () => {
  const result = score({
    url: 'https://www.exemple.fr/enjeux-pedagogiques/simulation',
    title: 'Enjeux pédagogiques de la simulation',
    signals: { engineGlobal: true, bigCanvas: true },
  });
  assert.equal(result.hasLexical, false, 'enjeux ne doit pas compter comme le mot jeu');
  assert.equal(result.shouldBlock, false);
});

test('la frontiere de mot reconnait bien le mot isole', () => {
  const avec = score({ url: 'https://exemple.fr/jeu/123', title: '', signals: { engineDom: true } });
  assert.equal(avec.hasLexical, true);
  assert.equal(avec.shouldBlock, true);
});

test('le detail du score est expose pour la revue du mode observation', () => {
  const result = score({
    url: 'https://exemple.fr/games/',
    title: 'Free online games',
    signals: { engineDom: true, engineGlobal: true, bigCanvas: true },
  });
  assert.deepEqual(result.matched.sort(), ['bigCanvas', 'engineDom', 'engineGlobal', 'lexicalTitle', 'lexicalUrl']);
});
