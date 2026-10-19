// État des lieux en 4 étapes, au pouce : photos guidées → compteur → vérifications → signature.
// Au retour, la photo du départ s'affiche en face de chaque angle. Marche sans réseau.
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ecran, GrosBouton, Ligne, Texte, Titre, Etapes, Carte, Etiquette, Rangee, Chargement } from '@/composants/ui';
import { Puce, Puces } from '@/composants/champs';
import Feuille from '@/composants/Feuille';
import Fenetre from '@/composants/Fenetre';
import Icone from '@/composants/Icone';
import Plaque from '@/composants/Plaque';
import { useToast } from '@/composants/Toast';
import { useCouleurs, T } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { POSITIONS, VOYANTS, TYPES_DEGAT, ouvrirEdl, ajouterPhoto, terminerEdl, ajouterSignature, ajouterDegat } from '@/lib/edl';
import { chargerLocation, photosDepart, type LocationFiche } from '@/lib/donnees';
import { chargerGps } from '@/lib/gps';
import { prendrePhoto } from '@/lib/photo';
import { ouvrirWhatsApp, msg } from '@/lib/messages';
import { euros, km as fkm, nomClient, nomVehicule, jour, heure } from '@/lib/format';
import Signature, { signatureEnImage } from '@/composants/Signature';

const ETAPES = ['Photos', 'Compteur', 'Contrôles', 'Signature'] as const;
type Degat = { type: keyof typeof TYPES_DEGAT; gravite: 'leger' | 'moyen' | 'grave' };
const CONTROLES = [['proprete', 'Véhicule propre'], ['kit', 'Kit anti-crevaison'], ['badge', 'Badge parking / télépéage'], ['accessoires', 'Accessoires (siège bébé…)'], ['voyant', 'Un voyant est allumé']] as const;

