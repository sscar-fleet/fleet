import { notFound, redirect } from 'next/navigation';
import Logo from '../_c/Logo';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import { supabaseServeur } from '@/lib/supabase';
import { date, dateHeure } from '@/lib/format';
import { majAgence, noteAgence, rattacherSscs } from './actions';
import { candidatsSscs, annuaireConfigure } from '@/lib/annuaireSscs';
import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const LIBELLES: Record<string, [string, string]> = {
  attente: ['À ouvrir', 'proche'], essai: ['Essai', ''], actif: ['Abonné', 'gps-roule'], suspendu: ['Suspendu', 'retard'],
};
const joursAvant = (d?: string | null) => (d ? Math.ceil((new Date(d + 'T23:59:59').getTime() - Date.now()) / 864e5) : null);

// Page réservée à SS CAR FLEET : toutes les agences, leur essai, leur activité, et l'ouverture / suspension des comptes
export default async function Admin() {
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: admin } = await supabase.rpc('est_admin');
  if (!admin) notFound();
  const { data: agences, error } = await supabase.rpc('admin_agences');
  const liste: any[] = agences ?? [];
  const compte = (s: string) => liste.filter((a) => a.statut === s).length;
  const finissent = liste.filter((a) => a.statut === 'essai' && (joursAvant(a.fin_essai) ?? 99) <= 5);
  // Clients SS CAR SYSTEM reconnus (agences sans véhicule encore relié) et imports qui ont eu du mal (14 derniers jours)
  const [sscs, imports, relies] = await Promise.all([
    annuaireConfigure() ? Promise.all(liste.filter((a) => a.statut !== 'suspendu').map(async (a) => [a.id, await candidatsSscs(a)] as const)).then((x) => new Map(x)) : Promise.resolve(new Map()),
    adminConfigure() ? supabaseAdmin().from('imports_flotte').select('agence_id, genre, ok, detail, created_at').gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(500).then((r: any) => r.data ?? [], () => []) : Promise.resolve([]),
    adminConfigure() ? supabaseAdmin().from('traceurs').select('agence_id, imei').limit(5000).then((r: any) => r.data ?? [], () => []) : Promise.resolve([]),
  ]);
  const imeisAgence = (id: string) => new Set((relies as any[]).filter((t) => t.agence_id === id).map((t) => String(t.imei)));
  const aideImport = (id: string) => {
    const lignes = (imports as any[]).filter((i) => i.agence_id === id);
    const dernierImport = lignes.find((i) => i.genre === 'import');
    const ratees = lignes.filter((i) => i.genre === 'lecture' && !i.ok && (!dernierImport || i.created_at > dernierImport.created_at));
    if (ratees.length >= 2) return `${ratees.length} lectures ratées sans import réussi depuis (${ratees.slice(0, 2).map((r) => r.detail?.nom).filter(Boolean).join(', ')})`;
    if (dernierImport && !dernierImport.ok) return `Import fait avec ${dernierImport.detail?.aReprendre?.length ?? 0} ligne(s) à reprendre`;
    return null;
  };
  const aAppeler = liste.filter((a) => aideImport(a.id));

  return (
    <main className="page" style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <div className="titre" style={{ marginBottom: 18 }}>
        <div className="ligne" style={{ gap: 14 }}><Logo /><h1 style={{ margin: 0 }}>Agences</h1></div>
        <a className="bouton petit" href="/">Retour au logiciel</a>
      </div>
      {error && <p className="pastille retard">{error.message}</p>}
      <div className="tuiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        {[['À ouvrir', compte('attente')], ['En essai', compte('essai')], ['Abonnés', compte('actif')], ['Suspendus', compte('suspendu')]].map(([t, n]) => (
          <div key={t as string} className="carte"><span className="gris">{t}</span><b style={{ display: 'block', fontSize: 28 }}>{n}</b></div>
        ))}
      </div>
      {finissent.length > 0 && <p className="carte" style={{ borderColor: 'var(--orange, #E07A00)' }}><b>Essais qui se terminent bientôt :</b> {finissent.map((a) => `${a.nom} (${joursAvant(a.fin_essai)} j)`).join(', ')}</p>}
      {aAppeler.length > 0 && <p className="carte" style={{ borderColor: 'var(--orange, #E07A00)' }}><b>Imports à regarder :</b> {aAppeler.map((a) => `${a.nom} (${aideImport(a.id)})`).join(' · ')}</p>}
      {!annuaireConfigure() && <p className="gris" style={{ fontSize: 13 }}>Reconnaissance des clients SS CAR SYSTEM inactive : ajoutez AIRTABLE_TOKEN (jeton Airtable en lecture seule) dans Vercel.</p>}
      {!liste.length && <p className="gris">Aucune agence pour l’instant.</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {liste.map((a) => {
          const [lib, cls] = LIBELLES[a.statut] ?? [a.statut, ''];
          const reste = a.statut === 'essai' ? joursAvant(a.fin_essai) : null;
          return (
            <section key={a.id} className="carte" style={{ display: 'grid', gap: 10 }}>
              <div className="titre">
                <div>
                  <b style={{ fontSize: 18 }}>{a.nom}</b> <span className={`pastille ${cls}`} style={{ marginLeft: 8 }}>{lib}{reste != null ? ` · ${reste > 0 ? `${reste} j restants` : 'terminé'}` : ''}</span>
                  <div className="gris" style={{ fontSize: 14, marginTop: 4 }}>
                    {[a.gerant, a.email, a.telephone].filter(Boolean).join(' · ')} · inscrite le {date(a.creee_le)}
                  </div>
                </div>
                <div className="gris" style={{ fontSize: 14, textAlign: 'right' }}>
                  {a.vehicules} véhicule{a.vehicules > 1 ? 's' : ''} · {a.locations_30j} location{a.locations_30j > 1 ? 's' : ''} sur 30 j · {a.utilisateurs} utilisateur{a.utilisateurs > 1 ? 's' : ''}<br />
                  Dernière activité : {a.derniere_activite ? dateHeure(a.derniere_activite) : 'aucune'}
                </div>
              </div>
              <div className="ligne" style={{ flexWrap: 'wrap', gap: 8 }}>
                {(a.statut === 'attente' || a.statut === 'suspendu') && (
                  <Formulaire action={majAgence.bind(null, a.id, 'essai', 30)} succes="Essai de 30 jours démarré"><Envoyer className="bouton petit principal">Ouvrir : essai 30 jours</Envoyer></Formulaire>
                )}
                {a.statut === 'essai' && (
                  <Formulaire action={majAgence.bind(null, a.id, 'essai', Math.max(reste ?? 0, 0) + 15)} succes="Essai prolongé de 15 jours"><Envoyer className="bouton petit">Prolonger de 15 jours</Envoyer></Formulaire>
                )}
                {a.statut !== 'actif' && (
                  <Formulaire action={majAgence.bind(null, a.id, 'actif', null)} succes="Agence passée abonnée" confirmer={`Passer ${a.nom} en abonné (plus de date de fin) ?`}><Envoyer className="bouton petit">Passer abonné</Envoyer></Formulaire>
                )}
                {a.statut !== 'suspendu' && a.statut !== 'attente' && (
                  <Formulaire action={majAgence.bind(null, a.id, 'suspendu', null)} succes="Agence suspendue" confirmer={`Suspendre ${a.nom} ? L’agence n’aura plus accès à ses données, ordinateur et appli. Rien n’est effacé.`}><Envoyer className="bouton petit danger">Suspendre</Envoyer></Formulaire>
                )}
              </div>
              {((sscs as Map<string, any[]>).get(a.id) ?? []).map((c: any) => {
                const deja = imeisAgence(a.id);
                const reste = c.vehicules.filter((v: any) => !deja.has(v.imei)).length;
                return (
                  <div key={c.client.id} className="ligne" style={{ gap: 10, flexWrap: 'wrap', background: 'var(--panneau2)', borderRadius: 10, padding: '8px 12px' }}>
                    <span>Client SS CAR SYSTEM reconnu par {c.par} : <b>{c.client.nom}</b> <span className="gris">({[c.client.email, c.client.telephone].filter(Boolean).join(' · ') || '—'})</span> · {c.vehicules.length} véhicule{c.vehicules.length > 1 ? 's' : ''} équipé{c.vehicules.length > 1 ? 's' : ''}{reste < c.vehicules.length ? ` (${c.vehicules.length - reste} déjà relié${c.vehicules.length - reste > 1 ? 's' : ''})` : ''}</span>
                    {reste > 0 && <Formulaire action={rattacherSscs.bind(null, a.id, c.client.id)} succes="Véhicules et boîtiers rattachés" confirmer={`Rattacher à ${a.nom} les ${reste} véhicule(s) équipés du client SS CAR SYSTEM « ${c.client.nom} » (${[c.client.email, c.client.telephone].filter(Boolean).join(' · ') || 'sans e-mail ni téléphone'}) ? Ils auront la position et la coupure moteur de ces véhicules : vérifiez que c'est bien la même entreprise.`}>
                      <Envoyer className="bouton petit principal">Rattacher les {reste} boîtier{reste > 1 ? 's' : ''}</Envoyer>
                    </Formulaire>}
                  </div>
                );
              })}
              <Formulaire action={noteAgence.bind(null, a.id, a.statut)} succes="Note enregistrée" className="ligne" style={{ gap: 8 }}>
                <input name="note" defaultValue={a.note_admin ?? ''} placeholder="Note (prix convenu, contact, prochaine relance…)" style={{ flex: 1 }} />
                <Envoyer className="bouton petit">Enregistrer</Envoyer>
              </Formulaire>
            </section>
          );
        })}
      </div>
    </main>
  );
}
