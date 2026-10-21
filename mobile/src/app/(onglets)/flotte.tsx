// Espace Suivi : la carte de toutes les voitures suivies (louées ou au parking), un filtre par état,
// la liste compacte, et une fiche rapide au toucher. Les voitures sans traceur sont listées à part.
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, Carte, Chargement, BandeauHorsLigne, Vide, Etiquette, BoutonRond, GrosBouton, Action, Ligne } from '@/composants/ui';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import MiniCarte from '@/composants/MiniCarte';
import Feuille from '@/composants/Feuille';
import Fenetre from '@/composants/Fenetre';
import { useToast } from '@/composants/Toast';
import { logoMarque } from '@/lib/logoMarque';
import { chargerVehicules, chargerLocations, type VehiculeLigne, type LocationLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps, libelleGps, couleurGps, depuis, itineraire, commanderMoteur, type EtatGps } from '@/lib/gps';
import { appeler } from '@/lib/messages';
import { urlSite } from '@/lib/site';
import { heure, jour, km, nomClient, nomVehicule, plaque, estAujourdhui } from '@/lib/format';

type Filtre = 'tous' | 'roule' | 'arret' | 'coupe' | 'hors_ligne';
const LIBELLE: Record<Filtre, string> = { tous: 'Toutes', roule: 'Roule', arret: 'À l’arrêt', coupe: 'Coupé', hors_ligne: 'Hors ligne' };
type Suivi = { v: VehiculeLigne; e: EtatGps; loc?: LocationLigne };

