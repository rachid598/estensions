/**
 * Implementation minimale et sans dependance de l'algorithme de la Public Suffix List.
 * https://github.com/publicsuffix/list/wiki/Format
 *
 * Le verrou n'1 du projet repose entierement sur ce module : aucune reduction de
 * domaine ne doit jamais remonter au-dessus d'un suffixe public, faute de quoi
 * bloquer `jeu123.github.io` reviendrait a bloquer `github.io` tout entier.
 */

/**
 * @param {string} datText contenu brut de public_suffix_list.dat
 */
export function createPsl(datText) {
  const exact = new Set();
  const wildcard = new Set();
  const exception = new Set();

  for (const rawLine of datText.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) continue;
    // Une regle s'arrete au premier caractere blanc.
    const rule = line.split(/\s/)[0].toLowerCase();
    if (rule === '') continue;

    if (rule.startsWith('!')) exception.add(rule.slice(1));
    else if (rule.startsWith('*.')) wildcard.add(rule.slice(2));
    else exact.add(rule);
  }

  /**
   * Suffixe public d'un hostname deja normalise (minuscules, punycode).
   * @returns {string} le suffixe public ; `host` lui-meme s'il en est un.
   */
  function publicSuffix(host) {
    const labels = host.split('.');

    // Les regles d'exception l'emportent sur toutes les autres.
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      if (exception.has(candidate)) return labels.slice(i + 1).join('.');
    }

    // Sinon la regle qui l'emporte est celle qui compte le plus de labels :
    // on part donc du candidat le plus long.
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      if (exact.has(candidate)) return candidate;
      const rest = labels.slice(i + 1).join('.');
      if (rest !== '' && wildcard.has(rest)) return candidate;
    }

    // Regle implicite `*` : le dernier label.
    return labels[labels.length - 1];
  }

  /**
   * Domaine enregistrable (suffixe public + un label).
   * @returns {string|null} null si `host` est lui-meme un suffixe public
   *   (il n'a alors pas de proprietaire unique : on ne doit jamais s'y fusionner).
   */
  function registrableDomain(host) {
    const suffix = publicSuffix(host);
    if (host === suffix) return null;

    const labels = host.split('.');
    const suffixLabelCount = suffix.split('.').length;
    if (labels.length <= suffixLabelCount) return null;

    return labels.slice(labels.length - suffixLabelCount - 1).join('.');
  }

  function isPublicSuffix(host) {
    return publicSuffix(host) === host;
  }

  return { publicSuffix, registrableDomain, isPublicSuffix, ruleCount: exact.size + wildcard.size + exception.size };
}
