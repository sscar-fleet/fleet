// Nouvelle amende : la voiture, la date, le montant → le conducteur est retrouvé tout seul
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ecran, Carte, GrosBouton, Texte, Titre, Chargement } from '@/composants/ui';
import { Champ, Puce, Puces } from '@/composants/champs';
import { chargerVehicules, retrouverConducteur, type VehiculeLigne } from '@/lib/donnees';
import { mettreEnFile, enLigne } from '@/lib/hors-ligne';
import { nouvelId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { nomClient } from '@/lib/format';

const TYPES = ['Excès de vitesse', 'Stationnement', 'Feu rouge', 'Péage', 'Téléphone', 'Autre'];

export default function NouvelleAmende() {
  const c = useCouleurs();
  const { profil } = useSession();
  const [vehicules, setVehicules] = useState<VehiculeLigne[]>();
  const [vehicule, setVehicule] = useState<VehiculeLigne>();
  const [photo, setPhoto] = useState<string>();
  const [date, setDate] = useState(''); // JJ/MM/AAAA
  const [heure, setHeure] = useState(''); // HH:MM
  const [montant, setMontant] = useState('');
  const [type, setType] = useState('');
  const [conducteur, setConducteur] = useState<any>(undefined);

  useEffect(() => { chargerVehicules().then((r) => setVehicules(r.donnees)); }, []);

  const quand = (() => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(date.trim());
    if (!m) return null;
    const [hh, mm] = (/^\d{1,2}[:h]\d{2}$/.test(heure.trim()) ? heure.trim().split(/[:h]/) : ['12', '00']).map(Number);
    const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(a, Number(m[2]) - 1, Number(m[1]), hh, mm);
    return isNaN(d.getTime()) ? null : d.toISOString();
  })();

  useEffect(() => {
    if (!vehicule || !quand) { setConducteur(undefined); return; }
    enLigne().then((ok) => ok ? retrouverConducteur(vehicule.id, quand).then(setConducteur) : setConducteur(undefined));
  }, [vehicule, quand]);

  async function photographier() {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  }

  async function enregistrer() {
    if (!profil || !vehicule || !quand) return;
    const id = nouvelId();
    const echeance = new Date(new Date(quand).getTime() + 45 * 864e5).toISOString().slice(0, 10);
    await mettreEnFile({ genre: 'ajout', table: 'amendes', champs: {
      id, agence_id: profil.agence_id, vehicule_id: vehicule.id, location_id: conducteur?.id ?? null, client_id: conducteur?.client_id ?? null,
      type: type || null, date_infraction: quand, montant: montant ? Number(montant.replace(',', '.')) : null, echeance,
      statut: conducteur ? 'a_designer' : 'infos_manquantes' } });
    if (photo) {
      const chemin = `${profil.agence_id}/amendes/${id}-${Date.now()}.jpg`;
      await mettreEnFile({ genre: 'fichier', chemin, uri: photo, type: 'image/jpeg', ensuite: { genre: 'maj', table: 'amendes', id, champs: { avis_path: chemin } } });
    }
    router.back();
  }

  return (
    <Ecran titre="Nouvelle amende" bas={<GrosBouton titre="Enregistrer l'amende" desactive={!vehicule || !quand} onPress={enregistrer} />}>
      <GrosBouton secondaire titre={photo ? 'Avis photographié ✓ (reprendre)' : "Photographier l'avis"} onPress={photographier} />
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 180, borderRadius: 14 }} resizeMode="cover" /> : null}
      <Texte gris taille={14}>Bientôt, l'IA lira l'avis toute seule : immatriculation, date, lieu et montant.</Texte>

      <Titre>Véhicule</Titre>
      {!vehicules ? <Chargement /> : <Puces>{vehicules.map((v) => <Puce key={v.id} titre={v.immatriculation} actif={vehicule?.id === v.id} onPress={() => setVehicule(v)} />)}</Puces>}

      <Titre>Quand</Titre>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 3 }}><Champ valeur={date} onChange={setDate} placeholder="JJ/MM/AAAA" clavier="numbers-and-punctuation" /></View>
        <View style={{ flex: 2 }}><Champ valeur={heure} onChange={setHeure} placeholder="HH:MM" clavier="numbers-and-punctuation" /></View>
      </View>

      <Titre>Infraction</Titre>
      <Puces>{TYPES.map((t) => <Puce key={t} titre={t} actif={type === t} onPress={() => setType(type === t ? '' : t)} />)}</Puces>
      <Champ libelle="Montant (€)" valeur={montant} onChange={setMontant} clavier="decimal-pad" />

      {vehicule && quand ? (
        <Carte accent={conducteur ? c.vert : c.orange}>
          <Texte gras>{conducteur ? `Conducteur : ${nomClient(conducteur.clients)}` : conducteur === null ? 'Aucune location ce jour-là' : 'Recherche du conducteur…'}</Texte>
          <Texte gris>{conducteur ? 'Retrouvé grâce à la location en cours à ce moment-là.' : 'L’amende sera marquée « infos manquantes ».'}</Texte>
        </Carte>
      ) : null}
    </Ecran>
  );
}