export default function EspaceSuivi() {
  const c = useCouleurs();
  const toast = useToast();
  const { gps, rafraichirGps } = useGps();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerVehicules);
  const [locations, setLocations] = useState<LocationLigne[]>([]);
  useEffect(() => { chargerLocations().then((r) => setLocations(r.donnees)).catch(() => {}); }, [donnees]);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [choisi, setChoisi] = useState<string | null>(null);
  const [ficheChoisie, setFiche] = useState<Suivi | null>(null);
  const [question, setQuestion] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const vehicules = (donnees ?? []).filter((v) => v.statut !== 'sorti');
  const enCours = (id: string) => locations.find((l) => l.statut === 'en_cours' && l.vehicules?.id === id);
  const suivis: Suivi[] = vehicules.filter((v) => gps.parVehicule[v.id]).map((v) => ({ v, e: gps.parVehicule[v.id], loc: enCours(v.id) }));
  // La fiche ouverte suit l'état en direct (coupure moteur, position)
  const fiche = ficheChoisie ? suivis.find((s) => s.v.id === ficheChoisie.v.id) ?? ficheChoisie : null;
  const sansTraceur = vehicules.filter((v) => !gps.parVehicule[v.id]);
  const nb = (f: Filtre) => (f === 'tous' ? suivis.length : suivis.filter((s) => s.e.etat === f).length);
  // Les voitures qui roulent d'abord, puis les dernières nouvelles en haut
  const ordre: Record<string, number> = { roule: 0, coupe: 1, arret: 2, hors_ligne: 3 };
  const visibles = suivis.filter((s) => filtre === 'tous' || s.e.etat === filtre).sort((a, b) => ordre[a.e.etat] - ordre[b.e.etat]);
  const cible = visibles.find((s) => s.v.id === choisi && s.e.lat != null);
  const points = visibles.filter((s) => s.e.lat != null && s.e.lng != null).map((s) => ({
    id: s.v.id, lat: s.e.lat!, lng: s.e.lng!, couleur: couleurGps(s.e, c), titre: plaque(s.v.immatriculation), logo: logoMarque(s.v.marque, s.v.modele),
    onPress: () => ouvrir(s),
  }));

  function ouvrir(s: Suivi) { setChoisi(s.v.id); setFiche(s); }
  const enRetardLoc = (s: Suivi) => !!s.loc && new Date(s.loc.fin_prevue).getTime() < Date.now();
  const ou = (s: Suivi) => s.loc
    ? `${nomClient(s.loc.clients)} · ${enRetardLoc(s) ? 'devait rentrer le' : 'retour'} ${estAujourdhui(s.loc.fin_prevue) ? 'à' : jour(s.loc.fin_prevue)} ${heure(s.loc.fin_prevue)}`
    : s.v.statut === 'maintenance' || s.v.statut === 'hors_service' ? 'À l’atelier' : 'Au parking';

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

  return (
    <Ecran titre="Suivi" sousTitre={gps.actif ? `${suivis.length} suivie${suivis.length > 1 ? 's' : ''} · ${nb('roule')} en route${gps.demo ? ' · aperçu' : ''}` : 'Positions des voitures'}
      rafraichir={() => { recharger(); rafraichirGps(); }} enChargement={enChargement && !!donnees}
      actions={<BoutonRond icone="voiture" label="Stock" onPress={() => router.push('/stock')} />}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees ? <Chargement /> : !gps.actif ? (
        <Vide icone="carte" titre="Suivi GPS pas encore activé" texte={gps.raison ?? 'Le suivi s’active avec les traceurs posés par SS CAR SYSTEM.'} />
      ) : <>
        {points.length > 0 ? (
          <View style={{ gap: 6 }}>
            <MiniCarte points={points} hauteur={300} zoomMax={15} centre={cible ? { lat: cible.e.lat!, lng: cible.e.lng!, zoom: 15 } : null} onPress={() => router.push('/carte')} />
            <Ligne style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: c.gris, fontSize: 12 }}>{gps.demo ? 'Aperçu : positions fictives en attendant les clés du fournisseur GPS.' : 'Actualisé toutes les 30 secondes.'}</Text>
              {cible ? <Text onPress={() => setChoisi(null)} style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>Voir toutes</Text>
                : <Text onPress={() => router.push('/carte')} style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>Plein écran</Text>}
            </Ligne>
          </View>
        ) : suivis.length > 0 ? <Carte><Text style={{ color: c.gris }}>Aucune position dans ce filtre.</Text></Carte> : null}

        {suivis.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['tous', 'roule', 'arret', 'coupe', 'hors_ligne'] as Filtre[]).filter((f) => f === 'tous' || nb(f) > 0 || f === filtre).map((f) => {
              const actif = filtre === f;
              const coul = f === 'tous' ? c.accent : couleurGps({ etat: f } as EtatGps, c);
              return (
                <Pressable key={f} onPress={() => { setFiltre(f); setChoisi(null); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: actif ? coul : c.bord, backgroundColor: actif ? coul + '1f' : c.panneau }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: coul }} />
                  <Text style={{ color: c.texte, fontWeight: '700', fontSize: 14 }}>{LIBELLE[f]}</Text>
                  <Text style={{ color: actif ? coul : c.gris, fontWeight: '800', fontSize: 14 }}>{nb(f)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {visibles.length > 0 && (
          <Carte style={{ paddingVertical: 2 }}>
            {visibles.map((s, i) => (
              <Pressable key={s.v.id} onPress={() => ouvrir(s)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: i === visibles.length - 1 ? 0 : 1, borderBottomColor: c.bord, opacity: pressed ? 0.7 : 1 })}>
                <View>
                  <LogoMarque marque={s.v.marque} modele={s.v.modele} taille={42} />
                  <View style={{ position: 'absolute', right: -3, bottom: -3, width: 15, height: 15, borderRadius: 8, backgroundColor: couleurGps(s.e, c), borderWidth: 3, borderColor: c.panneau }} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{plaque(s.v.immatriculation)} <Text style={{ color: c.gris, fontWeight: '600', fontSize: 14 }}>{nomVehicule(s.v)}</Text></Text>
                  <Text numberOfLines={1} style={{ color: enRetardLoc(s) ? c.rouge : s.loc ? c.texte2 : c.gris, fontSize: 13, fontWeight: enRetardLoc(s) ? '700' : '400' }}>{ou(s)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ color: couleurGps(s.e, c), fontWeight: '800', fontSize: 14 }}>{s.e.etat === 'roule' ? `${s.e.vitesse} km/h` : libelleGps(s.e)}</Text>
                  <Text style={{ color: c.gris, fontSize: 12 }}>{depuis(s.e.le)}</Text>
                </View>
              </Pressable>
            ))}
          </Carte>
        )}

        {sansTraceur.length > 0 && <>
          <Text style={{ color: c.gris, fontWeight: '800', fontSize: 13, marginTop: 6 }}>SANS TRACEUR · {sansTraceur.length}</Text>
          <Carte style={{ paddingVertical: 2, opacity: 0.85 }}>
            {sansTraceur.map((v, i) => (
              <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === sansTraceur.length - 1 ? 0 : 1, borderBottomColor: c.bord }}>
                <LogoMarque marque={v.marque} modele={v.modele} taille={36} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 15, fontWeight: '700' }}>{plaque(v.immatriculation)} <Text style={{ color: c.gris, fontWeight: '500', fontSize: 13 }}>{nomVehicule(v)}</Text></Text>
                  <Text style={{ color: c.gris, fontSize: 12 }}>{enCours(v.id) ? `Louée · ${nomClient(enCours(v.id)!.clients)}` : 'Position inconnue'}</Text>
                </View>
                <Text onPress={() => Linking.openURL(urlSite(`/vehicules/${v.id}`))} style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>Relier un traceur</Text>
              </View>
            ))}
          </Carte>
        </>}
      </>}

      <Feuille visible={!!fiche} titre={fiche ? `${plaque(fiche.v.immatriculation)} · ${nomVehicule(fiche.v)}` : ''} onFermer={() => setFiche(null)}>
        {fiche && <>
          <Ligne style={{ justifyContent: 'space-between' }}>
            <Etiquette titre={libelleGps(fiche.e)} couleur={couleurGps(fiche.e, c)} />
            <Text style={{ color: c.gris, fontSize: 13 }}>{depuis(fiche.e.le)}{fiche.e.km_estime != null ? ` · ${km(fiche.e.km_estime)}` : ''}</Text>
          </Ligne>
          <Text style={{ color: c.texte2, fontSize: 15 }}>{ou(fiche)}</Text>
          {fiche.e.alerte ? <Etiquette titre={fiche.e.alerte} couleur={c.rouge} icone="alerte" /> : null}
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            {fiche.e.lat != null && <Action icone="itineraire" titre="Itinéraire" couleur={c.bleu} onPress={() => Linking.openURL(itineraire(fiche.e.lat!, fiche.e.lng!))} />}
            <Action icone={fiche.e.moteur_coupe ? 'cle' : 'moteur'} titre={envoi ? 'Envoi…' : fiche.e.moteur_coupe ? 'Remettre' : 'Couper'} couleur={fiche.e.moteur_coupe ? c.vert : c.rouge} desactive={envoi}
              onPress={() => (fiche.e.moteur_coupe ? moteur() : setQuestion(true))} />
            {fiche.loc?.clients?.telephone ? <Action icone="tel" titre="Client" couleur={c.vert} onPress={() => appeler(fiche.loc!.clients!.telephone!)} /> : null}
            <Action icone="voiture" titre="Fiche" couleur={c.texte2} onPress={() => { const id = fiche.v.id; setFiche(null); router.push({ pathname: '/vehicule/[id]', params: { id } }); }} />
          </View>
          {fiche.loc && <GrosBouton secondaire petit icone="doc" titre={`Location n° ${fiche.loc.numero ?? '—'}`} onPress={() => { const id = fiche.loc!.id; setFiche(null); router.push({ pathname: '/location/[id]', params: { id } }); }} />}
        </>}
      </Feuille>

      <Fenetre visible={question} danger icone="moteur" question={fiche ? `Couper le moteur de ${plaque(fiche.v.immatriculation)} ?` : ''}
        detail="La voiture ne pourra plus redémarrer. La coupure se fait à l’arrêt ou à vitesse lente, selon le boîtier." non="Annuler" oui="Couper le moteur" onNon={() => setQuestion(false)} onOui={moteur} />
    </Ecran>
  );
}
