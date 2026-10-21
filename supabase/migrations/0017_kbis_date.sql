-- Date de l'extrait Kbis (lue par l'IA au dépôt) : alerte quand il a plus de 3 mois
alter table agences add column if not exists kbis_date date;
