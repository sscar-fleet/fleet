-- SS CAR FLEET : pilotage business (coût des véhicules et dépenses)

alter table vehicules add column if not exists cout_mensuel numeric(10,2);       -- loyer leasing, crédit ou amortissement
alter table vehicules add column if not exists financement text;                 -- achat, leasing, lld, credit, autre
alter table vehicules add column if not exists date_entree date default current_date; -- début du coût dans la flotte
update vehicules set date_entree = created_at::date where date_entree is null;

create table if not exists depenses (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid not null references agences(id) on delete cascade,
  vehicule_id  uuid references vehicules(id) on delete set null,
  location_id  uuid references locations(id) on delete set null,
  categorie    text not null default 'autre',  -- fourriere, reparation, carburant, nettoyage, peage, autre
  montant      numeric(10,2) not null,
  date         date not null default current_date,
  libelle      text,
  created_at   timestamptz not null default now()
);
create index if not exists depenses_agence_date on depenses (agence_id, date);

alter table depenses enable row level security;
drop policy if exists depenses_agence on depenses;
create policy depenses_agence on depenses for all
  using (agence_id = agence_courante()) with check (agence_id = agence_courante());

alter publication supabase_realtime add table depenses;

notify pgrst, 'reload schema';
