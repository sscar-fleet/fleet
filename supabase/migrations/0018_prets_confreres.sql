-- Prêts entre loueurs
-- Véhicule emprunté à un confrère : ce qu'on lui paie (par jour, par mois ou forfait) entre dans les coûts
alter table vehicules add column if not exists pret_tarif numeric(10,2);
alter table vehicules add column if not exists pret_unite text;          -- jour, mois, forfait
alter table vehicules add column if not exists pret_regle boolean not null default false;
-- Véhicule prêté à un confrère (maintenance de type transfert) : tarif et encaissement
alter table entretiens add column if not exists tarif numeric(10,2);
alter table entretiens add column if not exists tarif_unite text;        -- jour, forfait
alter table entretiens add column if not exists encaisse boolean not null default false;
