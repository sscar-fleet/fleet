-- SS CAR FLEET : accès employés (invitation par lien) et devis

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  agence_id   uuid not null references agences(id) on delete cascade,
  email       text not null,
  nom         text not null,
  role        role_utilisateur not null default 'employe',
  jeton       uuid not null unique default gen_random_uuid(),
  utilisee    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table invitations enable row level security;
drop policy if exists invitations_gerant on invitations;
create policy invitations_gerant on invitations for all
  using (agence_id = agence_courante() and exists (select 1 from utilisateurs u where u.id = auth.uid() and u.role = 'gerant'))
  with check (agence_id = agence_courante() and exists (select 1 from utilisateurs u where u.id = auth.uid() and u.role = 'gerant'));

alter table utilisateurs add column if not exists email text;

-- Lecture d'une invitation par son lien (avant d'avoir un compte)
create or replace function voir_invitation(le_jeton uuid)
returns table (email text, nom text, agence text, utilisee boolean)
language sql stable security definer set search_path = public as $$
  select i.email, i.nom, a.nom, i.utilisee from invitations i join agences a on a.id = i.agence_id where i.jeton = le_jeton
$$;
grant execute on function voir_invitation(uuid) to anon, authenticated;

-- L'employé connecté rejoint l'agence
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
  insert into utilisateurs (id, agence_id, nom, role, email) values (auth.uid(), inv.agence_id, inv.nom, inv.role, inv.email);
  update invitations set utilisee = true where id = inv.id;
  return inv.agence_id;
end $$;
grant execute on function accepter_invitation(uuid) to authenticated;

-- Le gérant retire l'accès d'un employé (le compte ne voit plus rien de l'agence)
create or replace function retirer_acces(utilisateur uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from utilisateurs where id = auth.uid() and role = 'gerant') then raise exception 'Réservé au gérant'; end if;
  if utilisateur = auth.uid() then raise exception 'Vous ne pouvez pas retirer votre propre accès'; end if;
  delete from utilisateurs where id = utilisateur and agence_id = agence_courante() and role = 'employe';
end $$;
grant execute on function retirer_acces(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------------
create table if not exists devis (
  id             uuid primary key default gen_random_uuid(),
  agence_id      uuid not null references agences(id) on delete cascade,
  numero         int,
  client_id      uuid references clients(id) on delete set null,
  client_nom     text,
  telephone      text,
  email          text,
  vehicule_id    uuid references vehicules(id) on delete set null,
  debut          timestamptz not null,
  fin            timestamptz not null,
  prix_total     numeric(10,2),
  km_inclus      int,
  prix_km_sup    numeric(10,2),
  caution        numeric(10,2),
  note           text,
  valide_jusqu   date,
  statut         text not null default 'envoye', -- envoye, accepte, refuse
  location_id    uuid references locations(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (fin > debut)
);
create or replace function numeroter_devis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero from devis where agence_id = new.agence_id;
  end if;
  return new;
end $$;
drop trigger if exists devis_numero on devis;
create trigger devis_numero before insert on devis for each row execute function numeroter_devis();

alter table devis enable row level security;
drop policy if exists devis_agence on devis;
create policy devis_agence on devis for all
  using (agence_id = agence_courante()) with check (agence_id = agence_courante());

do $$ begin alter publication supabase_realtime add table devis; exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
