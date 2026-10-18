-- SS CAR FLEET : compléments pour le site complet
-- (stockage des documents et photos, numéros de contrat, cautions, prolongations, historique)

-- ---------------------------------------------------------------------------
-- Champs ajoutés
-- ---------------------------------------------------------------------------
alter table locations add column if not exists numero int;
alter table locations add column if not exists caution_retenue numeric(10,2);
alter table locations add column if not exists caution_motif text;
alter table locations add column if not exists signature_contrat_path text;
alter table locations add column if not exists note text;

alter table agences add column if not exists logo_path text;
alter table agences add column if not exists tva_taux numeric(5,2) not null default 20; -- 0 = TVA non applicable
alter table agences add column if not exists conditions text; -- conditions générales imprimées sur le contrat

alter table entretiens add column if not exists km int;
alter table entretiens add column if not exists devis_path text;

alter table clients add column if not exists numero_permis text;

alter table amendes add column if not exists conducteur_designe text;

-- Numéro de contrat qui se suit, par agence
create or replace function numeroter_location() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero from locations where agence_id = new.agence_id;
  end if;
  return new;
end $$;

drop trigger if exists locations_numero on locations;
create trigger locations_numero before insert on locations
for each row execute function numeroter_location();

-- ---------------------------------------------------------------------------
-- Historique des actions sur une location (prolongation, changement de voiture…)
-- ---------------------------------------------------------------------------
create table if not exists historique (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid not null references agences(id) on delete cascade,
  location_id  uuid references locations(id) on delete cascade,
  vehicule_id  uuid references vehicules(id) on delete cascade,
  action       text not null,
  detail       text,
  auteur       uuid references utilisateurs(id),
  created_at   timestamptz not null default now()
);
create index if not exists historique_location on historique (location_id, created_at);

alter table historique enable row level security;
drop policy if exists historique_agence on historique;
create policy historique_agence on historique for all
  using (agence_id = agence_courante()) with check (agence_id = agence_courante());

alter publication supabase_realtime add table clients, entretiens, historique;

-- ---------------------------------------------------------------------------
-- Stockage des documents et photos (privé, un dossier par agence)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_lecture on storage.objects;
drop policy if exists documents_ajout on storage.objects;
drop policy if exists documents_maj on storage.objects;
drop policy if exists documents_suppression on storage.objects;

create policy documents_lecture on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.agence_courante()::text);
create policy documents_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.agence_courante()::text);
create policy documents_maj on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.agence_courante()::text);
create policy documents_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.agence_courante()::text);

notify pgrst, 'reload schema';
