// Entretien au kilomètre : vidange tous les X km ou tous les X mois (le premier atteint), comme dans le carnet du constructeur
export const TYPES_PLAN: Record<string, { libelle: string; km?: number; mois?: number }> = {
  vidange: { libelle: 'Vidange + filtres', km: 30000, mois: 12 },
  pneus: { libelle: 'Pneus', km: 50000 },
  freins: { libelle: 'Plaquettes de frein', km: 40000 },
  distribution: { libelle: 'Distribution', km: 150000, mois: 72 },
  revision: { libelle: 'Révision complète', km: 60000, mois: 24 },
  controle_technique: { libelle: 'Contrôle technique', mois: 12 },
  autre: { libelle: 'Autre' },
};
export const SEUIL_KM = 1500;   // on prévient 1 500 km avant
export const SEUIL_JOURS = 21;  // ou 3 semaines avant

const JOUR = 864e5;
const ajouterMois = (d: string, m: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };

export type Echeance = { kmRestant: number | null; prochainKm: number | null; prochaineDate: string | null; joursRestants: number | null; niveau: 'rouge' | 'orange' | 'ok' | 'inconnu' };

export function echeancePlan(p: { intervalle_km?: number | null; intervalle_mois?: number | null; dernier_km?: number | null; derniere_date?: string | null }, kmActuel: number | null | undefined, aujourdhui = new Date().toISOString().slice(0, 10)): Echeance {
  const prochainKm = p.intervalle_km && p.dernier_km != null ? p.dernier_km + p.intervalle_km : null;
  const kmRestant = prochainKm != null && kmActuel != null ? prochainKm - kmActuel : null;
  const prochaineDate = p.intervalle_mois && p.derniere_date ? ajouterMois(p.derniere_date, p.intervalle_mois) : null;
  const joursRestants = prochaineDate ? Math.round((new Date(prochaineDate + 'T12:00:00Z').getTime() - new Date(aujourdhui + 'T12:00:00Z').getTime()) / JOUR) : null;
  let niveau: Echeance['niveau'] = 'inconnu';
  if (kmRestant != null || joursRestants != null) {
    niveau = (kmRestant != null && kmRestant <= 0) || (joursRestants != null && joursRestants <= 0) ? 'rouge'
      : (kmRestant != null && kmRestant <= SEUIL_KM) || (joursRestants != null && joursRestants <= SEUIL_JOURS) ? 'orange' : 'ok';
  }
  return { kmRestant, prochainKm, prochaineDate, joursRestants, niveau };
}

export const libellePlan = (p: { type: string; libelle?: string | null }) => p.libelle || TYPES_PLAN[p.type]?.libelle || 'Entretien';
export const phraseEcheance = (e: Echeance) => {
  const morceaux: string[] = [];
  if (e.kmRestant != null) morceaux.push(e.kmRestant <= 0 ? `dépassé de ${Math.abs(e.kmRestant).toLocaleString('fr-FR')} km` : `dans ${e.kmRestant.toLocaleString('fr-FR')} km`);
  if (e.joursRestants != null) morceaux.push(e.joursRestants <= 0 ? `date dépassée de ${Math.abs(e.joursRestants)} j` : e.joursRestants <= 60 ? `dans ${e.joursRestants} j` : `avant le ${new Date(e.prochaineDate + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`);
  return morceaux.join(' · ') || 'Dernier passage à renseigner';
};
