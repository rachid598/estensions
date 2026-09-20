# Kwartz : le deuxième filet

L'extension ne protège que Firefox, sur les postes où elle est installée. Le
filtrage réseau de Kwartz couvre ce qu'elle ne peut pas atteindre : navigateur
portable sur clé USB, poste démarré sur un autre système, application native,
navigateur oublié sur un poste hors périmètre.

Les deux couches consomment **la même source** — la catégorie `games` des
blacklists de l'Université Toulouse 1 Capitole — donc elles restent cohérentes :
un domaine bloqué par l'une l'est par l'autre, et un faux positif se corrige au
même endroit en amont.

## Importer la liste dans Kwartz

Kwartz consomme nativement les blacklists UT1. Dans l'interface d'administration
du filtrage, activer la catégorie **`games`**, et **seulement** celle-ci : les
catégories `gambling`, `vpn` et `arjel` sont hors du périmètre décidé pour ce
projet.

Ne pas activer de catégories supplémentaires sans les passer au même crible que
l'allowlist de l'extension : la catégorie `games` d'UT1 contient déjà des sites
que des enseignants utilisent, ce qui est précisément la raison d'être de
`lists/allowlist.txt`.

## Reporter l'allowlist

Les exceptions pédagogiques doivent exister **des deux côtés**, sans quoi un
site débloqué dans Firefox resterait bloqué par le réseau. Reporter dans la
liste blanche de Kwartz le contenu de `lists/allowlist.txt`, ainsi que les
domaines de `filtre_jeux_allowlist`.

La liste compilée est directement exploitable :

```sh
python3 -c "import json;print('\n'.join(json.load(open('extension/rules/hostnames.json'))['allowed']))"
```

## Répartition des rôles

| | Extension | Kwartz |
|---|---|---|
| Portée | Firefox, postes gérés | tout le trafic du réseau |
| Granularité | page, cadre, signature d'exécution | domaine |
| Détecte les proxys web | oui, par signature | non |
| Couvre les navigateurs portables | non | oui |
| Correction d'un faux positif | immédiate, par policy | via l'interface Kwartz |

La détection des proxys web (Ultraviolet, Scramjet) est le point que seule
l'extension traite : ces services changent de domaine chaque semaine et
échappent par construction à un filtrage par liste de domaines.
