# Un site utile est bloqué : que faire ?

Le filtre est réglé pour privilégier la précision : un faux positif qui prive
une classe de son outil est plus grave qu'un jeu qui passe. Un blocage indu doit
donc être corrigé vite, et la correction ne demande **ni réinstallation, ni
régénération de l'extension**.

## Pour l'enseignant

Signaler au service informatique l'adresse affichée sur la page « Accès bloqué »
(elle est encadrée, en gras). Préciser l'usage pédagogique.

## Pour l'administrateur

### Correction immédiate, sans rebuild

Ajouter le domaine dans `ansible/group_vars/salles_informatiques.yml` :

```yaml
filtre_jeux_allowlist:
  - "site-a-debloquer.fr"
```

puis rejouer le playbook :

```sh
ansible-playbook -i inventory.ini site.yml
```

L'entrée passe par la policy `3rdparty`, lue directement par l'extension.
Elle couvre le domaine **et tous ses sous-domaines**, et prime sur toute autre
règle — liste UT1, heuristique et sonde anti-proxy comprises.

### Correction durable

Si le site a vocation à rester débloqué, l'ajouter aussi à `lists/allowlist.txt`
et régénérer :

```sh
npm run build:lists
npm run report:diff     # vérifier que seul ce domaine change
npm run check
```

L'entrée devient alors permanente, indépendamment de la policy.

## Diagnostiquer le motif du blocage

L'URL de la page de blocage porte le motif :

| Paramètre | Cause | Correction |
|---|---|---|
| `r=liste` | domaine présent dans la liste UT1 `games` ou la liste maison | allowlist |
| `r=proxy` | signature de proxy web détectée (`__uv$config`, `__scramjet$config`, `__bare$server`) | vérifier : un site pédagogique n'a aucune raison de contenir ces variables |
| `r=heuristique` | score de détection atteint | allowlist, puis signaler le cas pour ajuster `lists/heuristics.json` |

Un `r=proxy` sur un site légitime est anormal et mérite un examen : ces trois
variables sont propres aux proxys Ultraviolet et Scramjet. La détection ignore
volontairement le nom `sw.js` et la simple présence d'un service worker, que
Replit, CodeSandbox et JupyterLite enregistrent légitimement.

## À l'inverse : un jeu passe

Ajouter le domaine à `filtre_jeux_blocklist` pour un effet immédiat, puis à
`lists/custom-block.txt` pour le rendre permanent. Si le cas se répète sur un
site non répertorié, c'est la liste amont UT1 qui gagnerait à être enrichie :
<https://dsi.ut-capitole.fr/blacklists/>.
