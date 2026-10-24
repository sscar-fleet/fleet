-- Notifications sur le téléphone (appli Fleet) : téléphones inscrits, ce qui a déjà été envoyé,
-- et la tournée lancée chaque minute par la base elle-même (pg_cron + pg_net), sans service extérieur.

create table if not exists appareils_push (
  jeton          text primary key,                       -- jeton Expo du téléphone
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  agence_id      uuid not null references agences(id) on delete cascade,
  plateforme     text,
  actif          boolean not null default true,
  created_at     timestamptz not null default now(),
  vu_le          timestamptz not null default now()
);
create index if not exists appareils_push_utilisateur on appareils_push (utilisateur_id) where actif;
alter table appareils_push enable row level security;
drop policy if exists appareils_push_moi on appareils_push;
create policy appareils_push_moi on appareils_push for all using (utilisateur_id = auth.uid())
  with check (utilisateur_id = auth.uid() and agence_id = agence_courante());

-- Une notification n'est envoyée qu'une fois par personne (seul le serveur y touche : aucune règle d'accès)
create table if not exists push_envoyes (
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  agence_id      uuid not null references agences(id) on delete cascade,
  cle            text not null,
  envoye_le      timestamptz not null default now(),
  primary key (utilisateur_id, cle)
);
alter table push_envoyes enable row level security;

-- Réglages internes, lisibles seulement par le serveur : le jeton qui protège la tournée
create table if not exists interne (cle text primary key, valeur text not null);
alter table interne enable row level security;
insert into interne (cle, valeur)
  values ('jeton_tournee', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
  on conflict (cle) do nothing;

-- Tournée chaque minute
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'fleet-tournee-notifications';
select cron.schedule('fleet-tournee-notifications', '* * * * *', $tournee$
  select net.http_post(
    url := 'https://fleet-beryl-seven.vercel.app/api/push/tournee',
    headers := jsonb_build_object('content-type', 'application/json', 'x-jeton', (select valeur from public.interne where cle = 'jeton_tournee')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$tournee$);
