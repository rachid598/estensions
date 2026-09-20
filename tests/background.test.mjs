import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test d'integration du moteur de blocage.
 *
 * Aucun Firefox n'est disponible dans l'environnement de developpement : on
 * simule l'API WebExtension pour verifier le comportement reel du background
 * (enregistrement du listener, annulation des requetes, affichage de la page de
 * blocage, application de la policy). Cela ne remplace PAS un essai sur un
 * Firefox ESR reel, qui reste a faire sur le poste pilote.
 */

const calls = {
  webRequestListener: null,
  webRequestFilter: null,
  webRequestExtra: null,
  messageListener: null,
  tabsUpdates: [],
  policyWatchers: [],
};

const POLICY = {
  allowlist: ['poki.com'],
  blocklist: ['exemple-jeu.fr'],
  contact: 'assistance@college.example.fr',
  heuristicMode: 'observe',
};

before(async () => {
  globalThis.browser = {
    runtime: {
      getURL: (path) => `moz-extension://test/${path}`,
      onMessage: { addListener: (fn) => { calls.messageListener = fn; } },
    },
    webRequest: {
      onBeforeRequest: {
        addListener: (fn, filter, extra) => {
          calls.webRequestListener = fn;
          calls.webRequestFilter = filter;
          calls.webRequestExtra = extra;
        },
      },
    },
    tabs: {
      update: async (tabId, props) => { calls.tabsUpdates.push({ tabId, props }); },
    },
    storage: {
      managed: { get: async () => POLICY },
      onChanged: { addListener: (fn) => { calls.policyWatchers.push(fn); } },
    },
  };

  await import('../extension/src/background.js');
  // Laisse se resoudre loadPolicy().then(applyPolicy).
  await new Promise((resolve) => setImmediate(resolve));
});

const request = (url, type = 'main_frame', tabId = 7) => calls.webRequestListener({ url, type, tabId });

test('le listener est enregistre en mode bloquant, des le chargement du module', () => {
  assert.equal(typeof calls.webRequestListener, 'function');
  assert.deepEqual(calls.webRequestExtra, ['blocking']);
  assert.deepEqual(calls.webRequestFilter.types, ['main_frame', 'sub_frame']);
  assert.deepEqual(calls.webRequestFilter.urls, ['http://*/*', 'https://*/*']);
});

test('une requete vers un site de jeux est annulee et la page de blocage affichee', async () => {
  calls.tabsUpdates.length = 0;
  const result = request('https://www.crazygames.com/jeu/xyz');

  assert.deepEqual(result, { cancel: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.tabsUpdates.length, 1);
  assert.equal(calls.tabsUpdates[0].tabId, 7);
  assert.equal(
    calls.tabsUpdates[0].props.url,
    'moz-extension://test/src/ui/blocked.html?h=www.crazygames.com',
  );
});

test('un cadre imbrique est annule SANS exposer la page d\'extension', async () => {
  calls.tabsUpdates.length = 0;
  const result = request('https://www.crazygames.com/embed/xyz', 'sub_frame');

  assert.deepEqual(result, { cancel: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.tabsUpdates.length, 0);
});

test('un site pedagogique passe sans entrave', () => {
  for (const url of ['https://scratch.mit.edu/projects/1', 'https://www.geogebra.org/', 'https://fr.wikipedia.org/wiki/Jeu']) {
    assert.deepEqual(request(url), {}, `${url} doit passer`);
  }
});

test('la policy d\'etablissement est appliquee : ajout et exception', () => {
  // poki.com est dans la liste compilee, mais allowliste par la policy.
  assert.deepEqual(request('https://poki.com/fr'), {});
  // exemple-jeu.fr n'est dans aucune liste compilee, mais bloque par la policy.
  assert.deepEqual(request('https://exemple-jeu.fr/'), { cancel: true });
});

test('une URL non analysable ne bloque rien', () => {
  assert.deepEqual(calls.webRequestListener({ url: 'pas-une-url', type: 'main_frame', tabId: 7 }), {});
});

test('la page de blocage recupere son contexte', async () => {
  const context = await calls.messageListener({ type: 'getBlockedPageContext' });
  assert.equal(context.contact, 'assistance@college.example.fr');
  assert.match(context.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(calls.messageListener({ type: 'autre' }), undefined);
});
