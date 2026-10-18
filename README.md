# SS CAR FLEET

Logiciel de gestion pour loueurs de véhicules, par SS CAR SYSTEM.
Site web privé (PC) + appli téléphone, synchronisés en direct sur une seule base.

## Briques

| Brique | Rôle | Coût au démarrage |
| --- | --- | --- |
| Supabase | Base de données, comptes, photos, synchro en direct | 0 € |
| Vercel | Mise en ligne sur fleet.sscarsystem.com | 0 € |
| GitHub | Code source | 0 € |

## Contenu

- `supabase/migrations/0001_socle.sql` : le modèle de données (agences, utilisateurs, véhicules,
  clients, locations, états des lieux, photos, dommages, amendes, entretiens, traceurs,
  attestations fourrière) et les règles d'accès (chaque loueur ne voit que ses données).
- `docs/modele-de-donnees.md` : le même modèle expliqué simplement.

## Principes

- Fleet ne prend aucun paiement : le loueur encaisse lui-même.
- 5 colonnes maximum par écran, des pastilles de couleur, des compteurs cliquables.
- Tout ce qui est scanné ou photographié sur le téléphone apparaît instantanément sur le PC.
