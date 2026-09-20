# Données personnelles

## Ce que fait l'extension

Elle compare le nom de domaine de chaque page consultée à une liste embarquée
dans le poste, et bloque la page le cas échéant. La comparaison a lieu
**localement**, en mémoire. Aucune requête n'est émise vers un serveur tiers.

**Aucune donnée de navigation des utilisateurs n'est transmise hors du poste.**

L'extension déclare formellement cette absence de collecte dans son manifeste
(`data_collection_permissions: ["none"]`), déclaration vérifiée par Mozilla lors
de la signature.

## Le journal du mode observation

Pendant la phase de calibrage, l'heuristique consigne les pages qu'elle **aurait**
bloquées, afin de régler les seuils sans pénaliser les élèves.

- stocké dans le profil Firefox du poste, jamais transmis ;
- borné à **200 entrées**, avec rotation automatique ;
- contenu : horodatage, nom de domaine, motif, score. **Ni l'URL complète, ni le
  contenu des pages, ni aucun identifiant d'utilisateur** ;
- effaçable à tout moment (`viderJournal()`), et sans objet une fois le mode
  blocage activé.

En pratique, le journal n'a d'intérêt que sur le poste pilote pendant une
semaine. Le vider en fin de calibrage est la bonne hygiène.

## À faire par l'établissement

1. **Mentionner le dispositif dans la charte informatique** et en informer
   élèves et personnels : un filtrage doit être connu de ceux qui y sont soumis.
2. **Inscrire le traitement au registre** tenu par l'établissement, même s'il
   est minimal. Base légale : mission d'intérêt public. Finalité : garantir
   l'usage pédagogique des postes.
3. **Désigner qui consulte le journal** pendant le calibrage, et sous quelles
   conditions.
4. Rappeler aux enseignants la procédure de déblocage (`faux-positifs.md`) :
   un filtrage dont on ne peut pas contester les décisions est mal accepté, et
   contourné.

## Ce que l'extension ne fait pas

- aucune remontée de statistiques, même anonymes ;
- aucun profilage, aucun historique de navigation conservé ;
- aucune distinction entre utilisateurs : le filtrage porte sur le poste ;
- aucune capture d'écran, aucune surveillance de l'activité.
