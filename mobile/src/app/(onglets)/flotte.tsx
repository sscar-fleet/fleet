// Espace Suivi : la carte plein écran (la même que le logiciel), un panneau en bas qu'on tire vers le haut
// pour la liste, et une fiche claire quand on touche une voiture, sur la carte ou dans la liste.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, PanResponder, Pressable, ScrollView, Text, TextInput, View, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Action, GrosBouton } from '@/composants/ui';
import LogoMarque, { BadgeSport } from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Icone from '@/composants/Icone';
import CarteSuivi, { type CarteSuiviRef, type PointCarte } from '@/composants/CarteSuivi';
import Fenetre from '@/composants/Fenetre';
import { useToast } from '@/composants/Toast';
import { badgeSport, logoMarque } from '@/lib/logoMarque';
import { chargerVehicules, chargerLocations, type VehiculeLigne, type LocationLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps, couleurGps, depuis, itineraire, commanderMoteur, type EtatGps } from '@/lib/gps';
import { appeler } from '@/lib/messages';
import { urlSite } from '@/lib/site';
import { heure, jour, km, nomClient, plaque, estAujourdhui } from '@/lib/format';

type Filtre = 'tous' | 'roule' | 'arret' | 'coupe' | 'hors_ligne';
const LIBELLE: Record<Filtre, string> = { tous: 'Toutes', roule: 'Roule', arret: 'À l’arrêt', coupe: 'Coupé', hors_ligne: 'Hors ligne' };
const ETAT: Record<EtatGps['etat'], string> = { roule: 'Roule', arret: 'À l’arrêt', coupe: 'Moteur coupé', hors_ligne: 'Hors ligne' };
type Suivi = { v: VehiculeLigne; e: EtatGps; loc?: LocationLigne };
const vibrer = () => Haptics.selectionAsync().catch(() => {});
const nomModele = (v: VehiculeLigne) => [v.marque, v.modele].filter(Boolean).join(' ');

