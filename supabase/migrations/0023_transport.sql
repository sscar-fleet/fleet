-- Version transport de Fleet : dépôts, donneurs d'ordre, chauffeurs, tournées et planning.
-- Chaque entreprise choisit son métier (location ou transport) et règle elle-même ses règles de planning.

alter table agences add column if not exists metier text not null default 'location';
do $$ begin
  alter table agences add constraint agences_metier_valide check (metier in ('location', 'transport'));
exception when duplicate_object then null; end $$;
-- Règles de planning (voir lib/planning.ts) : jours de repos, créneaux par jour, dépôt fixe, partage des camions…
alter table agences add column if not exists regles_transport jsonb not null default '{}'::jsonb;

create table if not exists depots (
  id         uuid primary key default gen_random_uuid(),
  agence_id  uuid not null references agences(id) on delete cascade,
  nom        text not null,
  adresse    text,
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Donneurs d'ordre : Amazon, UPS, Rexel… payés à la tournée (tarif fixe, ajustable par dépôt via tarifs_tournee)
create table if not exists donneurs_ordre (
  id            uuid primary key default gen_random_uuid(),
  agence_id     uuid not null references agences(id) on delete cascade,
  nom           text not null,
  tarif_tournee numeric(10,2),
  couleur       text,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);
create table if not exists tarifs_tournee (
  agence_id  uuid not null references agences(id) on delete cascade,
  donneur_id uuid not null references donneurs_ordre(id) on delete cascade,
  depot_id   uuid not null references depots(id) on delete cascade,
  tarif      numeric(10,2) not null,
  primary key (donneur_id, depot_id)
);

create table if not exists chauffeurs (
  id                   uuid primary key default gen_random_uuid(),
  agence_id            uuid not null references agences(id) on delete cascade,
  prenom               text,
  nom                  text not null,
  telephone            text,
  ville                text,
  depot_id             uuid references depots(id) on delete set null,
  permis_path          text,
  permis_valide_le     date,          -- dernière preuve de validité du permis reçue
  utilisateur_id       uuid references utilisateurs(id) on delete set null,  -- son accès à l'appli chauffeur
  actif                boolean not null default true,
  note                 text,
  created_at           timestamptz not null default now()
);

-- Absences : congés, maladie, indisponibilités ponctuelles
create table if not exists indispos_chauffeurs (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid not null references agences(id) on delete cascade,
  chauffeur_id uuid not null references chauffeurs(id) on delete cascade,
  du           date not null,
  au           date not null,
  motif        text,
  created_at   timestamptz not null default now(),
  check (au >= du)
);

-- Camion rattaché à un dépôt (pour le planning)
alter table vehicules add column if not exists depot_id uuid references depots(id) on delete set null;

-- Tournées qui reviennent chaque semaine (ex. Rexel du lundi au vendredi, 7 h - 15 h)
create table if not exists tournees_fixes (
  id          uuid primary key default gen_random_uuid(),
  agence_id   uuid not null references agences(id) on delete cascade,
  donneur_id  uuid references donneurs_ordre(id) on delete set null,
  depot_id    uuid references depots(id) on delete set null,
  libelle     text,
  debut       time not null,
  fin         time not null,
  jours       int[] not null default '{1,2,3,4,5}',   -- 1 = lundi … 7 = dimanche
  nombre      int not null default 1,                -- combien de tournées identiques par jour
  tarif       numeric(10,2),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists tournees (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid not null references agences(id) on delete cascade,
  jour         date not null,
  debut        time not null,
  fin          time not null,
  donneur_id   uuid references donneurs_ordre(id) on delete set null,
  depot_id     uuid references depots(id) on delete set null,
  libelle      text,
  tarif        numeric(10,2),
  chauffeur_id uuid references chauffeurs(id) on delete set null,
  vehicule_id  uuid references vehicules(id) on delete set null,
  fixe_id      uuid references tournees_fixes(id) on delete set null,
  statut       text not null default 'prevue',      -- prevue, faite, annulee
  verrouillee  boolean not null default false,      -- affectation choisie à la main : « Remplir la semaine » n'y touche pas
  livres       int,
  absents      int,
  fin_le       timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  check (statut in ('prevue', 'faite', 'annulee'))
);
create index if not exists tournees_agence_jour on tournees (agence_id, jour);
create index if not exists tournees_chauffeur_jour on tournees (chauffeur_id, jour);
create index if not exists tournees_vehicule_jour on tournees (vehicule_id, jour);

-- Règles d'accès : chaque entreprise ne voit que ses données
do $$
declare t text;
begin
  foreach t in array array['depots', 'donneurs_ordre', 'tarifs_tournee', 'chauffeurs', 'indispos_chauffeurs', 'tournees_fixes', 'tournees'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_agence', t);
    execute format('create policy %I on %I for all using (agence_id = agence_courante()) with check (agence_id = agence_courante())', t || '_agence', t);
  end loop;
end $$;

do $$ begin alter publication supabase_realtime add table tournees; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table chauffeurs; exception when duplicate_object then null; end $$;

-- Photos des bons de livraison envoyées par le chauffeur en fin de tournée
alter table tournees add column if not exists photos text[] not null default '{}';

-- Accès chauffeur à l'appli : l'invitation est reliée à sa fiche chauffeur
alter table invitations add column if not exists chauffeur_id uuid references chauffeurs(id) on delete set null;
create or replace function accepter_invitation(le_jeton uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations%rowtype; courriel text;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into inv from invitations where jeton = le_jeton;
  if not found then raise exception 'Invitation introuvable'; end if;
  if inv.utilisee then raise exception 'Cette invitation a déjà été utilisée'; end if;
  select lower(u.email) into courriel from auth.users u where u.id = auth.uid();
  if courriel is distinct from lower(inv.email) then raise exception 'Connectez-vous avec l''adresse %', inv.email; end if;
  if exists (select 1 from utilisateurs where id = auth.uid()) then raise exception 'Ce compte appartient déjà à une agence'; end if;
  insert into utilisateurs (id, agence_id, nom, role, email, acces) values (auth.uid(), inv.agence_id, inv.nom, inv.role, inv.email, coalesce(inv.acces, 'les_deux'));
  if inv.chauffeur_id is not null then
    update chauffeurs set utilisateur_id = auth.uid() where id = inv.chauffeur_id and agence_id = inv.agence_id;
  end if;
  update invitations set utilisee = true where id = inv.id;
  return inv.agence_id;
end $$;
grant execute on function accepter_invitation(uuid) to authenticated;
