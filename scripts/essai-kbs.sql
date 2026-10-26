-- Version d'essai L3M Transport / KBS Express : à coller dans Supabase APRÈS que KBS a créé son compte
-- (avec l'adresse l3mtransports@gmail.com). Met l'agence en version transport, en essai 30 jours,
-- et y range ses 21 camions avec leurs boîtiers GPS (IMEI), comme dans la base SS CAR SYSTEM.
do $$
declare
  ag uuid;
  v record;
  t uuid;
  ve uuid;
begin
  select u.agence_id into ag from utilisateurs u join auth.users au on au.id = u.id where lower(au.email) = 'l3mtransports@gmail.com' limit 1;
  if ag is null then raise exception 'Aucun compte Fleet avec l''adresse l3mtransports@gmail.com : KBS doit d''abord créer son compte'; end if;

  update agences set metier = 'transport', statut = 'essai', fin_essai = current_date + 30 where id = ag;
  -- Suivi GPS : le compte principal SS CAR SYSTEM, limité à ses propres boîtiers
  insert into telematique (agence_id, fournisseur, compte_externe_id) values (ag, 'seeworld', null) on conflict (agence_id) do nothing;

  for v in select * from (values
    ('FE-191-JG', 'Renault', 'Kangoo Maxi', '353994715356728', 'SSCS R1'),
    ('FD-002-JW', 'Opel', 'Movano', '353994715356520', 'SSCS R1'),
    ('DA-387-LY', 'Renault', 'Kangoo', '353994715356447', 'SSCS R1'),
    ('DW-383-YX', 'Renault', 'Kangoo', '353994714454169', 'Ancien modèle'),
    ('FD-450-KJ', 'Renault', 'Master', '353994714155345', 'Ancien modèle'),
    ('FV-852-AV', 'Fiat', 'Ducato', '353994714154934', 'Ancien modèle'),
    ('GK-808-JW', 'Mercedes', 'Classe C', '353994714152946', 'Ancien modèle'),
    ('FS-632-TQ', 'Mercedes', null, '353994714152722', 'Ancien modèle'),
    ('FC-347-MS', 'Fiat', 'Ducato', '353994714153209', 'Ancien modèle'),
    ('FN-815-JJ', 'Mercedes', 'Sprinter', '353994714726038', 'Ancien modèle'),
    ('DZ-633-QK', 'Mercedes', 'Sprinter', '353994714832794', 'Ancien modèle'),
    ('FL-742-BJ', 'Mercedes', null, '353994714153274', 'Ancien modèle'),
    ('FN-698-MY', 'Renault', 'Kangoo', '353994716806952', 'SSCS R1'),
    ('FY-765-AK', 'Mercedes', 'Sprinter', '353994716533960', 'SSCS R2'),
    ('EH-659-EK', 'Iveco', 'Daily', '353994716296816', 'SSCS R2'),
    ('GF-457-WJ', 'Peugeot', 'Expert', null, 'SSCS R2'),
    ('GG-225-AY', 'Citroën', 'Jumpy', '353994716536096', 'SSCS R2'),
    ('FY-818-QT', 'Mercedes', 'Vito', '353994716807232', 'SSCS R1'),
    ('FY-853-QT', 'Mercedes', 'Sprinter', '353994716542060', 'SSCS R2'),
    ('GD-580-VT', 'Renault', 'Trafic', '353994716813024', 'SSCS R1'),
    ('GA-858-JP', 'Fiat', 'Talento', '353994716542441', 'SSCS R2')
  ) as x(immat, marque, modele, imei, modele_traceur) loop
    t := null;
    if v.imei is not null then
      -- Un boîtier déjà rangé dans une autre agence n'est pas déplacé (il est signalé à la fin)
      insert into traceurs (agence_id, imei, modele) values (ag, v.imei, v.modele_traceur) on conflict (imei) do nothing;
      select id into t from traceurs where imei = v.imei and agence_id = ag;
      if t is null then raise notice 'Boîtier % (%) déjà rattaché à une autre agence : non relié', v.imei, v.immat; end if;
    end if;
    insert into vehicules (agence_id, immatriculation, marque, modele, traceur_id)
    values (ag, v.immat, v.marque, v.modele, t)
    on conflict (agence_id, immatriculation) do update set traceur_id = coalesce(vehicules.traceur_id, excluded.traceur_id)
    returning id into ve;
  end loop;
end $$;

select a.nom, a.metier, a.statut, a.fin_essai,
  (select count(*) from vehicules where agence_id = a.id) as camions,
  (select count(*) from vehicules where agence_id = a.id and traceur_id is not null) as avec_gps
from agences a join utilisateurs u on u.agence_id = a.id join auth.users au on au.id = u.id
where lower(au.email) = 'l3mtransports@gmail.com';
