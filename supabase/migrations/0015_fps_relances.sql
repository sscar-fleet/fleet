-- SS CAR FLEET : suivi des FPS (relances du client, mise en demeure, retenue sur la caution)
alter table fps add column if not exists relance1_le timestamptz;
alter table fps add column if not exists relance2_le timestamptz;
alter table fps add column if not exists mise_en_demeure_le timestamptz;
alter table fps add column if not exists retenu_location_id uuid references locations(id) on delete set null;
notify pgrst, 'reload schema';
