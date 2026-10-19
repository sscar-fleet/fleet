// Fiche d'une location : où on en est, ce qui manque (et le bouton pour le régler), la voiture en direct,
// le client à un geste. Le gros bouton en bas lance l'étape suivante.
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, GrosBouton, Carte, Ligne, Texte, Titre, Chargement, BandeauHorsLigne, Rangee, Etiquette, Barre, Action, BoutonRond } from '@/composants/ui';
import { Puce, Puces } from '@/composants/champs';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Frise from '@/composants/Frise';
import MiniCarte from '@/composants/MiniCarte';
import Fenetre from '@/composants/Fenetre';
import Feuille from '@/composants/Feuille';
import Calendrier from '@/composants/Calendrier';
import { useToast } from '@/composants/Toast';
import { chargerLocation, chargerLocations, voyantsDepart, type LocationLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { mettreEnFile, enAttente, envoyerFile } from '@/lib/hors-ligne';
import { prendrePhoto } from '@/lib/photo';
import { prolonger, lienDocument } from '@/lib/edl';
import { useGps, libelleGps, couleurGps, depuis, itineraire, commanderMoteur } from '@/lib/gps';
import { signatureDistance } from '@/lib/capacites';
import { urlSite } from '@/lib/site';
import { appeler, ouvrirWhatsApp, ouvrirSms, msg } from '@/lib/messages';
import { euros, heure, jour, km, nomClient, nomVehicule, relatif, enRetard, nbJours } from '@/lib/format';

const CAUTION: Record<string, string> = { a_prendre: 'à prendre', prise: 'prise', rendue: 'rendue', encaissee: 'encaissée', litige: 'en litige' };

export default function FicheLocation() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => chargerLocation(id), [id]);
  const { donnees, horsLigne, majLe, recharger } = useDonnees(charger);
  const { gps, rafraichirGps } = useGps();
  const [local, setLocal] = useState<Record<string, any>>({});
  const [distance, setDistance] = useState(false);
  const [question, setQuestion] = useState<null | 'moteur' | 'manque' | { prevenir: { fin: string; prix: number | null } }>(null);
  const [envoiMoteur, setEnvoiMoteur] = useState(false);
  const [feuilleFin, setFeuilleFin] = useState<Date | null>(null);
  const [attente, setAttente] = useState(0);
  const [docEnCours, setDocEnCours] = useState<string | null>(null);
  useEffect(() => { const lire = () => enAttente().then(setAttente).catch(() => {}); lire(); const t = setInterval(lire, 3000); return () => clearInterval(t); }, []);
  const [occupations, setOccupations] = useState<LocationLigne[]>([]);
  useEffect(() => { chargerLocations().then((r) => setOccupations(r.donnees)).catch(() => {}); }, []);
  useEffect(() => { signatureDistance().then(setDistance); }, []);

  if (!donnees) return <Ecran titre="Location" retour><Chargement /></Ecran>;
  const l = { ...donnees, ...local, clients: donnees.clients ? { ...donnees.clients, ...(local.clients ?? {}) } : null };
  const cl = l.clients;
  const v = l.vehicules;
  const tel = cl?.telephone;
  const reservee = l.statut === 'reservee', enCours = l.statut === 'en_cours', finie = l.statut === 'terminee' || l.statut === 'annulee';
  const retard = enCours && enRetard(l.fin_prevue);
  const etatGps = v ? gps.parVehicule[v.id] : undefined;
  const contratSigne = !!(l.signature_contrat_path || l.signe_distance_le);
  const manque = reservee ? voyantsDepart(l).filter((x) => !x.ok) : [];
  const etape = l.statut === 'annulee' ? 0 : reservee ? 0 : enCours ? 1 : 3;
  const kmFaits = etatGps?.km_estime != null && l.km_depart != null ? etatGps.km_estime - l.km_depart : null;

  async function photoPapier(champ: 'permis_path' | 'piece_identite_path') {
    if (!profil || !cl) return;
    const p = await prendrePhoto();
    if (!p) return;
    const chemin = `${profil.agence_id}/clients/${cl.id}/${champ.replace('_path', '')}-${Date.now()}.jpg`;
    await mettreEnFile({ genre: 'fichier', chemin, uri: p.uri, type: 'image/jpeg', ensuite: { genre: 'maj', table: 'clients', id: cl.id, champs: { [champ]: chemin } } });
    setLocal((x) => ({ ...x, clients: { ...(x.clients ?? {}), [champ]: chemin } }));
    toast(champ === 'permis_path' ? 'Permis enregistré' : 'Pièce d’identité enregistrée');
  }
  async function cautionPrise() {
    await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { caution_statut: 'prise' } });
    setLocal((x) => ({ ...x, caution_statut: 'prise' }));
    toast(`Caution de ${euros(l.caution_montant)} notée comme prise`);
  }
  async function allonger(jours: number | Date) {
    setFeuilleFin(null);
    const r = await prolonger(l, jours);
    setLocal((x) => ({ ...x, fin_prevue: r.fin, prix_total: r.prix }));
    toast(`Prolongée jusqu’au ${jour(r.fin)} ${heure(r.fin)}`);
    if (tel) setQuestion({ prevenir: r });
  }
  async function moteur() {
    if (!v || !etatGps) return;
    setQuestion(null); setEnvoiMoteur(true);
    try {
      const couper = !etatGps.moteur_coupe;
      const r = await commanderMoteur(v.id, couper);
      toast(couper ? (r.enLigne ? 'Coupure envoyée au boîtier' : 'Coupure en attente : boîtier hors ligne') : 'Moteur remis en route', couper ? 'alerte' : 'ok');
      rafraichirGps();
    } catch (e: any) { toast(e.message, 'alerte'); }
    setEnvoiMoteur(false);
  }
  // Réservation suivante de la même voiture : une prolongation ne doit pas la chevaucher
  const suivante = occupations.filter((o) => o.id !== l.id && o.vehicules?.id === v?.id && o.statut === 'reservee' && o.debut >= l.debut).sort((a, b) => a.debut.localeCompare(b.debut))[0];
  const conflitFin = feuilleFin && suivante && feuilleFin > new Date(suivante.debut);
  const joursEnPlus = feuilleFin ? Math.max(0, Math.ceil((feuilleFin.getTime() - new Date(l.fin_prevue).getTime()) / 864e5 - 0.01)) : 0;
  const lienSignature = l.jeton_signature ? urlSite(`/signer/${l.jeton_signature}`) : null;
  // État des lieux fini mais location pas encore à jour (envoi interrompu) : on termine d'un geste
  const edlDepart = l.etats_des_lieux.find((e) => e.type === 'depart' && e.statut !== 'en_attente');
  const edlRetour = l.etats_des_lieux.find((e) => e.type === 'retour' && e.statut !== 'en_attente');
  async function validerDepart() {
    if (!edlDepart || !v) return;
    await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { statut: 'en_cours', km_depart: edlDepart.km ?? l.km_depart, carburant_depart: edlDepart.carburant ?? null } });
    await mettreEnFile({ genre: 'maj', table: 'vehicules', id: v.id, champs: { statut: 'loue', ...(edlDepart.km != null ? { km: edlDepart.km } : {}) } });
    setLocal((x) => ({ ...x, statut: 'en_cours', km_depart: edlDepart.km ?? l.km_depart }));
    toast('Départ validé : la location est en cours');
    setTimeout(recharger, 2500);
  }
  async function validerRetour() {
    if (!edlRetour || !v) return;
    await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { statut: 'terminee', km_retour: edlRetour.km ?? null, carburant_retour: edlRetour.carburant ?? null, fin_reelle: new Date().toISOString() } });
    await mettreEnFile({ genre: 'maj', table: 'vehicules', id: v.id, champs: { statut: 'disponible', ...(edlRetour.km != null ? { km: edlRetour.km } : {}) } });
    setLocal((x) => ({ ...x, statut: 'terminee' }));
    toast('Retour validé : la voiture est disponible');
    setTimeout(recharger, 2500);
  }
  // Ouvrir le PDF, ou l'envoyer au client par WhatsApp avec le lien
  const NOMS_DOC = { contrat: 'votre contrat de location', facture: 'votre facture', edl_depart: 'l’état des lieux de départ (photos, kilométrage, carburant)', edl_retour: 'l’état des lieux de retour (photos, kilométrage, carburant)' } as const;
  async function documentPdf(genre: keyof typeof NOMS_DOC, envoyer: boolean) {
    setDocEnCours(genre + (envoyer ? '-envoi' : ''));
    try {
      const lien = await lienDocument(l.id, genre);
      if (!lien) toast('Photos encore en cours d’envoi, réessayez dans un instant', 'alerte');
      else if (envoyer) ouvrirWhatsApp(tel, `Bonjour ${cl?.prenom ?? ''}, voici ${NOMS_DOC[genre]} pour la ${nomVehicule(v)} : ${lien}`);
      else Linking.openURL(lien);
    } catch (e: any) { toast(e?.message ?? 'PDF impossible', 'alerte'); }
    setDocEnCours(null);
  }
  const DocActions = ({ genre }: { genre: keyof typeof NOMS_DOC }) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <BoutonRond icone={docEnCours === genre ? 'sync' : 'doc'} label="Ouvrir le PDF" onPress={() => documentPdf(genre, false)} />
      {tel ? <BoutonRond icone={docEnCours === genre + '-envoi' ? 'sync' : 'whatsapp'} label="Envoyer au client" couleur={c.vert} onPress={() => documentPdf(genre, true)} /> : null}
    </View>
  );
  const lancerEdl = (type: 'depart' | 'retour') => router.push({ pathname: '/edl/[id]', params: { id: l.id, type } });

  const bas = reservee && edlDepart
    ? (attente > 0
      ? <GrosBouton icone="sync" titre="Envoi en cours…" sousTitre={`${attente} élément${attente > 1 ? 's' : ''} à envoyer · touchez pour relancer`} onPress={() => envoyerFile().then(() => enAttente().then(setAttente))} />
      : <GrosBouton icone="ok" titre="Valider le départ" sousTitre={`État des lieux fait${edlDepart.km != null ? ` · ${km(edlDepart.km)}` : ''}`} onPress={validerDepart} />)
    : enCours && edlRetour
    ? (attente > 0
      ? <GrosBouton icone="sync" titre="Envoi en cours…" sousTitre={`${attente} élément${attente > 1 ? 's' : ''} à envoyer · touchez pour relancer`} onPress={() => envoyerFile().then(() => enAttente().then(setAttente))} />
      : <GrosBouton icone="ok" titre="Valider le retour" sousTitre={`État des lieux fait${edlRetour.km != null ? ` · ${km(edlRetour.km)}` : ''}`} onPress={validerRetour} />)
    : reservee
    ? <GrosBouton icone="photo" titre="État des lieux de départ"
        sousTitre={manque.length ? `${manque.length} point${manque.length > 1 ? 's' : ''} à régler` : 'Tout est prêt'}
        onPress={() => (manque.length ? setQuestion('manque') : lancerEdl('depart'))} />
    : enCours ? <GrosBouton icone="arrivee" titre="État des lieux de retour" sousTitre={retard ? `En retard ${relatif(l.fin_prevue).replace('depuis ', '')}` : `Prévu ${jour(l.fin_prevue)} ${heure(l.fin_prevue)}`} onPress={() => lancerEdl('retour')} />
    : undefined;

  return (
    <Ecran retour titre={nomClient(cl)} rafraichir={() => { recharger(); rafraichirGps(); }} bas={bas}
      surTitre={<Ligne style={{ marginBottom: 6 }}>
        <Etiquette titre={`Contrat n° ${l.numero ?? '—'}`} couleur={c.gris} />
        {retard ? <Etiquette plein titre="En retard" couleur={c.rouge} icone="horloge" /> : <Etiquette titre={reservee ? 'Réservée' : enCours ? 'En cours' : l.statut === 'terminee' ? 'Terminée' : 'Annulée'} couleur={reservee ? c.accent : enCours ? c.vert : c.gris} />}
      </Ligne>}
      actions={tel ? <><BoutonRond icone="tel" label="Appeler" onPress={() => appeler(tel)} /><BoutonRond icone="whatsapp" label="WhatsApp" onPress={() => ouvrirWhatsApp(tel, reservee ? msg.rappelDepart(l) : retard ? msg.retard(l) : msg.rappelRetour(l))} /></> : undefined}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}

      {/* La voiture */}
      <Carte onPress={v ? () => router.push({ pathname: '/vehicule/[id]', params: { id: v.id } }) : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <LogoMarque marque={v?.marque} modele={v?.modele} taille={56} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: c.texte, fontSize: 19, fontWeight: '800' }}>{nomVehicule(v)}</Text>
            <Plaque immat={v?.immatriculation} taille={0.85} />
          </View>
        </View>
      </Carte>

      {/* Les dates */}
      <Carte>
        <Frise etapes={['Réservée', 'En route', 'Retour', 'Terminée']} actuelle={etape} couleur={retard ? c.rouge : undefined} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <View style={{ flex: 1 }}><Texte gris taille={13}>DÉPART</Texte><Texte gras taille={18}>{jour(l.debut)}</Texte><Texte gras taille={22} couleur={c.accent}>{heure(l.debut)}</Texte></View>
          <View style={{ alignItems: 'center', paddingHorizontal: 8 }}><Text style={{ color: c.gris, fontWeight: '800' }}>{nbJours(l.debut, l.fin_prevue)} j</Text><Text style={{ color: c.gris, fontSize: 20 }}>→</Text></View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}><Texte gris taille={13}>RETOUR</Texte><Texte gras taille={18}>{jour(l.fin_prevue)}</Texte><Texte gras taille={22} couleur={retard ? c.rouge : c.vert}>{heure(l.fin_prevue)}</Texte></View>
        </View>
        {enCours && <View style={{ gap: 6, marginTop: 4 }}>
          <Barre part={(Date.now() - new Date(l.debut).getTime()) / (new Date(l.fin_prevue).getTime() - new Date(l.debut).getTime())} couleur={retard ? c.rouge : c.vert} />
          <Texte gris taille={14}>{retard ? `Retour attendu ${relatif(l.fin_prevue)}` : `Retour ${relatif(l.fin_prevue)}`}</Texte>
        </View>}
        {reservee && <Texte gris taille={14}>Départ {relatif(l.debut)}</Texte>}
      </Carte>

      {/* Avant le départ : chaque point manquant se règle ici */}
      {reservee && <>
        <Titre>Avant le départ</Titre>
        <Carte style={{ paddingVertical: 4 }}>
          {cl?.liste_noire && <Rangee icone="alerte" couleur={c.rouge} titre="Client en liste noire" sous="Vérifiez avant de remettre les clés" />}
          <Rangee icone="carteId" couleur={cl?.permis_path ? c.vert : c.orange} titre="Permis de conduire" sous={cl?.permis_path ? 'Enregistré' : 'Touchez pour le photographier'}
            droite={cl?.permis_path ? <Etiquette titre="OK" couleur={c.vert} icone="ok" /> : <Etiquette titre="Photo" couleur={c.orange} icone="photo" />} onPress={() => photoPapier('permis_path')} chevron={false} />
          <Rangee icone="client" couleur={cl?.piece_identite_path ? c.vert : c.orange} titre="Pièce d’identité" sous={cl?.piece_identite_path ? 'Enregistrée' : 'Touchez pour la photographier'}
            droite={cl?.piece_identite_path ? <Etiquette titre="OK" couleur={c.vert} icone="ok" /> : <Etiquette titre="Photo" couleur={c.orange} icone="photo" />} onPress={() => photoPapier('piece_identite_path')} chevron={false} />
          {l.caution_montant ? <Rangee icone="bouclier" couleur={l.caution_statut === 'prise' ? c.vert : c.orange} titre={`Caution ${euros(l.caution_montant)}`}
            sous={l.caution_statut === 'prise' ? 'Prise' : 'Touchez quand elle est prise'} chevron={false}
            droite={l.caution_statut === 'prise' ? <Etiquette titre="Prise" couleur={c.vert} icone="ok" /> : <Etiquette titre="À prendre" couleur={c.orange} />}
            onPress={l.caution_statut === 'prise' ? undefined : cautionPrise} /> : null}
          <Rangee icone="signature" couleur={contratSigne ? c.vert : c.bleu} titre="Contrat"
            sous={contratSigne ? 'Signé' : distance && lienSignature ? 'Envoyez le lien : il signe sur son téléphone' : 'Signé avec l’état des lieux de départ'} chevron={false}
            droite={contratSigne ? <Etiquette titre="Signé" couleur={c.vert} icone="ok" /> : distance && lienSignature ? <Etiquette titre="Envoyer" couleur={c.bleu} icone="envoyer" /> : undefined}
            onPress={!contratSigne && distance && lienSignature ? () => ouvrirWhatsApp(tel, msg.signature(l, lienSignature)) : undefined} />
          <Rangee fin icone="voiture" couleur={v?.statut === 'disponible' ? c.vert : c.orange} titre="Voiture" sous={v?.statut === 'disponible' ? 'Disponible' : v?.statut === 'loue' ? 'Encore louée : attendez son retour' : 'À l’atelier'}
            droite={v?.statut === 'disponible' ? <Etiquette titre="Prête" couleur={c.vert} icone="ok" /> : <Etiquette titre="Pas prête" couleur={c.orange} />} />
        </Carte>
      </>}

      {/* Pendant la location : la voiture en direct */}
      {enCours && etatGps && <>
        <Titre>La voiture en direct</Titre>
        <Carte>
          <Ligne style={{ justifyContent: 'space-between' }}>
            <Etiquette titre={libelleGps(etatGps)} couleur={couleurGps(etatGps, c)} />
            <Texte gris taille={13}>{depuis(etatGps.le)}{gps.demo ? ' · aperçu' : ''}</Texte>
          </Ligne>
          {etatGps.lat != null && etatGps.lng != null && <MiniCarte points={[{ id: etatGps.vehicule_id, lat: etatGps.lat, lng: etatGps.lng, couleur: couleurGps(etatGps, c) }]} />}
          {kmFaits != null && <View style={{ gap: 6, marginTop: 4 }}>
            <Ligne style={{ justifyContent: 'space-between' }}>
              <Texte gras>{km(kmFaits)} parcourus</Texte>
              {l.km_inclus ? <Texte gris taille={14}>sur {km(l.km_inclus)} inclus</Texte> : <Texte gris taille={14}>kilométrage illimité</Texte>}
            </Ligne>
            {l.km_inclus ? <Barre part={kmFaits / (l.km_inclus)} couleur={kmFaits > l.km_inclus ? c.rouge : c.bleu} /> : null}
          </View>}
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {etatGps.lat != null && <Action icone="itineraire" titre="Itinéraire" couleur={c.bleu} onPress={() => Linking.openURL(itineraire(etatGps.lat!, etatGps.lng!))} />}
            <Action icone="actualiser" titre="Actualiser" couleur={c.texte2} onPress={rafraichirGps} />
            {gps.actif && <Action icone={etatGps.moteur_coupe ? 'cle' : 'moteur'} titre={envoiMoteur ? 'Envoi…' : etatGps.moteur_coupe ? 'Remettre' : 'Couper'} couleur={etatGps.moteur_coupe ? c.vert : c.rouge} desactive={envoiMoteur}
              onPress={() => (etatGps.moteur_coupe ? moteur() : setQuestion('moteur'))} />}
          </View>
        </Carte>
      </>}

      {enCours && <>
        <Titre>Prolonger</Titre>
        <Puces>
          {[[1, '+1 jour'], [2, '+2 jours'], [3, '+3 jours'], [7, '+1 semaine']].map(([j, t]) => <Puce key={t} titre={String(t)} onPress={() => allonger(Number(j))} />)}
          <Puce titre="Choisir une date" couleur={c.bleu} actif onPress={() => setFeuilleFin(new Date(new Date(l.fin_prevue).getTime() + 864e5))} />
        </Puces>
        {suivante && <Texte gris taille={13}>Prochaine réservation de cette voiture : {jour(suivante.debut)} {heure(suivante.debut)} (n° {suivante.numero ?? '—'}).</Texte>}
        {v?.prix_jour ? <Texte gris taille={13}>Prix ajusté automatiquement : {euros(v.prix_jour)} par jour supplémentaire.</Texte> : null}
      </>}

      <Titre>Contrat</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee icone="euro" couleur={c.accent} titre="Prix total" droite={euros(l.prix_total)} />
        <Rangee icone="bouclier" couleur={c.accent} titre="Caution" sous={l.caution_montant ? CAUTION[l.caution_statut] ?? l.caution_statut : undefined} droite={l.caution_montant ? euros(l.caution_montant) : 'Aucune'} />
        <Rangee icone="jauge" couleur={c.accent} titre="Kilomètres" sous={l.km_inclus && l.prix_km_sup ? `${euros(l.prix_km_sup)} le km en plus` : undefined} droite={l.km_inclus ? km(l.km_inclus) : 'Illimités'} />
        {l.km_depart != null && <Rangee icone="depart" couleur={c.accent} titre="Compteur au départ" droite={km(l.km_depart)} />}
        <Rangee fin icone="signature" couleur={contratSigne ? c.vert : c.gris} titre="Signature" droite={contratSigne ? 'Signé' : 'Pas encore'} />
      </Carte>

      <Titre>Documents</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee icone="doc" couleur={c.accent} titre="Contrat de location" sous={contratSigne ? 'Signé · PDF' : 'PDF'} chevron={false}
          droite={<DocActions genre="contrat" />} />
        {edlDepart && <Rangee icone="photo" couleur={c.bleu} titre="État des lieux de départ" sous="Photos, compteur, carburant" chevron={false} droite={<DocActions genre="edl_depart" />} />}
        {edlRetour && <Rangee icone="photo" couleur={c.bleu} titre="État des lieux de retour" sous="Photos, compteur, carburant" chevron={false} droite={<DocActions genre="edl_retour" />} />}
        {finie && <Rangee icone="euro" couleur={c.vert} titre="Facture" sous="PDF" chevron={false} droite={<DocActions genre="facture" />} />}
        <View style={{ height: 2 }} />
      </Carte>

      <Titre>Client</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee fin icone="client" couleur={cl?.liste_noire ? c.rouge : c.bleu} titre={nomClient(cl)} sous={[tel, cl?.email].filter(Boolean).join(' · ') || 'Pas de coordonnées'}
          onPress={cl ? () => router.push({ pathname: '/client/[id]', params: { id: cl.id } }) : undefined} />
      </Carte>
      {tel ? <View style={{ flexDirection: 'row' }}>
        <Action icone="tel" titre="Appeler" onPress={() => appeler(tel)} />
        <Action icone="whatsapp" titre="WhatsApp" couleur={c.vert} onPress={() => ouvrirWhatsApp(tel, reservee ? msg.rappelDepart(l) : retard ? msg.retard(l) : msg.rappelRetour(l))} />
        <Action icone="message" titre="SMS" couleur={c.bleu} onPress={() => ouvrirSms(tel, reservee ? msg.rappelDepart(l) : msg.rappelRetour(l))} />
        {!finie && distance && lienSignature && !contratSigne ? <Action icone="signature" titre="Lien contrat" couleur={c.orange} onPress={() => ouvrirWhatsApp(tel, msg.signature(l, lienSignature))} /> : null}
      </View> : null}

      <Feuille visible={!!feuilleFin} titre="Nouvelle date de retour" onFermer={() => setFeuilleFin(null)}>
        {feuilleFin && <>
          <Calendrier retourSeul debut={new Date(l.fin_prevue)} fin={feuilleFin} onChange={(_, f) => setFeuilleFin(f)} />
          <Titre>Heure de retour</Titre>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {Array.from({ length: 33 }, (_, i) => [6 + Math.floor(i / 2), i % 2 ? 30 : 0]).map(([h, m]) => (
              <Puce key={`${h}${m}`} titre={`${h}:${String(m).padStart(2, '0')}`} couleur={c.vert} actif={feuilleFin.getHours() === h && feuilleFin.getMinutes() === m}
                onPress={() => { const f = new Date(feuilleFin); f.setHours(h, m, 0, 0); setFeuilleFin(f); }} />
            ))}
          </ScrollView>
          <Carte accent={conflitFin ? c.rouge : c.vert}>
            <Texte gras>Retour le {jour(feuilleFin.toISOString())} à {heure(feuilleFin.toISOString())}</Texte>
            <Texte gris taille={15}>{joursEnPlus} jour{joursEnPlus > 1 ? 's' : ''} de plus{v?.prix_jour && l.prix_total != null ? ` · nouveau total ${euros(Number(l.prix_total) + Number(v.prix_jour) * joursEnPlus)}` : ''}</Texte>
            {conflitFin && suivante ? <Texte gras couleur={c.rouge} taille={15}>Attention : la voiture est réservée à partir du {jour(suivante.debut)} {heure(suivante.debut)} (n° {suivante.numero ?? '—'}).</Texte> : null}
          </Carte>
          <GrosBouton icone="prolonger" titre="Prolonger jusqu’à cette date" danger={!!conflitFin} desactive={feuilleFin <= new Date(l.fin_prevue)} onPress={() => allonger(feuilleFin)} />
        </>}
      </Feuille>

      <Fenetre visible={question === 'moteur'} danger icone="moteur" question={`Couper le moteur de ${v?.immatriculation ?? 'la voiture'} ?`}
        detail="La voiture ne pourra plus redémarrer. La coupure se fait à l’arrêt ou à vitesse lente, selon le boîtier." non="Annuler" oui="Couper le moteur" onNon={() => setQuestion(null)} onOui={moteur} />
      <Fenetre visible={question === 'manque'} question="Il reste des points à régler" detail={manque.map((x) => x.titre).join(', ')}
        non="Les régler d’abord" oui="Commencer quand même" onNon={() => setQuestion(null)} onOui={() => { setQuestion(null); lancerEdl('depart'); }} />
      <Fenetre visible={typeof question === 'object' && question !== null} icone="whatsapp" ouiEnAvant question={`Prévenir ${cl?.prenom ?? 'le client'} ?`} detail="WhatsApp s’ouvre avec le message prêt, vous n’avez plus qu’à envoyer."
        oui="Ouvrir WhatsApp" non="Plus tard" onNon={() => setQuestion(null)}
        onOui={() => { if (typeof question === 'object' && question) ouvrirWhatsApp(tel, msg.prolongation(l, question.prevenir.fin, question.prevenir.prix)); setQuestion(null); }} />
    </Ecran>
  );
}