export default function EspaceSuivi() {
  const c = useCouleurs();
  const sombre = useColorScheme() !== 'light';
  const sa = useSafeAreaInsets();
  const toast = useToast();
  const carte = useRef<CarteSuiviRef>(null);
  const { gps, rafraichirGps } = useGps();
  const { donnees, recharger } = useDonnees(chargerVehicules);
  const [locations, setLocations] = useState<LocationLigne[]>([]);
  useEffect(() => { chargerLocations().then((r) => setLocations(r.donnees)).catch(() => {}); }, [donnees]);

  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [cherche, setCherche] = useState('');
  const [choisi, setChoisi] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [question, setQuestion] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  // --- Données
  const vehicules = (donnees ?? []).filter((v) => v.statut !== 'sorti');
  const enCours = (id: string) => locations.find((l) => l.statut === 'en_cours' && l.vehicules?.id === id);
  const suivis: Suivi[] = vehicules.filter((v) => gps.parVehicule[v.id]).map((v) => ({ v, e: gps.parVehicule[v.id], loc: enCours(v.id) }));
  const sansTraceur = vehicules.filter((v) => !gps.parVehicule[v.id]);
  const nb = (f: Filtre) => (f === 'tous' ? suivis.length : suivis.filter((s) => s.e.etat === f).length);
  const ordre: Record<string, number> = { roule: 0, coupe: 1, arret: 2, hors_ligne: 3 };
  const q = cherche.toLowerCase().replace(/[\s-]/g, '');
  const visibles = suivis
    .filter((s) => (filtre === 'tous' || s.e.etat === filtre)
      && (!q || `${s.v.immatriculation ?? ''}${s.v.marque ?? ''}${s.v.modele ?? ''}${s.loc ? nomClient(s.loc.clients) : ''}`.toLowerCase().replace(/[\s-]/g, '').includes(q)))
    .sort((a, b) => ordre[a.e.etat] - ordre[b.e.etat]);
  const fiche = choisi ? suivis.find((s) => s.v.id === choisi) ?? null : null;
  const points: PointCarte[] = useMemo(() => visibles.filter((s) => s.e.lat != null && s.e.lng != null).map((s) => ({
    id: s.v.id, lat: s.e.lat!, lng: s.e.lng!, couleur: couleurGps(s.e, c), plaque: plaque(s.v.immatriculation) || '—', roule: s.e.etat === 'roule',
    logo: logoMarque(s.v.marque, s.v.modele), badge: badgeSport(s.v.marque, s.v.modele),
  })), [JSON.stringify(visibles.map((s) => [s.v.id, s.e.lat, s.e.lng, s.e.etat])), sombre]); // eslint-disable-line react-hooks/exhaustive-deps

  const enRetard = (s: Suivi) => !!s.loc && new Date(s.loc.fin_prevue).getTime() < Date.now();
  const ou = (s: Suivi) => s.loc
    ? `${nomClient(s.loc.clients)} · ${enRetard(s) ? 'devait rentrer' : 'retour'} ${estAujourdhui(s.loc.fin_prevue) ? 'à' : `le ${jour(s.loc.fin_prevue)} à`} ${heure(s.loc.fin_prevue)}`
    : s.v.statut === 'maintenance' || s.v.statut === 'hors_service' ? 'À l’atelier' : 'Au parking';

  // --- Panneau du bas : replié (carte bien visible), ouvert (liste), fiche (voiture choisie)
  const [H, setH] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const BAS = Math.max(250, H * 0.36), HAUT = Math.max(BAS + 120, H * 0.84), FICHE = Math.max(360, H * 0.52);
  const cible = fiche ? FICHE : ouvert ? HAUT : BAS;
  const hauteur = useRef(new Animated.Value(300)).current;
  const actuelle = useRef(300);
  useEffect(() => { const id = hauteur.addListener(({ value }) => { actuelle.current = value; }); return () => hauteur.removeListener(id); }, [hauteur]);
  const caler = (h: number) => Animated.spring(hauteur, { toValue: h, useNativeDriver: false, bounciness: 3, speed: 16 }).start();
  useEffect(() => { if (H) caler(cible); }, [cible, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const depart = useRef(0);
  const glisse = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { depart.current = actuelle.current; },
    onPanResponderMove: (_, g) => hauteur.setValue(Math.min(Math.max(depart.current - g.dy, 150), H * 0.9 || 800)),
    onPanResponderRelease: (_, g) => { rel.current(g.dy, g.vy); },
  })).current;
  const rel = useRef<(dy: number, vy: number) => void>(() => {});
  rel.current = (dy, vy) => {
    const h = depart.current - dy;
    if (fiche) { if (dy > 70 || vy > 0.6) { setChoisi(null); setOuvert(false); } else caler(FICHE); return; }
    const haut = vy < -0.4 || (vy <= 0.4 && h > (BAS + HAUT) / 2);
    if (haut !== ouvert) vibrer();
    setOuvert(haut); caler(haut ? HAUT : BAS);
  };
  const margesCarte = { haut: sa.top + 108, bas: fiche ? FICHE : BAS };

  function choisir(id: string) { vibrer(); setChoisi(id); }
  async function moteur() {
    if (!fiche) return;
    setQuestion(false); setEnvoi(true);
    try {
      const couper = !fiche.e.moteur_coupe;
      const r = await commanderMoteur(fiche.v.id, couper);
      toast(couper ? (r.enLigne ? 'Coupure envoyée au boîtier' : 'Coupure en attente : boîtier hors ligne') : 'Moteur remis en route', couper ? 'alerte' : 'ok');
    } catch (err: any) { toast(err?.message ?? 'Commande impossible', 'alerte'); }
    setEnvoi(false);
  }

  const verre = { backgroundColor: sombre ? 'rgba(18,24,29,.94)' : 'rgba(255,255,255,.96)', borderWidth: 1, borderColor: c.bord, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 };

  return (
    <View style={{ flex: 1, backgroundColor: c.fond }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <CarteSuivi ref={carte} points={points} choisi={choisi} sombre={sombre} satellite={satellite} marges={margesCarte}
        onChoisir={choisir} onFond={() => { if (choisi) setChoisi(null); else if (ouvert) setOuvert(false); }} />

      {/* En-tête flottant */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: sa.top + 8, left: 12, right: 12, gap: 8 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => { recharger(); rafraichirGps(); vibrer(); }} style={[verre, { flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 }]}>
            <Text style={{ color: c.texte, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 }}>Suivi</Text>
            <Text numberOfLines={1} style={{ color: c.gris, fontSize: 12.5, fontWeight: '600' }}>
              {gps.actif ? `${suivis.length} suivie${suivis.length > 1 ? 's' : ''} · ${nb('roule')} en route${gps.demo ? ' · aperçu' : ''}` : 'Suivi GPS pas encore activé'}
            </Text>
          </Pressable>
          <Pressable onPress={() => { vibrer(); setSatellite((s) => !s); }} accessibilityLabel={satellite ? 'Afficher le plan' : 'Afficher le satellite'}
            style={[verre, { height: 52, paddingHorizontal: 13, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }]}>
            <Icone nom="carte" couleur={satellite ? c.accent : c.texte} taille={20} />
            <Text style={{ color: satellite ? c.accent : c.texte2, fontSize: 10.5, fontWeight: '800', marginTop: 2 }}>{satellite ? 'Plan' : 'Satellite'}</Text>
          </Pressable>
          <Pressable onPress={() => { vibrer(); setChoisi(null); carte.current?.cadrer(); }} accessibilityLabel="Voir toute la flotte"
            style={[verre, { height: 52, paddingHorizontal: 13, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }]}>
            <Icone nom="flotte" couleur={c.texte} taille={20} />
            <Text style={{ color: c.texte2, fontSize: 10.5, fontWeight: '800', marginTop: 2 }}>Tout voir</Text>
          </Pressable>
        </View>
        {suivis.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 12 }} keyboardShouldPersistTaps="handled">
            {(['tous', 'roule', 'arret', 'coupe', 'hors_ligne'] as Filtre[]).filter((f) => f === 'tous' || nb(f) > 0 || f === filtre).map((f) => {
              const actif = filtre === f;
              const coul = f === 'tous' ? c.accent : couleurGps({ etat: f } as EtatGps, c);
              return (
                <Pressable key={f} onPress={() => { vibrer(); setFiltre(f); setChoisi(null); setTimeout(() => carte.current?.cadrer(), 120); }}
                  style={[verre, { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 36, borderRadius: 18, borderColor: actif ? coul : c.bord, borderWidth: actif ? 1.5 : 1 }]}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: coul }} />
                  <Text style={{ color: c.texte, fontWeight: '700', fontSize: 13.5 }}>{LIBELLE[f]}</Text>
                  <Text style={{ color: actif ? coul : c.gris, fontWeight: '900', fontSize: 13.5 }}>{nb(f)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Panneau du bas */}
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: hauteur, backgroundColor: c.panneau, borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: c.bord, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12, overflow: 'hidden' }}>
        <View {...glisse.panHandlers}>
          <Pressable onPress={() => { if (fiche) { setChoisi(null); } else { vibrer(); setOuvert((o) => !o); } }} style={{ alignItems: 'center', paddingTop: 9, paddingBottom: 6 }} accessibilityLabel={ouvert ? 'Réduire la liste' : 'Agrandir la liste'}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c.gris + '88' }} />
          </Pressable>

          {fiche ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable onPress={() => { vibrer(); setChoisi(null); }} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 }}>
                <Icone nom="retour" couleur={c.accent} taille={18} />
                <Text style={{ color: c.accent, fontWeight: '800', fontSize: 14.5 }}>Toutes les voitures</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text onPress={() => { vibrer(); setOuvert((o) => !o); }} style={{ color: c.texte, fontSize: 18, fontWeight: '900' }}>Mes voitures <Text style={{ color: c.gris, fontWeight: '700', fontSize: 15 }}>· {visibles.length}</Text></Text>
                <Pressable onPress={() => router.push('/stock')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: c.accent, fontWeight: '800', fontSize: 14 }}>Stock</Text>
                  <Icone nom="chevron" couleur={c.accent} taille={16} />
                </Pressable>
              </View>
              {suivis.length > 4 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.panneau2, borderWidth: 1, borderColor: c.bord }}>
                  <Icone nom="recherche" couleur={c.gris} taille={17} />
                  <TextInput value={cherche} onChangeText={setCherche} onFocus={() => setOuvert(true)} placeholder="Plaque, modèle, client…" placeholderTextColor={c.gris}
                    style={{ flex: 1, color: c.texte, fontSize: 15.5, outlineStyle: 'none' as never }} autoCorrect={false} autoCapitalize="characters" />
                  {cherche ? <Pressable onPress={() => setCherche('')} hitSlop={8}><Icone nom="fermer" couleur={c.gris} taille={16} /></Pressable> : null}
                </View>
              )}
            </View>
          )}
        </View>

        {fiche ? <FicheVoiture s={fiche} ou={ou(fiche)} retard={enRetard(fiche)} envoi={envoi} onCouper={() => (fiche.e.moteur_coupe ? moteur() : setQuestion(true))} /> : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" scrollEnabled={ouvert}>
            {!gps.actif ? (
              <View style={{ padding: 14, gap: 6 }}>
                <Text style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>Suivi GPS pas encore activé</Text>
                <Text style={{ color: c.gris, fontSize: 14.5, lineHeight: 20 }}>{gps.raison ?? 'Le suivi s’active avec les traceurs posés par SS CAR SYSTEM.'}</Text>
              </View>
            ) : !visibles.length ? (
              <Text style={{ color: c.gris, fontSize: 14.5, padding: 14 }}>{q ? 'Aucune voiture ne correspond.' : 'Aucune voiture dans ce filtre.'}</Text>
            ) : visibles.map((s) => {
              const coul = couleurGps(s.e, c);
              return (
                <Pressable key={s.v.id} onPress={() => choisir(s.v.id)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14, backgroundColor: pressed ? c.panneau2 : 'transparent' })}>
                  <View style={{ width: 46, alignItems: 'center' }}>
                    <LogoMarque marque={s.v.marque} modele={s.v.modele} taille={38} />
                    <View style={{ position: 'absolute', right: 0, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: coul, borderWidth: 2.5, borderColor: c.panneau }} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: c.texte, fontSize: 16, fontWeight: '900' }}>{plaque(s.v.immatriculation)}</Text>
                      <BadgeSport marque={s.v.marque} modele={s.v.modele} petit />
                      <Text numberOfLines={1} style={{ flex: 1, color: c.gris, fontSize: 13.5, fontWeight: '600' }}>{nomModele(s.v)}</Text>
                    </View>
                    <Text numberOfLines={1} style={{ color: enRetard(s) ? c.rouge : c.texte2, fontSize: 13, fontWeight: enRetard(s) ? '700' : '500' }}>{ou(s)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={{ color: coul, fontWeight: '900', fontSize: 13.5 }}>{s.e.etat === 'roule' ? `${s.e.vitesse} km/h` : ETAT[s.e.etat]}</Text>
                    <Text style={{ color: c.gris, fontSize: 12 }}>{depuis(s.e.le)}</Text>
                  </View>
                </Pressable>
              );
            })}

            {gps.actif && sansTraceur.length > 0 && <>
              <Text style={{ color: c.gris, fontWeight: '800', fontSize: 12.5, marginTop: 14, marginBottom: 4, paddingHorizontal: 6, letterSpacing: 0.4 }}>SANS TRACEUR · {sansTraceur.length}</Text>
              {sansTraceur.map((v) => (
                <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6, opacity: 0.85 }}>
                  <View style={{ width: 46, alignItems: 'center' }}><LogoMarque marque={v.marque} modele={v.modele} taille={32} /></View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 15, fontWeight: '800' }}>{plaque(v.immatriculation)} <Text style={{ color: c.gris, fontWeight: '500', fontSize: 13 }}>{nomModele(v)}</Text></Text>
                    <View style={{ flexDirection: 'row' }}><BadgeSport marque={v.marque} modele={v.modele} petit /></View>
                    <Text style={{ color: c.gris, fontSize: 12.5 }}>{enCours(v.id) ? `Louée · ${nomClient(enCours(v.id)!.clients)}` : 'Position inconnue'}</Text>
                  </View>
                  <Text onPress={() => Linking.openURL(urlSite(`/vehicules/${v.id}`))} style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>Relier un traceur</Text>
                </View>
              ))}
            </>}
          </ScrollView>
        )}
      </Animated.View>

      <Fenetre visible={question} danger icone="moteur" question={fiche ? `Couper le moteur de ${plaque(fiche.v.immatriculation)} ?` : ''}
        detail="La voiture ne pourra plus redémarrer. La coupure se fait à l’arrêt ou à vitesse lente, selon le boîtier." non="Annuler" oui="Couper le moteur" onNon={() => setQuestion(false)} onOui={moteur} />
    </View>
  );
}

