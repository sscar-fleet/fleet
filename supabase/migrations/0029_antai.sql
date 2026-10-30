-- ANTAI (désignation des conducteurs) : session de connexion, journal de tous les appels, résultats du cahier de tests.
-- Tables lues et écrites uniquement par le serveur (clé de service) : aucune politique d'accès pour les comptes.

-- Session ouverte auprès de l'ANTAI (jeton valable 12 h) et protection contre le blocage du compte
-- (5 erreurs de connexion en 30 s = compte bloqué 30 min : Fleet s'arrête bien avant).
create table if not exists antai_session (
  env            text primary key check (env in ('sandbox', 'production')),
  bearer         text,
  xsrf           text,
  cookies        text,
  expire_le      timestamptz,
  echecs         int not null default 0,          -- échecs de connexion successifs
  dernier_echec  timestamptz,
  bloque_jusqua  timestamptz,                      -- Fleet ne retente plus de connexion avant cette heure
  contexte       jsonb not null default '{}'::jsonb, -- données partagées entre les étapes du cahier de tests
  updated_at     timestamptz not null default now()
);
alter table antai_session enable row level security;

-- Journal de chaque appel à l'ANTAI (suivi des erreurs, preuves en cas de litige)
create table if not exists antai_journal (
  id          bigserial primary key,
  env         text not null,
  agence_id   uuid references agences(id) on delete set null,
  action      text not null,
  methode     text not null,
  chemin      text not null,
  statut      int,
  requete     jsonb,
  reponse     jsonb,
  duree_ms    int,
  created_at  timestamptz not null default now()
);
create index if not exists antai_journal_date on antai_journal(created_at desc);
alter table antai_journal enable row level security;

-- Résultats du cahier de tests de l'ANTAI (62 tests, dont 13 obligatoires)
create table if not exists antai_tests (
  env        text not null,
  numero     int not null,
  route      text not null,
  attendu    text,
  ok         boolean,
  statut     int,
  requete    text,
  reponse    text,
  remarque   text,
  lance_le   timestamptz not null default now(),
  primary key (env, numero)
);
alter table antai_tests enable row level security;
