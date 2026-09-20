/**
 * Moteur de blocage - Firefox ESR.
 *
 * Firefox conserve `webRequest` en mode bloquant sous MV3 : la requete est
 * annulee AVANT toute connexion reseau, ce qui est un vrai blocage et non une
 * interruption de navigation. Aucune limite de nombre de regles, contrairement
 * a declarativeNetRequest : les 33 000+ hostnames tiennent dans un Set.
 *
 * Les listes sont importees STATIQUEMENT. Une event page MV3 peut redemarrer a
 * tout moment ; un chargement asynchrone laisserait passer les requetes arrivant
 * avant la fin du chargement. L'import statique est resolu avant l'execution de
 * ce corps de script, donc avant l'enregistrement du listener.
 *
 * Toute DECISION est prise ici : le detecteur ne fait que relever des signaux,
 * et la sonde en monde MAIN ne transmet que des booleens.
 */

import { blocked, allowed, generatedAt, digest } from '../rules/hostnames.js';
import { heuristics } from '../rules/heuristics.js';
import { createMatcher } from './core/matcher.js';
import { loadPolicy, watchPolicy } from './core/policy.js';
import { scorePage } from './core/heuristics.js';
import { createJournal } from './core/journal.js';

const api = globalThis.browser ?? globalThis.chrome;

const matcher = createMatcher({ blocked, allowed });
const journal = createJournal(api, heuristics.journal?.maxEntries);
const BLOCKED_PAGE = api.runtime.getURL('src/ui/blocked.html');

/** Derniere policy lue. */
let currentPolicy = { heuristicMode: 'observe', contact: '' };

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Affiche la page de blocage dans l'onglet concerne.
 * Appel volontairement non attendu : un listener bloquant doit repondre de
 * facon synchrone.
 */
function showBlockedPage(tabId, hostname, reason) {
  if (tabId === undefined || tabId < 0) return;
  const url = `${BLOCKED_PAGE}?h=${encodeURIComponent(hostname)}&r=${encodeURIComponent(reason)}`;
  Promise.resolve(api.tabs.update(tabId, { url })).catch(() => {
    // L'onglet a pu etre ferme entre-temps : la requete reste annulee.
  });
}

// --- Etage 1 : blocage reseau par liste ------------------------------------

function onBeforeRequest(details) {
  const hostname = hostnameOf(details.url);
  if (matcher.verdict(hostname) !== 'blocked') return {};

  if (details.type === 'main_frame') {
    showBlockedPage(details.tabId, hostname, 'liste');
  }
  // Les cadres imbriques sont annules sans redirection : remplacer le contenu
  // d'une iframe tierce par une page d'extension l'exposerait inutilement.
  return { cancel: true };
}

api.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame', 'sub_frame'] },
  ['blocking'],
);

// --- Etage 2 : signaux de page (anti-contournement et heuristique) ---------

/**
 * @param {object} message signaux releves par le detecteur
 * @param {object} sender contexte fourni par le navigateur, non falsifiable
 *   par la page : c'est lui qui fait foi pour l'URL, pas le message.
 */
async function handlePageSignals(message, sender) {
  const tabId = sender?.tab?.id;
  const frameUrl = sender?.url ?? sender?.tab?.url ?? '';
  const hostname = hostnameOf(frameUrl);
  if (hostname === '') return;

  // L'allowlist prime en toutes circonstances, y compris sur la sonde.
  if (matcher.verdict(hostname) === 'allowed') return;

  // Signature de proxy web : sans ambiguite, donc bloquee quel que soit le mode
  // heuristique. Un proxy dans un cadre imbrique justifie de bloquer l'onglet.
  if (message.proxy === true) {
    await journal.add({ hostname, reason: 'proxy', action: 'bloque' });
    showBlockedPage(tabId, hostname, 'proxy');
    return;
  }

  const result = scorePage({
    url: frameUrl,
    title: message.title,
    signals: message.signals,
    config: heuristics,
  });
  if (!result.shouldBlock) return;

  const topLevel = sender?.frameId === 0 || sender?.frameId === undefined;
  // Mode « observe » : on consigne sans bloquer. Hors cadre principal aussi :
  // un cadre tiers ne doit pas faire disparaitre la page qui l'heberge.
  const bloque = currentPolicy.heuristicMode === 'block' && topLevel;

  await journal.add({
    hostname,
    reason: 'heuristique',
    action: bloque ? 'bloque' : 'observe',
    score: result.score,
    matched: result.matched,
  });

  if (bloque) showBlockedPage(tabId, hostname, 'heuristique');
}

api.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'getBlockedPageContext') {
    return Promise.resolve({ contact: currentPolicy.contact ?? '', generatedAt });
  }

  if (message?.type === 'pageSignals') {
    handlePageSignals(message, sender).catch(() => {});
    return undefined;
  }

  if (message?.type === 'exportJournal') {
    return journal.export();
  }

  return undefined;
});

// --- Policy d'etablissement -----------------------------------------------

async function applyPolicy(policy) {
  currentPolicy = policy;
  matcher.setPolicyLists({ allow: policy.allowlist, block: policy.blocklist });
  const counts = matcher.counts;
  console.info(
    `[filtre-jeux] listes du ${generatedAt} (${digest.slice(0, 12)}) : ` +
    `${counts.blocked} bloques, ${counts.allowed} autorises, ` +
    `+${counts.policyAllow} autorises et +${counts.policyBlock} bloques par policy. ` +
    `Heuristique : ${policy.heuristicMode}.`,
  );
}

loadPolicy().then(applyPolicy).catch(() => {});
watchPolicy(applyPolicy);

// Revue hebdomadaire du mode observation, depuis la console du service de fond
// (about:debugging > Cette instance de Firefox > Inspecter).
globalThis.exporterJournal = () => journal.export().then((json) => console.log(json));
globalThis.viderJournal = () => journal.clear();
