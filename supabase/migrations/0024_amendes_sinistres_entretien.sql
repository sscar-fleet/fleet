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
