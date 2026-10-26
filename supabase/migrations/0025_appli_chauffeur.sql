-- Appli chauffeur : accrochage déclaré depuis la tournée, notification quand le planning d'un chauffeur change

-- Sinistre déclaré par le chauffeur depuis l'appli (le responsable est prévenu sur son téléphone)
alter table sinistres add column if not exists source text not null default 'logiciel';   -- logiciel, appli
alter table sinistres add column if not exists tournee_id uuid references tournees(id) on delete set null;

-- Changements de planning à annoncer aux chauffeurs (regroupés : une seule notification après une série de modifications)
create table if not exists tournees_changements (
  id            uuid primary key default gen_random_uuid(),
  agence_id     uuid not null references agences(id) on delete cascade,
  chauffeur_id  uuid not null references chauffeurs(id) on delete cascade,
  tournee_id    uuid,
  jour          date not null,
  genre         text not null,          -- nouvelle, modifiee, retiree
  detail        text,
  envoye_le     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tournees_changements_attente on tournees_changements (envoye_le, created_at);
alter table tournees_changements enable row level security;
drop policy if exists tournees_changements_agence on tournees_changements;
create policy tournees_changements_agence on tournees_changements for select using (agence_id = agence_courante());

create or replace function tournee_changement() returns trigger language plpgsql security definer set search_path = public as $$
declare aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  if tg_op = 'DELETE' then
    if old.chauffeur_id is not null and old.jour >= aujourdhui and old.jour <= aujourdhui + 13 and old.statut <> 'annulee' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (old.agence_id, old.chauffeur_id, old.id, old.jour, 'retiree');
    end if;
    return old;
  end if;
  if new.jour < aujourdhui or new.jour > aujourdhui + 13 then return new; end if;
  if tg_op = 'INSERT' then
    if new.chauffeur_id is not null and new.statut = 'prevue' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (new.agence_id, new.chauffeur_id, new.id, new.jour, 'nouvelle');
    end if;
    return new;
  end if;
  -- Mise à jour : seulement ce qui change pour le chauffeur (pas sa propre fin de tournée)
  if old.chauffeur_id is distinct from new.chauffeur_id then
    if old.chauffeur_id is not null and old.statut <> 'annulee' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (new.agence_id, old.chauffeur_id, new.id, old.jour, 'retiree');
    end if;
    if new.chauffeur_id is not null and new.statut = 'prevue' then
      insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre) values (new.agence_id, new.chauffeur_id, new.id, new.jour, 'nouvelle');
    end if;
  elsif new.chauffeur_id is not null and new.statut <> 'faite' and (
        old.vehicule_id is distinct from new.vehicule_id or old.debut is distinct from new.debut or old.fin is distinct from new.fin
        or old.jour is distinct from new.jour or (new.statut = 'annulee' and old.statut <> 'annulee')) then
    insert into tournees_changements (agence_id, chauffeur_id, tournee_id, jour, genre, detail)
    values (new.agence_id, new.chauffeur_id, new.id, new.jour, case when new.statut = 'annulee' then 'retiree' else 'modifiee' end,
            case when old.vehicule_id is distinct from new.vehicule_id then 'camion' when old.debut is distinct from new.debut or old.fin is distinct from new.fin then 'horaire' else null end);
  end if;
  return new;
end $$;
drop trigger if exists tournee_changement on tournees;
create trigger tournee_changement after insert or update or delete on tournees for each row execute function tournee_changement();

notify pgrst, 'reload schema';
