import { utilisateurCourant } from '@/lib/agence';
import { date, euros, plaque } from '@/lib/format';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import { TYPES_PLAN, echeancePlan, libellePlan, phraseEcheance } from '@/lib/entretienKm';
import * as P from './actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';

export const dynamic = 'force-dynamic';
const COULEUR = { rouge: 'var(--rouge)', orange: 'var(--orange)', ok: 'var(--vert)', inconnu: 'var(--gris)' } as const;

// Entretien au kilomètre : chaque camion avec ses entretiens à venir, calculés sur le compteur du boîtier GPS
export default async function PlanEntretien() {
  const { supabase, transport } = await utilisateurCourant();
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const [{ data: vehicules }, { data: plans, error }, { data: historique }, suivi] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, km, traceurs(*)').neq('statut', 'sorti').order('immatriculation'),
    supabase.from('entretien_plans').select('*').eq('actif', true),
    supabase.from('entretiens').select('id, vehicule_id, raison, km, cout, fin, garage').eq('statut', 'termine').order('fin', { ascending: false }).limit(300),
    suiviAgence(supabase),
  ]);
  const mot = transport ? 'camion' : 'véhicule';
  // Compteur : celui du boîtier GPS quand il y en a un, sinon le dernier relevé saisi
  const kmDe = (v: any) => {
    const e = v.traceurs && suivi.actif ? suivi.etats.get(String(v.traceurs.imei)) : undefined;
    return { km: (v.traceurs ? kmEstime(v.traceurs, e) : null) ?? v.km ?? null, gps: !!(v.traceurs && e) };
  };
  const lignes = (vehicules ?? []).map((v: any) => {
    const { km, gps } = kmDe(v);
    const ps = (plans ?? []).filter((p: any) => p.vehicule_id === v.id).map((p: any) => ({ p, e: echeancePlan(p, km, aujourdhui) }));
    const pire = ps.some((x) => x.e.niveau === 'rouge') ? 0 : ps.some((x) => x.e.niveau === 'orange') ? 1 : ps.length ? 2 : 3;
    return { v, km, gps, ps, pire };
  }).sort((a, b) => a.pire - b.pire || String(a.v.immatriculation).localeCompare(String(b.v.immatriculation)));
  const enRetard = lignes.reduce((n, l) => n + l.ps.filter((x) => x.e.niveau === 'rouge').length, 0);
  const bientot = lignes.reduce((n, l) => n + l.ps.filter((x) => x.e.niveau === 'orange').length, 0);
  const sansPlan = lignes.filter((l) => !l.ps.length).length;

  return (
    <Cadre titre="Entretien au kilomètre" retour={{ lien: '/entretiens', texte: 'Maintenance' }} tables={['entretien_plans', 'entretiens']}>
      {error && <p className="carte" style={{ borderColor: 'var(--orange)' }}>Cette page sera prête dès la mise à jour de la base (migration 0024).</p>}
      <section className="compteurs">
        <div className="compteur"><span>À faire maintenant</span><b style={{ color: enRetard ? 'var(--rouge)' : 'var(--vert)' }}>{enRetard}</b></div>
        <div className="compteur"><span>Bientôt</span><b style={{ color: bientot ? 'var(--orange)' : 'var(--vert)' }}>{bientot}</b><small className="gris">moins de 1 500 km ou 3 semaines</small></div>
        <div className="compteur"><span>{transport ? 'Camions' : 'Véhicules'} sans suivi</span><b>{sansPlan}</b></div>
      </section>

      <details className="formulaire carte" open={!(plans ?? []).length}>
        <summary>Suivre un entretien</summary>
        <Formulaire action={P.ajouterPlan} className="grille" vider succes="Entretien suivi">
          <label>Entretien<select name="type">{Object.entries(TYPES_PLAN).map(([k, t]) => <option key={k} value={k}>{t.libelle}{t.km ? ` · ${t.km.toLocaleString('fr-FR')} km` : ''}{t.mois ? ` · ${t.mois} mois` : ''}</option>)}</select></label>
          <label>Nom (si autre)<input name="libelle" placeholder="Courroie, AdBlue…" /></label>
          <label>Tous les … km<input name="intervalle_km" type="number" min={0} placeholder="Valeur proposée si vide" /></label>
          <label>ou tous les … mois<input name="intervalle_mois" type="number" min={0} placeholder="Valeur proposée si vide" /></label>
          <label>Fait la dernière fois à … km<input name="dernier_km" type="number" min={0} placeholder="Sinon : compteur du jour" /></label>
          <label>le<input name="derniere_date" type="date" max={aujourdhui} /></label>
          <label className="pleine">{transport ? 'Camions' : 'Véhicules'}<select name="vehicule_id" multiple size={Math.min(6, (vehicules ?? []).length || 1)}>{(vehicules ?? []).map((v: any) => <option key={v.id} value={v.id}>{plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>
          <label className="case"><input type="checkbox" name="tous" value="oui" /> Pour tous les {mot}s</label>
          <Envoyer>Suivre</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Les intervalles proposés sont des moyennes : reprenez ceux du carnet d&apos;entretien. Le compteur vient du boîtier GPS quand le {mot} en a un.</p>
      </details>

      {lignes.map(({ v, km, gps, ps }) => {
        const histo = (historique ?? []).filter((h: any) => h.vehicule_id === v.id);
        const coutTotal = histo.reduce((x: number, h: any) => x + Number(h.cout ?? 0), 0);
        return (
          <section key={v.id} className="carte">
            <div className="titre" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}><a href={`/vehicules/${v.id}`} className="lien">{plaque(v.immatriculation)}</a> <span className="gris" style={{ fontWeight: 500, fontSize: 15 }}>{[v.marque, v.modele].filter(Boolean).join(' ')}</span></h2>
              <span className="gris">{km != null ? `${Math.round(km).toLocaleString('fr-FR')} km${gps ? ' (GPS)' : ''}` : 'compteur inconnu'}</span>
            </div>
            {!ps.length && <p className="gris" style={{ margin: 0 }}>Aucun entretien suivi.</p>}
            {ps.map(({ p, e }) => (
              <details key={p.id} className="ligne-chauffeur">
                <summary>
                  <span><b>{libellePlan(p)}</b> <span className="gris">· {[p.intervalle_km ? `tous les ${p.intervalle_km.toLocaleString('fr-FR')} km` : null, p.intervalle_mois ? `${p.intervalle_mois} mois` : null].filter(Boolean).join(' ou ')}</span></span>
                  <span style={{ color: COULEUR[e.niveau], fontWeight: 700 }}>{phraseEcheance(e)}</span>
                </summary>
                <p className="gris" style={{ fontSize: 13.5, margin: '4px 0 8px' }}>Dernière fois : {p.dernier_km != null ? `${p.dernier_km.toLocaleString('fr-FR')} km` : '—'}{p.derniere_date ? ` le ${date(p.derniere_date)}` : ''}{e.prochainKm ? ` · prochain à ${e.prochainKm.toLocaleString('fr-FR')} km` : ''}</p>
                <Formulaire action={P.planFait.bind(null, p.id)} className="grille" succes="C'est noté">
                  <label>Fait à … km<input name="km" type="number" min={0} defaultValue={km != null ? Math.round(km) : ''} /></label>
                  <label>Le<input name="date" type="date" defaultValue={aujourdhui} max={aujourdhui} /></label>
                  <label>Coût (€)<input name="cout" type="number" step="0.01" /></label>
                  <label>Garage<input name="garage" /></label>
                  <Envoyer>C&apos;est fait</Envoyer>
                </Formulaire>
                <Formulaire action={P.modifierPlan.bind(null, p.id)} className="grille" succes="Enregistré">
                  <label>Nom<input name="libelle" defaultValue={p.libelle ?? ''} placeholder={libellePlan(p)} /></label>
                  <label>Tous les … km<input name="intervalle_km" type="number" defaultValue={p.intervalle_km ?? ''} /></label>
                  <label>ou … mois<input name="intervalle_mois" type="number" defaultValue={p.intervalle_mois ?? ''} /></label>
                  <label>Dernier km<input name="dernier_km" type="number" defaultValue={p.dernier_km ?? ''} /></label>
                  <label>Dernière date<input name="derniere_date" type="date" defaultValue={p.derniere_date ?? ''} /></label>
                  <Envoyer className="bouton">Corriger</Envoyer>
                </Formulaire>
                <Formulaire action={P.arreterPlan.bind(null, p.id)} confirmer="Ne plus suivre cet entretien ?" succes="Arrêté"><Envoyer className="bouton petit">Ne plus suivre</Envoyer></Formulaire>
              </details>
            ))}
            {histo.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="gris" style={{ cursor: 'pointer' }}>Historique ({histo.length}) · {euros(coutTotal)}</summary>
                {histo.slice(0, 15).map((h: any) => (
                  <div key={h.id} className="fichier"><span>{h.fin ? date(h.fin) : '—'} · {h.raison}{h.km ? <span className="gris"> · {Number(h.km).toLocaleString('fr-FR')} km</span> : null}{h.garage ? <span className="gris"> · {h.garage}</span> : null}</span><b>{h.cout ? euros(h.cout) : ''}</b></div>
                ))}
              </details>
            )}
          </section>
        );
      })}
    </Cadre>
  );
}
