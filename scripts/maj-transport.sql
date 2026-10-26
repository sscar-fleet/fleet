-- Mise à jour Fleet version transport (0023 + 0024 + 0025). Sans danger si une partie a déjà été collée : tout est rejouable.
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
-- 1. Amendes : le chauffeur qui conduisait est retrouvé tout seul grâce au planning des tournées
alter table amendes add column if not exists chauffeur_id uuid references chauffeurs(id) on delete set null;
alter table amendes add column if not exists tournee_id uuid references tournees(id) on delete set null;
-- Identité du chauffeur demandée par l'ANTAI pour la désignation
alter table chauffeurs add column if not exists date_naissance date;
alter table chauffeurs add column if not exists lieu_naissance text;
alter table chauffeurs add column if not exists adresse text;
alter table chauffeurs add column if not exists numero_permis text;
alter table chauffeurs add column if not exists date_permis date;

-- À l'enregistrement d'une amende (logiciel ou appli) : la tournée de ce camion à cette heure-là donne le chauffeur
-- (45 min de marge avant le départ et après la fin, la plus proche du début si plusieurs)
create or replace function amende_trouver_chauffeur() returns trigger language plpgsql as $$
declare tid uuid; cid uuid;
begin
  if new.chauffeur_id is null and new.client_id is null and new.vehicule_id is not null and new.date_infraction is not null then
    select t.id, t.chauffeur_id into tid, cid from tournees t
     where t.vehicule_id = new.vehicule_id and t.agence_id = new.agence_id and t.chauffeur_id is not null and t.statut <> 'annulee'
       and t.jour between (new.date_infraction at time zone 'Europe/Paris')::date - 1 and (new.date_infraction at time zone 'Europe/Paris')::date
       and new.date_infraction >= ((t.jour + t.debut) at time zone 'Europe/Paris') - interval '45 minutes'
       and new.date_infraction <= ((t.jour + t.fin + case when t.fin <= t.debut then interval '1 day' else interval '0' end) at time zone 'Europe/Paris') + interval '45 minutes'
     order by abs(extract(epoch from (new.date_infraction - ((t.jour + t.debut) at time zone 'Europe/Paris'))))
     limit 1;
    if cid is not null then
      new.chauffeur_id := cid; new.tournee_id := tid;
      if new.statut = 'infos_manquantes' then new.statut := 'a_designer'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists amende_trouver_chauffeur on amendes;
create trigger amende_trouver_chauffeur before insert or update of vehicule_id, date_infraction on amendes
  for each row execute function amende_trouver_chauffeur();

