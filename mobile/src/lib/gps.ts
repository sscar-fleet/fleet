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
};
export type Gps = { actif: boolean; demo: boolean; raison: string | null; parVehicule: Record<string, EtatGps> };
const vide: Gps = { actif: false, demo: false, raison: null, parVehicule: {} };

const coupes = new Set<string>();
function gpsDemo(): Gps {
  const il = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const e = (id: string, etat: EtatGps['etat'], lat: number, lng: number, vitesse: number, km: number, min: number): EtatGps =>
    ({ vehicule_id: id, imei: '86000000000000' + id.slice(1), etat: coupes.has(id) ? 'coupe' : etat, moteur_coupe: coupes.has(id), lat, lng, vitesse: coupes.has(id) ? 0 : vitesse, contact: etat === 'roule', le: il(min), km_estime: km, alerte: null });
  const l = [
    e('v1', 'arret', 48.8566, 2.3522, 0, 42350, 4), e('v2', 'arret', 48.8571, 2.3539, 0, 61210, 9),
    e('v3', 'roule', 48.8848, 2.2966, 47, 23412, 1), e('v4', 'arret', 48.8352, 2.2412, 0, 88190, 26),
  ];
  return { actif: true, demo: true, raison: null, parVehicule: Object.fromEntries(l.map((x) => [x.vehicule_id, x])) };
}

export async function chargerGps(): Promise<Gps> {
  if (DEMO) return gpsDemo();
  try {
    const r = await api<{ actif: boolean; demo: boolean; raison: string | null; vehicules: EtatGps[] }>('mobile/gps');
    const g = { actif: r.actif, demo: r.demo, raison: r.raison, parVehicule: Object.fromEntries(r.vehicules.map((v) => [v.vehicule_id, v])) };
    garder('gps', g).catch(() => {});
    return g;
  } catch {
    return (await relire<Gps>('gps'))?.valeur ?? vide;
  }
}

export async function commanderMoteur(vehiculeId: string, couper: boolean) {
  if (DEMO) { await new Promise((r) => setTimeout(r, 900)); couper ? coupes.add(vehiculeId) : coupes.delete(vehiculeId); return { enLigne: true }; }
  return api<{ ok: boolean; enLigne: boolean }>('mobile/moteur', { vehicule_id: vehiculeId, couper });
}

// Actualisé toutes les 30 s tant que l'écran est affiché
export function useGps() {
  const [gps, setGps] = useState<Gps>(vide);
  const actif = useRef(false);
  const lancer = useCallback(() => { chargerGps().then(setGps).catch(() => {}); }, []);
  useEffect(() => { lancer(); }, [lancer]);
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
export const itineraire = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
