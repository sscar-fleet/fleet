import { notFound, redirect } from 'next/navigation';
import Logo from '../../_c/Logo';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import { supabaseServeur } from '@/lib/supabase';
import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';
import { antaiConfigure } from '@/lib/antai';
import { ETAPES, NUMEROS_OBLIGATOIRES } from '@/lib/antaiTests';
import { dateHeure } from '@/lib/format';
import { lancerEtapeAntai, activerAntai, tourneeAntai } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Cahier de tests ANTAI (sandbox) : chaque étape appelle l'ANTAI et garde requêtes et réponses
export default async function TestsAntai() {
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: admin } = await supabase.rpc('est_admin');
  if (!admin) notFound();
  const pret = antaiConfigure('sandbox');
  const resultats: any[] = adminConfigure() ? ((await supabaseAdmin().from('antai_tests').select('*').eq('env', 'sandbox')).data ?? []) : [];
  const parNumero = new Map(resultats.map((r) => [r.numero, r]));
  const oblig = NUMEROS_OBLIGATOIRES.map((n) => parNumero.get(n));
  const obligOk = oblig.filter((r) => r?.ok).length;
  const total = resultats.filter((r) => r.ok).length;
  const db = adminConfigure() ? supabaseAdmin() : null;
  const [agencesRes, journalRes] = db ? await Promise.all([
    db.from('agences').select('id, nom, siret, antai_actif, antai_active_le').neq('statut', 'suspendu').order('nom'),
    db.from('antai_journal').select('created_at, action, statut, chemin').order('created_at', { ascending: false }).limit(15),
  ]) : [{ data: [] }, { data: [] }];
  const agences: any[] = (agencesRes as any).data ?? [];
  const journal: any[] = (journalRes as any).data ?? [];

  return (
    <main className="page" style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div className="titre" style={{ marginBottom: 18 }}>
        <div className="ligne" style={{ gap: 14 }}><Logo style={{ height: 36 }} /><h1 style={{ margin: 0 }}>Tests ANTAI (sandbox)</h1></div>
        <a className="bouton petit" href="/admin">Retour</a>
      </div>
      {!pret && <p className="carte" style={{ borderColor: 'var(--orange, #E07A00)' }}>Identifiants ANTAI sandbox à coller dans Vercel : <b>ANTAI_SANDBOX_USER</b> et <b>ANTAI_SANDBOX_PASSWORD</b>, puis redéployer.</p>}
      <div className="tuiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        <div className="carte"><span className="gris">Obligatoires conformes</span><b style={{ display: 'block', fontSize: 28 }}>{obligOk} / {NUMEROS_OBLIGATOIRES.length}</b></div>
        <div className="carte"><span className="gris">Tous les tests conformes</span><b style={{ display: 'block', fontSize: 28 }}>{total} / 62</b></div>
        <div className="carte"><span className="gris">Résultats bruts</span><a className="lien" href="/api/admin/antai/resultats" target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}>Ouvrir (JSON)</a></div>
      </div>
      <section className="carte" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0 }}>Agences reliées à l&apos;ANTAI</h2>
        <p className="gris" style={{ fontSize: 13, marginTop: 0 }}>Une agence activée : sa flotte est déclarée à l&apos;ANTAI et ses infractions arrivent dans Fleet. Chaque désignation reste validée par le loueur.</p>
        {agences.map((a) => (
          <div key={a.id} className="fichier" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span><b>{a.nom}</b> <span className="gris" style={{ fontSize: 13 }}>{a.siret ? `SIRET ${a.siret}` : 'SIRET manquant'}{a.antai_active_le ? ` · activée le ${dateHeure(a.antai_active_le)}` : ''}</span></span>
            <Formulaire action={activerAntai.bind(null, a.id, !a.antai_actif)} succes={false} confirmer={a.antai_actif ? 'Couper la liaison ANTAI pour cette agence ?' : 'Activer la liaison ANTAI ? Sa flotte sera déclarée à l\u2019ANTAI au prochain passage.'}>
              <Envoyer className={`bouton petit ${a.antai_actif ? '' : 'principal'}`}>{a.antai_actif ? 'Couper' : 'Activer'}</Envoyer>
            </Formulaire>
          </div>
        ))}
        {pret && <div className="ligne" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Formulaire action={tourneeAntai.bind(null, 'flotte')} succes={false}><Envoyer className="bouton petit">Déclarer la flotte maintenant</Envoyer></Formulaire>
          <Formulaire action={tourneeAntai.bind(null, 'infractions')} succes={false}><Envoyer className="bouton petit">Récupérer les infractions</Envoyer></Formulaire>
          <Formulaire action={tourneeAntai.bind(null, 'statuts')} succes={false}><Envoyer className="bouton petit">Suivre les désignations</Envoyer></Formulaire>
        </div>}
      </section>
      <details className="carte" style={{ marginBottom: 14 }}>
        <summary><b>Derniers appels à l&apos;ANTAI</b></summary>
        {journal.map((j, i) => <div key={i} className="gris" style={{ fontSize: 13 }}>{dateHeure(j.created_at)} · {j.action} · {j.statut ?? '-'} · {j.chemin}</div>)}
        {!journal.length && <p className="gris">Aucun appel pour l&apos;instant.</p>}
      </details>
      <h2>Cahier de tests</h2>
      {ETAPES.map((e, i) => (
        <section key={i} className="carte" style={{ marginBottom: 14 }}>
          <div className="titre">
            <h2 style={{ margin: 0 }}>{e.titre}</h2>
            {pret && <Formulaire action={lancerEtapeAntai.bind(null, i)} succes={false}><Envoyer className="bouton principal petit">Lancer</Envoyer></Formulaire>}
          </div>
          {e.tests.map((t) => {
            const r = parNumero.get(t.n);
            return (
              <div key={t.n} className="fichier" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span><b>{t.n}.</b> {t.route} {t.obligatoire && <span className="pastille a_prendre" style={{ fontSize: 11 }}>Obligatoire</span>}<br />
                  <span className="gris" style={{ fontSize: 13 }}>Attendu : {Array.isArray(t.attendu) ? t.attendu.join(' ou ') : t.attendu}{r ? ` · reçu : ${r.statut ?? '-'} · ${dateHeure(r.lance_le)}` : ''}{r?.remarque ? ` · ${r.remarque}` : ''}</span></span>
                <span className={`pastille ${!r ? '' : r.ok ? 'ok' : 'depasse'}`}>{!r ? 'Pas lancé' : r.ok ? 'Conforme' : 'Non conforme'}</span>
                {r?.reponse && <details style={{ width: '100%' }}><summary className="gris" style={{ fontSize: 13 }}>Requête et réponse</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 300, overflow: 'auto' }}>{r.requete}{'\n\n'}{r.reponse}</pre></details>}
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
