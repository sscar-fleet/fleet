// Espace Suivi, dans l'esprit de l'appli SS CAR SYSTEM : une grande carte en haut (Agrandir, Satellite),
// puis une carte par voiture avec une phrase de loueur (« Louée à Sarah · roule à 47 km/h · retour 16:40 »)
// et la barre d'avancement de la location. On touche une voiture : la carte la vise et sa fiche remplace la liste.
import VisuelVehicule from '@/composants/VisuelVehicule';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Action } from '@/composants/ui';
import { FondDegrade, Verre, Point, Puce, Libelle, useSombre } from '@/composants/Ambiance';
import { BadgeSport } from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Icone from '@/composants/Icone';
import CarteSuivi, { type CarteSuiviRef, type PointCarte } from '@/composants/CarteSuivi';
import Fenetre from '@/composants/Fenetre';
import { useToast } from '@/composants/Toast';
import { badgeSport, logoMarque } from '@/lib/logoMarque';
import { chargerVehicules, chargerLocations, type VehiculeLigne, type LocationLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps, couleurGps, depuis, duree, motCarte, itineraire, commanderMoteur, chargerTrajet, phraseEtat, type EtatGps } from '@/lib/gps';
import { appeler } from '@/lib/messages';
import { urlSite } from '@/lib/site';
import { heure, jour, km, nomClient, plaque, estAujourdhui, prenom } from '@/lib/format';

type Filtre = 'toutes' | 'louees' | 'libres' | 'alertes';
type Suivi = { v: VehiculeLigne; e?: EtatGps; loc?: LocationLigne };
const aLAtelier = (s: Suivi) => s.v.statut === 'maintenance' || s.v.statut === 'hors_service';
const enRetard = (s: Suivi) => !!s.loc && new Date(s.loc.fin_prevue).getTime() < Date.now();
// Ce qui mérite qu'on regarde : un retard, un moteur coupé, un boîtier muet, une voiture arrêtée moteur allumé
const enAlerte = (s: Suivi) => enRetard(s) || s.e?.etat === 'coupe' || s.e?.etat === 'hors_ligne' || (s.e?.etat === 'arret' && s.e.contact === true) || !!s.e?.alerte;
// Km faits depuis le départ du client : compteur estimé par le traceur moins le km noté à l'état des lieux de départ
const kmDepuisDepart = (s: Suivi) => {
  const dep = s.loc?.etats_des_lieux?.find((x) => x.type === 'depart')?.km ?? s.loc?.km_depart;
  return s.e?.km_estime != null && dep != null && s.e.km_estime >= dep ? s.e.km_estime - dep : null;
};
const vibrer = () => Haptics.selectionAsync().catch(() => {});
const nomModele = (v: VehiculeLigne) => [v.marque, v.modele].filter(Boolean).join(' ');
const prenomNom = (c?: { prenom: string | null; nom: string } | null) => (c ? [c.prenom, c.nom ? c.nom.charAt(0) + '.' : ''].filter(Boolean).join(' ') : '');
const quandRetour = (iso: string) => (estAujourdhui(iso) ? heure(iso) : `${jour(iso)} ${heure(iso)}`);

