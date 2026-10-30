-- Paiements en ligne (Stripe Connect, comptes « standard ») : chaque loueur encaisse sur SON compte Stripe.
-- Fleet ne touche jamais l'argent. Tout est au choix du loueur (paiement de la location, caution, prolongations, frais).

-- Compte Stripe du loueur : écrit uniquement par le serveur (clé de service), lu par l'agence.
create table if not exists stripe_comptes (
  agence_id     uuid primary key references agences(id) on delete cascade,
  compte        text not null unique,           -- acct_…
  pret          boolean not null default false, -- Stripe autorise les paiements
  virements     boolean not null default false, -- Stripe autorise les virements vers la banque du loueur
  relie_par     text not null default 'creation' check (relie_par in ('creation', 'existant')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table stripe_comptes enable row level security;
drop policy if exists stripe_comptes_lecture on stripe_comptes;
create policy stripe_comptes_lecture on stripe_comptes for select using (agence_id = agence_courante());

-- Ce que le loueur propose à ses clients (rien par défaut) et commission Fleet (0 au lancement)
alter table agences add column if not exists paiements jsonb not null default '{}'::jsonb; -- {"location":true,"caution":true,"prolongation":true,"frais":true}
alter table agences add column if not exists commission_pct numeric(4,2) not null default 0;

-- Chaque demande de paiement envoyée à un client
create table if not exists paiements (
  id               uuid primary key default gen_random_uuid(),
  agence_id        uuid not null references agences(id) on delete cascade,
  location_id      uuid references locations(id) on delete set null,
  client_id        uuid references clients(id) on delete set null,
  type             text not null check (type in ('location', 'caution', 'prolongation', 'frais')),
  libelle          text not null,
  montant          numeric(10,2) not null check (montant > 0),
  -- paiement : débité tout de suite · empreinte : montant bloqué puis débité ou libéré · carte : carte enregistrée, débitée seulement en cas de besoin
  mode             text not null default 'paiement' check (mode in ('paiement', 'empreinte', 'carte')),
  statut           text not null default 'en_attente' check (statut in ('en_attente', 'paye', 'autorise', 'carte_enregistree', 'retenu', 'libere', 'rembourse', 'echoue', 'expire', 'annule')),
  lien             text,                 -- page de paiement Stripe envoyée au client
  stripe_session   text,                 -- cs_…
  stripe_intent    text,                 -- pi_… / seti_…
  stripe_client    text,                 -- cus_… (carte enregistrée)
  stripe_moyen     text,                 -- pm_…  (carte enregistrée)
  retenu           numeric(10,2),        -- part de la caution gardée
  rembourse        numeric(10,2),
  motif            text,
  paye_le          timestamptz,
  expire_le        timestamptz,
  auteur           uuid references utilisateurs(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists paiements_location on paiements(location_id);
create index if not exists paiements_session on paiements(stripe_session);
create index if not exists paiements_intent on paiements(stripe_intent);
alter table paiements enable row level security;
drop policy if exists paiements_agence on paiements;
create policy paiements_agence on paiements for select using (agence_id = agence_courante());
-- Les écritures passent par le serveur (clé de service) après vérification de l'utilisateur : pas de politique d'écriture.
