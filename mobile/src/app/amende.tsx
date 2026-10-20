// Nouvelle amende : photo de l'avis → lecture automatique → la voiture et le conducteur sont retrouvés
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, Carte, GrosBouton, Texte, Titre, Chargement, Ligne } from '@/composants/ui';
import { Champ, Puce, Puces } from '@/composants/champs';
import Icone from '@/composants/Icone';
import { useToast } from '@/composants/Toast';
import { chargerVehicules, retrouverConducteur, type VehiculeLigne } from '@/lib/donnees';
import { mettreEnFile, enLigne } from '@/lib/hors-ligne';
import { nouvelId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { lireAmende } from '@/lib/ia';
import { prendrePhoto } from '@/lib/photo';
import { DEMO } from '@/lib/demo';
import { nomClient, jour, heure as fHeure, plaque } from '@/lib/format';

const TYPES = ['Excès de vitesse', 'Stationnement', 'Feu rouge', 'Péage', 'Téléphone', 'Autre'];
const jj = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export default function NouvelleAmende() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil } = useSession();
  const [vehicules, setVehicules] = useState<VehiculeLigne[]>();
  const [vehicule, setVehicule] = useState<VehiculeLigne>();
  const [photo, setPhoto] = useState<string>();
  const [lecture, setLecture] = useState(false);
  const [lu, setLu] = useState(false);
  const [date, setDate] = useState(''); // JJ/MM/AAAA
  const [heure, setHeure] = useState(''); // HH:MM
  const [montant, setMontant] = useState('');
  const [type, setType] = useState('');
  const [lieu, setLieu] = useState('');
  const [numero, setNumero] = useState('');
  const [conducteur, setConducteur] = useState<any>(undefined);

  useEffect(() => { chargerVehicules().then((r) => setVehicules(r.donnees)).catch(() => setVehicules([])); }, []);

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
    if (DEMO) { setConducteur(vehicule.id === 'v3' ? { id: 'r1', client_id: 'c3', clients: { prenom: 'Yanis', nom: 'Laurent' } } : null); return; }
    enLigne().then((ok) => ok ? retrouverConducteur(vehicule.id, quand).then(setConducteur) : setConducteur(undefined));
  }, [vehicule, quand]);

  async function photographier() {
    const p = await prendrePhoto({ pourIa: true, qualite: 0.75 });
    if (!p) return;
    setPhoto(p.uri);
    if (!p.dataUrl) return;
    setLecture(true);
    try {
      const ch = await lireAmende(p.dataUrl);
      const immat = String(ch.immatriculation ?? '').toUpperCase().replace(/[\s-]/g, '');
      const v = vehicules?.find((x) => x.immatriculation.toUpperCase().replace(/[\s-]/g, '') === immat);
      if (v) setVehicule(v);
      if (ch.date_infraction) { const d = new Date(String(ch.date_infraction)); if (!isNaN(d.getTime())) { setDate(jj(d)); setHeure(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); } }
      if (ch.montant != null) setMontant(String(ch.montant));
      if (ch.type) setType(TYPES.find((t) => String(ch.type).toLowerCase().includes(t.toLowerCase().split(' ')[0])) ?? 'Autre');
      if (ch.lieu) setLieu(String(ch.lieu));
      if (ch.numero_avis) setNumero(String(ch.numero_avis));
      setLu(true);
      toast(v ? 'Avis lu : vérifiez les informations' : `Avis lu, mais ${immat || 'l’immatriculation'} n’est pas dans la flotte`, v ? 'ok' : 'alerte');
    } catch (e: any) { toast(e.message ?? 'Lecture impossible, remplissez à la main', 'info'); }
    setLecture(false);
  }

  async function enregistrer() {
    if (!profil || !vehicule || !quand) return;
    const id = nouvelId();
    const echeance = new Date(new Date(quand).getTime() + 45 * 864e5).toISOString().slice(0, 10);
    await mettreEnFile({ genre: 'ajout', table: 'amendes', champs: {
      id, agence_id: profil.agence_id, vehicule_id: vehicule.id, location_id: conducteur?.id ?? null, client_id: conducteur?.client_id ?? null,
      type: type || null, date_infraction: quand, montant: montant ? Number(montant.replace(',', '.')) : null, echeance, lieu: lieu.trim() || null, numero_avis: numero.trim() || null,
      statut: conducteur ? 'a_designer' : 'infos_manquantes' } });
    if (photo) {
      const chemin = `${profil.agence_id}/amendes/${id}-${Date.now()}.jpg`;
      await mettreEnFile({ genre: 'fichier', chemin, uri: photo, type: 'image/jpeg', ensuite: { genre: 'maj', table: 'amendes', id, champs: { avis_path: chemin } } });
    }
    toast(conducteur ? `Amende enregistrée · conducteur : ${nomClient(conducteur.clients)}` : 'Amende enregistrée (conducteur à compléter)');
    router.back();
  }

  const hier = new Date(Date.now() - 864e5), avantHier = new Date(Date.now() - 2 * 864e5);
  return (
    <Ecran fermer titre="Nouvelle amende" bas={<GrosBouton icone="ok" titre="Enregistrer l'amende" desactive={!vehicule || !quand} sousTitre={!vehicule ? 'Choisissez la voiture' : !quand ? 'Indiquez la date' : undefined} onPress={enregistrer} />}>
      <Pressable onPress={photographier} style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderStyle: photo ? 'solid' : 'dashed', borderColor: lu ? c.vert : c.accent, backgroundColor: c.accent + '10', minHeight: 150, justifyContent: 'center' }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 190 }} resizeMode="cover" /> : (
          <View style={{ alignItems: 'center', gap: 8, padding: 20 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.accent + '22', alignItems: 'center', justifyContent: 'center' }}><Icone nom="photo" couleur={c.accent} taille={30} /></View>
            <Text style={{ color: c.texte, fontWeight: '800', fontSize: 18 }}>Photographier l'avis</Text>
            <Text style={{ color: c.gris, fontSize: 14, textAlign: 'center' }}>Immatriculation, date, lieu et montant se remplissent tout seuls</Text>
          </View>
        )}
        {lecture && <View style={{ position: 'absolute', inset: 0, backgroundColor: c.voile, alignItems: 'center', justifyContent: 'center', gap: 10 } as any}>
          <ActivityIndicator color={c.accent} size="large" /><Text style={{ color: '#fff', fontWeight: '800' }}>Lecture de l'avis…</Text></View>}
      </Pressable>

      <Titre>Véhicule</Titre>
      {!vehicules ? <Chargement /> : <Puces>{vehicules.map((v) => <Puce key={v.id} titre={plaque(v.immatriculation)} actif={vehicule?.id === v.id} onPress={() => setVehicule(v)} />)}</Puces>}

      <Titre>Quand</Titre>
      <Puces>
        {[['Hier', hier], ['Avant-hier', avantHier]].map(([t, d]) => <Puce key={t as string} titre={t as string} actif={date === jj(d as Date)} onPress={() => setDate(jj(d as Date))} />)}
      </Puces>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 3 }}><Champ valeur={date} onChange={setDate} placeholder="JJ/MM/AAAA" clavier="numbers-and-punctuation" /></View>
        <View style={{ flex: 2 }}><Champ valeur={heure} onChange={setHeure} placeholder="HH:MM" clavier="numbers-and-punctuation" /></View>
      </View>

      {vehicule && quand ? (
        <Carte accent={conducteur ? c.vert : conducteur === null ? c.orange : c.bord}>
          <Ligne><Icone nom={conducteur ? 'client' : 'alerte'} couleur={conducteur ? c.vert : c.orange} taille={20} />
            <Texte gras>{conducteur ? `Conducteur : ${nomClient(conducteur.clients)}` : conducteur === null ? 'Aucune location à ce moment-là' : 'Recherche du conducteur…'}</Texte></Ligne>
          <Texte gris taille={14}>{conducteur ? `Location en cours le ${jour(quand)} à ${fHeure(quand)} : l’amende sera prête à désigner.` : 'L’amende sera marquée « infos manquantes ».'}</Texte>
        </Carte>
      ) : null}

      <Titre>Infraction</Titre>
      <Puces>{TYPES.map((t) => <Puce key={t} titre={t} actif={type === t} onPress={() => setType(type === t ? '' : t)} />)}</Puces>
      <Champ libelle="Montant (€)" valeur={montant} onChange={setMontant} clavier="decimal-pad" />
      <Champ libelle="Lieu (facultatif)" valeur={lieu} onChange={setLieu} />
      <Champ libelle="N° de l'avis (facultatif)" valeur={numero} onChange={setNumero} clavier="number-pad" />
    </Ecran>
  );
}
