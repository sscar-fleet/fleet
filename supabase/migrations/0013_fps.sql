-- SS CAR FLEET : forfaits post-stationnement (FPS)
-- Le FPS est dû par le titulaire de la carte grise (le loueur) : il le règle, puis le refacture au client
-- qui avait la voiture, avec des frais de gestion. Le client peut contester lui-même avec un mandat du loueur.

create table if not exists fps (
  id                   uuid primary key default gen_random_uuid(),
  agence_id            uuid not null references agences(id) on delete cascade,
  vehicule_id          uuid references vehicules(id) on delete set null,
  location_id          uuid references locations(id) on delete set null,
  client_id            uuid references clients(id) on delete set null,
  numero_avis          text,
  collectivite         text,
  date_constat         timestamptz not null,
  lieu                 text,
  montant              numeric(10,2),
  date_avis            date,                 -- date d'envoi de l'avis de paiement
  limite_contestation  date,                 -- RAPO : un mois après la notification
  limite_paiement      date,                 -- au-delà : majoration (20 %, 50 € minimum)
  frais_gestion        numeric(10,2) not null default 0,
  statut               text not null default 'a_refacturer'
                       check (statut in ('a_refacturer', 'client_inconnu', 'refacture', 'rembourse', 'conteste', 'abandonne')),
  paye_tresor          boolean not null default false, -- le loueur a réglé le FPS
  refacture_le         timestamptz,
  rembourse_le         timestamptz,
  avis_path            text,
  note                 text,
  created_at           timestamptz not null default now()
);
create index if not exists fps_agence_statut on fps (agence_id, statut, limite_paiement);

alter table fps enable row level security;
drop policy if exists fps_agence on fps;
create policy fps_agence on fps for all using (agence_id = agence_courante()) with check (agence_id = agence_courante());

-- Frais de gestion par défaut ajoutés à chaque FPS refacturé (réglable dans Réglages)
alter table agences add column if not exists frais_fps numeric(10,2) not null default 0;

do $$ begin
  alter publication supabase_realtime add table fps;
exception when others then null; end $$;
notify pgrst, 'reload schema';
