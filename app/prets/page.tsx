import { utilisateurCourant } from '@/lib/agence';
import { dateHeure, date, euros, plaque } from '@/lib/format';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';

export const dynamic = 'force-dynamic';
const JOUR = 864e5;
const jours = (a: string | number, b: string | number) => Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / JOUR));

// Prêts entre loueurs : ce que je prête (et qu'on me doit), ce qu'on me prête (et ce que je dois)
export default async function Prets() {
  const { supabase } = await utilisateurCourant();
  const [{ data: sortants }, { data: entrants }, { data: vehicules }, { data: locs }] = await Promise.all([
    supabase.from('entretiens').select('*, vehicules(id, immatriculation, marque, modele)').eq('type', 'transfert').order('created_at', { ascending: false }).limit(100),
    supabase.from('vehicules').select('*').eq('financement', 'pret').order('pret_retour', { nullsFirst: false }),
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, financement').not('statut', 'in', '(sorti,hors_service)').order('immatriculation'),
    supabase.from('locations').select('vehicule_id, prix_total, statut').in('statut', ['en_cours', 'terminee', 'reservee']),
  ]);
  const maintenant = Date.now();
  const enCoursSortants = (sortants ?? []).filter((e: any) => e.statut !== 'termine');
  const aEncaisser = (sortants ?? []).filter((e: any) => !e.encaisse && Number(e.montant_recu ?? 0) > 0);
  const totalDu = aEncaisser.reduce((s: number, e: any) => s + Number(e.montant_recu ?? 0), 0);
  const actifsEntrants = (entrants ?? []).filter((v: any) => v.statut !== 'sorti');
  const coutEmprunt = (v: any) => {
    const t = Number(v.pret_tarif ?? 0); if (!t) return 0;
    if (v.pret_unite === 'forfait') return t;
    const fin = v.date_sortie ? new Date(v.date_sortie).getTime() : Math.min(maintenant, v.pret_retour ? new Date(v.pret_retour).getTime() + JOUR : maintenant);
    const n = jours(v.date_entree ?? v.created_at, fin);
    return v.pret_unite === 'mois' ? (t * 12 / 365) * n : t * n;
  };
  const totalDois = (entrants ?? []).filter((v: any) => !v.pret_regle).reduce((s: number, v: any) => s + coutEmprunt(v), 0);
  const chiffre = (vid: string) => (locs ?? []).filter((l: any) => l.vehicule_id === vid && l.statut !== 'reservee').reduce((s: number, l: any) => s + Number(l.prix_total ?? 0), 0);
  const miens = (vehicules ?? []).filter((v: any) => v.financement !== 'pret' && v.statut !== 'maintenance');

  return (
    <Cadre titre="Prêts entre loueurs" tables={['entretiens', 'vehicules']}>
      <section className="compteurs">
        <div className="compteur"><span>Prêtés en ce moment</span><b>{enCoursSortants.length}</b></div>
        <div className="compteur"><span>On me doit</span><b style={{ color: totalDu ? 'var(--vert)' : undefined }}>{euros(totalDu)}</b></div>
        <div className="compteur"><span>Empruntés en ce moment</span><b>{actifsEntrants.length}</b></div>
        <div className="compteur"><span>Je dois</span><b style={{ color: totalDois ? 'var(--orange)' : undefined }}>{euros(totalDois)}</b></div>
      </section>

      <div className="deux-colonnes">
        <section className="carte">
          <div className="titre" style={{ marginBottom: 6 }}><h2 style={{ margin: 0 }}>Je prête à un confrère</h2></div>
          <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Le véhicule sort de vos disponibilités jusqu&apos;à son retour ; ce que paie le confrère entre dans votre chiffre.</p>
          <details className="formulaire carte" style={{ marginBottom: 14 }}>
            <summary className="bouton petit principal">+ Prêter un véhicule</summary>
            <Formulaire vider action={A.preterVehicule} className="grille" succes="Véhicule prêté">
              <label>Véhicule *<select name="vehicule_id" required><option value="">Choisir…</option>
                {miens.map((v: any) => <option key={v.id} value={v.id}>{plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>
              <label>Confrère *<input name="loueur" required placeholder="Nom de l'agence" /></label>
              <label>Téléphone<input name="telephone" type="tel" /></label>
              <label>Départ<input name="debut" type="datetime-local" /></label>
              <label>Retour prévu<input name="retour_prevu" type="datetime-local" /></label>
              <label>Il me paie (€)<input name="tarif" type="number" step="0.01" min={0} /></label>
              <label>Par<select name="tarif_unite" defaultValue="jour"><option value="jour">jour</option><option value="forfait">forfait</option></select></label>
              <label className="pleine">Note<input name="commentaire" placeholder="Plein fait, 23 000 km au départ…" /></label>
              <Envoyer>Prêter</Envoyer>
            </Formulaire>
          </details>
          {!(sortants ?? []).length && <p className="gris">Aucun véhicule prêté pour l&apos;instant.</p>}
          {(sortants ?? []).map((e: any) => {
            const retard = e.statut !== 'termine' && e.retour_prevu && new Date(e.retour_prevu).getTime() < maintenant;
            return (
              <div key={e.id} className="fichier" style={{ alignItems: 'flex-start' }}>
                <span>
                  <a href={`/entretiens/${e.id}`}><b>{plaque(e.vehicules?.immatriculation)}</b> · {[e.vehicules?.marque, e.vehicules?.modele].filter(Boolean).join(' ')} → <b>{e.garage ?? 'Confrère'}</b></a><br />
                  <span className="gris" style={{ fontSize: 13 }}>
                    {e.statut === 'termine' ? `Rendu le ${date(e.fin)}` : e.statut === 'prevu' ? `Part le ${dateHeure(e.debut)}` : retard ? <span style={{ color: 'var(--rouge)', fontWeight: 700 }}>Devait revenir le {dateHeure(e.retour_prevu)}</span> : `Retour prévu ${dateHeure(e.retour_prevu)}`}
                    {e.tarif ? ` · ${euros(e.tarif)}${e.tarif_unite === 'forfait' ? ' forfait' : ' / jour'}` : ''}
                  </span>
                </span>
                <span className="ligne">
                  {Number(e.montant_recu ?? 0) > 0 && <span className={`pastille ${e.encaisse ? 'termine' : 'proche'}`}>{euros(e.montant_recu)} {e.encaisse ? 'encaissé' : 'à encaisser'}</span>}
                  {!e.encaisse && Number(e.montant_recu ?? 0) > 0 && <Formulaire action={A.encaisserPret.bind(null, e.id)} succes="Encaissé"><Envoyer className="bouton petit">Encaissé</Envoyer></Formulaire>}
                  {e.statut === 'en_cours' && <Formulaire action={A.terminerEntretien.bind(null, e.id)} succes="Véhicule revenu : disponible" confirmer="Le véhicule est revenu ?"><Envoyer className="bouton petit">Revenu</Envoyer></Formulaire>}
                </span>
              </div>
            );
          })}
        </section>

        <section className="carte">
          <div className="titre" style={{ marginBottom: 6 }}><h2 style={{ margin: 0 }}>Un confrère me prête</h2><a className="bouton petit principal" href="/vehicules">+ Véhicule emprunté</a></div>
          <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Vous le louez comme les vôtres : ses locations comptent dans votre chiffre, ce que vous payez au confrère dans vos coûts.</p>
          {!(entrants ?? []).length && <p className="gris">Aucun véhicule emprunté. Ajoutez-le depuis Véhicules en choisissant « Prêté par un confrère ».</p>}
          {(entrants ?? []).map((v: any) => {
            const rendu = v.statut === 'sorti';
            const bientot = !rendu && v.pret_retour && new Date(v.pret_retour).getTime() - maintenant < 2 * JOUR;
            const cout = coutEmprunt(v), ca = chiffre(v.id);
            return (
              <div key={v.id} className="fichier" style={{ alignItems: 'flex-start' }}>
                <span>
                  <a href={`/vehicules/${v.id}`}><b>{plaque(v.immatriculation)}</b> · {[v.marque, v.modele].filter(Boolean).join(' ')} ← <b>{v.pret_par ?? 'Confrère'}</b></a><br />
                  <span className="gris" style={{ fontSize: 13 }}>
                    {rendu ? `Rendu le ${date(v.date_sortie)}` : v.pret_retour ? <span style={bientot ? { color: 'var(--orange)', fontWeight: 700 } : undefined}>À rendre le {date(v.pret_retour)}</span> : 'Date de retour non fixée'}
                    {v.pret_tarif ? ` · ${euros(v.pret_tarif)} ${v.pret_unite === 'forfait' ? 'forfait' : v.pret_unite === 'mois' ? '/ mois' : '/ jour'}` : ' · gratuit'}
                  </span><br />
                  <span style={{ fontSize: 13 }}>Loué : <b>{euros(ca)}</b> · Coût : <b>{euros(cout)}</b> · Gain : <b style={{ color: ca - cout >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{euros(ca - cout)}</b></span>
                </span>
                <span className="ligne">
                  {cout > 0 && <span className={`pastille ${v.pret_regle ? 'termine' : 'proche'}`}>{v.pret_regle ? 'Réglé' : 'À régler'}</span>}
                  {cout > 0 && !v.pret_regle && <Formulaire action={A.reglerEmprunt.bind(null, v.id)} succes="Réglé"><Envoyer className="bouton petit">Réglé</Envoyer></Formulaire>}
                  {!rendu && <Formulaire action={A.rendreEmprunt.bind(null, v.id)} succes="Rendu au confrère" confirmer={`Rendre ${plaque(v.immatriculation)} à ${v.pret_par ?? 'son propriétaire'} ? Il sort de votre flotte.`}><Envoyer className="bouton petit">Rendu</Envoyer></Formulaire>}
                </span>
              </div>
            );
          })}
        </section>
      </div>
    </Cadre>
  );
}
