import { notFound } from 'next/navigation';
import { utilisateurCourant } from '@/lib/agence';
import { chargerLocation } from '@/lib/location';
import { kmSupplementaires } from '@/lib/documents-pdf';
import { photosGuidees, statutCaution, typeDommage, graviteDommage, libellePosition, km, euros } from '@/lib/format';
import * as A from '../../../actions';
import Cadre from '../../../_c/Cadre';
import Formulaire from '../../../_c/Formulaire';
import Envoyer from '../../../_c/Envoyer';

export const dynamic = 'force-dynamic';

export default async function Comparaison({ params, searchParams }: { params: { id: string }; searchParams: { dommages?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const d = await chargerLocation(supabase, profil.agence_id, params.id);
  if (!d) notFound();
  const l = d.brut;
  const dep = d.depart; const ret = d.retour;
  const nouveaux = d.dommages.filter((x: any) => ret && x.edl_id === ret.id);
  const zones = new Set(nouveaux.map((x: any) => x.zone).filter(Boolean));
  const seulement = searchParams.dommages === '1';
  const positions = photosGuidees.filter((p) => !seulement || zones.has(p.position));
  const derniere = (e: any, pos: string) => e?.photos.filter((p: any) => p.position === pos).pop()?.url;
  const sup = kmSupplementaires(l);

  return (
    <Cadre retour={{ lien: `/locations/${l.id}`, texte: `Location N° ${l.numero}` }} titre="Départ / retour" tables={['photos_edl', 'dommages', 'locations']}
      actions={<a className={`bouton petit ${seulement ? 'actif' : ''}`} href={seulement ? '?' : '?dommages=1'}>{seulement ? 'Tout afficher' : 'N’afficher que les dommages'}</a>}>
      <section className="chiffres">
        <div><span>Km</span><b>{km(dep?.km)} → {km(ret?.km)}</b></div>
        <div><span>Carburant</span><b>{dep?.carburant ?? '—'} % → {ret?.carburant ?? '—'} %</b></div>
        <div><span>Nouveaux dommages</span><b className={nouveaux.length ? 'retard' : ''}>{nouveaux.length}</b></div>
        {sup.enTrop > 0 && <div><span>Km en trop</span><b className="retard">{sup.enTrop} · {euros(sup.montant)}</b></div>}
      </section>

      <div className="comparaison" style={{ marginBottom: 6 }}><h3>Départ</h3><h3>Retour</h3></div>
      {positions.map((p) => (
        <div key={p.position} className="carte">
          <h3>{p.libelle}{zones.has(p.position) && <span className="retard"> · dommage signalé</span>}</h3>
          <div className="comparaison">
            {derniere(dep, p.position) ? <a href={derniere(dep, p.position)} target="_blank" rel="noreferrer"><img src={derniere(dep, p.position)} alt="Départ" /></a> : <div className="photo"><div className="manque">Pas de photo</div></div>}
            {derniere(ret, p.position) ? <a href={derniere(ret, p.position)} target="_blank" rel="noreferrer"><img src={derniere(ret, p.position)} alt="Retour" /></a> : <div className="photo"><div className="manque">Pas de photo</div></div>}
          </div>
        </div>
      ))}
      {!positions.length && <p className="gris">Aucun dommage signalé au retour.</p>}

      <div className="colonnes">
        <section className="carte">
          <h2>Dommages du retour</h2>
          {!nouveaux.length && <p className="gris">Aucun.</p>}
          {nouveaux.map((x: any) => (
            <div key={x.id} className="fichier"><span className={`pastille ${x.gravite}`}>{typeDommage[x.type]} · {graviteDommage[x.gravite]}</span>
              <span className="gris">{x.zone ? libellePosition[x.zone] : ''}{x.cout ? ' · ' + euros(x.cout) : ''}</span></div>
          ))}
        </section>
        <section className="carte">
          <h2>Caution {l.caution_montant ? `(${euros(l.caution_montant)})` : ''}</h2>
          <Formulaire action={A.cautionLocation.bind(null, l.id)} className="grille">
            <input type="hidden" name="caution_montant" value={l.caution_montant ?? ''} />
            <label>Décision<select name="caution_statut" defaultValue={nouveaux.length || sup.enTrop ? 'encaissee' : 'rendue'}>
              {Object.entries(statutCaution).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Retenue (€)<input name="caution_retenue" type="number" step="0.01" min={0}
              defaultValue={l.caution_retenue ?? ((nouveaux.reduce((s: number, x: any) => s + Number(x.cout ?? 0), 0) + sup.montant) || '')} /></label>
            <label className="pleine">Motif<input name="caution_motif" defaultValue={l.caution_motif ?? [
              ...nouveaux.map((x: any) => `${typeDommage[x.type]}${x.zone ? ' ' + libellePosition[x.zone].toLowerCase() : ''}`),
              sup.enTrop ? `${sup.enTrop} km en trop` : ''].filter(Boolean).join(', ')} /></label>
            <Envoyer className="bouton">Enregistrer la caution</Envoyer>
          </Formulaire>
          <p className="gris" style={{ fontSize: 13 }}>Actuellement : {statutCaution[l.caution_statut]}</p>
        </section>
      </div>
      {ret?.statut === 'a_comparer' && (
        <Formulaire action={A.validerComparaison.bind(null, l.id)} style={{ marginTop: 16 }}><Envoyer>Comparaison terminée</Envoyer></Formulaire>
      )}
    </Cadre>
  );
}
