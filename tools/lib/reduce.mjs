/**
 * Reduction et couverture des ensembles de hostnames.
 *
 * Semantique de base, partagee avec le moteur d'execution : un hostname liste
 * couvre automatiquement tous ses sous-domaines. `exemple.com` bloque donc
 * `www.exemple.com` sans qu'il faille l'enumerer.
 *
 * Deux verrous encadrent toute remontee vers un domaine parent :
 *   1. PSL         : jamais au-dessus d'un suffixe public
 *                    (`jeu123.github.io` ne devient jamais `github.io`) ;
 *   2. parent liste: on ne fusionne que si le parent est lui-meme dans la liste,
 *                    et jamais dans un hebergeur mutualise connu.
 */

/** Ancetres de `host`, du plus proche au domaine enregistrable inclus. */
export function* ancestorsWithinRegistrable(host, psl, sharedHosts = new Set()) {
  const registrable = psl.registrableDomain(host);
  if (registrable === null || registrable === host) return;

  const labels = host.split('.');
  const highestIndex = labels.length - registrable.split('.').length;

  for (let i = 1; i <= highestIndex; i++) {
    const ancestor = labels.slice(i).join('.');
    // On ne se fusionne jamais dans un hebergeur mutualise, ni au-dessus de lui.
    if (sharedHosts.has(ancestor)) return;
    yield ancestor;
  }
}

/** Vrai si un ancetre de `host` appartient deja a `set`. */
export function isCoveredByAncestor(host, set, psl, sharedHosts = new Set()) {
  for (const ancestor of ancestorsWithinRegistrable(host, psl, sharedHosts)) {
    if (set.has(ancestor)) return true;
  }
  return false;
}

/** Supprime les entrees redondantes avec une autre entree du meme ensemble. */
export function reduce(hosts, psl, sharedHosts = new Set()) {
  const kept = new Set();
  for (const host of hosts) {
    if (!isCoveredByAncestor(host, hosts, psl, sharedHosts)) kept.add(host);
  }
  return kept;
}

/**
 * Vrai si `host` est couvert par `set`, directement ou par un de ses ancetres.
 * Contrairement a `isCoveredByAncestor`, la remontee n'est bornee ni par la PSL
 * ni par les hebergeurs mutualises : c'est la semantique de couverture du
 * moteur d'execution, ou une entree couvre tous ses sous-domaines.
 */
export function isCoveredBySet(host, set) {
  const labels = host.split('.');
  for (let i = 0; i < labels.length; i++) {
    if (set.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}
