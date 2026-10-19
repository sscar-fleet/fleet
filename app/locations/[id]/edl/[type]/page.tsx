import { notFound } from 'next/navigation';
import { utilisateurCourant } from '@/lib/agence';
import { chargerLocation } from '@/lib/location';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import { photosGuidees, checklistEdl, typeDommage, graviteDommage, statutEdl, km, dateHeure, euros, libellePosition } from '@/lib/format';
import * as A from '../../../../actions';
import Cadre from '../../../../_c/Cadre';
import Formulaire from '../../../../_c/Formulaire';
import Envoyer from '../../../../_c/Envoyer';
import Fichier from '../../../../_c/Fichier';
import Signature from '../../../../_c/Signature';
import PhotoEdl from '../../../../_c/PhotoEdl';
import Position from '../../../../_c/Position';
import BoutonPdf from '../../../../_c/BoutonPdf';
import CompteurEdl from '../../../../_c/CompteurEdl';

export const dynamic = 'force-dynamic';

export default async function EtatDesLieux({ params }: { params: { id: string; type: string } }) {
  if (params.type !== 'depart' && params.type !== 'retour') notFound();
  const type = params.type as 'depart' | 'retour';
  const { supabase, profil } = await utilisateurCourant();
  const d = await chargerLocation(supabase, profil.agence_id, params.id);
  if (!d) notFound();
  const e = d[type];
  if (!e) notFound();
  const l = d.brut; const v = l.vehicules;
  const ref = type === 'retour' ? d.depart : null;
  const photo = (pos: string) => e.photos.filter((p: any) => p.position === pos).pop();
  const faites = photosGuidees.filter((p) => photo(p.position)).length;
  const suivante = photosGuidees.find((p) => !photo(p.position))?.position;
  const libres = e.photos.filter((p: any) => p.position === 'libre');
  const dommages = d.dommages.filter((x: any) => x.edl_id === e.id);
  // Kilométrage proposé par le traceur GPS quand rien n'est encore saisi (à vérifier au compteur)
  let kmGps: number | null = null;
  if (e.km == null && v.traceur_id) {
    const [{ data: traceur }, suivi] = await Promise.all([supabase.from('traceurs').select('*').eq('id', v.traceur_id).maybeSingle(), suiviAgence(supabase)]);
    if (traceur) kmGps = kmEstime(traceur, suivi.etats.get(String(traceur.imei)));
  }
  const kmDefaut = e.km ?? kmGps ?? (type === 'depart' ? l.km_depart ?? v.km : null);

  return (
    <Cadre retour={{ lien: `/locations/${l.id}`, texte: `Location N° ${l.numero}` }} tables={['photos_edl', 'etats_des_lieux', 'dommages']}
      titre={`État des lieux de ${type === 'depart' ? 'départ' : 'retour'}`}
      actions={<><span className={`pastille ${e.statut}`}>{statutEdl[e.statut]}</span>
        <BoutonPdf genre="edl" nom={`etat-des-lieux-${type}-${v.immatriculation}.pdf`} libelle="PDF" classe="bouton petit"
          donnees={{ agence: d.agence, location: d.location, vehicule: d.vehicule, client: d.client, edl: e, dommages }} /></>}>
      <Position deja={e.latitude != null} action={A.positionEdl.bind(null, e.id)} />
      <p className="gris" style={{ marginTop: -6 }}>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')} · {l.clients.prenom} {l.clients.nom} · commencé le {dateHeure(e.created_at)}</p>

      <section className="carte">
        <div className="titre" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>1. Photos ({faites}/11)</h2>
          <div className="jauge" style={{ width: 160 }}><i style={{ width: `${(faites / 11) * 100}%` }} /></div>
        </div>
        <div className="photos">
          {photosGuidees.map((p, i) => (
            <PhotoEdl key={p.position} agenceId={profil.agence_id} edlId={e.id} position={p.position} libelle={p.libelle} numero={i + 1}
              url={photo(p.position)?.url} suivante={p.position === suivante}
              reference={ref?.photos.filter((x: any) => x.position === p.position).pop()?.url}
              action={A.photoEdl.bind(null, e.id, p.position)} />
          ))}
          {libres.map((p: any) => (
            <div key={p.id} className="photo"><img src={p.url} alt="Photo libre" /><div className="pied gris">Photo libre</div></div>
          ))}
          <PhotoEdl agenceId={profil.agence_id} edlId={e.id} position="libre" libelle="Photo en plus" action={A.photoEdl.bind(null, e.id, 'libre')} />
        </div>
      </section>

      <div className="colonnes">
        <section className="carte">
          <h2>2. Tableau de bord</h2>
          <Formulaire action={A.majEdl.bind(null, e.id)} className="grille" succes="Compteur enregistré">
            <CompteurEdl km={kmDefaut ?? null} carburant={e.carburant ?? null} checklist={e.checklist ?? {}}
              kmDepart={type === 'retour' ? (ref?.km ?? l.km_depart) : null} kmInclus={type === 'retour' ? l.km_inclus : null} />
            <Envoyer>Enregistrer le compteur</Envoyer>
          </Formulaire>
          {kmGps != null && e.km == null && <p className="gris" style={{ fontSize: 13 }}>Kilométrage proposé par le traceur GPS : vérifiez-le au compteur avant d&apos;enregistrer.</p>}
          {type === 'retour' && ref && <p className="gris" style={{ fontSize: 13 }}>Au départ : {km(ref.km)}, carburant {ref.carburant ?? '—'} %.{l.km_inclus != null ? ` Forfait : ${km(l.km_inclus)}.` : ''}</p>}
        </section>

        <section className="carte">
          <h2>3. Dommages {dommages.length > 0 && <span className="badge rouge">{dommages.length}</span>}</h2>
          <details className="formulaire">
            <summary className="bouton petit">+ Ajouter un dommage</summary>
            <Formulaire vider action={A.ajouterDommage} className="grille">
              <input type="hidden" name="vehicule_id" value={v.id} />
              <input type="hidden" name="location_id" value={l.id} />
              <input type="hidden" name="edl_id" value={e.id} />
              <label>Type<select name="type">{Object.entries(typeDommage).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
              <label>Gravité<select name="gravite">{Object.entries(graviteDommage).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
              <label>Zone<select name="zone"><option value="">—</option>{photosGuidees.filter((p) => p.position !== 'compteur').map((p) => <option key={p.position} value={p.position}>{p.libelle}</option>)}</select></label>
              <label>Coût estimé (€)<input name="cout" type="number" step="0.01" min={0} /></label>
              <Envoyer className="bouton">Ajouter</Envoyer>
            </Formulaire>
          </details>
          {!dommages.length && <p className="gris">Aucun dommage relevé sur cet état des lieux.</p>}
          {dommages.map((x: any) => (
            <div key={x.id} className="fichier">
              <span><span className={`pastille ${x.gravite}`}>{typeDommage[x.type]} · {graviteDommage[x.gravite]}</span><br />
                <span className="gris">{x.zone ? libellePosition[x.zone] : 'Zone non précisée'}{x.cout ? ' · ' + euros(x.cout) : ''}</span></span>
              <span className="ligne">
                <Fichier compact agenceId={profil.agence_id} dossier={`dommages/${x.id}`} nom="zone" libelle="Zone" camera accept="image/*"
                  lien={x.photo_zone} action={A.photoDommage.bind(null, x.id, 'photo_zone_path')} />
                <Fichier compact agenceId={profil.agence_id} dossier={`dommages/${x.id}`} nom="gros-plan" libelle="Gros plan" camera accept="image/*"
                  lien={x.photo_gros_plan} action={A.photoDommage.bind(null, x.id, 'photo_gros_plan_path')} />
              </span>
            </div>
          ))}
        </section>
      </div>

      <section className="carte" style={{ marginTop: 16 }}>
        <h2>4. Signature du client</h2>
        <Signature agenceId={profil.agence_id} dossier={`edl/${e.id}`} lien={e.signature} action={A.signatureEdl.bind(null, e.id)} />
        <p className="gris" style={{ fontSize: 13 }}>Preuve enregistrée : date et heure{e.latitude != null ? `, position GPS (${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)})` : ', position GPS si le téléphone l’autorise'}.</p>
      </section>

      {e.statut === 'en_attente' ? (
        <Formulaire action={A.terminerEdl.bind(null, e.id)} className="ligne">
          <Envoyer>{type === 'depart' ? 'Terminer : le véhicule part' : 'Terminer : le véhicule est rendu'}</Envoyer>
          {(faites < 11 || !e.signature || e.km == null) && <span className="gris">
            {[faites < 11 && `${11 - faites} photo(s) manquante(s)`, !e.signature && 'pas de signature', e.km == null && 'kilométrage à enregistrer'].filter(Boolean).join(' · ')}
          </span>}
        </Formulaire>
      ) : (
        <div className="info-bandeau">État des lieux {statutEdl[e.statut].toLowerCase()}. Vous pouvez encore ajouter des photos ou des dommages.
          {type === 'retour' && <> <a className="lien" href={`/locations/${l.id}/comparaison`}>Comparer avec le départ</a></>}</div>
      )}
    </Cadre>
  );
}
