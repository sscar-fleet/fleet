-- Notifications : rappels calculés à la volée ; on ne garde que ce que l'utilisateur a reporté ou ignoré, et le résumé du jour
create table if not exists notifications_etat (
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  agence_id      uuid not null references agences(id) on delete cascade,
  cle            text not null,
  jusqua         timestamptz,            -- « me le rappeler demain »
  ignoree        boolean not null default false,
  created_at     timestamptz not null default now(),
  primary key (utilisateur_id, cle)
);
alter table notifications_etat enable row level security;
drop policy if exists notifications_etat_moi on notifications_etat;
create policy notifications_etat_moi on notifications_etat for all using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid() and agence_id = agence_courante());

create table if not exists notifications_resume (
  agence_id  uuid not null references agences(id) on delete cascade,
  jour       date not null,
  role       text not null default 'gerant',
  texte      text not null,
  empreinte  text,
  created_at timestamptz not null default now(),
  primary key (agence_id, jour, role)
);
alter table notifications_resume enable row level security;
drop policy if exists notifications_resume_agence on notifications_resume;
create policy notifications_resume_agence on notifications_resume for all using (agence_id = agence_courante()) with check (agence_id = agence_courante());
