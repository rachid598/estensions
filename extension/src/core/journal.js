/**
 * Journal local borne du mode observation.
 *
 * En mode « observe », l'heuristique ne bloque rien : elle consigne ce qu'elle
 * AURAIT bloque, pour que l'etablissement calibre les seuils sur une semaine de
 * classe avant de basculer en mode « block ».
 *
 * Le journal reste sur le poste et n'est jamais transmis. Il est borne par
 * rotation FIFO pour ne pas saturer le quota de storage.local.
 */

const CLE = 'journal';

export function createJournal(api, maxEntries = 200) {
  const limite = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 200;

  // Ecritures serialisees : `add` fait un lire-modifier-ecrire, et plusieurs
  // appels rapproches (une rafale de cadres imbriques, par exemple) se
  // perdraient mutuellement sans cette file.
  let file = Promise.resolve();

  async function lire() {
    try {
      const stored = await api.storage.local.get(CLE);
      return Array.isArray(stored?.[CLE]) ? stored[CLE] : [];
    } catch {
      return [];
    }
  }

  return {
    /** Ajoute une entree et fait tourner le journal. */
    add(entry) {
      file = file.then(async () => {
        const entries = await lire();
        entries.push({ at: new Date().toISOString(), ...entry });
        // Rotation FIFO : on ne garde que les `limite` dernieres entrees.
        const tronque = entries.slice(-limite);
        try {
          await api.storage.local.set({ [CLE]: tronque });
        } catch {
          // Quota atteint ou stockage indisponible : le filtrage continue.
        }
        return tronque.length;
      });
      return file;
    },

    /** Export JSON pour la revue hebdomadaire. */
    async export() {
      await file;
      return JSON.stringify(await lire(), null, 2);
    },

    async entries() {
      await file;
      return lire();
    },

    async clear() {
      file = file.then(async () => {
        try {
          await api.storage.local.remove(CLE);
        } catch {
          // Sans consequence.
        }
      });
      return file;
    },
  };
}
