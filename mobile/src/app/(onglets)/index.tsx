// Écran d'ouverture : la prochaine chose à faire en grand, la journée en dessous. Rien à chercher.
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, GrosBouton, Titre, Vide, Chargement, BandeauHorsLigne, Tuile, Carte, Etiquette, BoutonRond, Ligne } from '@/composants/ui';
import { useToast } from '@/composants/Toast';
import { mettreEnFile } from '@/lib/hors-ligne';
import CarteLocation from '@/composants/CarteLocation';
import LogoMarque from '@/composants/LogoMarque';
import Synchro from '@/composants/Synchro';
import Logo from '@/composants/Logo';
import { chargerAujourdhui, chargerStock, voyantsDepart, type LocationLigne } from '@/lib/donnees';
import Icone from '@/composants/Icone';
import ClocheAppli from '@/composants/ClocheAppli';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { useGps } from '@/lib/gps';
import { appeler, ouvrirWhatsApp, msg } from '@/lib/messages';
import { heure, nomClient, nomVehicule, relatif, enRetard, duree, plaque } from '@/lib/format';

type Tache = { l: LocationLigne; genre: 'depart' | 'retour'; quand: string };

export default function Aujourdhui() {
  const c = useCouleurs();
  const { profil } = useSession();
  const { gps } = useGps();
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(chargerAujourdhui);
  const stock = useDonnees(chargerStock).donnees;
  const enLoc = (id: string) => stock?.locations.some((l) => l.statut === 'en_cours' && l.vehicules?.id === id);
  const nbAtelier = stock?.vehicules.filter((v) => v.statut === 'maintenance' || v.statut === 'hors_service').length ?? 0;
  const nbDehors = stock?.vehicules.filter((v) => !(v.statut === 'maintenance' || v.statut === 'hors_service') && (v.statut === 'loue' || enLoc(v.id))).length ?? 0;
  const nbLibres = (stock?.vehicules.length ?? 0) - nbAtelier - nbDehors;
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
        <Logo largeur={92} variante="fleet" />
        <Ligne style={{ flexWrap: 'nowrap' }}><Synchro /><ClocheAppli /><BoutonRond icone="client" label="Clients" onPress={() => router.push('/clients')} /><BoutonRond icone="outil" label="Mon compte" onPress={() => router.push('/compte')} /></Ligne>
      </Ligne>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger la journée" texte={erreur} />}

      {donnees && <>
        <CarteFleetAI retards={retards.length} amendes={donnees.amendes} libres={nbLibres} />
        {prochaine ? <Prochaine t={prochaine} gpsEtat={prochaine.l.vehicules ? gps.parVehicule[prochaine.l.vehicules.id] : undefined} /> : (
          <Carte style={{ alignItems: 'center', paddingVertical: 26, gap: 10 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: c.vert + '22', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.vert, fontSize: 26, fontWeight: '900' }}>✓</Text></View>
            <Text style={{ color: c.texte, fontSize: 19, fontWeight: '800' }}>Plus rien de prévu aujourd'hui</Text>
            <Text style={{ color: c.gris, fontSize: 15, textAlign: 'center' }}>{donnees.demain.length ? `${donnees.demain.length} départ${donnees.demain.length > 1 ? 's' : ''} demain.` : 'Un client au comptoir ? Créez la location en 30 secondes.'}</Text>
            <GrosBouton titre="Nouvelle location" icone="ajout" onPress={() => router.push('/nouvelle')} style={{ alignSelf: 'stretch' }} />
          </Carte>
        )}

        {stock && stock.vehicules.length > 0 && (
          <Pressable onPress={() => router.push('/stock')} style={({ pressed }) => ({ padding: 14, gap: 12, borderRadius: 20, backgroundColor: c.panneau, borderWidth: 1, borderColor: c.bord, opacity: pressed ? 0.9 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>Ma flotte <Text style={{ color: c.gris, fontWeight: '600', fontSize: 15 }}>· {stock.vehicules.length} véhicules</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ color: c.accent, fontWeight: '800', fontSize: 14 }}>Voir le stock</Text>
                <Icone nom="chevron" couleur={c.accent} taille={16} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { n: nbLibres, libelle: nbLibres > 1 ? 'Disponibles' : 'Disponible', couleur: c.vert },
                { n: nbDehors, libelle: 'En location', couleur: c.accent },
                { n: nbAtelier, libelle: 'En maintenance', couleur: c.orange },
              ].map((x) => (
                <View key={x.libelle} style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, backgroundColor: x.couleur + (x.n ? '1f' : '0d'), borderWidth: 1, borderColor: x.couleur + (x.n ? '55' : '22'), gap: 2 }}>
                  <Text style={{ color: x.n ? x.couleur : c.gris, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 34 }}>{x.n}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: x.n ? c.texte : c.gris, fontSize: 13, fontWeight: '700' }}>{x.libelle}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tuile valeur={departs.length} libelle="Départs du jour" couleur={c.accent} icone="depart" onPress={() => router.push({ pathname: '/locations', params: { filtre: 'avenir' } })} />
          <Tuile valeur={retours.length - retards.length} libelle="Retours du jour" couleur={c.vert} icone="arrivee" onPress={() => router.push({ pathname: '/locations', params: { filtre: 'encours' } })} />
          <Tuile valeur={retards.length} libelle="En retard" couleur={c.rouge} icone="horloge" alerte={retards.length > 0} onPress={() => router.push({ pathname: '/locations', params: { filtre: 'retard' } })} />
          <Tuile valeur={donnees.amendes} libelle="Amendes à traiter" couleur={c.orange} icone="amendes" alerte={donnees.amendes > 0} onPress={() => router.push('/amendes')} />
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
    const toast = useToast();
    const [confirmer, setConfirmer] = useState(false);
    const { l, genre, quand } = t;
    const retard = enRetard(quand);
    const departRetard = retard && genre === 'depart';
    // Client pas venu : on décale le départ à maintenant (même durée) ou on annule, sans ouvrir la fiche
    async function decaler() {
      const ecart = Date.now() - new Date(l.debut).getTime();
      const debut = new Date().toISOString();
      const fin = new Date(new Date(l.fin_prevue).getTime() + ecart).toISOString();
      await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { debut, fin_prevue: fin } });
      toast(`Départ décalé à ${heure(debut)}, retour le ${new Date(fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${heure(fin)}`);
      setTimeout(recharger, 1500);
    }
    async function annuler() {
      if (!confirmer) { setConfirmer(true); return; }
      await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { statut: 'annulee' } });
      toast('Location annulée');
      setTimeout(recharger, 1500);
    }
    const manque = genre === 'depart' ? voyantsDepart(l).filter((v) => !v.ok) : [];
    const coul = retard ? (genre === 'retour' ? c.rouge : c.orange) : genre === 'depart' ? c.accent : c.vert;
    const tel = l.clients?.telephone;
    return (
      <View style={{ borderRadius: 24, padding: 18, gap: 14, backgroundColor: coul + '14', borderWidth: 1.5, borderColor: coul + '55' }}>
        <Ligne style={{ justifyContent: 'space-between' }}>
          <Etiquette plein titre={retard ? (genre === 'retour' ? 'RETOUR EN RETARD' : 'DÉPART EN RETARD') : genre === 'depart' ? 'PROCHAIN DÉPART' : 'PROCHAIN RETOUR'} couleur={coul} icone={retard ? 'alerte' : 'horloge'} />
          <Text style={{ color: coul, fontWeight: '800', fontSize: 15 }}>{retard ? `prévu ${heure(quand)} · ${duree(Date.now() - new Date(quand).getTime())} de retard` : `${heure(quand)} · ${relatif(quand)}`}</Text>
        </Ligne>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} onPress={() => ouvrir(l.id)}>
          <LogoMarque marque={l.vehicules?.marque} modele={l.vehicules?.modele} taille={58} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: c.texte, fontSize: 22, fontWeight: '800' }}>{nomClient(l.clients)}</Text>
            <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 15 }}>{nomVehicule(l.vehicules)} · {plaque(l.vehicules?.immatriculation)}</Text>
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
        {departRetard && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <GrosBouton petit secondaire style={{ flex: 1 }} icone="horloge" titre="Décaler à maintenant" onPress={decaler} />
            <GrosBouton petit secondaire danger={confirmer} style={{ flex: 1 }} titre={confirmer ? 'Confirmer l’annulation' : 'Annuler'} onPress={annuler} />
          </View>
        )}
      </View>
    );
  }
}

