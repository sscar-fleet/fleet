-- SS CAR FLEET : pièces jointes (factures de réparation, devis de garage…) sur les maintenances et les dépenses
create table if not exists pieces_jointes (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid not null references agences(id) on delete cascade,
  vehicule_id  uuid references vehicules(id) on delete cascade,
  entretien_id uuid references entretiens(id) on delete cascade,
  depense_id   uuid references depenses(id) on delete cascade,
  nom          text not null,
  path         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists pieces_entretien on pieces_jointes (entretien_id);
create index if not exists pieces_depense on pieces_jointes (depense_id);

alter table pieces_jointes enable row level security;
drop policy if exists pieces_agence on pieces_jointes;
create policy pieces_agence on pieces_jointes for all
  using (agence_id = agence_courante()) with check (agence_id = agence_courante());

notify pgrst, 'reload schema';
