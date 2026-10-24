// Position des véhicules, lue sur le serveur du site (les clés du fournisseur GPS restent là-bas)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from './site';
import { garder, relire } from './hors-ligne';
import { DEMO } from './demo';
import type { Couleurs } from './theme';

export type EtatGps = {
  vehicule_id: string; imei: string; etat: 'roule' | 'arret' | 'coupe' | 'hors_ligne'; moteur_coupe: boolean;
  lat: number | null; lng: number | null; vitesse: number; contact: boolean | null; le: string | null; km_estime: number | null; alerte: string | null;
  coupure?: boolean; direct?: boolean; // coupure = false pour les boîtiers sans relais
  adresse?: string | null; contact_depuis?: string | null; arret_depuis?: string | null;
  tension?: number | null; satellites?: number | null; km_jour?: number | null; minutes_route?: number | null;
};
export type Gps = { actif: boolean; demo: boolean; raison: string | null; parVehicule: Record<string, EtatGps> };
const vide: Gps = { actif: false, demo: false, raison: null, parVehicule: {} };

const coupes = new Set<string>();
function gpsDemo(): Gps {
  const il = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const e = (id: string, etat: EtatGps['etat'], lat: number, lng: number, vitesse: number, km: number, min: number, plus: Partial<EtatGps>): EtatGps => {
    const c = coupes.has(id);
    return { vehicule_id: id, imei: '86000000000000' + id.slice(1), etat: c ? 'coupe' : etat, moteur_coupe: c, lat, lng, vitesse: c ? 0 : vitesse,
      contact: etat === 'roule', le: il(min), km_estime: km, alerte: null, coupure: true, direct: true, tension: 12.4, satellites: 9, ...plus,
      ...(c ? { contact: false, contact_depuis: il(0) } : {}) };
  };
  const l = [
    e('v1', 'arret', 48.8566, 2.3522, 0, 42350, 4, { contact: false, contact_depuis: il(130), arret_depuis: il(130), adresse: 'Rue de Rivoli, Paris 4e', km_jour: 0 }),
    e('v2', 'arret', 48.8411, 2.3003, 0, 61210, 1, { contact: true, contact_depuis: il(22), arret_depuis: il(4), adresse: 'Rue de Vaugirard, Paris 15e', km_jour: 18, minutes_route: 35 }),
    e('v3', 'roule', 48.8848, 2.2966, 47, 23262, 0.3, { contact: true, contact_depuis: il(48), adresse: 'Boulevard Bineau, Neuilly-sur-Seine', km_jour: 86, minutes_route: 130 }),
    e('v4', 'arret', 48.8352, 2.2412, 0, 88190, 26, { contact: false, contact_depuis: il(300), arret_depuis: il(300), adresse: 'Rue du Château, Boulogne-Billancourt', km_jour: 41 }),
    e('v6', 'hors_ligne', 48.8462, 2.2870, 0, 18400, 190, { contact: false, adresse: 'Rue Lecourbe, Paris 15e', tension: null, satellites: null }),
  ];
  return { actif: true, demo: true, raison: null, parVehicule: Object.fromEntries(l.map((x) => [x.vehicule_id, x])) };
}

// Coupure demandée : l'écran l'affiche tout de suite, sur tous les écrans ouverts, sans attendre le prochain relevé
const attendus = new Map<string, { coupe: boolean; jusqua: number }>();
const abonnes = new Set<() => void>();
function appliquer(g: Gps): Gps {
  if (!attendus.size) return g;
  const parVehicule = { ...g.parVehicule };
  for (const [id, a] of attendus) {
    const e = parVehicule[id];
    if (Date.now() > a.jusqua) { attendus.delete(id); continue; }
    if (!e) continue;
    if (e.moteur_coupe === a.coupe) { attendus.delete(id); continue; }
    parVehicule[id] = { ...e, moteur_coupe: a.coupe, etat: a.coupe ? 'coupe' : e.vitesse > 0 ? 'roule' : 'arret', vitesse: a.coupe ? 0 : e.vitesse };
  }
  return { ...g, parVehicule };
}

export async function chargerGps(): Promise<Gps> {
  if (DEMO) return gpsDemo();
  try {
    const r = await api<{ actif: boolean; demo: boolean; raison: string | null; vehicules: EtatGps[] }>('mobile/gps');
    const g = { actif: r.actif, demo: r.demo, raison: r.raison, parVehicule: Object.fromEntries(r.vehicules.map((v) => [v.vehicule_id, v])) };
    garder('gps', g).catch(() => {});
    return appliquer(g);
  } catch {
    return appliquer((await relire<Gps>('gps'))?.valeur ?? vide);
  }
}

