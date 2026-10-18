-- SS CAR FLEET : coût d'achat, photo du modèle, identité complète de l'agence sur les documents, options d'envoi

alter table vehicules add column if not exists prix_achat numeric(10,2);   -- si acheté comptant
alter table vehicules add column if not exists photo_modele text;          -- photo du modèle trouvée automatiquement

alter table agences add column if not exists forme_juridique text;         -- SAS, SARL, EI…
alter table agences add column if not exists rcs text;                     -- ville et numéro RCS
alter table agences add column if not exists tva_intra text;               -- n° de TVA intracommunautaire
alter table agences add column if not exists iban text;                    -- imprimé sur la facture pour les virements
alter table agences add column if not exists site text;
alter table agences add column if not exists couleur text not null default '#19F7D6'; -- couleur des documents
alter table agences add column if not exists envoi_contrat boolean not null default true; -- proposer l'envoi du contrat au départ
alter table agences add column if not exists facture_auto boolean not null default true;  -- facture proposée au retour

-- Papiers du client : permis et pièce d'identité recto verso, justificatif de domicile
alter table clients add column if not exists permis_verso_path text;
alter table clients add column if not exists piece_identite_verso_path text;
alter table clients add column if not exists justificatif_domicile_path text;
notify pgrst, 'reload schema';
