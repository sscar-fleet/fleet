-- Date de l'extrait Kbis (lue par l'IA au dépôt) : alerte quand il a plus de 3 mois
alter table agences add column if not exists kbis_date date;

-- Accès des employés : logiciel, appli, ou les deux
alter table utilisateurs add column if not exists acces text not null default 'les_deux';
alter table invitations add column if not exists acces text not null default 'les_deux';

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
  update invitations set utilisee = true where id = inv.id;
  return inv.agence_id;
end $$;
grant execute on function accepter_invitation(uuid) to authenticated;

create or replace function changer_acces(utilisateur uuid, nouvel_acces text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nouvel_acces not in ('logiciel', 'appli', 'les_deux') then raise exception 'Accès inconnu'; end if;
  if not exists (select 1 from utilisateurs where id = auth.uid() and role = 'gerant') then raise exception 'Réservé au gérant'; end if;
  update utilisateurs set acces = nouvel_acces where id = utilisateur and agence_id = agence_courante() and role <> 'gerant';
end $$;
grant execute on function changer_acces(uuid, text) to authenticated;
