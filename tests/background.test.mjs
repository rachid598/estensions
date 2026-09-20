import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test d'integration du moteur de blocage.
 *
 * Aucun Firefox n'est disponible dans l'environnement de developpement : on
 * simule l'API WebExtension pour verifier le comportement reel du service de
 * fond. Cela ne remplace PAS un essai sur un Firefox ESR reel, qui reste a faire
 * sur le poste pilote.
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

const localStore = new Map();

/** Laisse se resoudre les chaines de promesses du service de fond. */
const rendreLaMain = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
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
      local: {
        get: async (key) => (localStore.has(key) ? { [key]: localStore.get(key) } : {}),
        set: async (items) => { for (const [k, v] of Object.entries(items)) localStore.set(k, v); },
        remove: async (key) => { localStore.delete(key); },
      },
      onChanged: { addListener: (fn) => { calls.policyWatchers.push(fn); } },
    },
  };

  await import('../extension/src/background.js');
  await rendreLaMain();
});

beforeEach(() => {
  calls.tabsUpdates.length = 0;
});

const request = (url, type = 'main_frame', tabId = 7) => calls.webRequestListener({ url, type, tabId });

const signaux = (overrides = {}) => calls.messageListener(
  { type: 'pageSignals', proxy: false, signals: {}, title: '', ...overrides.message },
  { tab: { id: 7 }, url: overrides.url ?? 'https://exemple.fr/', frameId: overrides.frameId ?? 0 },
);

const journal = async () => {
  const json = await calls.messageListener({ type: 'exportJournal' }, {});
  return JSON.parse(json);
};

// --- Etage 1 : blocage reseau par liste ------------------------------------

test('le listener est enregistre en mode bloquant, des le chargement du module', () => {
  assert.equal(typeof calls.webRequestListener, 'function');
  assert.deepEqual(calls.webRequestExtra, ['blocking']);
  assert.deepEqual(calls.webRequestFilter.types, ['main_frame', 'sub_frame']);
  assert.deepEqual(calls.webRequestFilter.urls, ['http://*/*', 'https://*/*']);
});

test('une requete vers un site de jeux est annulee et la page de blocage affichee', async () => {
  assert.deepEqual(request('https://www.crazygames.com/jeu/xyz'), { cancel: true });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 1);
  assert.equal(calls.tabsUpdates[0].tabId, 7);
  assert.equal(
    calls.tabsUpdates[0].props.url,
    'moz-extension://test/src/ui/blocked.html?h=www.crazygames.com&r=liste',
  );
});

test('un cadre imbrique est annule SANS exposer la page d\'extension', async () => {
  assert.deepEqual(request('https://www.crazygames.com/embed/xyz', 'sub_frame'), { cancel: true });
  await rendreLaMain();
  assert.equal(calls.tabsUpdates.length, 0);
});

test('un site pedagogique passe sans entrave', () => {
  for (const url of ['https://scratch.mit.edu/projects/1', 'https://www.geogebra.org/', 'https://fr.wikipedia.org/wiki/Jeu']) {
    assert.deepEqual(request(url), {}, `${url} doit passer`);
  }
});

test('la policy d\'etablissement est appliquee : ajout et exception', () => {
  assert.deepEqual(request('https://poki.com/fr'), {});
  assert.deepEqual(request('https://exemple-jeu.fr/'), { cancel: true });
});

test('une URL non analysable ne bloque rien', () => {
  assert.deepEqual(calls.webRequestListener({ url: 'pas-une-url', type: 'main_frame', tabId: 7 }), {});
});