-- 2. Sinistres : déclaration, documents demandés par l'assureur, suivi, relances
create table if not exists sinistres (
  id                 uuid primary key default gen_random_uuid(),
  agence_id          uuid not null references agences(id) on delete cascade,
  vehicule_id        uuid references vehicules(id) on delete set null,
  chauffeur_id       uuid references chauffeurs(id) on delete set null,
  client_id          uuid references clients(id) on delete set null,
  date_sinistre      timestamptz not null,
  type               text not null default 'accident',     -- accident, vol, vandalisme, bris_glace, incendie, autre
  lieu               text,
  description        text,
  tiers              text,                                  -- nom, assurance et plaque du tiers
  responsabilite     text not null default 'inconnue',     -- non, partielle, totale, inconnue
  assureur           text,
  numero_dossier     text,
  expert             text,
  statut             text not null default 'a_declarer',   -- a_declarer, declare, expertise, chiffrage, accord, repare, rembourse, clos, refuse
  montant_estime     numeric(10,2),
  franchise          numeric(10,2),
  montant_rembourse  numeric(10,2),
  reste_a_charge     numeric(10,2),
  retenue_chauffeur  numeric(10,2),
  prochaine_relance  date,
  documents          jsonb not null default '[]'::jsonb,   -- [{ "nom": "Constat amiable", "fait": true, "chemin": "…" }]
  photos             text[] not null default '{}',
  clos_le            timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists sinistres_agence on sinistres (agence_id, statut);
create table if not exists sinistre_suivi (
  id           uuid primary key default gen_random_uuid(),
  agence_id    uuid not null references agences(id) on delete cascade,
  sinistre_id  uuid not null references sinistres(id) on delete cascade,
  genre        text not null default 'note',               -- note, appel, relance, courrier, statut
  texte        text,
  fichier_path text,
  auteur       uuid references utilisateurs(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 3. Entretien au kilomètre : un plan par camion (vidange tous les X km ou X mois…), avec le dernier passage
create table if not exists entretien_plans (
  id               uuid primary key default gen_random_uuid(),
  agence_id        uuid not null references agences(id) on delete cascade,
  vehicule_id      uuid not null references vehicules(id) on delete cascade,
  type             text not null,          -- vidange, pneus, freins, distribution, revision, controle_technique, autre
  libelle          text,
  intervalle_km    int,
  intervalle_mois  int,
  dernier_km       int,
  derniere_date    date,
  actif            boolean not null default true,
  created_at       timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['sinistres', 'sinistre_suivi', 'entretien_plans'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_agence', t);
    execute format('create policy %I on %I for all using (agence_id = agence_courante()) with check (agence_id = agence_courante())', t || '_agence', t);
  end loop;
end $$;
do $$ begin alter publication supabase_realtime add table sinistres; exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
-- Appli chauffeur : accrochage déclaré depuis la tournée, notification quand le planning d'un chauffeur change

-- Sinistre déclaré par le chauffeur depuis l'appli (le responsable est prévenu sur son téléphone)
alter table sinistres add column if not exists source text not null default 'logiciel';   -- logiciel, appli
alter table sinistres add column if not exists tournee_id uuid references tournees(id) on delete set null;

-- Changements de planning à annoncer aux chauffeurs (regroupés : une seule notification après une série de modifications)
create table if not exists tournees_changements (
  id            uuid primary key default gen_random_uuid(),
  agence_id     uuid not null references agences(id) on delete cascade,
  chauffeur_id  uuid not null references chauffeurs(id) on delete cascade,
  tournee_id    uuid,
  jour          date not null,
  genre         text not null,          -- nouvelle, modifiee, retiree
  detail        text,
  envoye_le     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tournees_changements_attente on tournees_changements (envoye_le, created_at);
alter table tournees_changements enable row level security;
drop policy if exists tournees_changements_agence on tournees_changements;
create policy tournees_changements_agence on tournees_changements for select using (agence_id = agence_courante());

create or replace function tournee_changement() returns trigger language plpgsql security definer set search_path = public as $$
declare aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  if tg_op = 'DELETE' then
    if old.chauffeur_id is not null and old.jour >= aujourdhui and old.jour <= aujourdhui + 13 and old.statut <> 'annulee' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (old.agence_id, old.chauffeur_id, old.id, old.jour, 'retiree');
    end if;
    return old;
  end if;
  if new.jour < aujourdhui or new.jour > aujourdhui + 13 then return new; end if;
  if tg_op = 'INSERT' then
    if new.chauffeur_id is not null and new.statut = 'prevue' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (new.agence_id, new.chauffeur_id, new.id, new.jour, 'nouvelle');
    end if;
    return new;
  end if;
  -- Mise à jour : seulement ce qui change pour le chauffeur (pas sa propre fin de tournée)
  if old.chauffeur_id is distinct from new.chauffeur_id then
    if old.chauffeur_id is not null and old.statut <> 'annulee' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (new.agence_id, old.chauffeur_id, new.id, old.jour, 'retiree');
    end if;
    if new.chauffeur_id is not null and new.statut = 'prevue' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (new.agence_id, new.chauffeur_id, new.id, new.jour, 'nouvelle');
    end if;
  elsif new.chauffeur_id is not null and new.statut <> 'faite' and (
        old.vehicule_id is distinct from new.vehicule_id or old.debut is distinct from new.debut or old.fin is distinct from new.fin
        or old.jour is distinct from new.jour or (new.statut = 'annulee' and old.statut <> 'annulee')) then
    insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre, detail)
    values (new.agence_id, new.chauffeur_id, new.id, new.jour, case when new.statut = 'annulee' then 'retiree' else 'modifiee' end,
            case when old.vehicule_id is distinct from new.vehicule_id then 'camion' when old.debut is distinct from new.debut or old.fin is distinct from new.fin then 'horaire' else null end);
  end if;
  return new;
end $$;
drop trigger if exists tournee_changement on tournees;
create trigger tournee_changement after insert or update or delete on tournees for each row execute function tournee_changement();

notify pgrst, 'reload schema';