// Fleet AI en tête de la journée : on le voit, on lui parle, il sert tous les jours.
// Les suggestions changent selon ce qui se passe dans l'agence.
function CarteFleetAI({ retards, amendes, libres }: { retards: number; amendes: number; libres: number }) {
  const c = useCouleurs();
  const h = new Date().getHours();
  const idees = [
    retards > 0 ? `Préviens les ${retards > 1 ? retards + ' clients' : 'clients'} en retard` : null,
    amendes > 0 ? 'Quelles amendes je dois traiter ?' : null,
    h < 12 ? 'Résume ma journée' : 'Qui rend une voiture demain ?',
    libres > 0 ? 'Quelles voitures sont libres ce week-end ?' : 'Quand une voiture se libère ?',
    'Combien j’ai encaissé ce mois ?',
  ].filter(Boolean).slice(0, 4) as string[];
  const demander = (q?: string, dicter?: boolean) => router.push({ pathname: '/assistant', params: q ? { q } : dicter ? { dicter: '1' } : {} } as any);
  return (
    <View style={{ borderRadius: 22, padding: 14, gap: 12, backgroundColor: c.accent + '14', borderWidth: 1.5, borderColor: c.accent + '66' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icone nom="ia" couleur={c.surAccent} taille={23} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.texte, fontSize: 18, fontWeight: '900', letterSpacing: -0.2 }}>Fleet AI</Text>
          <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 13 }}>Ton assistant. Il prépare, tu confirmes.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => demander()} accessibilityLabel="Écrire à Fleet AI"
          style={({ pressed }) => ({ flex: 1, height: 50, borderRadius: 25, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.panneau, borderWidth: 1, borderColor: c.bord, opacity: pressed ? 0.85 : 1 })}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.gris, fontSize: 15.5 }}>Demande-lui n’importe quoi…</Text>
        </Pressable>
        <Pressable onPress={() => demander(undefined, true)} accessibilityLabel="Parler à Fleet AI"
          style={({ pressed }) => ({ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 })}>
          <Icone nom="micro" couleur={c.surAccent} taille={23} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -14 }} >
        <View style={{ width: 6 }} />
        {idees.map((i) => (
          <Pressable key={i} onPress={() => demander(i)}
            style={({ pressed }) => ({ paddingVertical: 9, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: c.accent + '55', backgroundColor: pressed ? c.accent + '33' : c.fond })}>
            <Text style={{ color: c.texte, fontSize: 14, fontWeight: '700' }}>{i}</Text>
          </Pressable>
        ))}
        <View style={{ width: 6 }} />
      </ScrollView>
    </View>
  );
}
