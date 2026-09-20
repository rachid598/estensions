# Filtre Jeux

Extension de filtrage des sites de jeux en ligne pour les salles informatiques
d'un collège, déployée par Ansible sur un parc Windows et verrouillée par les
politiques d'entreprise des navigateurs.

Objectif directeur : **bloquer les jeux sans jamais bloquer un site utile à un
élève ou à un enseignant**. Un faux positif sur Scratch, GeoGebra ou Lumni est
plus grave qu'un jeu qui passe temporairement.

## État

Jalons 1 et 2 en place : chaîne de compilation des listes, et moteur de blocage
Firefox ESR. Restent les modules anti-contournement et heuristique (jalon 3),
l'empaquetage signé (jalon 4) et le rôle Ansible (jalon 5).

**Cible : Firefox ESR uniquement.** Chrome et Edge sont hors périmètre — voir
« Pourquoi pas Chromium » plus bas. Le manifeste exige **Firefox 140 ou
supérieur** : c'est la première version acceptant `data_collection_permissions`,
clé désormais obligatoire pour faire signer une extension par AMO. Le rôle
Ansible devra vérifier la version installée avant de déployer.

## Chaîne de compilation

```sh
npm run build:lists      # télécharge, normalise, réduit, émet les artefacts
npm run build:lists -- --offline   # rejoue depuis le cache .cache/
npm run report:diff      # audit : ce que ce build change par rapport à git HEAD
npm run lint             # validation du manifeste et des sources (web-ext)
npm test                 # 37 tests : unitaires, non-régressions, intégration
npm run check            # les trois enchaînés
```

Artefacts produits dans `extension/rules/` :

| Fichier | Rôle |
|---|---|
| `hostnames.json` | liste complète — moteur à `Set` (Firefox ESR, et Chromium si `webRequestBlocking`) |
| `hostnames.js` | même contenu en module ES, importé statiquement par l'extension (non versionné) |
| `build-report.json` | mesures, avertissements et décisions du build |

## Mesure du 2026-09-20

```
33 760 brut → 33 719 uniques → 33 719 après réduction → 33 717 après allowlist
            → 33 717 hostnames bloqués + 41 autorisés
```

Deux constats, tous deux mesurés et non supposés :

1. **La réduction ne gagne rien en volume : 0 entrée.** La liste UT1 `games`
   contient 30 527 domaines apex et 3 188 sous-domaines, et aucun de ces
   sous-domaines n'a son domaine enregistrable également présent. Il n'y a rien
   à fusionner. La réduction reste un **garde-fou de correction**, pas un levier.
2. **Le budget DNR de Chromium ne tenait pas** : la même liste donnait 33 758
   règles `declarativeNetRequest` contre 30 000 garanties par extension.

## Pourquoi pas Chromium

Chrome ne garantit que 30 000 règles statiques par extension ; au-delà, la
couverture dépend d'un pool global partagé et peut être tronquée sans le moindre
signal. Aucune réduction ne permettait de passer sous ce seuil sans supprimer
arbitrairement des milliers de domaines de jeux réels.

Firefox, lui, conserve `webRequest` en mode **bloquant** sous MV3 : la requête
est annulée avant toute connexion réseau, sans aucune limite de nombre d'entrées.
Les 33 717 hostnames tiennent dans un `Set`.

Le parc a donc été recentré sur Firefox ESR, Chrome et Edge étant neutralisés au
niveau du poste. Le volet `declarativeNetRequest` a été retiré du build plutôt
que maintenu à vide ; il reste consultable dans l'historique git.

## Garde-fous

- **Verrou PSL** — aucune réduction ne remonte au-dessus d'un suffixe public :
  `jeu123.github.io` ne devient jamais `github.io`. Voir `tools/lib/psl.mjs`.
- **Verrou « parent listé »** — un sous-domaine n'est fusionné que si son parent
  figure lui-même dans la liste amont.
- **Hébergeurs mutualisés** — `lists/shared-hosts.txt` recense les plateformes
  multi-locataires absentes de la PSL (`itch.io`, `glitch.me`…) : on ne s'y
  fusionne jamais.
- **Suffixes publics listés en amont** — refusés par défaut ; opt-in explicite
  dans `lists/public-suffix-block-optin.txt`. Six DNS dynamiques dédiés aux
  serveurs de jeu y sont acceptés.
- **Allowlist prioritaire** — `lists/allowlist.txt` prime en toutes circonstances,
  y compris sur les sous-domaines : allowlister `larousse.fr` débloque aussi
  `jeux.larousse.fr`. Règle assumée : un faux positif qui prive une classe de son
  outil est plus grave qu'un jeu qui passe.
- **Listes d'établissement** — la policy `3rdparty.Extensions` de `policies.json`
  permet d'ajouter un domaine à l'allowlist ou à la liste noire **sans
  régénérer ni redéployer** l'extension.

## Vérifications faites, et celle qui reste

Faites ici : 37 tests (`npm test`), dont les non-régressions de réduction et les
fixtures « ne doit jamais être bloqué » ; validation du manifeste et des sources
par `web-ext lint` (0 erreur, 0 alerte) ; test d'intégration du moteur avec une
API WebExtension simulée.

**Pas encore faite : l'exécution dans un vrai Firefox ESR.** Aucun Firefox n'est
installé dans l'environnement de développement. Un essai sur le poste pilote
reste indispensable avant tout déploiement.

## Listes amont

Catégorie `games` des **blacklists de l'Université Toulouse 1 Capitole**
(Fabrice Prigent), sous licence **Creative Commons BY-SA**. Source officielle :
<https://dsi.ut-capitole.fr/blacklists/>. Le build consomme le miroir GitHub
officiel `olbat/ut1-blacklists`, synchronisé quotidiennement.

La Public Suffix List (`lists/vendor/public_suffix_list.dat`) est publiée par
Mozilla sous licence MPL 2.0.
