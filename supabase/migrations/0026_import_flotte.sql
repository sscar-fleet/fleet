-- SS CAR FLEET : import de la flotte (Excel, photos, texte en vrac lus par Fleet AI)
-- et rattachement des véhicules déjà équipés chez SS CAR SYSTEM.

-- Trace de chaque import et de chaque lecture ratée : SS CAR FLEET voit dans l'admin
-- les agences qui ont eu du mal, pour les appeler elles seulement.
create table if not exists imports_flotte (
  id         uuid primary key default gen_random_uuid(),
  agence_id  uuid not null references agences(id) on delete cascade,
  genre      text not null check (genre in ('lecture', 'import', 'sscs')),
  ok         boolean not null default true,
  detail     jsonb not null default '{}'::jsonb,
  cree_par   uuid references utilisateurs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists imports_flotte_agence on imports_flotte (agence_id, created_at desc);
alter table imports_flotte enable row level security;
drop policy if exists imports_flotte_lecture on imports_flotte;
create policy imports_flotte_lecture on imports_flotte for select using (agence_id = agence_courante());
drop policy if exists imports_flotte_ajout on imports_flotte;
create policy imports_flotte_ajout on imports_flotte for insert with check (agence_id = agence_courante());

-- Visuel de chaque véhicule : photo exacte du modèle (de profil, détourée) ou icône classique (logo de la marque).
-- auto = photo, sauf pour un véhicule de plus de 15 ans qui garde l'icône. L'année sert aussi à choisir la bonne génération.
alter table vehicules add column if not exists annee int check (annee between 1950 and 2100);
alter table vehicules add column if not exists visuel text not null default 'auto';
do $$ begin
  alter table vehicules add constraint vehicules_visuel_valide check (visuel in ('auto', 'photo', 'icone'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
