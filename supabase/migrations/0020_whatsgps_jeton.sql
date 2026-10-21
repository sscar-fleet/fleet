-- Jeton de connexion WhatsGPS partagé entre toutes les instances du serveur.
-- Aucune lecture directe : seules deux fonctions y accèdent, et il faut fournir la clé secrète
-- WhatsGPS (connue du serveur seul) ; la table ne garde que son empreinte, jamais la clé.
create table if not exists public.whatsgps_jeton (
  cle_hash text primary key,
  token text not null,
  user_id bigint not null,
  expire timestamptz not null,
  echec_jusqua timestamptz
);
alter table public.whatsgps_jeton enable row level security;
revoke all on public.whatsgps_jeton from anon, authenticated;

create or replace function public.whatsgps_jeton_lire(p_cle text)
returns table (token text, user_id bigint, expire timestamptz, echec_jusqua timestamptz)
language sql security definer set search_path = public, extensions as $$
  select j.token, j.user_id, j.expire, j.echec_jusqua from public.whatsgps_jeton j
  where j.cle_hash = encode(extensions.digest(p_cle, 'sha256'), 'hex');
$$;

create or replace function public.whatsgps_jeton_ecrire(p_cle text, p_token text, p_user_id bigint, p_expire timestamptz, p_echec_jusqua timestamptz default null)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.whatsgps_jeton (cle_hash, token, user_id, expire, echec_jusqua)
  values (encode(extensions.digest(p_cle, 'sha256'), 'hex'), coalesce(p_token, ''), coalesce(p_user_id, 0), p_expire, p_echec_jusqua)
  on conflict (cle_hash) do update set
    token = case when p_token is null then public.whatsgps_jeton.token else excluded.token end,
    user_id = case when p_token is null then public.whatsgps_jeton.user_id else excluded.user_id end,
    expire = case when p_token is null then public.whatsgps_jeton.expire else excluded.expire end,
    echec_jusqua = excluded.echec_jusqua;
$$;

grant execute on function public.whatsgps_jeton_lire(text) to anon, authenticated;
grant execute on function public.whatsgps_jeton_ecrire(text, text, bigint, timestamptz, timestamptz) to anon, authenticated;
