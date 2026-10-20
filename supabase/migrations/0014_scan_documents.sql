-- SS CAR FLEET : le scan par téléphone sert aussi aux documents (avis de FPS, avis d'amende, carte grise)
alter table scans add column if not exists genre text not null default 'client';

create or replace function voir_scan(le_jeton uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('agence_id', s.agence_id, 'agence', a.nom, 'couleur', a.couleur, 'pieces', s.pieces, 'expire_le', s.expire_le, 'genre', s.genre,
    'client', case when c.id is null then null else trim(coalesce(c.prenom, '') || ' ' || c.nom) end)
  from scans s join agences a on a.id = s.agence_id left join clients c on c.id = s.client_id
  where s.jeton = le_jeton and s.expire_le > now()
$$;
grant execute on function voir_scan(uuid) to anon, authenticated;

create or replace function scan_ajouter(le_jeton uuid, piece text, chemin text)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if piece not in ('permis_path', 'permis_verso_path', 'piece_identite_path', 'piece_identite_verso_path', 'justificatif_domicile_path', 'document_path') then
    raise exception 'Pièce inconnue';
  end if;
  select * into s from scans where jeton = le_jeton and expire_le > now();
  if not found then raise exception 'Lien expiré : générez un nouveau QR code sur l''ordinateur'; end if;
  if chemin not like s.agence_id::text || '/scans-tel/' || le_jeton::text || '/%' then raise exception 'Chemin refusé'; end if;
  update scans set pieces = pieces || jsonb_build_object(piece, chemin) where id = s.id;
  if s.client_id is not null and piece <> 'document_path' then
    execute format('update clients set %I = $1 where id = $2', piece) using chemin, s.client_id;
  end if;
end $$;
grant execute on function scan_ajouter(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
