-- SS CAR FLEET — socle de la base de données
-- Une seule base pour tous les loueurs. Chaque ligne appartient à une agence (agence_id)
-- et chaque utilisateur ne voit que les lignes de son agence (Row Level Security).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Listes de valeurs
-- ---------------------------------------------------------------------------
create type role_utilisateur  as enum ('gerant', 'employe');
create type statut_vehicule   as enum ('disponible', 'loue', 'maintenance', 'hors_service');
create type carburant         as enum ('essence', 'diesel', 'hybride', 'electrique', 'gpl');
create type statut_location   as enum ('reservee', 'en_cours', 'terminee', 'annulee');
create type statut_caution    as enum ('a_prendre', 'prise', 'rendue', 'encaissee', 'litige');
create type type_edl          as enum ('depart', 'retour');
create type statut_edl        as enum ('en_attente', 'a_comparer', 'termine');
create type position_photo    as enum (
  'face_avant', 'lateral_gauche_avant', 'lateral_gauche_arriere', 'face_arriere',
  'lateral_droit_arriere', 'lateral_droit_avant',
  'roue_avant_gauche', 'roue_arriere_gauche', 'roue_arriere_droite', 'roue_avant_droite',
  'compteur', 'libre'
);
create type type_dommage      as enum ('rayure', 'bosse', 'impact', 'jante', 'autre');
create type gravite_dommage   as enum ('leger', 'moyen', 'grave');
create type statut_dommage    as enum ('ouvert', 'repare', 'annule');
create type statut_amende     as enum ('a_designer', 'infos_manquantes', 'designee', 'refusee', 'payee');
create type statut_entretien  as enum ('prevu', 'en_cours', 'termine');

-- ---------------------------------------------------------------------------
-- Agence (le loueur client de Fleet) et ses utilisateurs
-- ---------------------------------------------------------------------------
create table agences (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null,
  siret           text,
  adresse         text,
  telephone       text,
  email           text,
  -- saisis une fois, réutilisés pour l'attestation fourrière
  gerant_nom      text,
  gerant_piece_identite_path text,
  kbis_path       text,
  signature_path  text,
  tampon_path     text,
  acces_inclus    int  not null default 2,
  created_at      timestamptz not null default now()
);

create table utilisateurs (
  id         uuid primary key references auth.users(id) on delete cascade,
  agence_id  uuid not null references agences(id) on delete cascade,
  nom        text not null,
  role       role_utilisateur not null default 'employe',
  created_at timestamptz not null default now()
);

-- Agence de l'utilisateur connecté (sert à toutes les règles d'accès)
create or replace function agence_courante() returns uuid
language sql stable security definer set search_path = public as $$
  select agence_id from utilisateurs where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Flotte
-- ---------------------------------------------------------------------------
create table traceurs (
  id               uuid primary key default gen_random_uuid(),
  agence_id        uuid not null references agences(id) on delete cascade,
  imei             text not null unique,
  modele           text,
  sim              text,
  abonnement_fin   date,
  created_at       timestamptz not null default now()
);

create table vehicules (
  id                 uuid primary key default gen_random_uuid(),
  agence_id          uuid not null references agences(id) on delete cascade,
  immatriculation    text not null,
  marque             text,
  modele             text,
  carburant          carburant,
  km                 int,
  statut             statut_vehicule not null default 'disponible',
  prix_jour          numeric(10,2),
  photo_path         text,
  traceur_id         uuid references traceurs(id) on delete set null,
  -- papiers du véhicule (fonction 13)
  carte_grise_path   text,
  assurance_path     text,
  assurance_echeance date,
  ct_path            text,
  ct_echeance        date,
  created_at         timestamptz not null default now(),
  unique (agence_id, immatriculation)
);

