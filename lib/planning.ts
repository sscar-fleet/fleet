// Moteur de planning des tournées (version transport).
// Il affecte un chauffeur et un camion à chaque tournée de la semaine en respectant les règles de l'entreprise.
// Toutes les règles sont réglables par entreprise (agences.regles_transport) ; les valeurs par défaut sont celles
// d'une société de messagerie type : 2 jours de repos, 2 créneaux par jour, un chauffeur = un dépôt, camions partagés
// entre voisins. Fonction pure (aucun accès à la base) : testée dans scripts/test-planning.mjs.

export type Regles = {
  joursReposMin: number;        // jours de repos minimum par semaine (lundi → dimanche)
  joursConsecutifsMax: number;  // jours travaillés d'affilée au maximum
  creneauxMaxJour: number;      // tournées par chauffeur et par jour
  pauseMinutes: number;         // battement minimum entre deux tournées d'un même chauffeur ou d'un même camion
  memeDepot: boolean;           // un chauffeur ne tourne que sur son dépôt
  partageCamion: boolean;       // un camion peut servir à plusieurs chauffeurs dans la journée
  partageMemeVille: boolean;    // en cas de partage, on cherche d'abord deux chauffeurs de la même ville
  regrouperCreneaux: boolean;   // à égalité, on donne un 2e créneau à un chauffeur qui tourne déjà ce jour-là
  prisePosteMinutes: number;    // alerte « pas encore parti » : tant de minutes avant le début de la tournée
};
export const REGLES_DEFAUT: Regles = {
  joursReposMin: 2, joursConsecutifsMax: 5, creneauxMaxJour: 2, pauseMinutes: 0,
  memeDepot: true, partageCamion: true, partageMemeVille: true, regrouperCreneaux: true, prisePosteMinutes: 45,
};
export function reglesDe(brut: unknown): Regles {
  const r = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const n = (k: keyof Regles, min: number, max: number) => {
    const v = Number(r[k]); return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : (REGLES_DEFAUT[k] as number);
  };
  const b = (k: keyof Regles) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (REGLES_DEFAUT[k] as boolean));
  return {
    joursReposMin: n('joursReposMin', 0, 6), joursConsecutifsMax: n('joursConsecutifsMax', 1, 7), creneauxMaxJour: n('creneauxMaxJour', 1, 6),
    pauseMinutes: n('pauseMinutes', 0, 240), memeDepot: b('memeDepot'), partageCamion: b('partageCamion'),
    partageMemeVille: b('partageMemeVille'), regrouperCreneaux: b('regrouperCreneaux'), prisePosteMinutes: n('prisePosteMinutes', 0, 240),
  };
}

export type TourneeP = {
  id: string; jour: string; debut: string; fin: string; depot_id?: string | null;
  chauffeur_id?: string | null; vehicule_id?: string | null; verrouillee?: boolean;
};
export type ChauffeurP = { id: string; depot_id?: string | null; ville?: string | null; actif?: boolean; indispos?: { du: string; au: string }[] };
export type VehiculeP = { id: string; depot_id?: string | null; disponible?: boolean };
export type Affectation = { id: string; chauffeur_id: string | null; vehicule_id: string | null };
export type Manque = { id: string; raison: string };

