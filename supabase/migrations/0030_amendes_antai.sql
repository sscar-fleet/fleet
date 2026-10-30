-- Module amendes relié à l'ANTAI : déclaration automatique de la flotte, infractions reçues de l'ANTAI,
-- désignation du conducteur en un clic (toujours validée par le loueur) et suivi de la réponse de l'ANTAI.

-- Le loueur a activé la désignation automatique (ouvert par SS CAR FLEET agence par agence)
alter table agences add column if not exists antai_actif boolean not null default false;
alter table agences add column if not exists antai_active_le timestamptz;

-- Informations exigées par l'ANTAI pour désigner un conducteur
alter table clients add column if not exists civilite text check (civilite in ('M.', 'MME', 'SOCIETE'));
alter table clients add column if not exists lieu_naissance text;
alter table clients add column if not exists permis_lieu text;          -- lieu de délivrance du permis
alter table clients add column if not exists nationalite text default 'FRA'; -- code pays sur 3 lettres
alter table clients add column if not exists siret text;                -- si le conducteur désigné est une société

-- État du véhicule auprès de l'ANTAI
--   a_declarer : à envoyer · declare : dans la flotte ANTAI · sorti : retiré · erreur : refusé (voir antai_erreur)
alter table vehicules add column if not exists antai_statut text check (antai_statut in ('a_declarer', 'declare', 'sorti', 'erreur'));
alter table vehicules add column if not exists antai_le timestamptz;
alter table vehicules add column if not exists antai_erreur text;

-- Amendes reçues de l'ANTAI
alter table amendes add column if not exists source text not null default 'manuel' check (source in ('manuel', 'antai'));
alter table amendes add column if not exists antai_id bigint;              -- identifiantDesignation
alter table amendes add column if not exists code_natinf text;
alter table amendes add column if not exists apparition_le timestamptz;     -- date d'arrivée dans l'API : le délai de 45 jours part de là
-- non_traite · designation_faite · acquittement · refuse · expire · fail (vocabulaire de l'ANTAI)
alter table amendes add column if not exists antai_statut text;
alter table amendes add column if not exists antai_message text;            -- dernier message de l'ANTAI (refus, erreur)
alter table amendes add column if not exists designation jsonb;             -- ce qui a été envoyé à l'ANTAI
alter table amendes add column if not exists designe_le timestamptz;
alter table amendes add column if not exists designe_par uuid references utilisateurs(id) on delete set null;
create unique index if not exists amendes_antai_unique on amendes(antai_id) where antai_id is not null;
create index if not exists amendes_antai_statut on amendes(antai_statut) where antai_statut is not null;
