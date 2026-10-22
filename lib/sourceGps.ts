// Point d'entrée unique du suivi GPS : notre serveur en direct (Traccar) pour les boîtiers en double serveur,
// WhatsGPS pour les autres. Le reste du logiciel ne parle qu'à ce fichier.
import { etatsDuCompte, alertesRecentes, commandeMoteur as commandeWhatsgps, type EtatTraceur, type AlerteBoitier } from './whatsgps';
import { etatsTraccar, alertesTraccar, commandeTraccar, traccarConfigure } from './traccar';

export async function etatsFusionnes(compteId?: number | string | null): Promise<EtatTraceur[]> {
  const [ws, direct] = await Promise.all([
    etatsDuCompte(compteId),
    traccarConfigure() ? etatsTraccar().catch(() => [] as EtatTraceur[]) : Promise.resolve([] as EtatTraceur[]),
  ]);
  if (!direct.length) return ws;
  const parImei = new Map(direct.map((e) => [e.imei, e]));
  const fusion = ws.map((e) => {
    const d = parImei.get(e.imei);
    if (!d) return { ...e, source: 'whatsgps' as const };
    parImei.delete(e.imei);
    // Le direct gagne dès qu'il a une position, en gardant l'identifiant et le nom WhatsGPS
    return d.lat != null ? { ...d, carId: e.carId, nom: e.nom ?? d.nom } : { ...e, source: 'whatsgps' as const };
  });
  // Les boîtiers présents seulement sur notre serveur ne sont montrés à personne tant qu'ils ne sont pas
  // rattachés à un compte d'agence : sinon chaque loueur verrait les boîtiers des autres.
  return fusion;
}

export async function alertesFusionnees(heures = 48): Promise<AlerteBoitier[]> {
  const [ws, direct] = await Promise.all([
    alertesRecentes(heures),
    traccarConfigure() ? alertesTraccar(heures).catch(() => [] as AlerteBoitier[]) : Promise.resolve([] as AlerteBoitier[]),
  ]);
  return [...direct, ...ws].sort((a, b) => (b.le ?? '').localeCompare(a.le ?? ''));
}

// Le S21L est un boîtier sans fil (à pile) : pas de relais, donc pas de coupure moteur
export const sansCoupure = (modele?: string | null) => /s21/i.test(String(modele ?? ''));

// Coupure (RELAY,1#) ou remise en route (RELAY,0#) : par notre serveur si le boîtier y est, sinon par WhatsGPS
export async function commandeMoteur(imei: string, couper: boolean, modele?: string | null): Promise<{ enLigne: boolean; par: 'direct' | 'whatsgps' }> {
  if (sansCoupure(modele)) throw new Error('Ce boîtier (S21L, sans fil) n’a pas de coupure moteur.');
  const direct = await commandeTraccar(imei, couper ? 'RELAY,1#' : 'RELAY,0#').catch(() => null);
  if (direct) return { ...direct, par: 'direct' };
  const r = await commandeWhatsgps(imei, couper);
  return { enLigne: r.enLigne, par: 'whatsgps' };
}