test('la page de blocage recupere son contexte', async () => {
  const context = await calls.messageListener({ type: 'getBlockedPageContext' }, {});
  assert.equal(context.contact, 'assistance@college.example.fr');
  assert.match(context.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

// --- Etage 2 : anti-contournement ------------------------------------------

test('une signature de proxy web bloque, meme en mode observation', async () => {
  signaux({ message: { proxy: true }, url: 'https://proxy-inconnu.example/uv/service/abc' });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 1);
  assert.match(calls.tabsUpdates[0].props.url, /r=proxy$/);
});

test('un proxy dans un cadre imbrique bloque tout l\'onglet', async () => {
  signaux({ message: { proxy: true }, url: 'https://proxy-inconnu.example/uv/', frameId: 3 });
  await rendreLaMain();
  assert.equal(calls.tabsUpdates.length, 1);
});

test('SECURITE : une page hostile qui forge l\'evenement ne debloque jamais un site allowliste', async () => {
  // scratch.mit.edu est allowliste : meme en se declarant proxy, il n'est pas bloque.
  signaux({ message: { proxy: true }, url: 'https://scratch.mit.edu/projects/1' });
  // Et meme en se declarant jeu avec tous les signaux.
  signaux({
    message: { proxy: false, signals: { engineDom: true, engineGlobal: true, bigCanvas: true }, title: 'unblocked games' },
    url: 'https://scratch.mit.edu/jeux/',
  });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 0, 'un site allowliste ne doit jamais etre bloque');
});

test('SECURITE : forger l\'evenement ne peut provoquer que son propre blocage', async () => {
  signaux({ message: { proxy: true }, url: 'https://site-hostile.example/' });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 1);
  assert.match(calls.tabsUpdates[0].props.url, /h=site-hostile\.example/);
});

// --- Etage 3 : heuristique --------------------------------------------------

test('en mode observation, l\'heuristique journalise SANS bloquer', async () => {
  signaux({
    message: { signals: { engineDom: true, bigCanvas: true }, title: 'Unblocked Games' },
    url: 'https://jeu-inconnu.example/unblocked/',
  });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 0);
  const entrees = await journal();
  const derniere = entrees.at(-1);
  assert.equal(derniere.reason, 'heuristique');
  assert.equal(derniere.action, 'observe');
  assert.equal(derniere.hostname, 'jeu-inconnu.example');
});

test('une page pedagogique a moteur Unity ne declenche rien, meme journalise', async () => {
  const avant = (await journal()).length;
  signaux({
    message: { signals: { engineGlobal: true, bigCanvas: true }, title: 'Simulation du pendule' },
    url: 'https://sciences.ac-exemple.fr/enjeux-pedagogiques/pendule',
  });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 0);
  assert.equal((await journal()).length, avant, 'rien ne doit etre journalise');
});

test('en mode blocage, l\'heuristique bloque le cadre principal', async () => {
  POLICY.heuristicMode = 'block';
  for (const watcher of calls.policyWatchers) watcher({}, 'managed');
  await rendreLaMain();

  signaux({
    message: { signals: { engineDom: true }, title: 'Unblocked Games' },
    url: 'https://autre-jeu.example/unblocked/',
  });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 1);
  assert.match(calls.tabsUpdates[0].props.url, /r=heuristique$/);
});

test('en mode blocage, un cadre imbrique est journalise mais ne fait pas disparaitre la page hote', async () => {
  signaux({
    message: { signals: { engineDom: true }, title: 'Unblocked Games' },
    url: 'https://cadre-jeu.example/unblocked/',
    frameId: 4,
  });
  await rendreLaMain();

  assert.equal(calls.tabsUpdates.length, 0);
  assert.equal((await journal()).at(-1).action, 'observe');
});

test('le journal est borne par rotation FIFO, sans perte en rafale', async () => {
  // Plus que la limite, et sans attendre entre les envois : c'est le cas qui
  // faisait perdre des entrees avant la serialisation des ecritures.
  const total = 250;
  for (let i = 0; i < total; i += 1) {
    signaux({ message: { proxy: true }, url: `https://proxy-${i}.example/uv/` });
  }
  await rendreLaMain();

  const entrees = await journal();
  assert.equal(entrees.length, 200, 'le journal doit etre exactement a sa limite');
  // Rotation FIFO : ce sont les DERNIERES entrees qui sont conservees.
  assert.equal(entrees.at(-1).hostname, `proxy-${total - 1}.example`);
  assert.equal(entrees.at(0).hostname, `proxy-${total - 200}.example`);
});
