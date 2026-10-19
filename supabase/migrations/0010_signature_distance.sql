-- SS CAR FLEET : signature du contrat à distance (lien envoyé par WhatsApp ou e-mail)

alter table locations add column if not exists jeton_signature uuid not null default gen_random_uuid();
alter table locations add column if not exists signature_distance text;        -- image de la signature (PNG en data URL)
alter table locations add column if not exists signe_distance_le timestamptz;
create unique index if not exists locations_jeton_signature on locations (jeton_signature);

-- Ce que le client voit sur la page de signature (sans être connecté)
create or replace function voir_contrat(le_jeton uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'numero', l.numero, 'debut', l.debut, 'fin', l.fin_prevue, 'prix', l.prix_total, 'caution', l.caution_montant,
    'km_inclus', l.km_inclus, 'prix_km_sup', l.prix_km_sup, 'statut', l.statut,
    'signe', (l.signature_contrat_path is not null or l.signature_distance is not null), 'signe_le', l.signe_distance_le,
    'agence', a.nom, 'agence_telephone', a.telephone, 'agence_couleur', a.couleur, 'conditions', a.conditions,
    'vehicule', trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')), 'immatriculation', v.immatriculation,
    'client', trim(coalesce(c.prenom, '') || ' ' || c.nom)
  )
  from locations l
  join agences a on a.id = l.agence_id
  join vehicules v on v.id = l.vehicule_id
  join clients c on c.id = l.client_id
  where l.jeton_signature = le_jeton and l.statut in ('reservee', 'en_cours')
$$;
grant execute on function voir_contrat(uuid) to anon, authenticated;

-- Enregistre la signature, une seule fois, seulement pour une réservation ou une location en cours
create or replace function signer_contrat(le_jeton uuid, image text)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if image is null or left(image, 22) <> 'data:image/png;base64,' or length(image) > 400000 then
    raise exception 'Signature invalide';
  end if;
  select id, agence_id, vehicule_id, signature_contrat_path, signature_distance into l
    from locations where jeton_signature = le_jeton and statut in ('reservee', 'en_cours');
  if not found then raise exception 'Lien de signature invalide ou expiré'; end if;
  if l.signature_contrat_path is not null or l.signature_distance is not null then raise exception 'Contrat déjà signé'; end if;
  update locations set signature_distance = image, signe_distance_le = now() where id = l.id;
  insert into historique (agence_id, location_id, vehicule_id, action, detail)
    values (l.agence_id, l.id, l.vehicule_id, 'Contrat signé à distance', 'par lien');
end $$;
grant execute on function signer_contrat(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