export default function EtatDesLieux() {
  const c = useCouleurs();
  const toast = useToast();
  const { id, type } = useLocalSearchParams<{ id: string; type: 'depart' | 'retour' }>();
  const retour = type === 'retour';
  const { profil } = useSession();
  const [l, setL] = useState<LocationFiche>();
  const [edlId, setEdlId] = useState<string>();
  const [etape, setEtape] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [chemins, setChemins] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [degats, setDegats] = useState<Record<string, Degat>>({});
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [km, setKm] = useState('');
  const [kmGps, setKmGps] = useState<number | null>(null);
  const [carburant, setCarburant] = useState(8);
  const [checklist, setChecklist] = useState<Record<string, boolean | string>>({ proprete: true, kit: true });
  const [remarque, setRemarque] = useState('');
  const [signature, setSignature] = useState<{ traits: string[]; largeur: number }>({ traits: [], largeur: 320 });
  const [question, setQuestion] = useState<null | 'sansSignature' | 'kmBas' | 'quitter'>(null);
  const [fini, setFini] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!profil) return;
    ouvrirEdl(id, type, profil.agence_id, profil.id).then(setEdlId);
    chargerLocation(id).then((r) => {
      setL(r.donnees);
      if (retour && r.donnees.carburant_depart != null) setCarburant(Math.round((r.donnees.carburant_depart / 100) * 8));
      chargerGps().then((g) => { const e = r.donnees.vehicules ? g.parVehicule[r.donnees.vehicules.id] : undefined; if (e?.km_estime != null) { setKmGps(e.km_estime); setKm(String(e.km_estime)); } });
    }).catch(() => {});
    if (retour) photosDepart(id).then(setRefs);
  }, [id, type, profil, retour]);

  const kmNum = Number(km) || 0;
  const kmFaits = retour && l?.km_depart != null && km ? kmNum - l.km_depart : null;
  const enTrop = kmFaits != null && l?.km_inclus != null ? Math.max(0, kmFaits - l.km_inclus) : 0;
  const supplement = enTrop * Number(l?.prix_km_sup ?? 0);
  const carbDepart = l?.carburant_depart != null ? Math.round((l.carburant_depart / 100) * 8) : null;
  const prises = POSITIONS.filter((p) => photos[p.position]).length;
  const suivante = POSITIONS.find((p) => !photos[p.position]);
  const nbDegats = Object.keys(degats).length;
  const contratASigner = !retour && l && !l.signature_contrat_path && !l.signe_distance_le;
  const kmRef = !retour ? l?.vehicules?.km ?? null : l?.km_depart ?? null;

  async function photographier(position: string) {
    if (!edlId || !profil) return;
    const p = await prendrePhoto();
    if (!p) return;
    setPhotos((x) => ({ ...x, [position]: p.uri }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const chemin = await ajouterPhoto(edlId, profil.agence_id, position, p.uri);
    setChemins((x) => ({ ...x, [position]: chemin }));
  }

  async function terminer(forcer = false) {
    if (!edlId || !l?.vehicules || !profil) return;
    if (!forcer && !signature.traits.length) { setQuestion('sansSignature'); return; }
    setEnvoi(true);
    const image = await signatureEnImage(signature.traits, signature.largeur).catch(() => null);
    if (image) await ajouterSignature(edlId, profil.agence_id, image, contratASigner ? l.id : undefined);
    for (const [zone, d] of Object.entries(degats)) await ajouterDegat({ agenceId: profil.agence_id, vehiculeId: l.vehicules.id, locationId: l.id, edlId, zone, ...d, photo: chemins[zone] });
    let pos: Location.LocationObject | null = null;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) pos = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
    } catch {}
    await terminerEdl({ edlId, type, locationId: l.id, vehiculeId: l.vehicules.id, km: kmNum, carburant: Math.round((carburant / 8) * 100),
      checklist: { ...checklist, remarque: remarque.trim() || undefined, degats: nbDegats ? degats : undefined, km_traceur: kmGps ?? undefined },
      latitude: pos?.coords.latitude, longitude: pos?.coords.longitude });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEnvoi(false); setFini(true);
  }

  // --- Écran de fin : tout est parti (ou en file d'attente)
  if (fini && l) return (
    <Ecran titre={retour ? 'Voiture rendue' : 'Bonne route !'} sousTitre={`${nomClient(l.clients)} · ${nomVehicule(l.vehicules)}`}
      bas={<>
        {l.clients?.telephone ? <GrosBouton icone="whatsapp" titre="Envoyer le récapitulatif au client" onPress={() => ouvrirWhatsApp(l.clients!.telephone, retour ? msg.recapRetour(l, kmNum, kmFaits, supplement) : msg.recapDepart(l, kmNum))} /> : null}
        <GrosBouton secondaire titre="Retour à la journée" onPress={() => router.dismissTo('/')} />
      </>}>
      <View style={{ alignItems: 'center', paddingVertical: 20, gap: 12 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.vert + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.vert + '66' }}>
          <Icone nom="ok" couleur={c.vert} taille={50} epaisseur={3} />
        </View>
        <Texte gris centre>{retour ? 'L’état des lieux de retour est enregistré. La voiture repasse disponible.' : 'L’état des lieux de départ est enregistré et la location est en cours.'}</Texte>
      </View>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee icone="photo" couleur={c.accent} titre="Photos" droite={`${prises}/${POSITIONS.length}`} />
        <Rangee icone="jauge" couleur={c.accent} titre="Kilométrage" droite={fkm(kmNum)} sous={kmFaits != null ? `${fkm(kmFaits)} parcourus` : undefined} />
        <Rangee icone="carburant" couleur={c.accent} titre="Carburant" droite={`${Math.round((carburant / 8) * 100)} %`} />
        {nbDegats > 0 && <Rangee icone="degat" couleur={c.rouge} titre="Dégâts signalés" droite={String(nbDegats)} />}
        {supplement > 0 && <Rangee icone="euro" couleur={c.orange} titre="Km supplémentaires" sous={`${enTrop} km × ${euros(l.prix_km_sup)}`} droite={euros(supplement)} />}
        <Rangee fin icone="signature" couleur={signature.traits.length ? c.vert : c.orange} titre="Signature" droite={signature.traits.length ? 'Signé' : 'Sans'} sous={contratASigner && signature.traits.length ? 'Vaut aussi signature du contrat' : undefined} />
      </Carte>
    </Ecran>
  );

  const bas = etape === 0
    ? (suivante ? <GrosBouton icone="photo" titre={`Photo : ${suivante.libelle}`} sousTitre={`${prises + 1} sur ${POSITIONS.length}`} onPress={() => photographier(suivante.position)} />
      : <GrosBouton titre="Suivant : le compteur" onPress={() => setEtape(1)} />)
    : etape === 1 ? <GrosBouton titre="Suivant : les contrôles" desactive={!km} onPress={() => (kmRef != null && kmNum < kmRef ? setQuestion('kmBas') : setEtape(2))} />
    : etape === 2 ? <GrosBouton titre="Suivant : la signature" onPress={() => setEtape(3)} />
    : <GrosBouton icone="ok" titre={envoi ? 'Enregistrement…' : retour ? 'Terminer le retour' : 'Terminer et remettre les clés'} desactive={envoi} onPress={() => terminer()} />;

  return (
    <Ecran fermer titre={retour ? 'État des lieux retour' : 'État des lieux départ'} bas={bas}
      surTitre={l ? <Ligne style={{ marginBottom: 6 }}><Plaque immat={l.vehicules?.immatriculation} taille={0.75} /><Texte gris taille={14}>{nomClient(l.clients)}</Texte></Ligne> : undefined}>
      <Etapes etapes={ETAPES} etape={etape} onChoix={setEtape} />
      {!l && <Chargement />}

      {etape === 0 && <>
        <Ligne style={{ justifyContent: 'space-between' }}>
          <Texte gris taille={15}>{prises}/{POSITIONS.length} photos{nbDegats ? ` · ${nbDegats} dégât${nbDegats > 1 ? 's' : ''}` : ''}</Texte>
          {prises < POSITIONS.length && prises > 0 && <Pressable onPress={() => setEtape(1)}><Text style={{ color: c.gris, fontWeight: '700' }}>Passer</Text></Pressable>}
        </Ligne>
        {retour && Object.keys(refs).length > 0 && <Texte gris taille={14}>La photo du départ apparaît en petit dans chaque case : comparez d’un coup d’œil.</Texte>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {POSITIONS.map((p) => {
            const prise = photos[p.position];
            const degat = degats[p.position];
            const prochaine = suivante?.position === p.position;
            return (
              <Pressable key={p.position} onPress={() => (prise ? setOuverte(p.position) : photographier(p.position))}
                style={{ width: '48.5%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden', backgroundColor: c.panneau, borderWidth: 2, borderColor: degat ? c.rouge : prise ? c.vert : prochaine ? c.accent : c.bord, justifyContent: 'flex-end' }}>
                {prise ? <Image source={{ uri: prise }} style={{ position: 'absolute', width: '100%', height: '100%' }} />
                  : <View style={{ position: 'absolute', top: 0, bottom: 28, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}><Icone nom="photo" couleur={prochaine ? c.accent : c.gris} taille={30} /></View>}
                {refs[p.position] ? <Image source={{ uri: refs[p.position] }} style={{ position: 'absolute', top: 6, right: 6, width: '38%', aspectRatio: 4 / 3, borderRadius: 8, borderWidth: 2, borderColor: '#fff' }} /> : null}
                {prise && <View style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: degat ? c.rouge : c.vert, alignItems: 'center', justifyContent: 'center' }}>
                  <Icone nom={degat ? 'alerte' : 'ok'} couleur="#fff" taille={14} epaisseur={3} /></View>}
                <Text numberOfLines={1} style={{ color: prise ? '#fff' : c.texte2, backgroundColor: prise ? 'rgba(0,0,0,.5)' : 'transparent', paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, fontWeight: '800' }}>{p.libelle}</Text>
              </Pressable>
            );
          })}
        </View>
      </>}

      {etape === 1 && <>
        <Titre>Kilométrage</Titre>
        <TextInput value={km} onChangeText={(t) => setKm(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={kmRef != null ? String(kmRef) : '000000'} placeholderTextColor="#2b3a40"
          style={{ backgroundColor: '#05090b', color: c.accent, fontSize: 46, fontWeight: '800', letterSpacing: 6, textAlign: 'center', borderRadius: T.rayon, paddingVertical: 18, fontVariant: ['tabular-nums'], borderWidth: 1, borderColor: c.bord, outlineStyle: 'none' as never }} />
        <Ligne>
          {kmGps != null && <Etiquette titre={`Proposé par le traceur : ${fkm(kmGps)}`} couleur={c.bleu} icone="eclair" />}
          {kmRef != null && <Etiquette titre={`${retour ? 'Départ' : 'Dernier relevé'} : ${fkm(kmRef)}`} couleur={c.gris} />}
        </Ligne>
        {retour && kmFaits != null && kmFaits >= 0 && (
          <Carte accent={enTrop ? c.orange : c.vert}>
            <Texte gras taille={20}>{fkm(kmFaits)} parcourus</Texte>
            <Texte gris>{l?.km_inclus ? (enTrop ? `${enTrop} km au-delà des ${fkm(l.km_inclus)} inclus` : `Dans le forfait de ${fkm(l.km_inclus)}`) : 'Kilométrage illimité'}</Texte>
            {supplement > 0 && <Texte gras couleur={c.orange}>Supplément : {euros(supplement)}</Texte>}
          </Carte>
        )}
        <Titre>Carburant</Titre>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-end' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <Pressable key={i} onPress={() => { setCarburant(i + 1); Haptics.selectionAsync().catch(() => {}); }}
              style={{ flex: 1, height: 40 + i * 4, borderRadius: 8, backgroundColor: i < carburant ? (carburant <= 2 ? c.orange : c.accent) : c.panneau2, borderWidth: carbDepart === i + 1 && retour ? 2 : 0, borderColor: c.texte }} />
          ))}
        </View>
        <Ligne style={{ justifyContent: 'space-between' }}>
          <Texte gras>{carburant === 8 ? 'Plein' : `${carburant}/8`} · {Math.round((carburant / 8) * 100)} %</Texte>
          {retour && carbDepart != null && <Texte gras couleur={carburant < carbDepart ? c.orange : c.vert}>{carburant < carbDepart ? `Manque ${carbDepart - carburant}/8 par rapport au départ` : 'Niveau du départ respecté'}</Texte>}
        </Ligne>
      </>}

      {etape === 2 && <>
        {CONTROLES.map(([cle, lib]) => {
          const actif = !!checklist[cle];
          const alerte = cle === 'voyant';
          return (
            <Pressable key={cle} onPress={() => { Haptics.selectionAsync().catch(() => {}); setChecklist((x) => ({ ...x, [cle]: !x[cle] })); }}
              style={{ minHeight: 62, borderRadius: T.rayon, backgroundColor: actif ? (alerte ? c.orange : c.accent) + '1c' : c.panneau, borderWidth: 1.5, borderColor: actif ? (alerte ? c.orange : c.accent) : c.bord, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: actif ? (alerte ? c.orange : c.accent) : 'transparent', borderWidth: actif ? 0 : 2, borderColor: c.bord, alignItems: 'center', justifyContent: 'center' }}>
                {actif && <Icone nom={alerte ? 'alerte' : 'ok'} couleur={alerte ? '#fff' : c.surAccent} taille={17} epaisseur={3} />}
              </View>
              <Texte gras>{lib}</Texte>
            </Pressable>
          );
        })}
        {checklist.voyant ? <>
          <Titre>Quel voyant ? (facultatif)</Titre>
          <Puces>{Object.entries(VOYANTS).map(([cle, lib]) => <Puce key={cle} titre={lib} actif={checklist.voyant_type === cle} couleur={c.orange} onPress={() => setChecklist((x) => ({ ...x, voyant_type: x.voyant_type === cle ? '' : cle }))} />)}</Puces>
        </> : null}
        <Titre>Remarque (facultatif)</Titre>
        <TextInput value={remarque} onChangeText={setRemarque} multiline placeholder="Ex. : rayure déjà présente sur la portière arrière" placeholderTextColor={c.gris}
          style={{ backgroundColor: c.panneau, color: c.texte, borderWidth: 1.5, borderColor: c.bord, borderRadius: T.rayon, minHeight: 90, padding: 14, fontSize: 16, textAlignVertical: 'top', outlineStyle: 'none' as never }} />
      </>}

      {etape === 3 && l && <>
        <Carte style={{ paddingVertical: 4 }}>
          <Rangee icone="jauge" couleur={c.accent} titre="Kilométrage" droite={fkm(kmNum)} sous={kmFaits != null ? `${fkm(kmFaits)} parcourus` : undefined} />
          <Rangee icone="carburant" couleur={c.accent} titre="Carburant" droite={`${Math.round((carburant / 8) * 100)} %`} />
          <Rangee fin={retour && !supplement} icone="photo" couleur={c.accent} titre="Photos" droite={`${prises}/${POSITIONS.length}`} sous={nbDegats ? `${nbDegats} dégât${nbDegats > 1 ? 's' : ''} signalé${nbDegats > 1 ? 's' : ''}` : 'Aucun dégât signalé'} />
          {supplement > 0 && <Rangee fin={retour} icone="euro" couleur={c.orange} titre="Km supplémentaires" droite={euros(supplement)} />}
          {!retour && <Rangee fin icone="calendrier" couleur={c.accent} titre="Retour prévu" droite={`${jour(l.fin_prevue)} ${heure(l.fin_prevue)}`} sous={`${euros(l.prix_total)} · caution ${l.caution_montant ? euros(l.caution_montant) : 'aucune'}`} />}
        </Carte>
        <Texte gris taille={15}>{contratASigner
          ? `En signant, ${l.clients?.prenom ?? 'le client'} reconnaît l’état du véhicule et accepte le contrat de location n° ${l.numero ?? ''}.`
          : `${l.clients?.prenom ?? 'Le client'} vérifie le récapitulatif puis signe.`}</Texte>
        <Signature onChange={(traits, largeur) => setSignature({ traits, largeur })} />
      </>}

      {/* Photo en grand : reprendre, comparer, signaler un dégât */}
      <Feuille visible={!!ouverte} titre={POSITIONS.find((p) => p.position === ouverte)?.libelle ?? ''} onFermer={() => setOuverte(null)}>
        {ouverte && <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {refs[ouverte] ? <View style={{ flex: 1, gap: 4 }}><Texte gris taille={13}>DÉPART</Texte><Image source={{ uri: refs[ouverte] }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} /></View> : null}
            <View style={{ flex: 1, gap: 4 }}>{refs[ouverte] ? <Texte gris taille={13}>RETOUR</Texte> : null}<Image source={{ uri: photos[ouverte] }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} /></View>
          </View>
          <Titre>Dégât sur cette zone ?</Titre>
          <Puces>
            <Puce titre="Aucun" actif={!degats[ouverte]} onPress={() => setDegats((x) => { const { [ouverte]: _, ...reste } = x; return reste; })} />
            {Object.entries(TYPES_DEGAT).map(([k, t]) => <Puce key={k} titre={t} couleur={c.rouge} actif={degats[ouverte]?.type === k}
              onPress={() => setDegats((x) => ({ ...x, [ouverte]: { type: k as Degat['type'], gravite: x[ouverte]?.gravite ?? 'leger' } }))} />)}
          </Puces>
          {degats[ouverte] && <Puces>
            {(['leger', 'moyen', 'grave'] as const).map((g) => <Puce key={g} titre={{ leger: 'Léger', moyen: 'Moyen', grave: 'Grave' }[g]} couleur={c.orange} actif={degats[ouverte].gravite === g}
              onPress={() => setDegats((x) => ({ ...x, [ouverte]: { ...x[ouverte], gravite: g } }))} />)}
          </Puces>}
          <GrosBouton secondaire icone="photo" titre="Reprendre la photo" onPress={() => { const p = ouverte; setOuverte(null); photographier(p); }} />
          <GrosBouton titre={degats[ouverte] ? 'Dégât noté' : 'Fermer'} onPress={() => { if (degats[ouverte]) toast('Dégât ajouté à la fiche du véhicule'); setOuverte(null); }} />
        </>}
      </Feuille>

      <Fenetre visible={question === 'sansSignature'} icone="signature" question="Le client n’a pas signé" detail="Sans signature, l’état des lieux a moins de valeur en cas de litige."
        non="Faire signer" oui="Terminer sans signature" onNon={() => setQuestion(null)} onOui={() => { setQuestion(null); terminer(true); }} />
      <Fenetre visible={question === 'kmBas'} question={`Le compteur (${fkm(kmNum)}) est plus bas que ${retour ? 'au départ' : 'le dernier relevé'} (${fkm(kmRef)})`} detail="Vérifiez le chiffre saisi."
        non="Corriger" oui="C’est bien ça" onNon={() => setQuestion(null)} onOui={() => { setQuestion(null); setEtape(2); }} />
    </Ecran>
  );
}
