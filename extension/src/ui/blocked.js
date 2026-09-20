/**
 * Page de blocage.
 *
 * Aucun bouton de contournement, par construction : la seule voie de recours
 * passe par l'enseignant puis l'administrateur.
 *
 * Le hostname vient de la barre d'adresse et l'adresse de contact de la policy :
 * deux entrees externes, inserees exclusivement via `textContent`. Jamais
 * d'innerHTML ici.
 */

const api = globalThis.browser ?? globalThis.chrome;

const hostname = new URLSearchParams(window.location.search).get('h') ?? '';
document.getElementById('domaine').textContent = hostname || 'domaine inconnu';

const dateElement = document.getElementById('maj');
const contactElement = document.getElementById('contact');

api.runtime
  .sendMessage({ type: 'getBlockedPageContext' })
  .then((context) => {
    if (!context) return;

    if (context.generatedAt) {
      const date = new Date(context.generatedAt);
      if (!Number.isNaN(date.valueOf())) {
        dateElement.textContent = date.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }
    }

    if (context.contact) {
      contactElement.textContent = context.contact;
      contactElement.hidden = false;
    }
  })
  .catch(() => {
    // Le service de fond peut etre endormi : la page reste lisible sans ces details.
  });
