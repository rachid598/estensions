/**
 * Decision de filtrage : hostname -> verdict.
 *
 * Semantique de couverture : une entree couvre tous ses sous-domaines.
 * `exemple.com` bloque donc `www.exemple.com` sans qu'il faille l'enumerer.
 *
 * PRECEDENCE : l'allowlist prime TOUJOURS, sans exception. Un site allowliste
 * n'est jamais bloque, ni par la liste noire, ni par une liste d'etablissement,
 * ni plus tard par l'heuristique ou la sonde anti-proxy. C'est la regle qui
 * garantit qu'un faux positif ne peut pas priver une classe de son outil.
 */

/** Normalise un hostname : minuscules, sans point final, sans espaces. */
export function normalizeHostname(value) {
  if (typeof value !== 'string') return '';
  let host = value.trim().toLowerCase();
  while (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

/** Vrai si `host` ou l'un de ses ancetres appartient a l'un des ensembles. */
function coveredBy(host, sets) {
  const labels = host.split('.');
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    for (const set of sets) {
      if (set.has(candidate)) return true;
    }
  }
  return false;
}

const toSet = (values) => new Set(
  (Array.isArray(values) ? values : [])
    .map(normalizeHostname)
    .filter((host) => host !== ''),
);

/**
 * @param {{ blocked?: string[], allowed?: string[] }} lists listes compilees au build
 */
export function createMatcher({ blocked = [], allowed = [] } = {}) {
  const blockedSet = new Set(blocked);
  const allowedSet = new Set(allowed);

  // Listes ajoutees par la policy d'etablissement, modifiables sans rebuild.
  let policyAllowSet = new Set();
  let policyBlockSet = new Set();

  return {
    /** @returns {'allowed'|'blocked'|'unknown'} */
    verdict(rawHostname) {
      const host = normalizeHostname(rawHostname);
      // Un hostname sans point (localhost, intranet) n'est jamais filtre.
      if (host === '' || !host.includes('.')) return 'unknown';

      if (coveredBy(host, [policyAllowSet, allowedSet])) return 'allowed';
      if (coveredBy(host, [policyBlockSet, blockedSet])) return 'blocked';
      return 'unknown';
    },

    /** Applique les listes de la policy d'etablissement. */
    setPolicyLists({ allow = [], block = [] } = {}) {
      policyAllowSet = toSet(allow);
      policyBlockSet = toSet(block);
    },

    get counts() {
      return {
        blocked: blockedSet.size,
        allowed: allowedSet.size,
        policyAllow: policyAllowSet.size,
        policyBlock: policyBlockSet.size,
      };
    },
  };
}
