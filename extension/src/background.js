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
 */

import { blocked, allowed, generatedAt, digest } from '../rules/hostnames.js';
import { createMatcher } from './core/matcher.js';
import { loadPolicy, watchPolicy } from './core/policy.js';

const api = globalThis.browser ?? globalThis.chrome;

const matcher = createMatcher({ blocked, allowed });
const BLOCKED_PAGE = api.runtime.getURL('src/ui/blocked.html');

/** Derniere policy lue, exposee a la page de blocage. */
let currentPolicy = null;

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Affiche la page de blocage dans l'onglet concerne.
 * Appel volontairement non attendu : le listener bloquant doit repondre de
 * facon synchrone.
 */
function showBlockedPage(tabId, hostname) {
  if (tabId === undefined || tabId < 0) return;
  const url = `${BLOCKED_PAGE}?h=${encodeURIComponent(hostname)}`;
  Promise.resolve(api.tabs.update(tabId, { url })).catch(() => {
    // L'onglet a pu etre ferme entre-temps : la requete reste annulee.
  });
}

function onBeforeRequest(details) {
  const hostname = hostnameOf(details.url);
  if (matcher.verdict(hostname) !== 'blocked') return {};

  if (details.type === 'main_frame') {
    showBlockedPage(details.tabId, hostname);
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

/** La page de blocage demande le contact a afficher. */
api.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'getBlockedPageContext') return undefined;
  return Promise.resolve({
    contact: currentPolicy?.contact ?? '',
    generatedAt,
  });
});

async function applyPolicy(policy) {
  currentPolicy = policy;
  matcher.setPolicyLists({ allow: policy.allowlist, block: policy.blocklist });
  const counts = matcher.counts;
  console.info(
    `[filtre-jeux] listes du ${generatedAt} (${digest.slice(0, 12)}) : ` +
    `${counts.blocked} bloques, ${counts.allowed} autorises, ` +
    `+${counts.policyAllow} autorises et +${counts.policyBlock} bloques par policy.`,
  );
}

loadPolicy().then(applyPolicy).catch(() => {});
watchPolicy(applyPolicy);
