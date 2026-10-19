-- SS CAR FLEET : scan des papiers avec le téléphone, envoyés directement sur l'ordinateur
-- L'ordinateur crée une séance (QR code), le téléphone envoie les photos sans se connecter, pendant 30 minutes.

create table if not exists scans (
  id         uuid primary key default gen_random_uuid(),
  agence_id  uuid not null references agences(id) on delete cascade,
  client_id  uuid references clients(id) on delete cascade,
  jeton      uuid not null unique default gen_random_uuid(),
  pieces     jsonb not null default '{}'::jsonb,   -- { permis_path: chemin, ... }
  champs     jsonb not null default '{}'::jsonb,   -- ce que la lecture automatique a trouvé
  cree_par   uuid references utilisateurs(id),
  expire_le  timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);
alter table scans enable row level security;
drop policy if exists scans_agence on scans;
create policy scans_agence on scans for all to authenticated
  using (agence_id = public.agence_courante()) with check (agence_id = public.agence_courante());
do $$ begin alter publication supabase_realtime add table scans; exception when duplicate_object then null; end $$;

-- Le téléphone a-t-il le droit d'envoyer dans ce dossier ? (agence / scans-tel / jeton / fichier)
create or replace function scan_valide(le_jeton text, agence text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from scans where jeton::text = le_jeton and agence_id::text = agence and expire_le > now())
$$;
grant execute on function scan_valide(text, text) to anon, authenticated;

drop policy if exists documents_scan_tel on storage.objects;
create policy documents_scan_tel on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[2] = 'scans-tel'
    and public.scan_valide((storage.foldername(name))[3], (storage.foldername(name))[1]));

-- Ce que le téléphone affiche
create or replace function voir_scan(le_jeton uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('agence_id', s.agence_id, 'agence', a.nom, 'couleur', a.couleur, 'pieces', s.pieces, 'expire_le', s.expire_le,
    'client', case when c.id is null then null else trim(coalesce(c.prenom, '') || ' ' || c.nom) end)
  from scans s join agences a on a.id = s.agence_id left join clients c on c.id = s.client_id
  where s.jeton = le_jeton and s.expire_le > now()
$$;
grant execute on function voir_scan(uuid) to anon, authenticated;

-- Une pièce scannée : rangée dans la séance et, si le client existe déjà, directement dans sa fiche
create or replace function scan_ajouter(le_jeton uuid, piece text, chemin text)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if piece not in ('permis_path', 'permis_verso_path', 'piece_identite_path', 'piece_identite_verso_path', 'justificatif_domicile_path') then
    raise exception 'Pièce inconnue';
  end if;
  select * into s from scans where jeton = le_jeton and expire_le > now();
  if not found then raise exception 'Lien expiré : générez un nouveau QR code sur l''ordinateur'; end if;
  if chemin not like s.agence_id::text || '/scans-tel/' || le_jeton::text || '/%' then raise exception 'Chemin refusé'; end if;
  update scans set pieces = pieces || jsonb_build_object(piece, chemin) where id = s.id;
  if s.client_id is not null then
    execute format('update clients set %I = $1 where id = $2', piece) using chemin, s.client_id;
  end if;
end $$;
grant execute on function scan_ajouter(uuid, text, text) to anon, authenticated;

-- Résultat de la lecture du permis : gardé dans la séance, et reporté sur la fiche si ces cases sont vides
create or replace function scan_champs(le_jeton uuid, valeurs jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select * into s from scans where jeton = le_jeton and expire_le > now();
  if not found then return; end if;
  update scans set champs = champs || coalesce(valeurs, '{}'::jsonb) where id = s.id;
  if s.client_id is not null then
    update clients set
      date_naissance = coalesce(date_naissance, nullif(valeurs->>'date_naissance', '')::date),
      date_permis = coalesce(date_permis, nullif(valeurs->>'date_permis', '')::date),
      numero_permis = coalesce(numero_permis, nullif(valeurs->>'numero_permis', ''))
    where id = s.client_id;
  end if;
exception when others then null; -- une date mal lue ne doit jamais bloquer le scan
end $$;
grant execute on function scan_champs(uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
