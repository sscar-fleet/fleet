// Écran Journée, simple comme une page d'agenda : le jour (on passe d'un jour à l'autre), une phrase, puis une tuile par départ ou retour.
import VisuelVehicule from '@/composants/VisuelVehicule';
import { Fragment, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, GrosBouton, Vide, Chargement, BandeauHorsLigne, BoutonRond, Ligne } from '@/composants/ui';
import { Verre, Libelle, useSombre } from '@/composants/Ambiance';
import Synchro from '@/composants/Synchro';
import Logo from '@/composants/Logo';
import { chargerAujourdhui, chargerLocations, type LocationLigne } from '@/lib/donnees';
import Icone from '@/composants/Icone';
import ClocheAppli from '@/composants/ClocheAppli';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import JourneeTransport from '@/composants/transport/JourneeTransport';
import MesTournees from '@/composants/transport/MesTournees';
import { useCouleurs } from '@/lib/theme';
import { heure, nomClient, nomVehicule, enRetard, duree, plaque } from '@/lib/format';

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
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(chargerAujourdhui);
  const toutes = useDonnees(chargerLocations);
  const [decalage, setDecalage] = useState(0); // 0 = aujourd'hui, 1 = demain, -1 = hier…
  const jourVu = new Date(); jourVu.setDate(jourVu.getDate() + decalage);
  const debut = new Date(jourVu); debut.setHours(0, 0, 0, 0);
  const fin = new Date(jourVu); fin.setHours(23, 59, 59, 999);
  const auj = decalage === 0;
  const h = new Date().getHours();

  // Aujourd'hui : la journée vient du serveur (retards compris) ; les autres jours se lisent dans les locations en cours et à venir
  const dans = (iso: string) => { const t = new Date(iso).getTime(); return t >= debut.getTime() && t <= fin.getTime(); };
  const ls = toutes.donnees ?? [];
  const departs = auj ? donnees?.departs ?? [] : ls.filter((l) => l.statut === 'reservee' && dans(l.debut));
  const retours = auj ? donnees?.retours ?? [] : ls.filter((l) => l.statut === 'en_cours' && dans(l.fin_prevue));
  const taches: Tache[] = [...departs.map((l) => ({ l, genre: 'depart' as const, quand: l.debut })), ...retours.map((l) => ({ l, genre: 'retour' as const, quand: l.fin_prevue }))]
    .sort((a, b) => (enRetard(b.quand) && auj ? 1 : 0) - (enRetard(a.quand) && auj ? 1 : 0) || a.quand.localeCompare(b.quand));
  const faits: Tache[] = auj ? [
    ...(donnees?.partis ?? []).map((l) => ({ l, genre: 'depart' as const, quand: l.debut })),
    ...(donnees?.rendus ?? []).map((l) => ({ l, genre: 'retour' as const, quand: l.fin_reelle ?? l.fin_prevue })),
  ].sort((a, b) => a.quand.localeCompare(b.quand)) : [];
  const ouvrir = (id: string) => router.push({ pathname: '/location/[id]', params: { id } });
  const nbD = departs.length, nbR = retours.length;
  const resume = !nbD && !nbR ? (auj && faits.length ? 'Tout est fait pour aujourd’hui.' : 'Rien de prévu ce jour-là.')
    : `${auj ? 'Tu as' : 'Prévu :'} ${nbD ? `${nbD} départ${nbD > 1 ? 's' : ''}` : ''}${nbD && nbR ? ' et ' : ''}${nbR ? `${nbR} retour${nbR > 1 ? 's' : ''}` : ''}${auj ? ' aujourd’hui' : ''}.`;
  const libelleJour = jourVu.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Ecran ambiance titre={`${h < 18 ? 'Bonjour' : 'Bonsoir'}${profil?.nom ? ' ' + profil.nom.split(' ')[0] : ''}`}
      rafraichir={() => { recharger(); toutes.recharger(); }} enChargement={enChargement && !!donnees}
      haut={<Ligne style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Logo largeur={96} variante="fleet" />
        <Ligne style={{ flexWrap: 'nowrap' }}><Synchro /><ClocheAppli /><BoutonRond icone="outil" label="Mon compte" onPress={() => router.push('/compte')} /></Ligne>
      </Ligne>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger la journée" texte={erreur} />}

      {donnees && <>
        {/* Le jour : on passe d'un jour à l'autre d'un geste */}
        <Verre style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, height: 54 }}>
          <Pressable onPress={() => setDecalage((d) => d - 1)} hitSlop={8} accessibilityLabel="Jour précédent" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icone nom="retour" couleur={c.texte2} taille={20} />
          </Pressable>
          <Pressable onPress={() => setDecalage(0)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }} accessibilityLabel="Revenir à aujourd’hui">
            <Text style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>{libelleJour.charAt(0).toUpperCase() + libelleJour.slice(1)}</Text>
            {auj ? <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: c.accent }}><Text style={{ color: c.surAccent, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }}>AUJOURD’HUI</Text></View>
              : <Text style={{ color: c.accent, fontSize: 13, fontWeight: '800' }}>Aujourd’hui</Text>}
          </Pressable>
          <Pressable onPress={() => setDecalage((d) => d + 1)} hitSlop={8} accessibilityLabel="Jour suivant" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icone nom="chevron" couleur={c.texte2} taille={20} />
          </Pressable>
        </Verre>

        {/* Ma journée : une phrase, puis une tuile par chose à faire */}
        <Verre style={{ padding: 16, gap: 12 }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: c.accent, fontSize: 20, fontWeight: '800' }}>{auj ? 'Ma journée' : 'Ce jour-là'}</Text>
            <Text style={{ color: c.texte2, fontSize: 15 }}>{resume}</Text>
          </View>
          {taches.map((t) => <Fragment key={t.l.id + t.genre}>{Tuile({ t, fait: false })}</Fragment>)}
          {!taches.length && auj && (
            <GrosBouton titre="Nouvelle location" icone="ajout" onPress={() => router.push('/nouvelle')} />
          )}
          {faits.length > 0 && <>
            <View style={{ marginTop: 4 }}><Libelle>Déjà fait</Libelle></View>
            {faits.map((t) => <Fragment key={t.l.id + t.genre + 'f'}>{Tuile({ t, fait: true })}</Fragment>)}
          </>}
        </Verre>
      </>}
    </Ecran>
  );

  // Une tuile : ce qu'il faut faire et à quelle heure, le client, la voiture en photo. On touche, on y va.
  function Tuile({ t, fait }: { t: Tache; fait: boolean }) {
    const retard = !fait && auj && enRetard(t.quand);
    const coul = fait ? c.gris : retard ? c.rouge : t.genre === 'depart' ? c.accent : c.bleu;
    const quoi = fait ? (t.genre === 'depart' ? 'Parti' : 'Rendu') : retard ? (t.genre === 'depart' ? 'Départ en retard' : 'Retour en retard') : t.genre === 'depart' ? 'Départ' : 'Retour';
    const quand = retard ? `+ ${duree(Date.now() - new Date(t.quand).getTime())}` : heure(t.quand);
    return (
      <Pressable onPress={() => ouvrir(t.l.id)} accessibilityLabel={`${quoi} ${heure(t.quand)}, ${nomClient(t.l.clients)}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 10, borderRadius: 14,
          backgroundColor: coul + (fait ? '14' : sombre ? '26' : '18'), borderWidth: 1, borderColor: coul + (fait ? '33' : '77'), opacity: fait ? 0.6 : pressed ? 0.8 : 1 })}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icone nom={fait ? 'ok' : t.genre === 'depart' ? 'depart' : 'arrivee'} couleur={coul} taille={15} epaisseur={2.4} />
            <Text style={{ color: coul, fontSize: 12.5, fontWeight: '900', letterSpacing: 1 }}>{quoi.toUpperCase()} · {quand}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>{nomClient(t.l.clients)}</Text>
          <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 13.5 }}>{nomVehicule(t.l.vehicules)} · <Text style={{ color: c.gris, letterSpacing: 1 }}>{plaque(t.l.vehicules?.immatriculation)}</Text></Text>
        </View>
        <VisuelVehicule v={t.l.vehicules} taille={48} />
      </Pressable>
    );
  }
}
