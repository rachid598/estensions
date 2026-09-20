# Filtre Jeux

Extension de filtrage des sites de jeux en ligne pour les salles informatiques
d'un collège, déployée par Ansible sur un parc Windows et verrouillée par les
politiques d'entreprise des navigateurs.

Objectif directeur : **bloquer les jeux sans jamais bloquer un site utile à un
élève ou à un enseignant**. Un faux positif sur Scratch, GeoGebra ou Lumni est
plus grave qu'un jeu qui passe temporairement.

## État

Jalon 1 en place : chaîne de compilation des listes, garde-fous et tests.
L'extension elle-même (jalon 2) n'est pas encore écrite.

## Chaîne de compilation

```sh
npm run build:lists      # télécharge, normalise, réduit, émet les artefacts
npm run build:lists -- --offline   # rejoue depuis le cache .cache/
npm run report:diff      # audit : ce que ce build change par rapport à git HEAD
npm test                 # tests unitaires et non-régressions
```

Artefacts produits dans `extension/rules/` :

| Fichier | Rôle |
|---|---|
| `hostnames.json` | liste complète — moteur à `Set` (Firefox ESR, et Chromium si `webRequestBlocking`) |
| `dnr-rules.json` | règles `declarativeNetRequest` — Chromium par défaut (non versionné, 6,3 Mo) |
| `build-report.json` | mesures, avertissements et décisions du build |

## Mesure du 2026-09-20

```
33 760 brut → 33 719 uniques → 33 719 après réduction → 33 717 après allowlist
            → 33 758 règles DNR = 33 717 « block » + 41 « allow »
```

Deux constats, tous deux mesurés et non supposés :

1. **La réduction ne gagne rien en volume : 0 entrée.** La liste UT1 `games`
   contient 30 527 domaines apex et 3 188 sous-domaines, et aucun de ces
   sous-domaines n'a son domaine enregistrable également présent. Il n'y a rien
   à fusionner. La réduction reste un **garde-fou de correction**, pas un levier.
2. **Le budget DNR de Chromium ne tient pas** : 33 758 règles contre 30 000
   garanties par extension. Le build échoue volontairement plutôt que de laisser
   le navigateur tronquer le filtrage en silence.

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
- **Allowlist prioritaire** — `lists/allowlist.txt` prime en toutes circonstances.

## Listes amont

Catégorie `games` des **blacklists de l'Université Toulouse 1 Capitole**
(Fabrice Prigent), sous licence **Creative Commons BY-SA**. Source officielle :
<https://dsi.ut-capitole.fr/blacklists/>. Le build consomme le miroir GitHub
officiel `olbat/ut1-blacklists`, synchronisé quotidiennement.

La Public Suffix List (`lists/vendor/public_suffix_list.dat`) est publiée par
Mozilla sous licence MPL 2.0.
