// Écran Journée : une seule question, « qu’est-ce que je dois faire maintenant ? ». La prochaine chose en grand, le reste de la journée en liste simple.
import VisuelVehicule from '@/composants/VisuelVehicule';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, GrosBouton, Vide, Chargement, BandeauHorsLigne, BoutonRond, Ligne } from '@/composants/ui';
import { Verre, Point, Libelle, useSombre } from '@/composants/Ambiance';
import Synchro from '@/composants/Synchro';
import Logo from '@/composants/Logo';
import { chargerAujourdhui, voyantsDepart, type LocationLigne } from '@/lib/donnees';
import Icone from '@/composants/Icone';
import ClocheAppli from '@/composants/ClocheAppli';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import JourneeTransport from '@/composants/transport/JourneeTransport';
import MesTournees from '@/composants/transport/MesTournees';
import { useCouleurs } from '@/lib/theme';
import { useGps } from '@/lib/gps';
import { appeler, ouvrirWhatsApp, msg } from '@/lib/messages';
import { heure, nomClient, nomVehicule, relatif, enRetard, duree, plaque } from '@/lib/format';

type Tache = { l: LocationLigne; genre: 'depart' | 'retour'; quand: string };

// Accueil selon le métier : location, transport (responsable) ou chauffeur
export default function Accueil() {
  const { profil } = useSession();
  if (profil?.metier === 'transport') return profil.acces === 'chauffeur' ? <MesTournees /> : <JourneeTransport />;
  return <Aujourdhui />;
}