// Fiche d'une voiture dans le panneau : son état en grand, où elle est, et les gestes utiles
function FicheVoiture({ s, ou, retard, envoi, onCouper }: { s: Suivi; ou: string; retard: boolean; envoi: boolean; onCouper: () => void }) {
  const c = useCouleurs();
  const coul = couleurGps(s.e, c);
  const etat = s.e.etat === 'roule' ? `Roule · ${s.e.vitesse} km/h` : ETAT[s.e.etat];
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <LogoMarque marque={s.v.marque} modele={s.v.modele} taille={46} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Plaque immat={plaque(s.v.immatriculation)} taille={0.78} />
            <BadgeSport marque={s.v.marque} modele={s.v.modele} />
          </View>
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{nomModele(s.v) || 'Véhicule'}</Text>
        </View>
      </View>

      <View style={{ borderRadius: 16, padding: 14, gap: 4, backgroundColor: coul + '1c', borderWidth: 1, borderColor: coul + '55' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: coul }} />
          <Text style={{ color: coul, fontSize: 19, fontWeight: '900' }}>{etat}</Text>
        </View>
        <Text style={{ color: c.texte2, fontSize: 13.5 }}>
          {s.e.le ? `Dernier signal ${depuis(s.e.le)}` : 'Pas encore de signal'}{s.e.km_estime != null ? ` · ${km(s.e.km_estime)}` : ''}{s.e.lat == null ? ' · position inconnue' : ''}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icone nom={s.loc ? 'client' : 'voiture'} couleur={retard ? c.rouge : c.gris} taille={18} />
        <Text style={{ flex: 1, color: retard ? c.rouge : c.texte2, fontSize: 15, fontWeight: retard ? '800' : '600' }}>{ou}</Text>
      </View>
      {s.e.alerte ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: c.rouge + '1c' }}>
          <Icone nom="alerte" couleur={c.rouge} taille={18} />
          <Text style={{ flex: 1, color: c.rouge, fontWeight: '800', fontSize: 14 }}>{s.e.alerte}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {s.e.lat != null && <Action icone="itineraire" titre="Y aller" couleur={c.bleu} onPress={() => Linking.openURL(itineraire(s.e.lat!, s.e.lng!))} />}
        {s.e.coupure !== false && <Action icone={s.e.moteur_coupe ? 'cle' : 'moteur'} titre={envoi ? 'Envoi…' : s.e.moteur_coupe ? 'Remettre' : 'Couper'} couleur={s.e.moteur_coupe ? c.vert : c.rouge} desactive={envoi} onPress={onCouper} />}
        {s.loc?.clients?.telephone ? <Action icone="tel" titre="Client" couleur={c.vert} onPress={() => appeler(s.loc!.clients!.telephone!)} /> : null}
        <Action icone="voiture" titre="Fiche" couleur={c.texte2} onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: s.v.id } })} />
      </View>
      {s.loc && <GrosBouton secondaire petit icone="doc" titre={`Location n° ${s.loc.numero ?? '—'}`} onPress={() => router.push({ pathname: '/location/[id]', params: { id: s.loc!.id } })} />}
    </ScrollView>
  );
}
