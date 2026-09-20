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

const parametres = new URLSearchParams(window.location.search);
const hostname = parametres.get('h') ?? '';
document.getElementById('domaine').textContent = hostname || 'domaine inconnu';

/** Motifs connus. Toute valeur inattendue retombe sur le texte generique. */
const MOTIFS = {
  liste: "Ce site est classé parmi les sites de jeux en ligne. Il n'est pas accessible "
    + 'depuis les postes des salles informatiques.',
  proxy: 'Ce site a été identifié comme un service de contournement du filtrage. '
    + "Il n'est pas accessible depuis les postes des salles informatiques.",
  heuristique: 'Ce site a été détecté comme proposant des jeux en ligne. '
    + "Il n'est pas accessible depuis les postes des salles informatiques.",
};

const motif = MOTIFS[parametres.get('r')];
if (motif) document.getElementById('motif').textContent = motif;

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
