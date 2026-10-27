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

-- Sécurité des boîtiers : un loueur ne peut plus ajouter lui-même un boîtier (IMEI) à son agence.
-- Seul le serveur de Fleet le fait, après avoir vérifié que le boîtier lui appartient (sous-compte de suivi,
-- ou client SS CAR SYSTEM reconnu). Le loueur garde la lecture et la mise à jour du recalage km et de l'état moteur.
drop policy if exists traceurs_agence on traceurs;
drop policy if exists traceurs_lecture on traceurs;
create policy traceurs_lecture on traceurs for select using (agence_id = agence_courante());
drop policy if exists traceurs_maj on traceurs;
create policy traceurs_maj on traceurs for update using (agence_id = agence_courante()) with check (agence_id = agence_courante());
revoke insert, update, delete on traceurs from anon, authenticated;
grant select on traceurs to authenticated;
grant update (km_compteur_ref, km_traceur_ref, ref_le, moteur_coupe) on traceurs to authenticated;

notify pgrst, 'reload schema';
