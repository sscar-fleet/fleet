-- SS CAR FLEET : sortie de flotte et types de maintenance (dont transfert à un autre loueur)

alter type statut_vehicule add value if not exists 'sorti';

alter table vehicules add column if not exists date_sortie date;
alter table vehicules add column if not exists motif_sortie text;   -- vendu, restitue, epave, vole, autre
alter table vehicules add column if not exists prix_sortie numeric(10,2);

alter table entretiens add column if not exists type text not null default 'entretien'; -- entretien, reparation, carrosserie, controle, nettoyage, transfert, autre
alter table entretiens add column if not exists montant_recu numeric(10,2);              -- ce que paie l'autre loueur pour un transfert

notify pgrst, 'reload schema';
