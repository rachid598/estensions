/**
 * Lecture de la policy d'etablissement (storage.managed).
 *
 * Alimentee sous Firefox par la cle `3rdparty.Extensions` de policies.json,
 * deposee par Ansible. Elle permet d'ajouter un site a l'allowlist ou a la
 * liste noire, et de basculer le mode heuristique, SANS regenerer ni
 * redeployer l'extension : un enseignant signale, l'admin ajoute une ligne,
 * relance le playbook, l'effet est immediat.
 */

const api = globalThis.browser ?? globalThis.chrome;

export const DEFAULTS = Object.freeze({
  /** Domaines a ne jamais bloquer, en plus de l'allowlist compilee. */
  allowlist: [],
  /** Domaines a bloquer en plus de la liste compilee. */
  blocklist: [],
  /** 'observe' : l'heuristique journalise sans bloquer. 'block' : elle bloque. */
  heuristicMode: 'observe',
  /** Affiche sur la page de blocage, pour la procedure de faux positif. */
  contact: '',
});

const asHostList = (value) => (Array.isArray(value) ? value : [])
  .filter((entry) => typeof entry === 'string')
  .map((entry) => entry.trim().toLowerCase())
  .filter((entry) => entry !== '');

/** Ne retient que des valeurs de forme attendue : la policy est une entree externe. */
function sanitize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    allowlist: asHostList(source.allowlist),
    blocklist: asHostList(source.blocklist),
    heuristicMode: source.heuristicMode === 'block' ? 'block' : DEFAULTS.heuristicMode,
    contact: typeof source.contact === 'string' ? source.contact.slice(0, 200) : DEFAULTS.contact,
  };
}

/**
 * @returns {Promise<typeof DEFAULTS>} la policy, ou les valeurs par defaut.
 *   `storage.managed` leve une exception quand aucune policy n'est deployee
 *   (poste de developpement) : ce n'est pas une erreur.
 */
export async function loadPolicy() {
  try {
    const stored = await api.storage.managed.get(null);
    return sanitize(stored);
  } catch {
    return { ...DEFAULTS };
  }
}

/** Rappelle `handler` a chaque modification de la policy. */
export function watchPolicy(handler) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'managed') return;
    loadPolicy().then(handler).catch(() => {});
  });
}
