import { notFound } from 'next/navigation';
import { utilisateurCourant } from '@/lib/agence';
import { donneesAgence } from '@/lib/donnees';
import { lienWhatsApp } from '@/lib/whatsapp';
import { date, dateHeure, euros, km, joursEntre } from '@/lib/format';
import * as A from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import BoutonPdf from '../../_c/BoutonPdf';

export const dynamic = 'force-dynamic';

export default async function FicheDevis({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: x } = await supabase.from('devis').select('*, vehicules(id, immatriculation, marque, modele)').eq('id', params.id).maybeSingle();
  if (!x) notFound();
  const agence = await donneesAgence(supabase, profil.agence_id);
  const { data: vehicules } = await supabase.from('vehicules').select('id, immatriculation, marque, modele').not('statut', 'in', '(hors_service,sorti)').order('immatriculation');
  const num = `D-${String(x.numero).padStart(4, '0')}`;
  const voiture = x.vehicules ? [x.vehicules.marque, x.vehicules.modele].filter(Boolean).join(' ') : null;
  const jours = joursEntre(x.debut, x.fin);
  const message = `Bonjour ${String(x.client_nom).split(' ')[0]}, voici votre devis ${num} de ${agence.nom} : location${voiture ? ' ' + voiture : ''} du ${dateHeure(x.debut)} au ${dateHeure(x.fin)} (${jours} jour${jours > 1 ? 's' : ''}), ${euros(x.prix_total)}${x.caution ? `, caution ${euros(x.caution)}` : ''}${x.km_inclus ? `, ${x.km_inclus} km inclus` : ''}. Pour réserver, répondez simplement à ce message.`;
  const donnees = { agence, devis: { ...x, client: { nom: x.client_nom, telephone: x.telephone, email: x.email }, vehicule: voiture ? `${voiture} (${x.vehicules.immatriculation})` : null } };

  return (
    <Cadre retour={{ lien: '/devis', texte: 'Devis' }} titre={`Devis ${num}`} tables={['devis']}
      actions={<span className={`pastille ${x.statut === 'accepte' ? 'ok' : x.statut === 'refuse' ? 'annulee' : 'reservee'}`}>{x.statut === 'accepte' ? 'Accepté' : x.statut === 'refuse' ? 'Refusé' : 'Envoyé'}</span>}>
      <div className="colonnes">
        <section className="carte">
          <h2>{x.client_nom}</h2>
          <div className="infos">
            <div><span>Départ</span><b>{dateHeure(x.debut)}</b></div>
            <div><span>Retour</span><b>{dateHeure(x.fin)}</b></div>
            <div><span>Durée</span><b>{jours} jour{jours > 1 ? 's' : ''}</b></div>
            <div><span>Prix</span><b>{euros(x.prix_total)}</b></div>
            <div><span>Véhicule</span><b>{voiture ? `${x.vehicules.immatriculation} · ${voiture}` : 'À choisir'}</b></div>
            <div><span>Km inclus</span><b>{x.km_inclus != null ? km(x.km_inclus) : 'Illimités'}</b></div>
            <div><span>Caution</span><b>{euros(x.caution)}</b></div>
            <div><span>Valable jusqu&apos;au</span><b>{date(x.valide_jusqu)}</b></div>
          </div>
          {x.note && <p className="gris">{x.note}</p>}
          <div className="ligne" style={{ marginTop: 14 }}>
            <BoutonPdf genre="devis" nom={`devis-${num}.pdf`} libelle="Devis PDF" donnees={donnees} />
            <a className="bouton" target="_blank" rel="noreferrer" href={lienWhatsApp(x.telephone, message)}>Envoyer par WhatsApp</a>
          </div>
          <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Sur téléphone, « Devis PDF » ouvre le partage pour l&apos;envoyer en pièce jointe.</p>
        </section>
        <section className="carte">
          <h2>Le client a répondu ?</h2>
          {x.location_id ? (
            <p>Réservation créée. <a className="lien" href={`/locations/${x.location_id}`}>Ouvrir la location</a></p>
          ) : x.statut === 'refuse' ? (
            <Formulaire action={A.statutDevis.bind(null, x.id, 'envoye')}><Envoyer className="bouton">Remettre en attente</Envoyer></Formulaire>
          ) : (
            <>
              <Formulaire action={A.transformerDevis.bind(null, x.id)} className="grille">
                {!x.vehicule_id && <label className="pleine">Véhicule à réserver<select name="vehicule_id" required><option value="">Choisir…</option>
                  {vehicules?.map((v: any) => <option key={v.id} value={v.id}>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>}
                <Envoyer>Accepté : créer la réservation</Envoyer>
              </Formulaire>
              <Formulaire action={A.statutDevis.bind(null, x.id, 'refuse')} style={{ marginTop: 10 }}><Envoyer className="bouton">Refusé</Envoyer></Formulaire>
              <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>La réservation reprend les dates, le prix, les kilomètres et la caution du devis. Le client est créé s&apos;il n&apos;existe pas.</p>
            </>
          )}
        </section>
      </div>
    </Cadre>
  );
}
