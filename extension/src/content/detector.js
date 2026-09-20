/**
 * Detecteur - monde isole.
 *
 * Releve des signaux observables depuis le DOM, recoit le verdict booleen de la
 * sonde en monde MAIN, et transmet le tout au service de fond. Il ne DECIDE
 * rien : le score, les seuils et le blocage sont du ressort du service de fond,
 * ou la logique est unique et testable.
 */

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const EVENT_NAME = 'filtre-jeux:sonde';

  const signaux = {
    engineDom: false,
    engineGlobal: false,
    bigCanvas: false,
  };

  let proxyDetecte = false;
  let dernierEnvoi = '';

  const ENGINE_SCRIPTS = [
    'ruffle', 'unityloader', 'unitywebgl', 'phaser.min.js', 'phaser.js', 'godot',
    'c2runtime', 'c3runtime', 'construct', 'createjs', 'gamemaker', 'html5game', 'swfobject',
  ];
  const EMBED_EXTENSIONS = ['.swf', '.unity3d'];

  function releverDom() {
    try {
      for (const script of document.scripts) {
        const src = (script.src || '').toLowerCase();
        if (src !== '' && ENGINE_SCRIPTS.some((motif) => src.includes(motif))) {
          signaux.engineDom = true;
          break;
        }
      }

      if (!signaux.engineDom) {
        for (const element of document.querySelectorAll('embed[src], object[data]')) {
          const source = (element.getAttribute('src') || element.getAttribute('data') || '').toLowerCase();
          if (EMBED_EXTENSIONS.some((extension) => source.includes(extension))) {
            signaux.engineDom = true;
            break;
          }
        }
      }

      const aireVue = window.innerWidth * window.innerHeight;
      if (aireVue > 0) {
        for (const canvas of document.querySelectorAll('canvas')) {
          const rect = canvas.getBoundingClientRect();
          if ((rect.width * rect.height) / aireVue >= 0.6) {
            signaux.bigCanvas = true;
            break;
          }
        }
      }
    } catch {
      // Un DOM partiel ou un acces refuse ne doit jamais casser la page.
    }
  }

  function envoyer() {
    const empreinte = `${proxyDetecte}|${signaux.engineDom}|${signaux.engineGlobal}|${signaux.bigCanvas}`;
    // Rien de nouveau : inutile de reveiller le service de fond.
    if (empreinte === dernierEnvoi) return;
    if (!proxyDetecte && !signaux.engineDom && !signaux.engineGlobal && !signaux.bigCanvas) return;
    dernierEnvoi = empreinte;

    Promise.resolve(
      api.runtime.sendMessage({
        type: 'pageSignals',
        proxy: proxyDetecte,
        signals: { ...signaux },
        title: (document.title || '').slice(0, 300),
      }),
    ).catch(() => {
      // Service de fond endormi ou onglet en cours de fermeture.
    });
  }

  // Verdict de la sonde en monde MAIN : on n'accepte que des booleens vrais.
  document.addEventListener(EVENT_NAME, (event) => {
    const detail = event?.detail;
    if (typeof detail !== 'object' || detail === null) return;
    if (detail.proxy === true) proxyDetecte = true;
    if (detail.engine === true) signaux.engineGlobal = true;
    envoyer();
  });

  function passe() {
    releverDom();
    envoyer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', passe, { once: true });
  } else {
    passe();
  }
  // Les jeux se chargent souvent apres le document : quelques passages espaces.
  setTimeout(passe, 1500);
  setTimeout(passe, 5000);
})();
