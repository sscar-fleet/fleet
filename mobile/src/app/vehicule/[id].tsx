// Fiche véhicule : où elle est, son compteur, ses échéances, ses locations, et la coupure moteur
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, Carte, GrosBouton, Ligne, Texte, Titre, Chargement, BandeauHorsLigne, Rangee, Etiquette, Action } from '@/composants/ui';
import CarteLocation from '@/composants/CarteLocation';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import MiniCarte from '@/composants/MiniCarte';
import Fenetre from '@/composants/Fenetre';
import { useToast } from '@/composants/Toast';
import { chargerVehicule } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { mettreEnFile } from '@/lib/hors-ligne';
import { useCouleurs } from '@/lib/theme';
import { useGps, libelleGps, couleurGps, depuis, itineraire, commanderMoteur } from '@/lib/gps';
import { dateCourte, echeance, euros, km, statutVehicule, nomVehicule, plaque } from '@/lib/format';

export default function FicheVehicule() {
  const c = useCouleurs();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => chargerVehicule(id), [id]);
  const { donnees, horsLigne, majLe, recharger } = useDonnees(charger);
  const { gps, rafraichirGps } = useGps();
  const [statutLocal, setStatutLocal] = useState<string>();
  const [question, setQuestion] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  if (!donnees?.vehicule) return <Ecran retour titre="Véhicule"><Chargement /></Ecran>;
  const v = { ...donnees.vehicule, statut: statutLocal ?? donnees.vehicule.statut };
  const { locations } = donnees;
  const e = gps.parVehicule[v.id];

  const statut = async (s: string) => { await mettreEnFile({ genre: 'maj', table: 'vehicules', id: v.id, champs: { statut: s } }); setStatutLocal(s); toast(s === 'disponible' ? 'Véhicule remis disponible' : 'Véhicule envoyé à l’atelier'); };
  const couleurEch = (d: string | null) => (echeance(d) === 'depasse' ? c.rouge : echeance(d) === 'proche' ? c.orange : c.vert);
  async function moteur() {
    if (!e) return;
    setQuestion(false); setEnvoi(true);
    try {
      const couper = !e.moteur_coupe;
      const r = await commanderMoteur(v.id, couper);
      toast(couper ? (r.enLigne ? 'Coupure envoyée au boîtier' : 'Coupure en attente : boîtier hors ligne') : 'Moteur remis en route', couper ? 'alerte' : 'ok');
      rafraichirGps();
    } catch (err: any) { toast(err.message, 'alerte'); }
    setEnvoi(false);
  }
  const couleurStatut: Record<string, string> = { disponible: c.vert, loue: c.accent, maintenance: c.orange, hors_service: c.rouge };

  return (
    <Ecran retour titre={nomVehicule(v)} rafraichir={() => { recharger(); rafraichirGps(); }}
      surTitre={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <LogoMarque marque={v.marque} modele={v.modele} taille={64} />
        <View style={{ gap: 6 }}><Plaque immat={plaque(v.immatriculation)} /><Etiquette titre={statutVehicule[v.statut] ?? v.statut} couleur={couleurStatut[v.statut] ?? c.gris} /></View>
      </View>}
      bas={v.statut === 'disponible'
        ? <GrosBouton icone="ajout" titre="Louer ce véhicule" onPress={() => router.push({ pathname: '/nouvelle', params: { vehicule: v.id } })} />
        : v.statut === 'maintenance' || v.statut === 'hors_service' ? <GrosBouton icone="ok" titre="Remettre disponible" onPress={() => statut('disponible')} /> : undefined}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}

      {e && <>
        <Titre>En direct</Titre>
        <Carte>
          <Ligne style={{ justifyContent: 'space-between' }}>
            <Etiquette titre={libelleGps(e)} couleur={couleurGps(e, c)} />
            <Texte gris taille={13}>{depuis(e.le)}{gps.demo ? ' · aperçu' : ''}</Texte>
          </Ligne>
          {e.lat != null && e.lng != null && <MiniCarte points={[{ id: v.id, lat: e.lat, lng: e.lng, couleur: couleurGps(e, c) }]} hauteur={210} />}
          {e.alerte ? <Etiquette titre={e.alerte} couleur={c.rouge} icone="alerte" /> : null}
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {e.lat != null && <Action icone="itineraire" titre="Itinéraire" couleur={c.bleu} onPress={() => Linking.openURL(itineraire(e.lat!, e.lng!))} />}
            <Action icone="actualiser" titre="Actualiser" couleur={c.texte2} onPress={rafraichirGps} />
            {gps.actif && <Action icone={e.moteur_coupe ? 'cle' : 'moteur'} titre={envoi ? 'Envoi…' : e.moteur_coupe ? 'Remettre' : 'Couper'} couleur={e.moteur_coupe ? c.vert : c.rouge} desactive={envoi}
              onPress={() => (e.moteur_coupe ? moteur() : setQuestion(true))} />}
          </View>
        </Carte>
      </>}

      <Titre>Fiche</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee icone="jauge" couleur={c.accent} titre="Kilométrage" sous={e?.km_estime != null ? `Estimé par le traceur · fiche : ${km(v.km)}` : undefined} droite={km(e?.km_estime ?? v.km)} />
        <Rangee icone="euro" couleur={c.accent} titre="Prix par jour" droite={euros(v.prix_jour)} />
        <Rangee icone="bouclier" couleur={couleurEch(v.assurance_echeance)} titre="Assurance" droite={<Text style={{ color: v.assurance_echeance ? couleurEch(v.assurance_echeance) : c.gris, fontWeight: '800' }}>{dateCourte(v.assurance_echeance)}</Text>} />
        <Rangee fin icone="outil" couleur={couleurEch(v.ct_echeance)} titre="Contrôle technique" droite={<Text style={{ color: v.ct_echeance ? couleurEch(v.ct_echeance) : c.gris, fontWeight: '800' }}>{dateCourte(v.ct_echeance)}</Text>} />
      </Carte>

      {locations.length > 0 && <><Titre>Locations</Titre>{locations.map((l) => <CarteLocation key={l.id} l={l} genre={l.statut === 'en_cours' ? 'retour' : 'depart'} gps={e} />)}</>}
      {v.statut === 'disponible' && <GrosBouton secondaire icone="outil" titre="Envoyer à l'atelier" onPress={() => statut('maintenance')} />}

      <Fenetre visible={question} danger icone="moteur" question={`Couper le moteur de ${plaque(v.immatriculation)} ?`}
        detail="La voiture ne pourra plus redémarrer. La coupure se fait à l’arrêt ou à vitesse lente, selon le boîtier." non="Annuler" oui="Couper le moteur" onNon={() => setQuestion(false)} onOui={moteur} />
    </Ecran>
  );
}
