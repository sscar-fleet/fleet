// Fiche d'une location : où on en est, ce qui manque (et le bouton pour le régler), la voiture en direct,
// le client à un geste. Le gros bouton en bas lance l'étape suivante.
import { useCallback, useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, GrosBouton, Carte, Ligne, Texte, Titre, Chargement, BandeauHorsLigne, Rangee, Etiquette, Barre, Action, BoutonRond } from '@/composants/ui';
import { Puce, Puces } from '@/composants/champs';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Frise from '@/composants/Frise';
import MiniCarte from '@/composants/MiniCarte';
import Fenetre from '@/composants/Fenetre';
import { useToast } from '@/composants/Toast';
import { chargerLocation, voyantsDepart } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { mettreEnFile } from '@/lib/hors-ligne';
import { prendrePhoto } from '@/lib/photo';
import { prolonger } from '@/lib/edl';
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
  useEffect(() => { signatureDistance().then(setDistance); }, []);

  if (!donnees) return <Ecran titre="Location" retour><Chargement /></Ecran>;
  const l = { ...donnees, ...local, clients: donnees.clients ? { ...donnees.clients, ...(local.clients ?? {}) } : null };
  const cl = l.clients;
  const v = l.vehicules;
  const tel = cl?.telephone;
  const reservee = l.statut === 'reservee', enCours = l.statut === 'en_cours', finie = l.statut === 'terminee' || l.statut === 'annulee';
  const edlFait = (type: string) => l.etats_des_lieux.some((e) => e.type === type && e.statut !== 'en_attente');
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
  async function allonger(jours: number) {
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
  const lienSignature = l.jeton_signature ? urlSite(`/signer/${l.jeton_signature}`) : null;
  const lancerEdl = (type: 'depart' | 'retour') => router.push({ pathname: '/edl/[id]', params: { id: l.id, type } });

  const bas = reservee
    ? <GrosBouton icone="photo" titre={edlFait('depart') ? 'Départ en cours d’envoi…' : 'État des lieux de départ'} desactive={edlFait('depart')}
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
        <Puces>{[[1, '+1 jour'], [2, '+2 jours'], [3, '+3 jours'], [7, '+1 semaine']].map(([j, t]) => <Puce key={t} titre={String(t)} onPress={() => allonger(Number(j))} />)}</Puces>
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
