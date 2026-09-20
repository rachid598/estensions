/**
 * Sonde anti-contournement - monde MAIN.
 *
 * Les content scripts vivent par defaut dans un monde JavaScript isole et ne
 * voient pas les variables creees par la page. Detecter `__uv$config` impose
 * donc de s'executer dans le monde de la page.
 *
 * ATTENTION : ce monde est PARTAGE avec la page. Ce n'est pas une frontiere de
 * securite. La page peut lire, perturber ou neutraliser ce script. D'ou trois
 * regles strictes :
 *
 *   1. ce script n'a AUCUN privilege : ni acces aux API de l'extension, ni
 *      capacite de decision ;
 *   2. il ne transmet QUE des booleens. Aucune URL, aucun contenu, aucun code
 *      de la page ne traverse la frontiere ;
 *   3. la decision finale appartient au monde isole, puis au service de fond.
 *
 * Consequence assumee : une page hostile peut forger l'evenement. Elle ne
 * provoque alors que son PROPRE blocage, jamais un deblocage, puisqu'un verdict
 * de sonde ne fait qu'ajouter du soupcon et ne franchit jamais l'allowlist.
 */

(() => {
  const EVENT_NAME = 'filtre-jeux:sonde';

  // Signatures de proxys web. Volontairement restreintes aux globales propres a
  // Ultraviolet et Scramjet : on ne detecte ni sur le nom `sw.js`, ni sur la
  // simple presence d'un service worker, que des environnements de code en
  // ligne legitimes enregistrent en cours.
  const PROXY_GLOBALS = ['__uv$config', '__scramjet$config', '__bare$server', '__uv', '__scramjet'];

  const ENGINE_GLOBALS = [
    'unityInstance', 'UnityLoader', 'createUnityInstance', 'Godot',
    'c2runtime', 'c3runtime', 'Phaser', 'RufflePlayer', 'GameMaker_Init',
  ];

  const hasAny = (names) => names.some((name) => {
    try {
      return typeof window[name] !== 'undefined';
    } catch {
      return false;
    }
  });

  let proxyReported = false;
  let engineReported = false;

  function report() {
    const proxy = !proxyReported && hasAny(PROXY_GLOBALS);
    const engine = !engineReported && hasAny(ENGINE_GLOBALS);
    if (!proxy && !engine) return false;

    if (proxy) proxyReported = true;
    if (engine) engineReported = true;

    // Charge utile minimale : deux booleens, rien d'autre.
    document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { proxy, engine } }));
    return proxyReported && engineReported;
  }

  // Un proxy ou un moteur de jeu s'initialise souvent apres le chargement :
  // quelques passages espaces, puis on s'arrete.
  const DELAIS = [0, 250, 1000, 3000, 8000];
  for (const delai of DELAIS) {
    if (delai === 0) {
      if (report()) break;
    } else {
      setTimeout(report, delai);
    }
  }
})();
