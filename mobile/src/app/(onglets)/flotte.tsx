// Espace Suivi : la carte plein écran (la même que le logiciel), un panneau en bas qu'on tire vers le haut
// pour la liste, et une fiche claire quand on touche une voiture, sur la carte ou dans la liste.
// Règle d'ergonomie : sur la carte et dans la liste, une seule info par voiture (son état, moteur compris,
// et sa location) ; tout le détail (adresse, depuis quand, compteur, boîtier, trajet) est dans la fiche.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, PanResponder, Pressable, ScrollView, Text, TextInput, View, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Action } from '@/composants/ui';
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
import { useGps, couleurGps, depuis, duree, phraseEtat, motCarte, itineraire, commanderMoteur, chargerTrajet, type EtatGps } from '@/lib/gps';
import { appeler } from '@/lib/messages';
import { urlSite } from '@/lib/site';
import { heure, jour, km, nomClient, plaque, estAujourdhui } from '@/lib/format';

type Filtre = 'tous' | 'loue' | 'parking' | 'retard' | 'roule' | 'arret' | 'coupe' | 'hors_ligne';
const LIBELLE: Record<Filtre, string> = { tous: 'Toutes', loue: 'En location', parking: 'Au parking', retard: 'En retard', roule: 'Roule', arret: 'À l’arrêt', coupe: 'Coupé', hors_ligne: 'Hors ligne' };
const ETATS: Filtre[] = ['roule', 'arret', 'coupe', 'hors_ligne'];
type Suivi = { v: VehiculeLigne; e: EtatGps; loc?: LocationLigne };
const enRetard = (s: Suivi) => !!s.loc && new Date(s.loc.fin_prevue).getTime() < Date.now();
// Km faits depuis le départ du client : compteur estimé par le traceur moins le km noté à l'état des lieux de départ
const kmDepuisDepart = (s: Suivi) => {
  const dep = s.loc?.etats_des_lieux?.find((x) => x.type === 'depart')?.km ?? s.loc?.km_depart;
  return s.e.km_estime != null && dep != null && s.e.km_estime >= dep ? s.e.km_estime - dep : null;
};
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
  const [trace, setTrace] = useState<[number, number][] | null>(null);
  const [traceKm, setTraceKm] = useState<number | null>(null);
  const [chargeTrace, setChargeTrace] = useState(false);
  useEffect(() => { setTrace(null); setTraceKm(null); }, [choisi]);

  // --- Données
  const vehicules = (donnees ?? []).filter((v) => v.statut !== 'sorti');
  const enCours = (id: string) => locations.find((l) => l.statut === 'en_cours' && l.vehicules?.id === id);
  const suivis: Suivi[] = vehicules.filter((v) => gps.parVehicule[v.id]).map((v) => ({ v, e: gps.parVehicule[v.id], loc: enCours(v.id) }));
  const sansTraceur = vehicules.filter((v) => !gps.parVehicule[v.id]);
  const garde = (f: Filtre, s: Suivi) => f === 'tous' || (f === 'loue' ? !!s.loc : f === 'parking' ? !s.loc : f === 'retard' ? enRetard(s) : s.e.etat === f);
  const nb = (f: Filtre) => suivis.filter((s) => garde(f, s)).length;
  // Les urgences d'abord : retard, moteur coupé, puis ce qui roule, ce qui est arrêté, ce qui ne répond plus
  const rang = (s: Suivi) => (enRetard(s) ? 0 : ({ coupe: 1, roule: 2, arret: 3, hors_ligne: 4 } as Record<string, number>)[s.e.etat]);
  const q = cherche.toLowerCase().replace(/[\s-]/g, '');
  const visibles = suivis
    .filter((s) => garde(filtre, s)
      && (!q || `${s.v.immatriculation ?? ''}${s.v.marque ?? ''}${s.v.modele ?? ''}${s.loc ? nomClient(s.loc.clients) : ''}`.toLowerCase().replace(/[\s-]/g, '').includes(q)))
    .sort((a, b) => rang(a) - rang(b));
  const fiche = choisi ? suivis.find((s) => s.v.id === choisi) ?? null : null;
  const points: PointCarte[] = useMemo(() => visibles.filter((s) => s.e.lat != null && s.e.lng != null).map((s) => ({
    id: s.v.id, lat: s.e.lat!, lng: s.e.lng!, couleur: couleurGps(s.e, c), plaque: plaque(s.v.immatriculation) || '—', roule: s.e.etat === 'roule',
    logo: logoMarque(s.v.marque, s.v.modele), badge: badgeSport(s.v.marque, s.v.modele),
    mot: enRetard(s) ? `retard ${duree(s.loc!.fin_prevue)}` : motCarte(s.e), motCouleur: enRetard(s) ? '#fbbf24' : s.e.etat === 'roule' ? '#93c5fd' : s.e.etat === 'coupe' ? '#fca5a5' : s.e.etat === 'hors_ligne' ? '#94a3b8' : '#fcd34d',
    retard: enRetard(s),
  })), [JSON.stringify(visibles.map((s) => [s.v.id, s.e.lat, s.e.lng, s.e.etat, s.e.vitesse, s.e.contact, enRetard(s)])), sombre]); // eslint-disable-line react-hooks/exhaustive-deps

  const retour = (iso: string) => `${estAujourdhui(iso) ? 'aujourd’hui' : jour(iso)} à ${heure(iso)}`;
  const ou = (s: Suivi) => s.loc
    ? (enRetard(s) ? `En retard de ${duree(s.loc.fin_prevue)} · ${nomClient(s.loc.clients)}` : `Louée · ${nomClient(s.loc.clients)} · retour ${retour(s.loc.fin_prevue)}`)
    : s.v.statut === 'maintenance' || s.v.statut === 'hors_service' ? 'À l’atelier' : 'Au parking · libre';
  const couleurOu = (s: Suivi) => (enRetard(s) ? c.orange : s.loc ? c.texte2 : c.gris);
  // « À l'arrêt, moteur allumé » se remarque : c'est souvent un oubli ou quelqu'un qui attend dans la voiture
  const couleurEtat = (s: Suivi) => (s.e.etat === 'arret' && s.e.contact === true ? c.orange : couleurGps(s.e, c));

  // --- Panneau du bas : replié (carte bien visible), ouvert (liste), fiche (voiture choisie)
  const [H, setH] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const BAS = Math.max(250, H * 0.36), HAUT = Math.max(BAS + 120, H * 0.84), FICHE = Math.max(420, H * 0.6);
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
  async function basculerTrajet() {
    if (!fiche) return;
    if (trace) { setTrace(null); setTraceKm(null); carte.current?.viser(fiche.v.id); return; }
    setChargeTrace(true);
    try {
      const t = await chargerTrajet(fiche.v.id, fiche.e);
      if (!t.disponible) toast('Trajet disponible quand le boîtier est passé sur le serveur SS CAR SYSTEM', 'info');
      else if (t.points.length < 2) toast('Pas encore de trajet aujourd’hui', 'info');
      else { setTrace(t.points); setTraceKm(t.km); }
    } catch (err: any) { toast(err?.message ?? 'Trajet indisponible', 'alerte'); }
    setChargeTrace(false);
  }
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
      <CarteSuivi ref={carte} points={points} choisi={choisi} trace={fiche ? trace : null} sombre={sombre} satellite={satellite} marges={margesCarte}
        onChoisir={choisir} onFond={() => { if (choisi) setChoisi(null); else if (ouvert) setOuvert(false); }} />

      {/* En-tête flottant */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: sa.top + 8, left: 12, right: 12, gap: 8 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => { recharger(); rafraichirGps(); vibrer(); }} style={[verre, { flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 }]}>
            <Text style={{ color: c.texte, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 }}>Suivi</Text>
            <Text numberOfLines={1} style={{ color: c.gris, fontSize: 12.5, fontWeight: '600' }}>
              {gps.actif ? `${nb('roule')} roule${nb('roule') > 1 ? 'nt' : ''} · ${nb('loue')} louée${nb('loue') > 1 ? 's' : ''}${gps.demo ? ' · aperçu' : ''}` : 'Suivi GPS pas encore activé'}
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
            {(['tous', 'loue', 'parking', 'retard', ...ETATS] as Filtre[]).filter((f) => f === 'tous' || f === filtre || (nb(f) > 0 && (f !== 'parking' || nb('loue') > 0))).map((f) => {
              const actif = filtre === f;
              const coul = f === 'tous' || f === 'loue' ? c.accent : f === 'parking' ? c.vert : f === 'retard' ? c.orange : couleurGps({ etat: f } as EtatGps, c);
              const separe = f === 'roule';
              return (
                <Pressable key={f} accessibilityLabel={`${LIBELLE[f]} : ${nb(f)}`} onPress={() => { vibrer(); setFiltre(f); setChoisi(null); setTimeout(() => carte.current?.cadrer(), 120); }}
                  style={[verre, { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 36, borderRadius: 18, borderColor: actif ? coul : c.bord, borderWidth: actif ? 1.5 : 1, marginLeft: separe ? 8 : 0 }]}>
                  {ETATS.includes(f) || f === 'retard' ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: coul }} /> : null}
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

        {fiche ? <FicheVoiture s={fiche} retourTexte={fiche.loc ? (estAujourdhui(fiche.loc.fin_prevue) ? `à ${heure(fiche.loc.fin_prevue)}` : retour(fiche.loc.fin_prevue)) : ''} envoi={envoi} onCouper={() => (fiche.e.moteur_coupe ? moteur() : setQuestion(true))}
          trajetAffiche={!!trace} trajetKm={traceKm} chargeTrajet={chargeTrace} onTrajet={basculerTrajet} /> : (
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
                <Pressable key={s.v.id} onPress={() => choisir(s.v.id)} accessibilityLabel={`${plaque(s.v.immatriculation)}, ${phraseEtat(s.e)}, ${ou(s)}`}
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
                      {s.e.etat !== 'hors_ligne' && <Text style={{ color: c.gris, fontSize: 12 }}>{depuis(s.e.le)}</Text>}
                    </View>
                    <Text numberOfLines={1} style={{ color: couleurEtat(s), fontSize: 13.5, fontWeight: '800' }}>{phraseEtat(s.e)}</Text>
                    <Text numberOfLines={1} style={{ color: couleurOu(s), fontSize: 13, fontWeight: enRetard(s) ? '800' : '500' }}>{ou(s)}</Text>
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

// Fiche d'une voiture : son état en grand (moteur compris) et où elle est, quatre cases utiles,
// la location en cours, et les gestes. Les cases sans donnée ne s'affichent pas.
function FicheVoiture({ s, retourTexte, envoi, onCouper, trajetAffiche, trajetKm, chargeTrajet, onTrajet }: {
  s: Suivi; retourTexte: string; envoi: boolean; onCouper: () => void; trajetAffiche: boolean; trajetKm: number | null; chargeTrajet: boolean; onTrajet: () => void;
}) {
  const c = useCouleurs();
  const e = s.e;
  const coul = couleurGps(e, c);
  const retard = enRetard(s);
  const kmFaits = kmDepuisDepart(s);
  const enTrop = kmFaits != null && s.loc?.km_inclus != null ? Math.max(0, kmFaits - s.loc.km_inclus) : 0;

  const moteur = e.etat === 'coupe' ? { val: 'Coupé', coul: c.rouge, sous: 'à distance' }
    : e.contact === true ? { val: 'Allumé', coul: c.vert, sous: e.contact_depuis ? `depuis ${heure(e.contact_depuis)}` : '' }
    : e.contact === false ? { val: 'Éteint', coul: c.texte, sous: e.contact_depuis ? `depuis ${heure(e.contact_depuis)}` : '' } : null;
  const cases: { titre: string; val: string; sous?: string; coul?: string }[] = [];
  if (moteur) cases.push({ titre: 'MOTEUR', val: moteur.val, sous: moteur.sous, coul: moteur.coul });
  if (e.km_estime != null) cases.push({ titre: 'COMPTEUR', val: km(e.km_estime), sous: kmFaits != null ? `+${km(kmFaits)} depuis le départ` : undefined });
  if (e.km_jour != null) cases.push({ titre: 'AUJOURD’HUI', val: km(e.km_jour), sous: e.minutes_route ? `${e.minutes_route >= 60 ? `${Math.floor(e.minutes_route / 60)} h ${String(e.minutes_route % 60).padStart(2, '0')}` : `${e.minutes_route} min`} de route` : undefined });
  if (e.tension != null) cases.push({ titre: 'BOÎTIER', val: e.tension >= 11 ? 'Branché' : e.tension > 3 ? 'Tension faible' : 'Sur sa batterie', coul: e.tension >= 11 ? undefined : c.orange,
    sous: `${String(e.tension).replace('.', ',')} V${e.satellites != null ? ` · ${e.satellites} satellites` : ''}` });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
      <Pressable onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: s.v.id } })} accessibilityLabel="Ouvrir la fiche du véhicule"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.75 : 1 })}>
        <LogoMarque marque={s.v.marque} modele={s.v.modele} taille={44} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Plaque immat={plaque(s.v.immatriculation)} taille={0.78} />
            <BadgeSport marque={s.v.marque} modele={s.v.modele} />
          </View>
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{nomModele(s.v) || 'Véhicule'}</Text>
        </View>
        <Icone nom="chevron" couleur={c.gris} taille={18} />
      </Pressable>

      {/* L'état en grand, et où */}
      <View style={{ borderRadius: 16, padding: 14, gap: 4, backgroundColor: coul + '1c', borderWidth: 1, borderColor: coul + '55' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: coul }} />
          <Text style={{ flex: 1, color: coul, fontSize: 19, fontWeight: '900' }}>{phraseEtat(e)}</Text>
          <Text style={{ color: c.texte2, fontSize: 12, fontWeight: '700' }}>{depuis(e.le)}</Text>
        </View>
        <Text numberOfLines={2} style={{ color: c.texte2, fontSize: 14 }}>{e.lat == null ? 'Position inconnue' : e.adresse ?? 'Adresse en cours de recherche'}</Text>
      </View>

      {e.alerte ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: c.rouge + '1c' }}>
          <Icone nom="alerte" couleur={c.rouge} taille={18} />
          <Text style={{ flex: 1, color: c.rouge, fontWeight: '800', fontSize: 14 }}>{e.alerte}</Text>
        </View>
      ) : null}

      {trajetAffiche && <Text style={{ color: c.bleu, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>Trajet d’aujourd’hui sur la carte{trajetKm != null ? ` · ${km(trajetKm)}` : ''}</Text>}

      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {e.lat != null && <Action icone="itineraire" titre="Y aller" couleur={c.bleu} onPress={() => Linking.openURL(itineraire(e.lat!, e.lng!))} />}
        {e.coupure !== false && <Action icone={e.moteur_coupe ? 'cle' : 'moteur'} titre={envoi ? 'Envoi…' : e.moteur_coupe ? 'Remettre' : 'Couper'} couleur={e.moteur_coupe ? c.vert : c.rouge} desactive={envoi} onPress={onCouper} />}
        {s.loc?.clients?.telephone ? <Action icone="tel" titre="Client" couleur={c.vert} onPress={() => appeler(s.loc!.clients!.telephone!)} /> : null}
        <Action icone="carte" titre={chargeTrajet ? 'Chargement…' : trajetAffiche ? 'Masquer' : 'Trajet'} couleur={c.accent} desactive={chargeTrajet} onPress={onTrajet} />
      </View>
      {/* La location */}
      {s.loc ? (
        <Pressable onPress={() => router.push({ pathname: '/location/[id]', params: { id: s.loc!.id } })} accessibilityLabel="Ouvrir la location"
          style={({ pressed }) => ({ borderRadius: 14, padding: 12, gap: 3, opacity: pressed ? 0.8 : 1,
            backgroundColor: retard ? c.orange + '16' : c.panneau2, borderWidth: 1, borderColor: retard ? c.orange + '66' : c.bord })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ flex: 1, color: retard ? c.orange : c.texte, fontSize: 15, fontWeight: '900' }}>{retard ? `En retard de ${duree(s.loc.fin_prevue)}` : `Louée · retour ${retourTexte}`}</Text>
            <Icone nom="chevron" couleur={c.gris} taille={16} />
          </View>
          <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 13.5 }}>{nomClient(s.loc.clients)} · contrat n° {s.loc.numero ?? '—'}{retard ? ` · devait rentrer ${retourTexte}` : ''}</Text>
          {kmFaits != null && (
            <Text style={{ color: enTrop ? c.orange : c.gris, fontSize: 12.5, fontWeight: enTrop ? '700' : '500' }}>
              {km(kmFaits)} parcourus{s.loc.km_inclus != null ? (enTrop ? ` · ${km(enTrop)} au-delà du forfait${s.loc.prix_km_sup ? ` (+${(enTrop * s.loc.prix_km_sup).toFixed(2).replace('.', ',')} €)` : ''}` : ` sur ${km(s.loc.km_inclus)} inclus`) : ''}
            </Text>
          )}
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 }}>
          <Icone nom="voiture" couleur={c.vert} taille={18} />
          <Text style={{ flex: 1, color: c.vert, fontSize: 15, fontWeight: '700' }}>{s.v.statut === 'maintenance' || s.v.statut === 'hors_service' ? 'À l’atelier' : 'Disponible · au parking'}</Text>
        </View>
      )}


      {cases.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {cases.map((k) => (
            <View key={k.titre} style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 14, padding: 11, gap: 2, backgroundColor: c.panneau2, borderWidth: 1, borderColor: c.bord }}>
              <Text style={{ color: c.gris, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>{k.titre}</Text>
              <Text numberOfLines={1} style={{ color: k.coul ?? c.texte, fontSize: 16.5, fontWeight: '900' }}>{k.val}</Text>
              {k.sous ? <Text numberOfLines={1} style={{ color: c.gris, fontSize: 12 }}>{k.sous}</Text> : null}
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}
