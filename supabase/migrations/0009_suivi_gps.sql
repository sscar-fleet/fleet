-- SS CAR FLEET : branchement des traceurs GPS (Seeworld / WhatsGPS)

-- Compte de suivi GPS de chaque agence. Activé uniquement par SS CAR SYSTEM :
-- lecture permise à l'agence, aucune écriture possible depuis le logiciel
-- (un loueur ne peut donc pas se brancher sur les traceurs d'un autre).
create table if not exists telematique (
  agence_id         uuid primary key references agences(id) on delete cascade,
  fournisseur       text not null default 'seeworld',
  compte_externe_id bigint,          -- id du sous-compte WhatsGPS du client ; vide = compte principal SS CAR SYSTEM
  created_at        timestamptz not null default now()
);
alter table telematique enable row level security;
drop policy if exists telematique_lecture on telematique;
create policy telematique_lecture on telematique for select using (agence_id = agence_courante());

-- Recalage du kilométrage : le traceur compte les km depuis sa pose, on garde
-- le compteur du véhicule et le chiffre du traceur au même moment.
alter table traceurs add column if not exists fournisseur text not null default 'seeworld';
alter table traceurs add column if not exists km_compteur_ref int;
alter table traceurs add column if not exists km_traceur_ref numeric;
alter table traceurs add column if not exists ref_le timestamptz;
alter table traceurs add column if not exists moteur_coupe boolean not null default false;

notify pgrst, 'reload schema';
