-- SS CAR FLEET : véhicule prêté par un confrère (pas de prix d'achat ni de leasing)
alter table vehicules add column if not exists pret_par text;     -- loueur qui prête le véhicule
alter table vehicules add column if not exists pret_retour date;  -- date à laquelle il faut le lui rendre
notify pgrst, 'reload schema';
