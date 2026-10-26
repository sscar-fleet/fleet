// Accueil de la version transport : les tournées du jour (qui est parti, qui ne l'est pas encore), la carte,
// et ce qui reste à régler dans la semaine
import { euros, plaque } from '@/lib/format';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import { lundiDe, semaineDe, heureCourte, nomChauffeur, tarifDe } from '@/lib/transport';
import SuiviFlotte, { type LigneSuivi } from './SuiviFlotte';
import { reglesDe } from '@/lib/planning';

const minutes = (h: string) => { const [a, b] = String(h).split(':').map(Number); return (a || 0) * 60 + (b || 0); };

export default async function AccueilTransport({ supabase, prenom, regles }: { supabase: any; prenom: string; regles?: unknown }) {
  const avance = reglesDe(regles).prisePosteMinutes;
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const maintenant = (() => { const p = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })); return p.getHours() * 60 + p.getMinutes(); })();
  const semaine = semaineDe(lundiDe(aujourdhui));
  const [{ data: tournees }, { data: chauffeurs }, { data: vehicules }, { data: donneurs }, { data: tarifs }, { data: semaineT }, suivi] = await Promise.all([
    supabase.from('tournees').select('*').eq('jour', aujourdhui).neq('statut', 'annulee').order('debut'),
    supabase.from('chauffeurs').select('id, prenom, nom, telephone, ville').eq('actif', true),
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km, traceurs(*)').neq('statut', 'sorti'),
    supabase.from('donneurs_ordre').select('*'),
    supabase.from('tarifs_tournee').select('*'),
    supabase.from('tournees').select('id, jour, chauffeur_id, vehicule_id, statut').gte('jour', aujourdhui).lte('jour', semaine[6]).neq('statut', 'annulee'),
    suiviAgence(supabase),
  ]);
  const ch = (id?: string | null) => (chauffeurs ?? []).find((c: any) => c.id === id);
  const ve = (id?: string | null) => (vehicules ?? []).find((v: any) => v.id === id);
  const etatCamion = (v: any) => {
    const t = v?.traceurs; const e = t && suivi.actif ? suivi.etats.get(String(t.imei)) : undefined;
    return { e, etat: !t ? 'sans' : !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret' } as const;
  };
  // Prise de poste : la tournée commence bientôt (délai réglable) (ou a commencé) et le camion n'a pas encore bougé
  const lignes = (tournees ?? []).map((t: any) => {
    const v = ve(t.vehicule_id); const { e, etat } = etatCamion(v);
    const debut = minutes(t.debut), fin = minutes(t.fin) <= debut ? minutes(t.fin) + 1440 : minutes(t.fin);
    const enCours = maintenant >= debut && maintenant < fin;
    const bientot = maintenant >= debut - avance && maintenant < debut;
    const parti = etat === 'roule' || (e?.contact === true);
    const alerte = t.statut === 'prevue' && v && (bientot || enCours) && !parti && etat !== 'sans' && etat !== 'hors_ligne';
    return { t, v, etat, alerte, enCours, passee: maintenant >= fin };
  });
  const pasPartis = lignes.filter((l: any) => l.alerte);
  const sansChauffeurJour = lignes.filter((l: any) => !l.t.chauffeur_id).length;
  const sansChauffeurSemaine = (semaineT ?? []).filter((t: any) => !t.chauffeur_id).length;
  const chiffreJour = (tournees ?? []).reduce((x: number, t: any) => x + (tarifDe(t, donneurs ?? [], tarifs ?? []) ?? 0), 0);
  const faites = (tournees ?? []).filter((t: any) => t.statut === 'faite').length;
  const donneur = (id?: string | null) => (donneurs ?? []).find((d: any) => d.id === id);

  // Mini carte : les camions avec traceur, avec le chauffeur du moment
  const lignesGps: LigneSuivi[] = suivi.actif ? (vehicules ?? []).filter((v: any) => v.traceurs).map((v: any): LigneSuivi => {
    const { e, etat } = etatCamion(v);
    const enCours = lignes.find((l: any) => l.v?.id === v.id && l.enCours) ?? lignes.find((l: any) => l.v?.id === v.id && !l.passee);
    return { id: v.id, immat: plaque(v.immatriculation), marque: v.marque, modele: v.modele, statut: v.statut, etat: etat === 'sans' ? 'hors_ligne' : etat,
      vitesse: e?.vitesse ?? 0, contact: e?.contact ?? null, lat: e?.lat ?? null, lng: e?.lng ?? null, le: e?.le ?? null, km: kmEstime(v.traceurs, e) ?? v.km,
      client: enCours ? nomChauffeur(ch(enCours.t.chauffeur_id)) || null : null, retour: null, location_id: null };
  }) : [];

  return (
    <>
      <div className="titre"><h1>Bonjour {prenom} <span className="gris" style={{ fontSize: 16, fontWeight: 500 }}>· {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}</span></h1></div>
      <section className="compteurs deux">
        <div className="compteur"><span>Tournées aujourd&apos;hui</span><b>{(tournees ?? []).length}</b><small className="gris">{faites} faite{faites > 1 ? 's' : ''}</small></div>
        <div className="compteur"><span>Pas encore partis</span><b style={{ color: pasPartis.length ? 'var(--orange)' : 'var(--vert)' }}>{pasPartis.length}</b></div>
        <div className="compteur"><span>Sans chauffeur</span><b style={{ color: sansChauffeurJour ? 'var(--rouge)' : 'var(--vert)' }}>{sansChauffeurJour}</b><small className="gris">{sansChauffeurSemaine} d&apos;ici dimanche</small></div>
        <div className="compteur"><span>Chiffre du jour</span><b>{euros(chiffreJour)}</b></div>
      </section>

      {pasPartis.length > 0 && (
        <section className="carte" style={{ borderColor: 'var(--orange)' }}>
          <h2 style={{ marginTop: 0, color: 'var(--orange)' }}>Pas encore partis</h2>
          {pasPartis.map((l: any) => {
            const c = ch(l.t.chauffeur_id);
            return (
              <div key={l.t.id} className="fichier">
                <span><b>{nomChauffeur(c) || 'Sans chauffeur'}</b> · tournée de {heureCourte(l.t.debut)} · <span className="gris">{plaque(l.v?.immatriculation)} à l&apos;arrêt</span></span>
                {c?.telephone && <a className="bouton petit principal" href={`tel:${String(c.telephone).replace(/\s/g, '')}`}>Appeler</a>}
              </div>
            );
          })}
        </section>
      )}

      <section className="carte">
        <div className="titre" style={{ marginBottom: 6 }}><h2 style={{ margin: 0 }}>Aujourd&apos;hui</h2><a className="bouton petit" href="/tournees">Planning de la semaine</a></div>
        {!lignes.length && <p className="gris">Aucune tournée aujourd&apos;hui. <a href="/tournees">Ajouter des tournées</a></p>}
        {lignes.map((l: any) => {
          const c = ch(l.t.chauffeur_id); const d = donneur(l.t.donneur_id);
          const etatTexte = l.t.statut === 'faite' ? 'Faite' : l.etat === 'roule' ? 'Roule' : l.etat === 'arret' ? 'À l’arrêt' : l.etat === 'coupe' ? 'Moteur coupé' : l.etat === 'hors_ligne' ? 'Hors ligne' : '';
          return (
            <div key={l.t.id} className="fichier">
              <span><b>{heureCourte(l.t.debut)}–{heureCourte(l.t.fin)}</b> · {d?.nom ?? l.t.libelle ?? 'Tournée'} · {c ? nomChauffeur(c) : <span style={{ color: 'var(--rouge)', fontWeight: 700 }}>sans chauffeur</span>}
                {l.v ? <span className="gris"> · {plaque(l.v.immatriculation)}</span> : <span style={{ color: 'var(--orange)' }}> · sans camion</span>}</span>
              <span className={`pastille ${l.t.statut === 'faite' ? 'termine' : l.alerte ? 'proche' : l.etat === 'roule' ? 'en_cours' : ''}`}>{l.alerte ? 'Pas encore parti' : etatTexte}</span>
            </div>
          );
        })}
      </section>

      {suivi.actif && lignesGps.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <SuiviFlotte lignes={lignesGps} demo={suivi.actif && suivi.demo} compact transport />
        </section>
      )}
    </>
  );
}
