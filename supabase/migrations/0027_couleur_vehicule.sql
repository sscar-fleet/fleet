-- Couleur réelle du véhicule, pour la photo du modèle (gris foncé si rien n'est choisi)
alter table vehicules add column if not exists couleur text;
alter table vehicules drop constraint if exists vehicules_couleur_check;
alter table vehicules add constraint vehicules_couleur_check
  check (couleur is null or couleur in ('gris-fonce','noir','gris','blanc','bleu','rouge','vert','marron','beige','orange','jaune'));
