-- Première connexion : le loueur crée son agence et devient son gérant.
create or replace function creer_agence(nom_agence text, nom_gerant text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nouvelle uuid;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  if exists (select 1 from utilisateurs where id = auth.uid()) then
    raise exception 'Cet utilisateur a déjà une agence';
  end if;
  insert into agences (nom, gerant_nom) values (nom_agence, nom_gerant) returning id into nouvelle;
  insert into utilisateurs (id, agence_id, nom, role) values (auth.uid(), nouvelle, nom_gerant, 'gerant');
  return nouvelle;
end $$;

grant execute on function creer_agence(text, text) to authenticated;
