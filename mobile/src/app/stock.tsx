// Stock : d'un coup d'œil, les véhicules disponibles, en location et en maintenance.
// Libres : la prochaine réservation et un bouton Louer. Dehors : le client et l'heure du retour.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, Carte, Chargement, BandeauHorsLigne, Vide, Etiquette, Titre } from '@/composants/ui';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Icone from '@/composants/Icone';
import { chargerStock, type VehiculeLigne, type LocationLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { echeance, km, nomVehicule, nomClient, plaque, jour, heure, estAujourdhui } from '@/lib/format';

type Groupe = 'libres' | 'dehors' | 'atelier';
const quand = (iso: string) => `${estAujourdhui(iso) ? 'aujourd’hui' : jour(iso)} à ${heure(iso)}`;

export default function Stock() {
  const c = useCouleurs();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerStock);
  const [ouvert, setOuvert] = useState<Groupe | 'tous'>('tous');
  const vehicules: VehiculeLigne[] = donnees?.vehicules ?? [];
  const locations: LocationLigne[] = donnees?.locations ?? [];
  const maintenant = Date.now();

  const enCours = (id: string) => locations.find((l) => l.statut === 'en_cours' && l.vehicules?.id === id);
  const prochaine = (id: string) => locations.filter((l) => l.statut === 'reservee' && l.vehicules?.id === id).sort((a, b) => a.debut.localeCompare(b.debut))[0];
  const groupe = (v: VehiculeLigne): Groupe => (v.statut === 'maintenance' || v.statut === 'hors_service' ? 'atelier' : v.statut === 'loue' || enCours(v.id) ? 'dehors' : 'libres');

  const parGroupe: Record<Groupe, VehiculeLigne[]> = { libres: [], dehors: [], atelier: [] };
  vehicules.forEach((v) => parGroupe[groupe(v)].push(v));
  // Dehors : le retour le plus proche d'abord ; libres : ceux qui repartent bientôt en dernier
  parGroupe.dehors.sort((a, b) => (enCours(a.id)?.fin_prevue ?? '9').localeCompare(enCours(b.id)?.fin_prevue ?? '9'));
  parGroupe.libres.sort((a, b) => (prochaine(b.id)?.debut ?? '9').localeCompare(prochaine(a.id)?.debut ?? '9'));

  const GROUPES: { cle: Groupe; titre: string; couleur: string; icone: any }[] = [
    { cle: 'libres', titre: 'Disponibles', couleur: c.vert, icone: 'voiture' },
    { cle: 'dehors', titre: 'En location', couleur: c.accent, icone: 'cle' },
    { cle: 'atelier', titre: 'En maintenance', couleur: c.orange, icone: 'outil' },
  ];

  const Compteur = ({ g }: { g: typeof GROUPES[number] }) => {
    const actif = ouvert === g.cle;
    return (
      <Pressable onPress={() => setOuvert(actif ? 'tous' : g.cle)} style={({ pressed }) => ({ flex: 1, padding: 12, borderRadius: 16, gap: 2,
        backgroundColor: actif ? g.couleur + '22' : c.panneau, borderWidth: 1.5, borderColor: actif ? g.couleur : c.bord, opacity: pressed ? 0.85 : 1 })}>
        <Text style={{ color: g.couleur, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{parGroupe[g.cle].length}</Text>
        <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 13.5, fontWeight: '700' }}>{g.titre}</Text>
      </Pressable>
    );
  };

  const Ligne = ({ v, g }: { v: VehiculeLigne; g: typeof GROUPES[number] }) => {
    const loc = enCours(v.id);
    const suite = prochaine(v.id);
    const retard = loc && new Date(loc.fin_prevue).getTime() < maintenant;
    const papiers = echeance(v.assurance_echeance) === 'depasse' || echeance(v.ct_echeance) === 'depasse';
    const detail = g.cle === 'dehors' && loc ? `${nomClient(loc.clients)} · ${retard ? 'devait rentrer' : 'retour'} ${quand(loc.fin_prevue)}`
      : g.cle === 'libres' ? (suite ? `Réservée ${quand(suite.debut)}` : 'Aucune réservation à venir')
      : v.statut === 'hors_service' ? 'Hors service' : 'En maintenance';
    return (
      <Carte accent={retard ? c.rouge : g.couleur} onPress={() => (loc ? router.push({ pathname: '/location/[id]', params: { id: loc.id } }) : router.push({ pathname: '/vehicule/[id]', params: { id: v.id } }))}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LogoMarque marque={v.marque} modele={v.modele} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text numberOfLines={1} style={{ color: c.texte, fontSize: 16.5, fontWeight: '800' }}>{nomVehicule(v)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Plaque immat={plaque(v.immatriculation)} taille={0.62} />
              <Text style={{ color: c.gris, fontSize: 12.5 }}>{km(v.km)}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: retard ? c.rouge : c.texte2, fontSize: 13.5, fontWeight: retard ? '800' : '500' }}>{detail}</Text>
          </View>
          {g.cle === 'libres' ? (
            <Pressable onPress={() => router.push({ pathname: '/nouvelle', params: { vehicule: v.id } })} hitSlop={6}
              style={({ pressed }) => ({ paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: c.surAccent, fontWeight: '800', fontSize: 14 }}>Louer</Text>
            </Pressable>
          ) : <Icone nom="chevron" couleur={c.gris} taille={18} />}
        </View>
        {papiers && <View style={{ marginTop: 4 }}><Etiquette titre="Papiers expirés" couleur={c.rouge} icone="alerte" /></View>}
      </Carte>
    );
  };

  return (
    <Ecran retour titre="Stock" sousTitre={donnees ? `${vehicules.length} véhicule${vehicules.length > 1 ? 's' : ''}` : undefined} rafraichir={recharger} enChargement={enChargement && !!donnees}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees ? <Chargement /> : !vehicules.length ? <Vide icone="voiture" titre="Aucun véhicule" /> : <>
        <View style={{ flexDirection: 'row', gap: 8 }}>{GROUPES.map((g) => <Compteur key={g.cle} g={g} />)}</View>
        {GROUPES.filter((g) => ouvert === 'tous' || ouvert === g.cle).map((g) => parGroupe[g.cle].length ? (
          <View key={g.cle} style={{ gap: 10 }}>
            <Titre>{`${g.titre} · ${parGroupe[g.cle].length}`}</Titre>
            {parGroupe[g.cle].map((v) => <Ligne key={v.id} v={v} g={g} />)}
          </View>
        ) : ouvert === g.cle ? <Vide key={g.cle} icone="voiture" titre={`Aucun véhicule ${g.cle === 'libres' ? 'disponible' : g.cle === 'dehors' ? 'en location' : 'en maintenance'}`} /> : null)}
      </>}
    </Ecran>
  );
}
