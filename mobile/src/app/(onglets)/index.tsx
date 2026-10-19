// Écran d'ouverture : la prochaine chose à faire en grand, la journée en dessous. Rien à chercher.
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, GrosBouton, Titre, Vide, Chargement, BandeauHorsLigne, Tuile, Action, Carte, Etiquette, BoutonRond, Ligne } from '@/composants/ui';
import CarteLocation from '@/composants/CarteLocation';
import LogoMarque from '@/composants/LogoMarque';
import Synchro from '@/composants/Synchro';
import Logo from '@/composants/Logo';
import { chargerAujourdhui, voyantsDepart, type LocationLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { useGps } from '@/lib/gps';
import { appeler, ouvrirWhatsApp, msg } from '@/lib/messages';
import { heure, nomClient, nomVehicule, relatif, enRetard } from '@/lib/format';

type Tache = { l: LocationLigne; genre: 'depart' | 'retour'; quand: string };

export default function Aujourdhui() {
  const c = useCouleurs();
  const { profil } = useSession();
  const { gps } = useGps();
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(chargerAujourdhui);
  const departs = donnees?.departs ?? [];
  const retours = donnees?.retours ?? [];
  const retards = retours.filter((l) => enRetard(l.fin_prevue));
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = new Date().getHours();

  // Les retards d'abord, puis tout dans l'ordre de l'heure
  const taches: Tache[] = [...departs.map((l) => ({ l, genre: 'depart' as const, quand: l.debut })), ...retours.map((l) => ({ l, genre: 'retour' as const, quand: l.fin_prevue }))]
    .sort((a, b) => a.quand.localeCompare(b.quand));
  const prochaine = taches.find((t) => t.genre === 'retour' && enRetard(t.quand)) ?? taches[0];
  const passees = taches.filter((t) => t !== prochaine && enRetard(t.quand));
  const aVenir = taches.filter((t) => t !== prochaine && !enRetard(t.quand));
  const ouvrir = (id: string) => router.push({ pathname: '/location/[id]', params: { id } });

  return (
    <Ecran titre={`${h < 18 ? 'Bonjour' : 'Bonsoir'}${profil?.nom ? ' ' + profil.nom.split(' ')[0] : ''}`} sousTitre={`${date.charAt(0).toUpperCase() + date.slice(1)} · ${profil?.agence ?? ''}`}
      rafraichir={recharger} enChargement={enChargement && !!donnees}
      haut={<Ligne style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Logo largeur={96} />
        <Ligne style={{ flexWrap: 'nowrap' }}><Synchro /><BoutonRond icone="client" label="Mon compte" onPress={() => router.push('/compte')} /></Ligne>
      </Ligne>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger la journée" texte={erreur} />}

      {donnees && <>
        {prochaine ? <Prochaine t={prochaine} gpsEtat={prochaine.l.vehicules ? gps.parVehicule[prochaine.l.vehicules.id] : undefined} /> : (
          <Carte style={{ alignItems: 'center', paddingVertical: 26, gap: 10 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: c.vert + '22', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.vert, fontSize: 26, fontWeight: '900' }}>✓</Text></View>
            <Text style={{ color: c.texte, fontSize: 19, fontWeight: '800' }}>Plus rien de prévu aujourd'hui</Text>
            <Text style={{ color: c.gris, fontSize: 15, textAlign: 'center' }}>{donnees.demain.length ? `${donnees.demain.length} départ${donnees.demain.length > 1 ? 's' : ''} demain.` : 'Un client au comptoir ? Créez la location en 30 secondes.'}</Text>
            <GrosBouton titre="Nouvelle location" icone="ajout" onPress={() => router.push('/nouvelle')} style={{ alignSelf: 'stretch' }} />
          </Carte>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tuile valeur={departs.length} libelle="Départs du jour" couleur={c.accent} icone="depart" onPress={() => router.push({ pathname: '/locations', params: { filtre: 'avenir' } })} />
          <Tuile valeur={retours.length - retards.length} libelle="Retours du jour" couleur={c.vert} icone="arrivee" onPress={() => router.push({ pathname: '/locations', params: { filtre: 'encours' } })} />
          <Tuile valeur={retards.length} libelle="En retard" couleur={c.rouge} icone="horloge" alerte={retards.length > 0} onPress={() => router.push({ pathname: '/locations', params: { filtre: 'retard' } })} />
          <Tuile valeur={donnees.amendes} libelle="Amendes à traiter" couleur={c.orange} icone="amendes" alerte={donnees.amendes > 0} onPress={() => router.push('/amendes')} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Action icone="ajout" titre="Location" onPress={() => router.push('/nouvelle')} />
          <Action icone="amendes" titre="Amende" couleur={c.orange} onPress={() => router.push('/amende')} />
          <Action icone="client" titre="Clients" couleur={c.bleu} onPress={() => router.push('/clients')} />
          <Action icone="carte" titre="Carte GPS" couleur={c.vert} onPress={() => router.push('/carte')} />
        </View>

        {(passees.length > 0 || aVenir.length > 0) && <Titre>Programme du jour</Titre>}
        {passees.map((t) => <CarteLocation key={t.l.id + t.genre} l={t.l} genre={t.genre} gps={t.l.vehicules ? gps.parVehicule[t.l.vehicules.id] : undefined} />)}
        {passees.length > 0 && aVenir.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />
            <Text style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>MAINTENANT · {heure(new Date().toISOString())}</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: c.accent + '66' }} />
          </View>
        )}
        {aVenir.map((t) => <CarteLocation key={t.l.id + t.genre} l={t.l} genre={t.genre} gps={t.l.vehicules ? gps.parVehicule[t.l.vehicules.id] : undefined} />)}

        {donnees.demain.length > 0 && <>
          <Titre action="Tout voir" onAction={() => router.push({ pathname: '/locations', params: { filtre: 'avenir' } })}>Demain</Titre>
          <Carte style={{ paddingVertical: 4 }}>
            {donnees.demain.map((l, i) => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < donnees.demain.length - 1 ? 1 : 0, borderBottomColor: c.bord }}>
                <Text onPress={() => ouvrir(l.id)} style={{ color: c.texte, fontWeight: '800', fontSize: 16, width: 54, fontVariant: ['tabular-nums'] }}>{heure(l.debut)}</Text>
                <Text onPress={() => ouvrir(l.id)} numberOfLines={1} style={{ flex: 1, color: c.texte2, fontSize: 15 }}>{nomClient(l.clients)} · {nomVehicule(l.vehicules)}</Text>
                {voyantsDepart(l).some((v) => !v.ok) ? <Etiquette titre="À préparer" couleur={c.orange} /> : <Etiquette titre="Prêt" couleur={c.vert} icone="ok" />}
              </View>
            ))}
          </Carte>
        </>}
      </>}
    </Ecran>
  );

  // Grande carte « à faire maintenant » : un geste pour lancer l'état des lieux, appeler ou écrire
  function Prochaine({ t, gpsEtat }: { t: Tache; gpsEtat?: import('@/lib/gps').EtatGps }) {
    const { l, genre, quand } = t;
    const retard = enRetard(quand);
    const manque = genre === 'depart' ? voyantsDepart(l).filter((v) => !v.ok) : [];
    const coul = retard && genre === 'retour' ? c.rouge : genre === 'depart' ? c.accent : c.vert;
    const tel = l.clients?.telephone;
    return (
      <View style={{ borderRadius: 24, padding: 18, gap: 14, backgroundColor: coul + '14', borderWidth: 1.5, borderColor: coul + '55' }}>
        <Ligne style={{ justifyContent: 'space-between' }}>
          <Etiquette plein titre={retard && genre === 'retour' ? 'RETOUR EN RETARD' : genre === 'depart' ? 'PROCHAIN DÉPART' : 'PROCHAIN RETOUR'} couleur={coul} icone={retard ? 'alerte' : 'horloge'} />
          <Text style={{ color: coul, fontWeight: '800', fontSize: 15 }}>{heure(quand)} · {relatif(quand)}</Text>
        </Ligne>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} onPress={() => ouvrir(l.id)}>
          <LogoMarque marque={l.vehicules?.marque} modele={l.vehicules?.modele} taille={58} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: c.texte, fontSize: 22, fontWeight: '800' }}>{nomClient(l.clients)}</Text>
            <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 15 }}>{nomVehicule(l.vehicules)} · {l.vehicules?.immatriculation}</Text>
            {gpsEtat?.lat != null && genre === 'retour' && <Text style={{ color: c.gris, fontSize: 13, marginTop: 2 }}>Traceur : {gpsEtat.etat === 'roule' ? `roule à ${gpsEtat.vitesse} km/h` : 'à l’arrêt'}</Text>}
          </View>
        </Pressable>
        {manque.length > 0 && <Text style={{ color: c.orange, fontWeight: '700', fontSize: 14 }}>À régler avant de partir : {manque.map((v) => v.titre.toLowerCase()).join(', ')}</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <GrosBouton style={{ flex: 1 }} icone={manque.length ? 'doc' : 'photo'}
            titre={manque.length ? 'Préparer' : genre === 'depart' ? 'Faire partir' : 'Récupérer'}
            onPress={() => manque.length ? ouvrir(l.id) : router.push({ pathname: '/edl/[id]', params: { id: l.id, type: genre } })} />
          {tel ? <>
            <BoutonRond taille={60} icone="tel" label="Appeler" couleur={coul} onPress={() => appeler(tel)} />
            <BoutonRond taille={60} icone="whatsapp" label="WhatsApp" couleur={coul} onPress={() => ouvrirWhatsApp(tel, retard && genre === 'retour' ? msg.retard(l) : genre === 'depart' ? msg.rappelDepart(l) : msg.rappelRetour(l))} />
          </> : null}
        </View>
      </View>
    );
  }
}
