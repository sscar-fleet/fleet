// Encart « Suivi GPS » de la fiche véhicule : position, état du moteur, kilométrage, coupure à distance.
import Formulaire from './Formulaire';
import Envoyer from './Envoyer';
import CarteGps from './CarteGps';
import * as A from '../actions';
import { km, dateHeure } from '@/lib/format';
import { kmEstime, depuis, type Suivi } from '@/lib/telematique';

export default function SuiviGps({ v, traceur, suivi }: { v: any; traceur: any | null; suivi: Suivi }) {
  const e = traceur ? suivi.etats.get(String(traceur.imei)) : undefined;
  const estime = kmEstime(traceur, e);

  if (!traceur) {
    return (
      <section className="carte">
        <h2>Suivi GPS</h2>
        {suivi.actif && suivi.demo && <p className="gris" style={{ marginTop: 0 }}>Aperçu avec des boîtiers fictifs, en attendant les clés WhatsGPS.</p>}
        {!suivi.actif ? <p className="gris" style={{ margin: 0 }}>{suivi.raison}</p>
          : !suivi.disponibles.length ? <p className="gris" style={{ margin: 0 }}>Tous les boîtiers de votre compte sont déjà reliés à un véhicule.</p>
          : (
            <Formulaire action={A.relierTraceur.bind(null, v.id)} className="grille" succes="Traceur relié">
              <label>Boîtier<select name="imei" required defaultValue="">
                <option value="" disabled>Choisir…</option>
                {suivi.disponibles.map((d) => <option key={d.imei} value={d.imei}>IMEI {d.imei}{d.enLigne ? ' · en ligne' : ''}</option>)}
              </select></label>
              <label>Compteur du véhicule (km)<input name="km" type="number" min={0} inputMode="numeric" defaultValue={v.km ?? ''} /></label>
              <Envoyer className="bouton principal">Relier le traceur</Envoyer>
            </Formulaire>
          )}
      </section>
    );
  }

  const etat = !e ? null : traceur.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret';
  const libelle = { roule: `Roule · ${e?.vitesse ?? 0} km/h`, arret: e?.contact ? 'À l’arrêt · moteur allumé' : 'À l’arrêt · moteur éteint', coupe: 'Moteur coupé à distance', hors_ligne: 'Boîtier hors ligne' };

  return (
    <section className="carte">
      <div className="titre" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Suivi GPS</h2>
        {etat && <span className={`pastille gps-${etat}`}>{libelle[etat]}</span>}
      </div>
      {!suivi.actif && <p className="gris">{suivi.raison}</p>}
      {suivi.actif && suivi.demo && <p className="gris" style={{ marginTop: 0 }}>Aperçu : position et kilométrage fictifs, la coupure moteur ne fait rien.</p>}
      {suivi.actif && !e && <p className="gris">Le boîtier IMEI {traceur.imei} ne répond pas sur le compte de suivi.</p>}
      {e?.lat != null && e.lng != null && (
        <CarteGps hauteur={260} points={[{ id: v.id, lat: e.lat, lng: e.lng, titre: v.immatriculation, detail: depuis(e.le), etat: etat ?? 'arret' }]} />
      )}
      {e && (
        <div className="infos" style={{ marginTop: 12 }}>
          <div><span>Dernière position</span><b>{depuis(e.le)}</b></div>
          <div><span>Kilométrage estimé</span><b>{estime != null ? km(estime) : '—'}</b></div>
          <div><span>Dernier relevé du compteur</span><b>{traceur.km_compteur_ref != null ? `${km(traceur.km_compteur_ref)} · ${dateHeure(traceur.ref_le)}` : '—'}</b></div>
          {e.alerte && <div><span>Alerte</span><b className="pastille retard">{e.alerte}</b></div>}
        </div>
      )}
      <div className="ligne" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        {e?.lat != null && <a className="bouton petit" href={`https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}`} target="_blank" rel="noreferrer">Itinéraire</a>}
        {estime != null && estime !== v.km && (
          <Formulaire action={A.reporterKm.bind(null, v.id, estime)} succes="Kilométrage mis à jour">
            <Envoyer className="bouton petit">Reporter {km(estime)} sur la fiche</Envoyer>
          </Formulaire>
        )}
        {suivi.actif && (traceur.moteur_coupe
          ? <Formulaire action={A.moteur.bind(null, v.id, false)} succes="Moteur remis en route" confirmer={`Remettre en route le moteur de ${v.immatriculation} ?`}>
              <Envoyer className="bouton petit principal">Remettre le moteur en route</Envoyer>
            </Formulaire>
          : <Formulaire action={A.moteur.bind(null, v.id, true)} succes="Coupure envoyée"
              confirmer={`Couper le moteur de ${v.immatriculation} ? Le véhicule ne pourra plus redémarrer. La coupure se fait une fois le véhicule à l’arrêt ou à vitesse lente, selon le boîtier.`}>
              <Envoyer className="bouton petit danger">Couper le moteur</Envoyer>
            </Formulaire>)}
        <Formulaire action={A.delierTraceur.bind(null, v.id)} succes="Traceur retiré" confirmer="Retirer ce traceur du véhicule ? Le boîtier reste sur votre compte.">
          <Envoyer className="bouton petit">Retirer le traceur</Envoyer>
        </Formulaire>
      </div>
    </section>
  );
}