export default function EspaceSuivi() {
  const c = useCouleurs();
  const sombre = useSombre();
  const sa = useSafeAreaInsets();
  const toast = useToast();
  const carte = useRef<CarteSuiviRef>(null);
  const grande = useRef<CarteSuiviRef>(null);
  const defil = useRef<any>(null);
  const { gps, rafraichirGps } = useGps();
  const { donnees, recharger, enChargement } = useDonnees(chargerVehicules);
  const [locations, setLocations] = useState<LocationLigne[]>([]);
  useEffect(() => { chargerLocations().then((r) => setLocations(r.donnees)).catch(() => {}); }, [donnees]);

  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [cherche, setCherche] = useState('');
  const [choisi, setChoisi] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [plein, setPlein] = useState(false);
  const [question, setQuestion] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [trace, setTrace] = useState<[number, number][] | null>(null);
  const [traceKm, setTraceKm] = useState<number | null>(null);
  const [chargeTrace, setChargeTrace] = useState(false);
  useEffect(() => { setTrace(null); setTraceKm(null); }, [choisi]);

  // --- Données
  const vehicules = (donnees ?? []).filter((v) => v.statut !== 'sorti');
  const enCours = (id: string) => locations.find((l) => l.statut === 'en_cours' && l.vehicules?.id === id);
  const tous: Suivi[] = vehicules.map((v) => ({ v, e: gps.parVehicule[v.id], loc: enCours(v.id) }));
  const garde = (f: Filtre, s: Suivi) => f === 'toutes' || (f === 'louees' ? !!s.loc : f === 'libres' ? !s.loc && !aLAtelier(s) : enAlerte(s));
  const nb = (f: Filtre) => tous.filter((s) => garde(f, s)).length;
  // Les urgences d'abord, puis les louées (retour le plus proche), puis les libres
  const rang = (s: Suivi) => (enRetard(s) ? 0 : enAlerte(s) ? 1 : s.loc ? 2 : aLAtelier(s) ? 4 : 3);
  const q = cherche.toLowerCase().replace(/[\s-]/g, '');
  const visibles = tous
    .filter((s) => garde(filtre, s) && (!q || `${s.v.immatriculation ?? ''}${s.v.marque ?? ''}${s.v.modele ?? ''}${s.loc ? nomClient(s.loc.clients) : ''}`.toLowerCase().replace(/[\s-]/g, '').includes(q)))
    .sort((a, b) => rang(a) - rang(b) || (a.loc && b.loc ? a.loc.fin_prevue.localeCompare(b.loc.fin_prevue) : 0));
  const fiche = choisi ? tous.find((s) => s.v.id === choisi) ?? null : null;
  const avecGps = tous.filter((s) => s.e);
  const points: PointCarte[] = useMemo(() => visibles.filter((s) => s.e?.lat != null && s.e?.lng != null).map((s) => ({
    id: s.v.id, lat: s.e!.lat!, lng: s.e!.lng!, couleur: couleurPoint(s), plaque: `${s.v.modele ?? ''}${s.v.modele ? ' · ' : ''}${plaque(s.v.immatriculation) || '—'}`, roule: s.e!.etat === 'roule',
    logo: logoMarque(s.v.marque, s.v.modele), badge: badgeSport(s.v.marque, s.v.modele),
    mot: enRetard(s) ? `retard ${duree(s.loc!.fin_prevue)}` : motCarte(s.e!), motCouleur: enRetard(s) ? '#fbbf24' : s.e!.etat === 'roule' ? '#93c5fd' : s.e!.etat === 'coupe' ? '#fca5a5' : s.e!.etat === 'hors_ligne' ? '#94a3b8' : '#fcd34d',
    retard: enRetard(s),
  })), [JSON.stringify(visibles.map((s) => [s.v.id, s.e?.lat, s.e?.lng, s.e?.etat, s.e?.vitesse, s.e?.contact, enRetard(s)])), sombre]); // eslint-disable-line react-hooks/exhaustive-deps

  // Couleur d'une voiture : rouge si problème, orange si retard, bleu si elle roule, turquoise si louée, vert si libre
  function couleurPoint(s: Suivi) {
    if (s.e?.etat === 'coupe') return c.rouge;
    if (enRetard(s)) return c.orange;
    if (s.e?.etat === 'hors_ligne') return c.gris;
    if (s.e?.etat === 'roule') return c.bleu;
    if (aLAtelier(s)) return c.orange;
    return s.loc ? c.accent : c.vert;
  }
  // La phrase d'un loueur : à qui, ce qu'elle fait, et quand elle rentre
  function phrase(s: Suivi): { ligne: string; couleur: string } {
    const qui = s.loc ? prenomNom(s.loc.clients) : '';
    const etat = !s.e ? '' : s.e.etat === 'roule' ? `roule à ${s.e.vitesse} km/h` : s.e.etat === 'coupe' ? 'moteur coupé' : s.e.etat === 'hors_ligne' ? `boîtier muet depuis ${duree(s.e.le)}` : s.e.contact === true ? 'arrêtée, moteur allumé' : 'garée';
    if (enRetard(s)) return { ligne: `En retard de ${duree(s.loc!.fin_prevue)} · ${qui}${etat ? ' · ' + etat : ''}`, couleur: c.orange };
    if (s.e?.etat === 'coupe') return { ligne: `Moteur coupé à distance${qui ? ' · ' + qui : ''}`, couleur: c.rouge };
    if (s.loc) return { ligne: `Louée à ${qui}${etat ? ' · ' + etat : ''}`, couleur: s.e?.etat === 'roule' ? (sombre ? '#9cc7ff' : c.bleu) : c.texte2 };
    if (aLAtelier(s)) return { ligne: 'À l’atelier', couleur: c.orange };
    return { ligne: `Libre${etat ? ' · ' + etat : ''}`, couleur: sombre ? '#9ff0bf' : c.vert };
  }

  function choisir(id: string) { vibrer(); setPlein(false); setChoisi(id); setTimeout(() => { carte.current?.viser(id); defil.current?.scrollTo({ y: 0, animated: true }); }, 60); }
  function fermerFiche() { vibrer(); setChoisi(null); setTimeout(() => carte.current?.cadrer(), 80); }
  async function basculerTrajet() {
    if (!fiche?.e) return;
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
    if (!fiche?.e) return;
    setQuestion(false); setEnvoi(true);
    try {
      const couper = !fiche.e.moteur_coupe;
      const r = await commanderMoteur(fiche.v.id, couper);
      toast(couper ? (r.enLigne ? 'Coupure envoyée au boîtier' : 'Coupure en attente : boîtier hors ligne') : 'Moteur remis en route', couper ? 'alerte' : 'ok');
    } catch (err: any) { toast(err?.message ?? 'Commande impossible', 'alerte'); }
    setEnvoi(false);
  }

  const nbRoulent = avecGps.filter((s) => s.e!.etat === 'roule').length;
  const boutonCarte = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, height: 40, paddingHorizontal: 13, borderRadius: 12,
    backgroundColor: 'rgba(8,12,16,.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' };

  return (
    <View style={{ flex: 1, backgroundColor: c.fond }}>
      <FondDegrade />
      <ScrollView ref={defil} style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: sa.top + 12, paddingBottom: 40, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={!!enChargement && !!donnees} onRefresh={() => { recharger(); rafraichirGps(); }} tintColor={c.accent} />}>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 6 }}>
          <Text style={{ color: c.texte, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>Suivi</Text>
          {gps.actif && <Text style={{ color: sombre ? '#9ff0bf' : c.vert, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
            {nbRoulent ? `${nbRoulent} roule${nbRoulent > 1 ? 'nt' : ''} · ` : ''}{nb('louees')} louée{nb('louees') > 1 ? 's' : ''}{gps.demo ? ' · aperçu' : ''}
          </Text>}
        </View>

        {/* La carte */}
        <View style={{ height: fiche ? 280 : 330, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: sombre ? 'rgba(255,255,255,.12)' : c.bord, backgroundColor: '#0b0f12' }}>
          {!plein && <CarteSuivi ref={carte} points={points} choisi={choisi} trace={fiche ? trace : null} sombre={sombre} satellite={satellite} marges={{ haut: 56, bas: 20 }}
            onChoisir={choisir} onFond={() => { if (choisi) fermerFiche(); }} />}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable onPress={() => { vibrer(); setPlein(true); }} style={boutonCarte} accessibilityLabel="Agrandir la carte">
              <Icone nom="agrandir" couleur="#fff" taille={17} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Agrandir</Text>
            </Pressable>
            <Pressable onPress={() => { vibrer(); setSatellite((x) => !x); }} style={boutonCarte} accessibilityLabel={satellite ? 'Afficher le plan' : 'Afficher le satellite'}>
              <Icone nom="globe" couleur={satellite ? c.accent : '#fff'} taille={17} />
              <Text style={{ color: satellite ? c.accent : '#fff', fontWeight: '700', fontSize: 14 }}>{satellite ? 'Plan' : 'Satellite'}</Text>
            </Pressable>
          </View>
        </View>

        {!gps.actif ? (
          <Verre style={{ padding: 16, gap: 6 }}>
            <Text style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>Suivi GPS pas encore activé</Text>
            <Text style={{ color: c.gris, fontSize: 14.5, lineHeight: 20 }}>{gps.raison ?? 'Le suivi s’active avec les traceurs posés par SS CAR SYSTEM.'}</Text>
          </Verre>
        ) : fiche ? (
          <FicheVoiture s={fiche} couleur={couleurPoint(fiche)} phrase={phrase(fiche)} onFermer={fermerFiche} envoi={envoi}
            onCouper={() => (fiche.e?.moteur_coupe ? moteur() : setQuestion(true))} trajetAffiche={!!trace} trajetKm={traceKm} chargeTrajet={chargeTrace} onTrajet={basculerTrajet} />
        ) : <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
            <View style={{ width: 8 }} />
            <Puce titre="Toutes" n={nb('toutes')} actif={filtre === 'toutes'} onPress={() => { vibrer(); setFiltre('toutes'); }} />
            <Puce titre="Louées" n={nb('louees')} actif={filtre === 'louees'} onPress={() => { vibrer(); setFiltre('louees'); }} />
            <Puce titre="Libres" n={nb('libres')} actif={filtre === 'libres'} couleur={c.vert} onPress={() => { vibrer(); setFiltre('libres'); }} />
            <Puce titre="Alertes" n={nb('alertes')} actif={filtre === 'alertes'} couleur={nb('alertes') ? c.orange : c.gris} onPress={() => { vibrer(); setFiltre('alertes'); }} />
            <View style={{ width: 8 }} />
          </ScrollView>

          {tous.length > 6 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 14, paddingHorizontal: 12, backgroundColor: sombre ? 'rgba(6,10,14,.46)' : c.panneau, borderWidth: 1, borderColor: sombre ? 'rgba(255,255,255,.12)' : c.bord }}>
              <Icone nom="recherche" couleur={c.gris} taille={17} />
              <TextInput value={cherche} onChangeText={setCherche} placeholder="Plaque, modèle, client…" placeholderTextColor={c.gris}
                style={{ flex: 1, color: c.texte, fontSize: 15.5, outlineStyle: 'none' as never }} autoCorrect={false} autoCapitalize="characters" />
              {cherche ? <Pressable onPress={() => setCherche('')} hitSlop={8}><Icone nom="fermer" couleur={c.gris} taille={16} /></Pressable> : null}
            </View>
          )}

          {!visibles.length && <Text style={{ color: c.gris, fontSize: 15, padding: 8 }}>{q ? 'Aucune voiture ne correspond.' : filtre === 'alertes' ? 'Aucune alerte. Tout roule.' : 'Aucune voiture ici.'}</Text>}
          {visibles.map((s) => <Fragment key={s.v.id}>{CarteVoiture({ s })}</Fragment>)}
        </>}
      </ScrollView>

      {/* Carte en grand */}
      {plein && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b0f12' }}>
          <CarteSuivi ref={grande} points={points} choisi={null} sombre={sombre} satellite={satellite} marges={{ haut: sa.top + 70, bas: 40 }} onChoisir={choisir} onFond={() => {}} />
          <View pointerEvents="box-none" style={{ position: 'absolute', top: sa.top + 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable onPress={() => { vibrer(); setPlein(false); }} style={[boutonCarte, { height: 46 }]} accessibilityLabel="Réduire la carte">
              <Icone nom="reduire" couleur="#fff" taille={18} />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Réduire</Text>
            </Pressable>
            <Pressable onPress={() => { vibrer(); setSatellite((x) => !x); }} style={[boutonCarte, { height: 46 }]} accessibilityLabel={satellite ? 'Afficher le plan' : 'Afficher le satellite'}>
              <Icone nom="globe" couleur={satellite ? c.accent : '#fff'} taille={18} />
              <Text style={{ color: satellite ? c.accent : '#fff', fontWeight: '800', fontSize: 15 }}>{satellite ? 'Plan' : 'Satellite'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Fenetre visible={question} danger icone="moteur" question={fiche ? `Couper le moteur de ${plaque(fiche.v.immatriculation)} ?` : ''}
        detail="La voiture ne pourra plus redémarrer. La coupure se fait à l’arrêt ou à vitesse lente, selon le boîtier." non="Annuler" oui="Couper le moteur" onNon={() => setQuestion(false)} onOui={moteur} />
    </View>
  );

  // Une voiture dans la liste : photo, modèle et plaque, la phrase, l'adresse, et l'avancement de la location
  function CarteVoiture({ s }: { s: Suivi }) {
    const p = phrase(s);
    const coul = couleurPoint(s);
    const retard = enRetard(s);
    let part = 0;
    if (s.loc) { const d = new Date(s.loc.debut).getTime(), f = new Date(s.loc.fin_prevue).getTime(); part = f > d ? Math.min(1, Math.max(0, (Date.now() - d) / (f - d))) : 1; }
    return (
      <Verre onPress={() => choisir(s.v.id)} label={`${nomModele(s.v)} ${plaque(s.v.immatriculation)}, ${p.ligne}`} bord={retard ? c.orange + '88' : undefined}
        style={{ paddingVertical: 12, paddingHorizontal: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <VisuelVehicule v={s.v} taille={46} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: c.texte, fontSize: 16, fontWeight: '800' }}>{nomModele(s.v) || 'Véhicule'}</Text>
              <BadgeSport marque={s.v.marque} modele={s.v.modele} petit />
            </View>
            <Text style={{ color: c.gris, fontSize: 12.5, letterSpacing: 1.4, fontWeight: '600' }}>{plaque(s.v.immatriculation)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }}>
              <Point couleur={coul} taille={8} />
              <Text numberOfLines={1} style={{ flex: 1, color: p.couleur, fontSize: 13.5, fontWeight: '700' }}>{p.ligne}</Text>
            </View>
          </View>
          {s.loc ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.gris, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{retard ? 'ATTENDUE' : 'RETOUR'}</Text>
              <Text style={{ color: retard ? c.orange : c.texte, fontSize: estAujourdhui(s.loc.fin_prevue) ? 19 : 14, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{quandRetour(s.loc.fin_prevue)}</Text>
            </View>
          ) : null}
        </View>
        {s.e?.adresse ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
            <Icone nom="carte" couleur={c.gris} taille={14} />
            <Text numberOfLines={1} style={{ flex: 1, color: c.gris, fontSize: 12.5 }}>{s.e.adresse}</Text>
            {s.e.etat !== 'hors_ligne' && <Text style={{ color: c.gris, fontSize: 12 }}>{depuis(s.e.le)}</Text>}
          </View>
        ) : !s.e ? <Text style={{ color: c.gris, fontSize: 12.5, paddingLeft: 2 }}>Sans traceur · position inconnue</Text> : null}
        {s.loc && (
          <View style={{ height: 5, borderRadius: 3, backgroundColor: sombre ? 'rgba(255,255,255,.08)' : c.panneau2, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round((retard ? 1 : part) * 100)}%`, height: 5, borderRadius: 3, backgroundColor: retard ? c.orange : c.accent }} />
          </View>
        )}
      </Verre>
    );
  }
}

// Fiche d'une voiture : sa photo, son état en une phrase et où elle est, les gestes, la location, et quatre cases utiles.
// Les cases sans donnée ne s'affichent pas.
function FicheVoiture({ s, couleur, phrase, onFermer, envoi, onCouper, trajetAffiche, trajetKm, chargeTrajet, onTrajet }: {
  s: Suivi; couleur: string; phrase: { ligne: string; couleur: string }; onFermer: () => void; envoi: boolean; onCouper: () => void; trajetAffiche: boolean; trajetKm: number | null; chargeTrajet: boolean; onTrajet: () => void;
}) {
  const c = useCouleurs();
  const sombre = useSombre();
  const e = s.e;
  const retard = enRetard(s);
  const kmFaits = kmDepuisDepart(s);
  const enTrop = kmFaits != null && s.loc?.km_inclus != null ? Math.max(0, kmFaits - s.loc.km_inclus) : 0;

  const cases: { titre: string; val: string; sous?: string; coul?: string }[] = [];
  if (e) {
    const moteur = e.etat === 'coupe' ? { val: 'Coupé', coul: c.rouge, sous: 'à distance' }
      : e.contact === true ? { val: 'Allumé', coul: c.vert, sous: e.contact_depuis ? `depuis ${heure(e.contact_depuis)}` : '' }
      : e.contact === false ? { val: 'Éteint', coul: c.texte, sous: e.contact_depuis ? `depuis ${heure(e.contact_depuis)}` : '' } : null;
    if (moteur) cases.push({ titre: 'Moteur', val: moteur.val, sous: moteur.sous, coul: moteur.coul });
    if (e.km_estime != null) cases.push({ titre: 'Compteur', val: km(e.km_estime), sous: kmFaits != null ? `+${km(kmFaits)} depuis le départ` : undefined });
    if (e.km_jour != null) cases.push({ titre: 'Aujourd’hui', val: km(e.km_jour), sous: e.minutes_route ? `${e.minutes_route >= 60 ? `${Math.floor(e.minutes_route / 60)} h ${String(e.minutes_route % 60).padStart(2, '0')}` : `${e.minutes_route} min`} de route` : undefined });
    if (e.tension != null) cases.push({ titre: 'Boîtier', val: e.tension >= 11 ? 'Branché' : e.tension > 3 ? 'Tension faible' : 'Sur sa batterie', coul: e.tension >= 11 ? undefined : c.orange,
      sous: `${String(e.tension).replace('.', ',')} V${e.satellites != null ? ` · ${e.satellites} satellites` : ''}` });
  }

  return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={onFermer} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 }}>
        <Icone nom="retour" couleur={c.accent} taille={18} />
        <Text style={{ color: c.accent, fontWeight: '800', fontSize: 15 }}>Toutes les voitures</Text>
      </Pressable>

      <Verre style={{ padding: 16, gap: 12 }}>
        <Pressable onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: s.v.id } })} accessibilityLabel="Ouvrir la fiche du véhicule"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.75 : 1 })}>
          <VisuelVehicule v={s.v} taille={58} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: c.texte, fontSize: 19, fontWeight: '800' }}>{nomModele(s.v) || 'Véhicule'}</Text>
              <BadgeSport marque={s.v.marque} modele={s.v.modele} petit />
            </View>
            <Plaque immat={plaque(s.v.immatriculation)} taille={0.7} />
          </View>
          <Icone nom="chevron" couleur={c.gris} taille={18} />
        </Pressable>

        <View style={{ borderRadius: 14, padding: 12, gap: 4, backgroundColor: couleur + '1a', borderWidth: 1, borderColor: couleur + '55' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Point couleur={couleur} />
            <Text style={{ flex: 1, color: phrase.couleur, fontSize: 16.5, fontWeight: '800' }}>{e ? phraseEtat(e) : phrase.ligne}</Text>
            {e && <Text style={{ color: c.gris, fontSize: 12, fontWeight: '700' }}>{depuis(e.le)}</Text>}
          </View>
          <Text numberOfLines={2} style={{ color: c.texte2, fontSize: 14 }}>{!e ? 'Sans traceur : position inconnue' : e.lat == null ? 'Position inconnue' : e.adresse ?? 'Adresse en cours de recherche'}</Text>
        </View>

        {e?.alerte ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: c.rouge + '1c' }}>
            <Icone nom="alerte" couleur={c.rouge} taille={18} />
            <Text style={{ flex: 1, color: c.rouge, fontWeight: '800', fontSize: 14 }}>{e.alerte}</Text>
          </View>
        ) : null}

        {trajetAffiche && <Text style={{ color: c.bleu, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>Trajet d’aujourd’hui sur la carte{trajetKm != null ? ` · ${km(trajetKm)}` : ''}</Text>}

        {e ? (
          <View style={{ flexDirection: 'row' }}>
            {e.lat != null && <Action icone="itineraire" titre="Y aller" couleur={c.bleu} onPress={() => Linking.openURL(itineraire(e.lat!, e.lng!))} />}
            {e.coupure !== false && <Action icone={e.moteur_coupe ? 'cle' : 'moteur'} titre={envoi ? 'Envoi…' : e.moteur_coupe ? 'Remettre' : 'Couper'} couleur={e.moteur_coupe ? c.vert : c.rouge} desactive={envoi} onPress={onCouper} />}
            {s.loc?.clients?.telephone ? <Action icone="tel" titre="Client" couleur={c.vert} onPress={() => appeler(s.loc!.clients!.telephone!)} /> : null}
            <Action icone="carte" titre={chargeTrajet ? 'Chargement…' : trajetAffiche ? 'Masquer' : 'Trajet'} couleur={c.accent} desactive={chargeTrajet} onPress={onTrajet} />
          </View>
        ) : (
          <Pressable onPress={() => Linking.openURL(urlSite(`/vehicules/${s.v.id}`))} style={{ alignSelf: 'flex-start' }}>
            <Text style={{ color: c.accent, fontWeight: '800', fontSize: 14.5 }}>Relier un traceur</Text>
          </Pressable>
        )}
      </Verre>

      {s.loc ? (
        <Verre onPress={() => router.push({ pathname: '/location/[id]', params: { id: s.loc!.id } })} label="Ouvrir la location" bord={retard ? c.orange + '88' : undefined}
          style={{ padding: 14, gap: 4, backgroundColor: retard ? c.orange + '16' : undefined }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ flex: 1, color: retard ? c.orange : c.texte, fontSize: 16, fontWeight: '800' }}>{retard ? `En retard de ${duree(s.loc.fin_prevue)}` : `Louée · retour ${quandRetour(s.loc.fin_prevue)}`}</Text>
            <Icone nom="chevron" couleur={c.gris} taille={16} />
          </View>
          <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 14 }}>{nomClient(s.loc.clients)} · contrat n° {s.loc.numero ?? '—'}{retard ? ` · attendue à ${quandRetour(s.loc.fin_prevue)}` : ''}</Text>
          {kmFaits != null && (
            <Text style={{ color: enTrop ? c.orange : c.gris, fontSize: 13, fontWeight: enTrop ? '700' : '500' }}>
              {km(kmFaits)} parcourus{s.loc.km_inclus != null ? (enTrop ? ` · ${km(enTrop)} au-delà du forfait${s.loc.prix_km_sup ? ` (+${(enTrop * s.loc.prix_km_sup).toFixed(2).replace('.', ',')} €)` : ''}` : ` sur ${km(s.loc.km_inclus)} inclus`) : ''}
            </Text>
          )}
        </Verre>
      ) : (
        <Verre style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icone nom={aLAtelier(s) ? 'outil' : 'voiture'} couleur={aLAtelier(s) ? c.orange : c.vert} taille={18} />
          <Text style={{ flex: 1, color: aLAtelier(s) ? c.orange : c.vert, fontSize: 15.5, fontWeight: '700' }}>{aLAtelier(s) ? 'À l’atelier' : 'Libre, prête à louer'}</Text>
          {!aLAtelier(s) && <Pressable onPress={() => router.push({ pathname: '/nouvelle', params: { vehicule: s.v.id } })}><Text style={{ color: c.accent, fontWeight: '800', fontSize: 14.5 }}>Louer</Text></Pressable>}
        </Verre>
      )}

      {cases.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {cases.map((k) => (
            <Verre key={k.titre} style={{ flexBasis: '47%', flexGrow: 1, padding: 12, gap: 3 }}>
              <Libelle>{k.titre}</Libelle>
              <Text numberOfLines={1} style={{ color: k.coul ?? c.texte, fontSize: 17, fontWeight: '800' }}>{k.val}</Text>
              {k.sous ? <Text numberOfLines={1} style={{ color: c.gris, fontSize: 12 }}>{k.sous}</Text> : null}
            </Verre>
          ))}
        </View>
      )}
    </View>
  );
}