const minutes = (h: string) => { const [a, b] = String(h).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const intervalle = (t: TourneeP): [number, number] => { const d = minutes(t.debut); let f = minutes(t.fin); if (f <= d) f += 1440; return [d, f]; };
const chevauche = (a: [number, number], b: [number, number], pause: number) => a[0] < b[1] + pause && b[0] < a[1] + pause;
const ajouterJours = (j: string, n: number) => { const d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Lundi de la semaine d'un jour (AAAA-MM-JJ)
export const lundiDe = (j: string) => { const d = new Date(j + 'T12:00:00Z'); const w = (d.getUTCDay() + 6) % 7; return ajouterJours(j, -w); };
const normVille = (v?: string | null) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

export function planifier(entree: {
  tournees: TourneeP[]; chauffeurs: ChauffeurP[]; vehicules: VehiculeP[]; regles?: Partial<Regles>;
  // Jours déjà travaillés hors de la période planifiée (semaine précédente…) pour la règle des jours d'affilée,
  // et nombre de tournées déjà faites dans le mois pour l'équité sur la durée
  joursTravailles?: Record<string, string[]>; tourneesMois?: Record<string, number>;
}): { affectations: Affectation[]; manques: Manque[] } {
  const R: Regles = { ...REGLES_DEFAUT, ...(entree.regles ?? {}) };
  const chauffeurs = entree.chauffeurs.filter((c) => c.actif !== false);
  const vehicules = entree.vehicules.filter((v) => v.disponible !== false);
  const parId = new Map(chauffeurs.map((c) => [c.id, c]));

  // État : créneaux occupés par chauffeur et par camion, jour par jour ; jours travaillés ; tournées par semaine
  const occChauffeur = new Map<string, Map<string, [number, number][]>>();
  const occCamion = new Map<string, Map<string, { iv: [number, number]; chauffeur: string | null }[]>>();
  const jours = new Map<string, Set<string>>();
  const nbSemaine = new Map<string, number>(); // clé chauffeur|lundi
  const camionDuJour = new Map<string, string>(); // clé chauffeur|jour → camion
  const occ = <T,>(m: Map<string, Map<string, T[]>>, k: string, j: string) => {
    if (!m.has(k)) m.set(k, new Map()); const mm = m.get(k)!; if (!mm.has(j)) mm.set(j, []); return mm.get(j)!;
  };
  Object.entries(entree.joursTravailles ?? {}).forEach(([c, js]) => jours.set(c, new Set(js)));
  const noter = (t: TourneeP, chauffeur: string | null, camion: string | null) => {
    const iv = intervalle(t);
    if (chauffeur) {
      occ(occChauffeur, chauffeur, t.jour).push(iv);
      if (!jours.has(chauffeur)) jours.set(chauffeur, new Set()); jours.get(chauffeur)!.add(t.jour);
      const k = chauffeur + '|' + lundiDe(t.jour); nbSemaine.set(k, (nbSemaine.get(k) ?? 0) + 1);
      if (camion) camionDuJour.set(chauffeur + '|' + t.jour, camion);
    }
    if (camion) occ(occCamion, camion, t.jour).push({ iv, chauffeur });
  };

  // Les tournées verrouillées (choisies à la main) restent telles quelles et comptent dans l'état
  const fixes = entree.tournees.filter((t) => t.verrouillee);
  fixes.forEach((t) => noter(t, t.chauffeur_id ?? null, t.vehicule_id ?? null));
  const aPlacer = entree.tournees.filter((t) => !t.verrouillee)
    .sort((a, b) => a.jour.localeCompare(b.jour) || minutes(a.debut) - minutes(b.debut) || a.id.localeCompare(b.id));

  const joursSemaine = (c: string, lundi: string) => { const s = jours.get(c); if (!s) return 0; let n = 0; for (let i = 0; i < 7; i++) if (s.has(ajouterJours(lundi, i))) n++; return n; };
  const suiteSi = (c: string, jour: string) => {
    // Longueur de la série de jours travaillés qui contiendrait « jour »
    const s = jours.get(c) ?? new Set<string>(); let n = 1;
    for (let i = 1; s.has(ajouterJours(jour, -i)); i++) n++;
    for (let i = 1; s.has(ajouterJours(jour, i)); i++) n++;
    return n;
  };
  const indispo = (c: ChauffeurP, jour: string) => (c.indispos ?? []).some((p) => p.du <= jour && jour <= p.au);

  const affectations: Affectation[] = [];
  const manques: Manque[] = [];
  for (const t of aPlacer) {
    const iv = intervalle(t); const lundi = lundiDe(t.jour);
    // 1. Chauffeur
    const candidats = chauffeurs.filter((c) => {
      if (indispo(c, t.jour)) return false;
      if (R.memeDepot && t.depot_id && c.depot_id && c.depot_id !== t.depot_id) return false;
      const deja = occChauffeur.get(c.id)?.get(t.jour) ?? [];
      if (deja.length >= R.creneauxMaxJour) return false;
      if (deja.some((d) => chevauche(d, iv, R.pauseMinutes))) return false;
      const travailleDeja = jours.get(c.id)?.has(t.jour);
      if (!travailleDeja) {
        if (joursSemaine(c.id, lundi) >= 7 - R.joursReposMin) return false;
        if (suiteSi(c.id, t.jour) > R.joursConsecutifsMax) return false;
      }
      return true;
    });
    // Camion déjà sorti ce jour-là par un voisin et libre sur ce créneau : on peut le lui passer
    const voisinLibre = (c: ChauffeurP) => {
      const ville = normVille(c.ville); if (!R.partageCamion || !R.partageMemeVille || !ville) return false;
      return vehicules.some((v) => {
        if (t.depot_id && v.depot_id && v.depot_id !== t.depot_id) return false;
        const usages = occCamion.get(v.id)?.get(t.jour) ?? [];
        return usages.length > 0 && !usages.some((u) => chevauche(u.iv, iv, R.pauseMinutes))
          && usages.some((u) => u.chauffeur && u.chauffeur !== c.id && normVille(parId.get(u.chauffeur)?.ville) === ville);
      });
    };
    const score = (c: ChauffeurP) => {
      const sem = nbSemaine.get(c.id + '|' + lundi) ?? 0;
      const mois = entree.tourneesMois?.[c.id] ?? 0;
      const aujourdhui = jours.get(c.id)?.has(t.jour) ? 1 : 0;
      // L'équité (même nombre de tournées dans la semaine, donc même paie) passe avant tout. Le 2e créneau d'un
      // chauffeur qui tourne déjà ce jour-là ne compte pas contre lui (il garde ses jours de repos entiers), et à
      // égalité on préfère un chauffeur qui peut reprendre le camion d'un voisin.
      return sem * 2 - (R.regrouperCreneaux ? aujourdhui * 2.5 : 0) - (voisinLibre(c) ? 1.9 : 0) + mois * 0.02 + joursSemaine(c.id, lundi) * 0.1;
    };
    candidats.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
    const chauffeur = candidats[0] ?? null;
    if (!chauffeur) { affectations.push({ id: t.id, chauffeur_id: null, vehicule_id: null }); manques.push({ id: t.id, raison: 'Aucun chauffeur disponible' }); continue; }

    // 2. Camion : celui qu'il a déjà ce jour-là, sinon un camion libre du dépôt
    const libre = (v: VehiculeP) => {
      const usages = occCamion.get(v.id)?.get(t.jour) ?? [];
      if (usages.some((u) => chevauche(u.iv, iv, R.pauseMinutes))) return false;
      if (!R.partageCamion && usages.some((u) => u.chauffeur && u.chauffeur !== chauffeur.id)) return false;
      return true;
    };
    let camion: string | null = null;
    const habituel = camionDuJour.get(chauffeur.id + '|' + t.jour);
    if (habituel && vehicules.some((v) => v.id === habituel && libre(v))) camion = habituel;
    if (!camion) {
      const possibles = vehicules.filter((v) => (!t.depot_id || !v.depot_id || v.depot_id === t.depot_id) && libre(v));
      const ville = normVille(chauffeur.ville);
      const rang = (v: VehiculeP) => {
        const autres = (occCamion.get(v.id)?.get(t.jour) ?? []).map((u) => u.chauffeur).filter((x): x is string => !!x && x !== chauffeur.id);
        if (!autres.length) return 1;                                   // camion pas encore sorti ce jour-là
        const voisin = ville && autres.some((a) => normVille(parId.get(a)?.ville) === ville);
        if (R.partageMemeVille && voisin) return 0;                      // partage entre voisins : en premier
        return 2;                                                        // partage avec quelqu'un d'une autre ville : en dernier
      };
      possibles.sort((a, b) => rang(a) - rang(b) || a.id.localeCompare(b.id));
      camion = possibles[0]?.id ?? null;
    }
    noter(t, chauffeur.id, camion);
    affectations.push({ id: t.id, chauffeur_id: chauffeur.id, vehicule_id: camion });
    if (!camion) manques.push({ id: t.id, raison: 'Pas de camion libre' });
  }
  return { affectations, manques };
}

// Contrôle d'un planning (ajusté à la main) : ce qui ne respecte pas les règles, pour l'afficher en orange
export function controler(entree: { tournees: TourneeP[]; chauffeurs: ChauffeurP[]; regles?: Partial<Regles> }): Record<string, string[]> {
  const R: Regles = { ...REGLES_DEFAUT, ...(entree.regles ?? {}) };
  const alertes: Record<string, string[]> = {};
  const dire = (id: string, m: string) => { (alertes[id] ??= []).includes(m) || alertes[id].push(m); };
  const parChauffeur = new Map<string, TourneeP[]>();
  entree.tournees.forEach((t) => { if (t.chauffeur_id) { if (!parChauffeur.has(t.chauffeur_id)) parChauffeur.set(t.chauffeur_id, []); parChauffeur.get(t.chauffeur_id)!.push(t); } });
  const parId = new Map(entree.chauffeurs.map((c) => [c.id, c]));
  for (const [c, ts] of parChauffeur) {
    const ch = parId.get(c);
    const parJour = new Map<string, TourneeP[]>();
    ts.forEach((t) => { if (!parJour.has(t.jour)) parJour.set(t.jour, []); parJour.get(t.jour)!.push(t); });
    for (const [j, liste] of parJour) {
      if (liste.length > R.creneauxMaxJour) liste.forEach((t) => dire(t.id, `Plus de ${R.creneauxMaxJour} tournées ce jour-là`));
      for (let i = 0; i < liste.length; i++) for (let k = i + 1; k < liste.length; k++)
        if (chevauche(intervalle(liste[i]), intervalle(liste[k]), R.pauseMinutes)) { dire(liste[i].id, 'Deux tournées en même temps'); dire(liste[k].id, 'Deux tournées en même temps'); }
      if (ch && (ch.indispos ?? []).some((p) => p.du <= j && j <= p.au)) liste.forEach((t) => dire(t.id, 'Chauffeur absent ce jour-là'));
      if (R.memeDepot && ch?.depot_id) liste.forEach((t) => { if (t.depot_id && t.depot_id !== ch.depot_id) dire(t.id, 'Hors de son dépôt'); });
    }
    const semaines = new Map<string, Set<string>>();
    ts.forEach((t) => { const l = lundiDe(t.jour); if (!semaines.has(l)) semaines.set(l, new Set()); semaines.get(l)!.add(t.jour); });
    for (const [, js] of semaines) if (js.size > 7 - R.joursReposMin) ts.filter((t) => js.has(t.jour)).forEach((t) => dire(t.id, `Moins de ${R.joursReposMin} jours de repos dans la semaine`));
  }
  return alertes;
}