export async function commanderMoteur(vehiculeId: string, couper: boolean) {
  if (DEMO) { await new Promise((r) => setTimeout(r, 900)); couper ? coupes.add(vehiculeId) : coupes.delete(vehiculeId); abonnes.forEach((f) => f()); return { enLigne: true }; }
  const r = await api<{ ok: boolean; enLigne: boolean }>('mobile/moteur', { vehicule_id: vehiculeId, couper });
  attendus.set(vehiculeId, { coupe: couper, jusqua: Date.now() + 60000 });
  abonnes.forEach((f) => f());
  return r;
}

// Trajet du jour d'un véhicule : points [lng, lat] depuis minuit et km parcourus
export type Trajet = { disponible: boolean; points: [number, number][]; km: number | null };
export async function chargerTrajet(vehiculeId: string, e?: EtatGps): Promise<Trajet> {
  if (DEMO) {
    if (!e?.lat || !e.lng) return { disponible: true, points: [], km: 0 };
    const pts: [number, number][] = Array.from({ length: 40 }, (_, i) => [e.lng! - 0.06 + i * 0.0015 + Math.sin(i / 4) * 0.004, e.lat! - 0.03 + i * 0.00075 + Math.cos(i / 5) * 0.003]);
    pts.push([e.lng, e.lat]);
    return { disponible: true, points: pts, km: e.km_jour ?? 12 };
  }
  return api<Trajet>(`mobile/trajet?vehicule_id=${encodeURIComponent(vehiculeId)}`);
}

// Actualisé toutes les 30 s tant que l'écran est affiché
export function useGps() {
  const [gps, setGps] = useState<Gps>(vide);
  const actif = useRef(false);
  const numero = useRef(0);
  // Seule la réponse la plus récente compte : un ancien relevé arrivé en retard n'écrase pas l'état après une coupure
  const lancer = useCallback(() => { const n = ++numero.current; chargerGps().then((g) => { if (n === numero.current) setGps(g); }).catch(() => {}); }, []);
  useEffect(() => { lancer(); }, [lancer]);
  useEffect(() => {
    const maj = () => { numero.current++; setGps((g) => appliquer(DEMO ? gpsDemo() : g)); lancer(); };
    abonnes.add(maj);
    return () => { abonnes.delete(maj); };
  }, [lancer]);
  useFocusEffect(useCallback(() => {
    actif.current = true; lancer();
    const t = setInterval(() => actif.current && lancer(), 30000);
    return () => { actif.current = false; clearInterval(t); };
  }, [lancer]));
  return { gps, rafraichirGps: lancer };
}

export const libelleGps = (e: EtatGps) => ({ roule: `Roule · ${e.vitesse} km/h`, arret: 'À l’arrêt', coupe: 'Moteur coupé', hors_ligne: 'Hors ligne' })[e.etat];
export const couleurGps = (e: EtatGps, c: Couleurs) => ({ roule: c.bleu, arret: c.vert, coupe: c.rouge, hors_ligne: c.gris })[e.etat];
export const depuis = (iso?: string | null) => {
  if (!iso) return 'pas de signal';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'à l’instant' : min < 60 ? `il y a ${min} min` : min < 1440 ? `il y a ${Math.round(min / 60)} h` : `il y a ${Math.round(min / 1440)} j`;
};
// Durée écoulée depuis une date, en court : « 4 min », « 2 h 10 », « 3 j »
export const duree = (iso?: string | null) => {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${Math.max(1, min)} min`;
  if (min < 1440) { const h = Math.floor(min / 60), m = min % 60; return m && h < 10 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  return `${Math.round(min / 1440)} j`;
};
// L'état en une phrase courte, moteur compris : c'est ce qu'on lit dans la liste
export function phraseEtat(e: EtatGps): string {
  if (e.etat === 'roule') return `Roule · ${e.vitesse} km/h`;
  if (e.etat === 'coupe') return 'Moteur coupé à distance';
  if (e.etat === 'hors_ligne') return e.le ? `Hors ligne depuis ${duree(e.le)}` : 'Hors ligne';
  if (e.contact === true) return 'À l’arrêt · moteur allumé';
  if (e.contact === false) return e.arret_depuis ? `Garée depuis ${duree(e.arret_depuis)}` : 'Garée · moteur éteint';
  return 'À l’arrêt';
}
// Mot court affiché à côté de la plaque sur la carte (rien quand tout est normal)
export function motCarte(e: EtatGps): string | null {
  if (e.etat === 'roule') return `${e.vitesse} km/h`;
  if (e.etat === 'coupe') return 'coupé';
  if (e.etat === 'hors_ligne') return 'hors ligne';
  if (e.contact === true) return 'moteur allumé';
  return null;
}
export const itineraire = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
