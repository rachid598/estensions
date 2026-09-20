# Déploiement

Parc Windows non joint à un domaine, serveur Kwartz, pilotage Ansible.
Navigateur cible : **Firefox ESR 140 ou supérieur**.

## Vue d'ensemble

```
CI mensuelle          →  XPI signé par AMO  +  updates.json
        ↓
serveur du collège    →  https://filtrage.<college>.fr/
        ↓
Ansible               →  policies.json sur chaque poste
        ↓
Firefox ESR           →  extension force-installée, non désinstallable
```

## 1. Préparer la configuration

Éditer `config/deploiement.json` : `baseUrl`, `extensionId`, `contact`.
Reporter les mêmes valeurs dans `ansible/group_vars/salles_informatiques.yml`
(modèle dans `ansible/group_vars_example.yml`). Ce sont les seuls endroits à
modifier.

## 2. Obtenir un XPI signé

Firefox refuse d'installer une extension non signée, y compris par policy.
Le canal **`unlisted`** d'AMO signe l'extension **sans la publier ni la
référencer** sur le store public : la distribution reste auto-hébergée, seule la
signature est déléguée à Mozilla.

```sh
npm run build:lists
npm run check
npm run sign -- --api-key <AMO_JWT_ISSUER> --api-secret <AMO_JWT_SECRET>
npm run pack -- --version 2026.9.20 --xpi dist/<fichier signé>.xpi
```

Les identifiants AMO s'obtiennent sur <https://addons.mozilla.org/developers/addon/api/key/>.
En CI, les placer dans les secrets `AMO_JWT_ISSUER` et `AMO_JWT_SECRET` : le
workflow mensuel signe alors automatiquement.

## 3. Déposer sur le serveur

Copier dans la racine servie par `baseUrl` :

- `dist/filtre_jeux-<version>.xpi` — le fichier **signé**
- `dist/updates.json`

Contraintes : HTTPS obligatoire, et le `.xpi` doit être servi en
`application/x-xpinstall`. Un fichier servi en `text/plain` ou en `.zip` est
refusé par Firefox.

## 4. Déployer sur un poste pilote

```sh
cd ansible
ansible-playbook -i inventory.ini site.yml --check --limit poste-pilote
ansible-playbook -i inventory.ini site.yml --limit poste-pilote
```

Le rôle échoue **avant** toute modification si Firefox est absent, trop ancien,
ou si le XPI n'est pas joignable en HTTPS **depuis le poste**. C'est
intentionnel : ces trois cas produisaient sinon une installation muette.

### Si le certificat vient d'une autorité interne

Firefox n'utilise pas le magasin de certificats de Windows par défaut. Avec un
certificat Kwartz signé par une autorité interne, laisser
`filtre_jeux_import_enterprise_roots: true`. Avec un certificat public, ce
réglage est inutile.

## 5. Vérifier sur le poste

Firefox ne lit les policies qu'au démarrage : fermer toutes les fenêtres, puis :

| Vérification | Résultat attendu |
|---|---|
| `about:policies` | le filtre apparaît en `force_installed` |
| Ouvrir `poki.com` | page « Accès bloqué » |
| Ouvrir `scratch.mit.edu` | s'ouvre normalement |
| `about:addons` | inaccessible |
| Redémarrer le poste | l'extension est toujours là et active |

## 6. Semaine d'observation

L'heuristique est livrée en mode `observe` : elle journalise sans rien bloquer.
Pendant une semaine de classe sur la salle pilote, garder
`filtre_jeux_desactiver_devtools: false`, puis relire le journal :

`about:debugging` → *Ce Firefox* → *Inspecter* sur Filtre Jeux → console :

```js
await exporterJournal()   // affiche le journal JSON
await viderJournal()      // repart de zéro
```

Chaque entrée indique le domaine, le motif, le score et les signaux retenus.
Tout domaine légitime qui y apparaît doit être ajouté à
`filtre_jeux_allowlist` **avant** de basculer en mode blocage.

Puis, sur le parc :

```yaml
filtre_jeux_mode_heuristique: "block"
filtre_jeux_desactiver_devtools: true
```

## 7. Généraliser

```sh
ansible-playbook -i inventory.ini site.yml
```

## Ce que ce déploiement ne couvre pas

Une extension ne protège que le navigateur où elle est installée. Restent hors
de portée : un navigateur portable lancé depuis une clé USB, un poste démarré
sur un autre système, un téléphone en partage de connexion, une application
native. Le filtrage réseau **Kwartz** est le complément qui couvre ces cas —
voir `kwartz.md`. Retirer les droits administrateur locaux aux élèves reste la
mesure la plus efficace du lot.
