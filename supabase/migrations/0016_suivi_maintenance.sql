-- Fiche maintenance : journal de suivi (appels, notes, nouvelles dates) et factures du réparateur
alter table entretiens add column if not exists garage_tel text;

create table if not exists entretien_suivi (
  id            uuid primary key default gen_random_uuid(),
  agence_id     uuid not null references agences(id) on delete cascade,
  entretien_id  uuid not null references entretiens(id) on delete cascade,
  genre         text not null default 'note',   -- note, appel, facture, date
  texte         text,
  montant       numeric(10,2),
  fichier_path  text,
  retour_prevu  timestamptz,
  auteur        uuid references utilisateurs(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists entretien_suivi_entretien on entretien_suivi(entretien_id, created_at desc);
alter table entretien_suivi enable row level security;
drop policy if exists entretien_suivi_agence on entretien_suivi;
create policy entretien_suivi_agence on entretien_suivi for all using (agence_id = agence_courante()) with check (agence_id = agence_courante());