create table entretiens (
  id            uuid primary key default gen_random_uuid(),
  agence_id     uuid not null references agences(id) on delete cascade,
  vehicule_id   uuid not null references vehicules(id) on delete cascade,
  raison        text not null,
  commentaire   text,
  garage        text,
  debut         timestamptz,
  retour_prevu  timestamptz,
  fin           timestamptz,
  cout          numeric(10,2),
  statut        statut_entretien not null default 'prevu',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clients et locations
-- ---------------------------------------------------------------------------
create table clients (
  id                   uuid primary key default gen_random_uuid(),
  agence_id            uuid not null references agences(id) on delete cascade,
  nom                  text not null,
  prenom               text,
  telephone            text,
  email                text,
  adresse              text,
  date_naissance       date,
  date_permis          date,
  permis_path          text,      -- scan fait sur le téléphone
  piece_identite_path  text,
  liste_noire          boolean not null default false,  -- drapeau conduite à risque
  note                 text,
  created_at           timestamptz not null default now()
);

create table locations (
  id                uuid primary key default gen_random_uuid(),
  agence_id         uuid not null references agences(id) on delete cascade,
  vehicule_id       uuid not null references vehicules(id),
  client_id         uuid not null references clients(id),
  debut             timestamptz not null,
  fin_prevue        timestamptz not null,
  fin_reelle        timestamptz,
  statut            statut_location not null default 'reservee',
  prix_total        numeric(10,2),
  -- forfait kilométrique (fonction 6)
  km_depart         int,
  km_retour         int,
  km_inclus         int,
  prix_km_sup       numeric(10,2),
  carburant_depart  int check (carburant_depart between 0 and 100),
  carburant_retour  int check (carburant_retour between 0 and 100),
  -- caution (encaissée par le loueur lui-même, Fleet ne prend aucun paiement)
  caution_montant   numeric(10,2),
  caution_statut    statut_caution not null default 'a_prendre',
  created_at        timestamptz not null default now(),
  check (fin_prevue > debut)
);

-- ---------------------------------------------------------------------------
-- État des lieux photo (départ / retour)
-- ---------------------------------------------------------------------------
create table etats_des_lieux (
  id              uuid primary key default gen_random_uuid(),
  agence_id       uuid not null references agences(id) on delete cascade,
  location_id     uuid not null references locations(id) on delete cascade,
  type            type_edl not null,
  statut          statut_edl not null default 'en_attente',
  km              int,
  carburant       int check (carburant between 0 and 100),
  checklist       jsonb not null default '{}'::jsonb, -- voyant, badge, kit, accessoires, propreté
  signature_path  text,
  signe_le        timestamptz,
  latitude        double precision,
  longitude       double precision,
  pdf_path        text,
  created_by      uuid references utilisateurs(id),
  created_at      timestamptz not null default now(),
  unique (location_id, type)
);

create table photos_edl (
  id          uuid primary key default gen_random_uuid(),
  agence_id   uuid not null references agences(id) on delete cascade,
  edl_id      uuid not null references etats_des_lieux(id) on delete cascade,
  position    position_photo not null,
  path        text not null,
  prise_le    timestamptz not null default now()
);

create table dommages (
  id                    uuid primary key default gen_random_uuid(),
  agence_id             uuid not null references agences(id) on delete cascade,
  vehicule_id           uuid not null references vehicules(id) on delete cascade,
  location_id           uuid references locations(id) on delete set null,
  edl_id                uuid references etats_des_lieux(id) on delete set null,
  type                  type_dommage not null,
  gravite               gravite_dommage not null default 'leger',
  zone                  position_photo,
  photo_zone_path       text,
  photo_gros_plan_path  text,
  cout                  numeric(10,2),
  statut                statut_dommage not null default 'ouvert',
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Amendes et attestations fourrière
-- ---------------------------------------------------------------------------
create table amendes (
  id               uuid primary key default gen_random_uuid(),
  agence_id        uuid not null references agences(id) on delete cascade,
  vehicule_id      uuid references vehicules(id) on delete set null,
  location_id      uuid references locations(id) on delete set null, -- retrouvée par date + immat
  client_id        uuid references clients(id) on delete set null,
  numero_avis      text,
  type             text,
  date_infraction  timestamptz not null,
  lieu             text,
  montant          numeric(10,2),
  echeance         date,
  statut           statut_amende not null default 'a_designer',
  avis_path        text,
  created_at       timestamptz not null default now()
);

create table attestations_fourriere (
  id                   uuid primary key default gen_random_uuid(),
  agence_id            uuid not null references agences(id) on delete cascade,
  vehicule_id          uuid not null references vehicules(id) on delete cascade,
  personne_autorisee   text not null,   -- champ libre : convoyeur, salarié…
  fourriere            text,
  pdf_path             text,
  created_by           uuid references utilisateurs(id),
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Index utiles (listes du jour, planning)
-- ---------------------------------------------------------------------------
create index on vehicules (agence_id, statut);
create index on locations (agence_id, debut);
create index on locations (agence_id, fin_prevue);
create index on locations (vehicule_id, debut);
create index on amendes (agence_id, statut, echeance);
create index on dommages (vehicule_id, statut);
create index on photos_edl (edl_id);

-- ---------------------------------------------------------------------------
-- Règles d'accès : chacun ne voit que son agence
-- ---------------------------------------------------------------------------
alter table agences enable row level security;
create policy agence_lecture on agences for select using (id = agence_courante());
create policy agence_maj on agences for update using (
  id = agence_courante()
  and exists (select 1 from utilisateurs u where u.id = auth.uid() and u.role = 'gerant')
);

alter table utilisateurs enable row level security;
create policy utilisateurs_lecture on utilisateurs for select using (agence_id = agence_courante());

do $$
declare t text;
begin
  foreach t in array array[
    'traceurs','vehicules','entretiens','clients','locations',
    'etats_des_lieux','photos_edl','dommages','amendes','attestations_fourriere'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (agence_id = agence_courante()) with check (agence_id = agence_courante())',
      t || '_agence', t
    );
  end loop;
end $$;

-- Synchronisation PC <-> téléphone en direct
alter publication supabase_realtime add table vehicules, locations, etats_des_lieux, photos_edl, dommages, amendes;
