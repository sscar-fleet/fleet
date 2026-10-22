-- SS CAR FLEET : ouverture des comptes par SS CAR FLEET, période d'essai, suspension, et page d'administration.
-- Une agence nouvellement inscrite est « en attente » : rien n'est accessible tant que SS CAR FLEET ne l'a pas
-- activée. Une agence suspendue, ou dont l'essai est terminé, perd l'accès à ses données (ordinateur et appli),
-- sans rien perdre : tout revient dès qu'elle est réactivée.

alter table agences add column if not exists statut text not null default 'attente';
alter table agences add column if not exists fin_essai date;
alter table agences add column if not exists note_admin text;
do $$ begin
  alter table agences add constraint agences_statut_check check (statut in ('attente', 'essai', 'actif', 'suspendu'));
exception when duplicate_object then null; end $$;

-- Les agences qui existent déjà gardent leur accès
update agences set statut = 'actif' where statut = 'attente' and created_at < now();

-- Agence utilisable : active, ou en essai non terminé
create or replace function agence_ouverte(a agences) returns boolean
language sql immutable as $$
  select a.statut = 'actif' or (a.statut = 'essai' and (a.fin_essai is null or a.fin_essai >= current_date))
$$;

-- Toutes les règles d'accès passent par cette fonction : une agence fermée ne voit plus rien
create or replace function agence_courante() returns uuid
language sql stable security definer set search_path = public as $$
  select u.agence_id from utilisateurs u join agences a on a.id = u.agence_id
  where u.id = auth.uid() and agence_ouverte(a)
$$;

-- Chacun peut toujours lire sa propre fiche (pour afficher « compte en attente » plutôt qu'une erreur)
drop policy if exists utilisateurs_moi on utilisateurs;
create policy utilisateurs_moi on utilisateurs for select using (id = auth.uid());

-- État du compte de l'utilisateur connecté, lisible même quand l'agence est fermée
create or replace function etat_compte()
returns table (agence text, statut text, fin_essai date, ouvert boolean)
language sql stable security definer set search_path = public as $$
  select a.nom, a.statut, a.fin_essai, agence_ouverte(a)
  from utilisateurs u join agences a on a.id = u.agence_id where u.id = auth.uid()
$$;
grant execute on function etat_compte() to authenticated;

-- Administrateurs SS CAR FLEET (ajoutés à la main, jamais depuis le site)
create table if not exists administrateurs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table administrateurs enable row level security;
revoke all on administrateurs from anon, authenticated;

create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administrateurs where user_id = auth.uid())
$$;
grant execute on function est_admin() to authenticated;

-- Liste des agences pour la page d'administration
create or replace function admin_agences()
returns table (
  id uuid, nom text, gerant text, email text, telephone text, statut text, fin_essai date, note_admin text,
  creee_le timestamptz, utilisateurs bigint, vehicules bigint, locations_30j bigint, derniere_activite timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin() then raise exception 'Réservé à SS CAR FLEET'; end if;
  return query
  select a.id, a.nom, a.gerant_nom,
    coalesce(a.email, (select au.email::text from utilisateurs u join auth.users au on au.id = u.id
                       where u.agence_id = a.id and u.role = 'gerant' order by u.created_at limit 1)),
    a.telephone, a.statut, a.fin_essai, a.note_admin, a.created_at,
    (select count(*) from utilisateurs u where u.agence_id = a.id),
    (select count(*) from vehicules v where v.agence_id = a.id and v.statut <> 'sorti'),
    (select count(*) from locations l where l.agence_id = a.id and l.created_at > now() - interval '30 days'),
    (select max(h.created_at) from historique h where h.agence_id = a.id)
  from agences a
  order by a.created_at desc;
end $$;
grant execute on function admin_agences() to authenticated;

-- Activer (essai ou plein tarif), suspendre, prolonger un essai
create or replace function admin_maj_agence(p_agence uuid, p_statut text, p_fin_essai date default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not est_admin() then raise exception 'Réservé à SS CAR FLEET'; end if;
  if p_statut not in ('attente', 'essai', 'actif', 'suspendu') then raise exception 'Statut inconnu'; end if;
  update agences set
    statut = p_statut,
    fin_essai = case when p_statut = 'essai' then coalesce(p_fin_essai, fin_essai, current_date + 30) else fin_essai end,
    note_admin = coalesce(p_note, note_admin)
  where id = p_agence;
end $$;
grant execute on function admin_maj_agence(uuid, text, date, text) to authenticated;

-- Fleet AI : compteur quotidien par agence (protège la facture d'IA)
create table if not exists ia_usage (
  agence_id uuid not null references agences(id) on delete cascade,
  jour date not null default current_date,
  nombre int not null default 0,
  primary key (agence_id, jour)
);
alter table ia_usage enable row level security;
revoke all on ia_usage from anon, authenticated;

create or replace function ia_compter() returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := agence_courante(); n int;
begin
  if a is null then raise exception 'Compte fermé'; end if;
  insert into ia_usage (agence_id, jour, nombre) values (a, current_date, 1)
  on conflict (agence_id, jour) do update set nombre = ia_usage.nombre + 1
  returning nombre into n;
  return n;
end $$;
grant execute on function ia_compter() to authenticated;

notify pgrst, 'reload schema';