function Aujourdhui() {
  const c = useCouleurs();
  const sombre = useSombre();
  const { profil } = useSession();
  const { gps } = useGps();
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(chargerAujourdhui);
  const departs = donnees?.departs ?? [];
  const retours = donnees?.retours ?? [];
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = new Date().getHours();

  // Ce qui reste à faire, dans l'ordre de l'heure ; un retour en retard passe toujours en premier
  const taches: Tache[] = [...departs.map((l) => ({ l, genre: 'depart' as const, quand: l.debut })), ...retours.map((l) => ({ l, genre: 'retour' as const, quand: l.fin_prevue }))]
    .sort((a, b) => a.quand.localeCompare(b.quand));
  const prochaine = taches.find((t) => t.genre === 'retour' && enRetard(t.quand)) ?? taches[0];
  const ensuite = taches.filter((t) => t !== prochaine);
  // Ce qui est déjà fait aujourd'hui, en grisé
  const faits: (Tache & { fait: true })[] = [
    ...(donnees?.partis ?? []).map((l) => ({ l, genre: 'depart' as const, quand: l.debut, fait: true as const })),
    ...(donnees?.rendus ?? []).map((l) => ({ l, genre: 'retour' as const, quand: l.fin_reelle ?? l.fin_prevue, fait: true as const })),
  ].sort((a, b) => a.quand.localeCompare(b.quand));
  const retards = taches.filter((t) => enRetard(t.quand) && t !== prochaine);
  const ouvrir = (id: string) => router.push({ pathname: '/location/[id]', params: { id } });

  return (
    <Ecran ambiance titre={`${h < 18 ? 'Bonjour' : 'Bonsoir'}${profil?.nom ? ' ' + profil.nom.split(' ')[0] : ''}`} sousTitre={date.charAt(0).toUpperCase() + date.slice(1)}
      rafraichir={recharger} enChargement={enChargement && !!donnees}
      haut={<Ligne style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Logo largeur={96} variante="fleet" />
        <Ligne style={{ flexWrap: 'nowrap' }}><Synchro /><ClocheAppli /><BoutonRond icone="outil" label="Mon compte" onPress={() => router.push('/compte')} /></Ligne>
      </Ligne>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger la journée" texte={erreur} />}

      {donnees && <>
        <BarreFleetAI />

        {/* Un vrai problème, et seulement s'il y en a un */}
        {retards.length > 0 && (
          <Verre bord={c.rouge + '88'} style={{ backgroundColor: c.rouge + '1c', paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            onPress={() => ouvrir(retards[0].l.id)} label="Voir le retard">
            <Icone nom="alerte" couleur={c.rouge} taille={20} />
            <Text numberOfLines={2} style={{ flex: 1, color: sombre ? '#ffc2c8' : c.rouge, fontSize: 15, fontWeight: '700' }}>
              {retards.length > 1 ? `${retards.length} autres en retard` : `${retards[0].genre === 'retour' ? 'Retour' : 'Départ'} en retard · ${nomClient(retards[0].l.clients)} · ${duree(Date.now() - new Date(retards[0].quand).getTime())}`}
            </Text>
            <Icone nom="chevron" couleur={c.rouge} taille={18} />
          </Verre>
        )}

        {prochaine ? Maintenant({ t: prochaine, gpsEtat: prochaine.l.vehicules ? gps.parVehicule[prochaine.l.vehicules.id] : undefined }) : (
          <Verre style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 18, gap: 10 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.vert + '22', alignItems: 'center', justifyContent: 'center' }}><Icone nom="ok" couleur={c.vert} taille={28} epaisseur={2.6} /></View>
            <Text style={{ color: c.texte, fontSize: 20, fontWeight: '800' }}>Plus rien à faire aujourd'hui</Text>
            <Text style={{ color: c.gris, fontSize: 15, textAlign: 'center' }}>{donnees.demain.length ? `${donnees.demain.length} départ${donnees.demain.length > 1 ? 's' : ''} demain.` : 'Un client au comptoir ? La location se crée en 30 secondes.'}</Text>
            <GrosBouton titre="Nouvelle location" icone="ajout" onPress={() => router.push('/nouvelle')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
          </Verre>
        )}

        {(ensuite.length > 0 || faits.length > 0) && <View style={{ marginTop: 10, marginBottom: -2, paddingHorizontal: 2 }}><Libelle>Aujourd'hui</Libelle></View>}
        {(ensuite.length > 0 || faits.length > 0) && (
          <Verre style={{ paddingVertical: 4 }}>
            {[...ensuite, ...faits].map((t, i, tout) => <Fragment key={t.l.id + t.genre + ('fait' in t ? 'f' : '')}>{LigneJournee({ t, fait: 'fait' in t, fin: i === tout.length - 1 })}</Fragment>)}
          </Verre>
        )}
      </>}
    </Ecran>
  );

  // Une ligne de la journée : l'heure, la voiture, le client. Rien d'autre.
  function LigneJournee({ t, fait, fin }: { t: Tache; fait: boolean; fin: boolean }) {
    const retard = !fait && enRetard(t.quand);
    const coulHeure = fait ? c.gris : retard ? c.rouge : c.texte;
    return (
      <Pressable onPress={() => ouvrir(t.l.id)} accessibilityLabel={`${t.genre === 'depart' ? 'Départ' : 'Retour'} ${heure(t.quand)}, ${nomClient(t.l.clients)}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, opacity: fait ? 0.5 : pressed ? 0.75 : 1,
          borderBottomWidth: fin ? 0 : 1, borderBottomColor: sombre ? 'rgba(255,255,255,.08)' : c.bord })}>
        <Text style={{ width: 50, color: coulHeure, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'], textDecorationLine: fait ? 'line-through' : 'none' }}>{heure(t.quand)}</Text>
        <VisuelVehicule v={t.l.vehicules} taille={34} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 15.5, fontWeight: '700' }}>{nomClient(t.l.clients)}</Text>
          <Text numberOfLines={1} style={{ color: retard ? c.rouge : c.gris, fontSize: 13, fontWeight: retard ? '700' : '500' }}>
            {fait ? (t.genre === 'depart' ? 'Parti' : 'Rendu') : retard ? `${t.genre === 'depart' ? 'Départ' : 'Retour'} en retard` : t.genre === 'depart' ? 'Départ' : 'Retour'} · {t.l.vehicules?.modele ?? nomVehicule(t.l.vehicules)}
          </Text>
        </View>
        {fait ? <Icone nom="ok" couleur={c.vert} taille={18} epaisseur={2.6} /> : <Icone nom={t.genre === 'depart' ? 'depart' : 'arrivee'} couleur={retard ? c.rouge : t.genre === 'depart' ? c.accent : c.vert} taille={18} />}
      </Pressable>
    );
  }

  // La prochaine chose à faire, en grand : la voiture, le client, l'heure, un seul bouton
  function Maintenant({ t, gpsEtat }: { t: Tache; gpsEtat?: import('@/lib/gps').EtatGps }) {
    const { l, genre, quand } = t;
    const retard = enRetard(quand);
    const manque = genre === 'depart' ? voyantsDepart(l).filter((v) => !v.ok) : [];
    const coul = retard ? (genre === 'retour' ? c.rouge : c.orange) : genre === 'depart' ? c.accent : c.vert;
    const tel = l.clients?.telephone;
    const libelle = retard ? (genre === 'retour' ? 'Retour en retard' : 'Départ en retard') : genre === 'depart' ? 'Prochain départ' : 'Prochain retour';
    const quandTexte = retard ? `+ ${duree(Date.now() - new Date(quand).getTime())}` : `${heure(quand)} · ${relatif(quand)}`;
    return (
      <Verre bord={coul + '77'} style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Point couleur={coul} />
          <Libelle couleur={coul}>{libelle}</Libelle>
          <Text style={{ flex: 1, textAlign: 'right', color: coul, fontWeight: '800', fontSize: 14.5 }}>{quandTexte}</Text>
        </View>
        <Pressable onPress={() => ouvrir(l.id)} style={({ pressed }) => ({ alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })} accessibilityLabel="Ouvrir la location">
          <VisuelVehicule v={l.vehicules} taille={104} />
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 }}>{nomClient(l.clients)}</Text>
          <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 15 }}>{nomVehicule(l.vehicules)} · <Text style={{ letterSpacing: 1.2, color: c.gris }}>{plaque(l.vehicules?.immatriculation)}</Text></Text>
          {retard && <Text style={{ color: coul, fontSize: 14, fontWeight: '700' }}>{genre === 'retour' ? 'Devait rentrer' : 'Devait partir'} à {heure(quand)}</Text>}
          {gpsEtat?.lat != null && genre === 'retour' && <Text style={{ color: c.gris, fontSize: 13.5 }}>{gpsEtat.etat === 'roule' ? `Roule à ${gpsEtat.vitesse} km/h` : 'À l’arrêt'}{gpsEtat.adresse ? ` · ${gpsEtat.adresse}` : ''}</Text>}
        </Pressable>
        {manque.length > 0 && <Text style={{ color: c.orange, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>À régler avant de partir : {manque.map((v) => v.titre.toLowerCase()).join(', ')}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <GrosBouton style={{ flex: 1 }} icone={manque.length ? 'doc' : 'photo'}
            titre={manque.length ? 'Préparer' : genre === 'depart' ? 'Faire partir' : 'Récupérer'}
            onPress={() => manque.length ? ouvrir(l.id) : router.push({ pathname: '/edl/[id]', params: { id: l.id, type: genre } })} />
          {tel ? <>
            <BoutonRond taille={56} icone="tel" label="Appeler" couleur={coul} onPress={() => appeler(tel)} />
            <BoutonRond taille={56} icone="whatsapp" label="WhatsApp" couleur={coul} onPress={() => ouvrirWhatsApp(tel, retard && genre === 'retour' ? msg.retard(l) : genre === 'depart' ? msg.rappelDepart(l) : msg.rappelRetour(l))} />
          </> : null}
        </View>
      </Verre>
    );
  }
}

// Fleet AI : une seule barre, toujours là, sans prendre la place de la journée
function BarreFleetAI() {
  const c = useCouleurs();
  const sombre = useSombre();
  const demander = (dicter?: boolean) => router.push({ pathname: '/assistant', params: dicter ? { dicter: '1' } : {} } as any);
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable onPress={() => demander()} accessibilityLabel="Écrire à Fleet AI"
        style={({ pressed }) => ({ flex: 1, height: 50, borderRadius: 25, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.85 : 1,
          backgroundColor: sombre ? 'rgba(6,10,14,.46)' : c.panneau, borderWidth: 1, borderColor: c.accent + '66' })}>
        <Icone nom="ia" couleur={c.accent} taille={20} />
        <Text numberOfLines={1} style={{ flex: 1, color: c.gris, fontSize: 15.5 }}>Demande à Fleet AI…</Text>
      </Pressable>
      <Pressable onPress={() => demander(true)} accessibilityLabel="Parler à Fleet AI"
        style={({ pressed }) => ({ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 })}>
        <Icone nom="micro" couleur={c.surAccent} taille={22} />
      </Pressable>
    </View>
  );
}
