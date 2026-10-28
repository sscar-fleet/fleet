import { couleurNette } from './visuel';
// Import de la flotte : ce qui sert à la fois au navigateur (aperçu) et au serveur (écriture).
// Tout ce que l'IA ou un tableur renvoie passe par nettoyerLot : plaques, dates et statuts sont remis au propre,
// rien n'est inventé, et ce qui manque est signalé « à compléter » sans jamais bloquer le reste.
import { devinerMarqueModele } from './logoMarque';

export type StatutImport = 'disponible' | 'loue' | 'garage';
export type VehiculeImport = {
  cle: string; immatriculation: string | null; marque: string | null; modele: string | null;
  carburant: string | null; km: number | null; prix_jour: number | null; statut: StatutImport | null;
  annee: number | null; visuel: 'auto' | 'photo' | 'icone'; couleur: string | null;
  garage: string | null; retour_garage: string | null; assurance_echeance: string | null; ct_echeance: string | null;
  note: string | null; carte_grise: string | null; sources: string[];
};
export type ClientImport = {
  cle: string; nom: string; prenom: string | null; telephone: string | null; email: string | null;
  date_naissance: string | null; numero_permis: string | null; adresse: string | null; sources: string[];
};
export type LocationImport = {
  cle: string; immatriculation: string | null; client_nom: string | null; client_prenom: string | null; client_telephone: string | null;
  debut: string | null; fin: string | null; prix_total: number | null; caution: number | null; sources: string[];
};
export type ChauffeurImport = { cle: string; nom: string; prenom: string | null; telephone: string | null; sources: string[] };
export type Lot = { vehicules: VehiculeImport[]; clients: ClientImport[]; locations: LocationImport[]; chauffeurs: ChauffeurImport[]; remarques: string[] };

export const lotVide = (): Lot => ({ vehicules: [], clients: [], locations: [], chauffeurs: [], remarques: [] });
export const LIMITES = { vehicules: 500, clients: 2000, locations: 500, chauffeurs: 300 };

// ---------------------------------------------------------------------------
// Valeurs remises au propre
// ---------------------------------------------------------------------------
const chaine = (v: unknown, max = 120): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || /^(null|undefined|n\/?a|-+|\?+|néant|aucun)$/i.test(s)) return null;
  return s.slice(0, max);
};
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Plaque française (AB-123-CD, ancien 123 ABC 75) ou étrangère : lettres et chiffres seulement, 4 à 10 caractères
export function plaqueNette(v: unknown): string | null {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 4 || s.length > 10 || !/\d/.test(s) || !/[A-Z]/.test(s)) return null;
  return s;
}
export const ressemblePlaque = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}$/i.test(s) || /^\d{1,4}[\s-]?[A-Z]{1,3}[\s-]?\d{2,3}$/i.test(s);
};

export function nombreNet(v: unknown, max = 9_999_999): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= max ? v : null;
  const s = String(v).replace(/\s| |€|km|eur/gi, '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  // 42.000 ou 12.500,50 (milliers à la française), 12,500.50 (à l'anglaise), 45,5 (virgule décimale)
  let t = s;
  const m = /^(\d{1,3}(?:[.,]\d{3})+)([.,]\d{1,2})?$/.exec(t);
  if (m) t = m[1].replace(/[.,]/g, '') + (m[2] ? '.' + m[2].slice(1) : '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

const pad = (n: number | string) => String(n).padStart(2, '0');
const dateValide = (a: number, m: number, j: number) => a >= 1950 && a <= 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31;
// Date au format AAAA-MM-JJ, avec l'heure HH:MM si elle est donnée : accepte 25/10/2026, 25-10-26, 2026-10-25, numéro de jour Excel
export function dateHeureNette(v: unknown): { date: string; heure: string | null } | null {
  if (v === null || v === undefined || v === '') return null;
  const t = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Number(t); const d = new Date(Date.UTC(1899, 11, 30) + n * 864e5);
    const frac = n % 1; const heure = frac > 0.0001 ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : null;
    return dateValide(d.getUTCFullYear(), 1, 1) ? { date: d.toISOString().slice(0, 10), heure } : null;
  }
  const heureLue = (txt: string) => {
    const m = /(?:^|[\sT])(\d{1,2})\s*[h:]\s*(\d{2})?\b/i.exec(txt);
    if (!m) return null; const hh = Number(m[1]), mm = Number(m[2] ?? 0);
    return hh < 24 && mm < 60 ? `${pad(hh)}:${pad(mm)}` : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m && dateValide(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, heure: heureLue(t.slice(m[0].length)) };
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(t);
  if (m) {
    // Année sur deux chiffres : 85 = 1985 (date de naissance), 26 = 2026
    const deux = Number(m[3]) % 100, siecle = deux > (new Date().getFullYear() % 100) + 5 ? 1900 : 2000;
    const a = m[3].length === 2 ? siecle + deux : Number(m[3]);
    if (dateValide(a, +m[2], +m[1])) return { date: `${a}-${pad(m[2])}-${pad(m[1])}`, heure: heureLue(t.slice(m[0].length)) };
  }
  return null;
}
export const dateNette = (v: unknown) => dateHeureNette(v)?.date ?? null;
// Pour une location : AAAA-MM-JJTHH:MM, heure de Paris (départ 9 h et retour 18 h si l'heure manque)
export function momentNet(v: unknown, heureParDefaut: string): string | null {
  const d = dateHeureNette(v);
  return d ? `${d.date}T${d.heure ?? heureParDefaut}` : null;
}

export function carburantNet(v: unknown): string | null {
  const t = sansAccent(String(v ?? ''));
  if (!t) return null;
  if (/^(essence|diesel|hybride|electrique|gpl)$/.test(t)) return t;
  if (/elec|\bev\b|e-tech electric/.test(t)) return 'electrique';
  if (/hybr|hev|phev/.test(t)) return 'hybride';
  if (/gpl|lpg/.test(t)) return 'gpl';
  if (/dies|gazo|gasoil|tdi|hdi|dci|bluehdi|crdi|\bd\b/.test(t)) return 'diesel';
  if (/ess|sp9|sans plomb|tsi|tce|puretech|benzin/.test(t)) return 'essence';
  return null;
}

export function statutNet(v: unknown): StatutImport | 'vendu' | null {
  const t = sansAccent(String(v ?? ''));
  if (!t) return null;
  if (/^(disponible|loue|garage)$/.test(t)) return t as StatutImport;
  if (/vend|cede|restitu|sorti|epave/.test(t)) return 'vendu';
  if (/garage|atelier|repar|carross|entretien|panne|immobil|maintenance|\bhs\b|hors service|sinistr|controle/.test(t)) return 'garage';
  if (/lou|location|en cours|parti|sorti chez|client|occup|reserv/.test(t)) return 'loue';
  if (/dispo|libre|parc|agence|pret|ok|\bau parking\b/.test(t)) return 'disponible';
  return null;
}

export function telNet(v: unknown): string | null {
  const s = String(v ?? '').replace(/[^\d+]/g, '');
  if (!s) return null;
  let d = s.replace(/^00/, '+');
  if (/^\+33\d{9}$/.test(d)) d = '0' + d.slice(3);
  if (/^33\d{9}$/.test(d)) d = '0' + d.slice(2);
  if (/^[1-9]\d{8}$/.test(d)) d = '0' + d; // 0 de tête perdu par Excel
  if (/^0\d{9}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return d.length >= 8 && d.length <= 16 ? d : null;
}
const emailNet = (v: unknown) => { const s = chaine(v, 120)?.toLowerCase() ?? null; return s && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(s) ? s : null; };
const nomPropre = (v: unknown) => {
  const s = chaine(v, 80);
  if (!s) return null;
  return s === s.toUpperCase() || s === s.toLowerCase()
    ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    : s;
};

// ---------------------------------------------------------------------------
// Clés de rapprochement (doublons entre fichiers, photos et texte)
// ---------------------------------------------------------------------------
export const cleNom = (v?: string | null) => sansAccent(String(v ?? '')).replace(/[^a-z]/g, '');
export const chiffresTel = (v?: string | null) => String(v ?? '').replace(/\D/g, '').replace(/^33/, '0');
export function cleClient(c: { nom?: string | null; prenom?: string | null; telephone?: string | null; email?: string | null }) {
  const t = chiffresTel(c.telephone); if (t.length >= 9) return `t:${t}`;
  if (c.email) return `e:${c.email.toLowerCase()}`;
  return `n:${cleNom(c.nom)}|${cleNom(c.prenom)}`;
}
let compteur = 0;
const cleTemp = (p: string) => `${p}${Date.now().toString(36)}${(compteur++).toString(36)}`;

// ---------------------------------------------------------------------------
// Ce que renvoie l'IA (ou l'application des colonnes d'un tableur) → lot propre
// ---------------------------------------------------------------------------
export function nettoyerLot(brut: any, source: string, document?: string | null): Lot {
  const lot = lotVide();
  const liste = (x: any) => (Array.isArray(x) ? x : []);
  const vendus: string[] = [];
  for (const v of liste(brut?.vehicules).slice(0, LIMITES.vehicules)) {
    const immatriculation = plaqueNette(v?.immatriculation);
    let marque = chaine(v?.marque, 40), modele = chaine(v?.modele, 60);
    if (marque && !modele && marque.includes(' ')) { const mm = devinerMarqueModele(marque); if (mm.marque) { marque = mm.marque; modele = mm.modele || null; } }
    if (!marque && modele) { const mm = devinerMarqueModele(modele); if (mm.marque) { marque = mm.marque; modele = mm.modele || modele; } }
    // Carte grise en capitales (« MASTER ») : remis en forme, sans toucher aux versions (RS3, GTI, AMG)
    if (modele && modele === modele.toUpperCase()) modele = modele.split(' ').map((m) => (/^[A-Z]{4,}$/.test(m) ? m[0] + m.slice(1).toLowerCase() : m)).join(' ');
    const s = statutNet(v?.statut);
    if (s === 'vendu') { if (immatriculation) vendus.push(immatriculation); continue; }
    const fiche: VehiculeImport = {
      cle: immatriculation ?? cleTemp('v'), immatriculation, marque: marque ? nomPropre(marque) : null, modele,
      annee: (() => { const a = nombreNet(v?.annee, 2100) ?? (dateNette(v?.annee) ? Number(dateNette(v?.annee)!.slice(0, 4)) : null); return a && a >= 1950 ? Math.round(a) : null; })(),
      visuel: v?.visuel === 'photo' || v?.visuel === 'icone' ? v.visuel : 'auto',
      couleur: couleurNette(v?.couleur),
      carburant: carburantNet(v?.carburant), km: (() => { const n = nombreNet(v?.km, 2_000_000); return n == null ? null : Math.round(n); })(),
      prix_jour: nombreNet(v?.prix_jour, 5000), statut: s,
      garage: chaine(v?.garage, 80), retour_garage: dateNette(v?.retour_garage),
      assurance_echeance: dateNette(v?.assurance_echeance), ct_echeance: dateNette(v?.ct_echeance),
      note: chaine(v?.note, 300), carte_grise: null, sources: [source],
    };
    if (!fiche.immatriculation && !fiche.marque && !fiche.modele) continue;
    if (fiche.garage && !fiche.statut) fiche.statut = 'garage';
    lot.vehicules.push(fiche);
  }
  for (const c of liste(brut?.clients).slice(0, LIMITES.clients)) {
    const nom = nomPropre(c?.nom);
    if (!nom) continue;
    const fiche: ClientImport = {
      cle: '', nom, prenom: nomPropre(c?.prenom), telephone: telNet(c?.telephone), email: emailNet(c?.email),
      date_naissance: dateNette(c?.date_naissance), numero_permis: chaine(c?.numero_permis, 30), adresse: chaine(c?.adresse, 200), sources: [source],
    };
    fiche.cle = cleClient(fiche);
    lot.clients.push(fiche);
  }
  for (const l of liste(brut?.locations).slice(0, LIMITES.locations)) {
    const fiche: LocationImport = {
      cle: '', immatriculation: plaqueNette(l?.immatriculation),
      client_nom: nomPropre(l?.client_nom), client_prenom: nomPropre(l?.client_prenom), client_telephone: telNet(l?.client_telephone),
      debut: momentNet(l?.debut, '09:00'), fin: momentNet(l?.fin, '18:00'),
      prix_total: nombreNet(l?.prix_total, 100_000), caution: nombreNet(l?.caution, 100_000), sources: [source],
    };
    if (!fiche.immatriculation && !fiche.client_nom) continue;
    fiche.cle = `${fiche.immatriculation ?? cleTemp('l')}|${fiche.debut?.slice(0, 10) ?? ''}`;
    lot.locations.push(fiche);
  }
  for (const c of liste(brut?.chauffeurs).slice(0, LIMITES.chauffeurs)) {
    const nom = nomPropre(c?.nom);
    if (!nom) continue;
    const telephone = telNet(c?.telephone); const prenom = nomPropre(c?.prenom);
    lot.chauffeurs.push({ cle: cleClient({ nom, prenom, telephone }), nom, prenom, telephone, sources: [source] });
  }
  // Photo d'une carte grise : elle est rangée dans la fiche du véhicule
  if (document && brut?.type_document === 'carte_grise' && lot.vehicules.length === 1) lot.vehicules[0].carte_grise = document;
  for (const r of liste(brut?.remarques).slice(0, 12)) { const s = chaine(r, 240); if (s) lot.remarques.push(s); }
  if (vendus.length) lot.remarques.push(`${vendus.length} véhicule${vendus.length > 1 ? 's' : ''} marqué${vendus.length > 1 ? 's' : ''} vendu${vendus.length > 1 ? 's' : ''} ou rendu${vendus.length > 1 ? 's' : ''}, non importé${vendus.length > 1 ? 's' : ''} : ${vendus.join(', ')}.`);
  return lot;
}

// ---------------------------------------------------------------------------
// Fusion de plusieurs sources : le même véhicule (plaque) ou le même client (téléphone, e-mail, nom) n'apparaît qu'une fois
// ---------------------------------------------------------------------------
function completer<T extends Record<string, any>>(a: T, b: T): T {
  const r: any = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k === 'cle') continue;
    if (k === 'sources') r.sources = Array.from(new Set([...(a.sources ?? []), ...(v as string[])]));
    else if (r[k] === null || r[k] === undefined || r[k] === '') r[k] = v;
  }
  return r;
}
const memeNom = (a: { nom: string; prenom: string | null }, b: { nom: string; prenom: string | null }) =>
  cleNom(a.nom) === cleNom(b.nom) && (!a.prenom || !b.prenom || cleNom(a.prenom) === cleNom(b.prenom))
  || (!!a.prenom && !!b.prenom && cleNom(a.nom + a.prenom) === cleNom(b.prenom + b.nom)); // « Dupont Jean » = « Jean Dupont »

export function fusionner(base: Lot, ajout: Lot): Lot {
  const r: Lot = { vehicules: [...base.vehicules], clients: [...base.clients], locations: [...base.locations], chauffeurs: [...base.chauffeurs], remarques: [...base.remarques] };
  const memeSansPlaque = (a: VehiculeImport, b: VehiculeImport) => !a.immatriculation && !b.immatriculation
    && cleNom(a.marque) === cleNom(b.marque) && cleNom(a.modele) === cleNom(b.modele) && (a.km ?? null) === (b.km ?? null);
  for (const v of ajout.vehicules) {
    // Même plaque = même véhicule ; sans plaque, le même véhicule cité dans deux sources n'apparaît qu'une fois
    const i = v.immatriculation ? r.vehicules.findIndex((x) => x.immatriculation === v.immatriculation) : r.vehicules.findIndex((x) => memeSansPlaque(x, v));
    if (i >= 0) r.vehicules[i] = completer(r.vehicules[i], v); else r.vehicules.push(v);
  }
  const trouverClient = (c: { nom: string; prenom: string | null; telephone: string | null; email: string | null }) => r.clients.findIndex((x) => {
    const ta = chiffresTel(x.telephone), tb = chiffresTel(c.telephone);
    if (ta.length >= 9 && tb.length >= 9) return ta === tb;
    if (x.email && c.email) return x.email === c.email;
    return memeNom(x, c);
  });
  for (const c of ajout.clients) {
    const i = trouverClient(c);
    if (i >= 0) r.clients[i] = completer(r.clients[i], c); else r.clients.push(c);
  }
  for (const l of ajout.locations) {
    // Même location citée deux fois : même véhicule et même retour, ou mêmes dates (une location en cours et la réservation
    // suivante du même véhicule restent bien deux locations)
    const memeLocation = (x: LocationImport) => !!l.immatriculation && x.immatriculation === l.immatriculation && (
      (!!x.fin && !!l.fin && x.fin.slice(0, 10) === l.fin.slice(0, 10))
      || (!!x.debut && !!l.debut && x.debut.slice(0, 10) === l.debut.slice(0, 10) && (!x.fin || !l.fin)));
    const i = r.locations.findIndex((x) => x.cle === l.cle || memeLocation(x));
    if (i >= 0) r.locations[i] = completer(r.locations[i], l); else r.locations.push(l);
    // Le client et le véhicule d'une location apparaissent aussi dans leur liste
    if (l.client_nom) {
      const c = { nom: l.client_nom, prenom: l.client_prenom, telephone: l.client_telephone, email: null };
      if (trouverClient(c) < 0) r.clients.push({ cle: cleClient(c), ...c, date_naissance: null, numero_permis: null, adresse: null, sources: l.sources });
    }
    if (l.immatriculation && !r.vehicules.some((x) => x.immatriculation === l.immatriculation)) {
      r.vehicules.push({ cle: l.immatriculation, immatriculation: l.immatriculation, marque: null, modele: null, carburant: null, km: null, prix_jour: null, annee: null, visuel: 'auto', couleur: null,
        statut: null, garage: null, retour_garage: null, assurance_echeance: null, ct_echeance: null, note: null, carte_grise: null, sources: l.sources });
    }
  }
  for (const c of ajout.chauffeurs) {
    const i = r.chauffeurs.findIndex((x) => x.cle === c.cle || memeNom(x, c));
    if (i >= 0) r.chauffeurs[i] = completer(r.chauffeurs[i], c); else r.chauffeurs.push(c);
  }
  for (const m of ajout.remarques) if (!r.remarques.includes(m)) r.remarques.push(m);
  return r;
}

// ---------------------------------------------------------------------------
// Statut réel d'une location au moment de l'import (heure de Paris)
// ---------------------------------------------------------------------------
export function maintenantParis(): string {
  const o = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
export function etatLocation(l: LocationImport, maintenant = maintenantParis()): 'en_cours' | 'reservee' | 'terminee' | 'incomplete' {
  if (!l.immatriculation || !l.client_nom || !l.fin) return 'incomplete';
  if (l.fin <= maintenant) return 'terminee';
  if (l.debut && l.debut > maintenant) return 'reservee';
  return 'en_cours';
}

// Ce qui manque sur une ligne (affiché « à compléter » ; seules les lignes sans plaque ne peuvent pas entrer)
export function manquesVehicule(v: VehiculeImport): string[] {
  const m: string[] = [];
  if (!v.immatriculation) m.push('immatriculation');
  if (!v.marque && !v.modele) m.push('modèle');
  return m;
}
export function manquesLocation(l: LocationImport): string[] {
  const m: string[] = [];
  if (!l.immatriculation) m.push('véhicule');
  if (!l.client_nom) m.push('client');
  if (!l.fin) m.push('date de retour');
  return m;
}

// Le statut affiché dans l'aperçu : une location en cours rend la voiture « louée »
export function statutAffiche(v: VehiculeImport, locations: LocationImport[], maintenant = maintenantParis()): StatutImport {
  if (v.statut === 'garage') return 'garage';
  if (v.immatriculation && locations.some((l) => l.immatriculation === v.immatriculation && etatLocation(l, maintenant) === 'en_cours')) return 'loue';
  return v.statut === 'loue' ? 'loue' : 'disponible';
}

// ---------------------------------------------------------------------------
// Tableur : l'IA reconnaît les colonnes sur quelques lignes, le navigateur applique à toutes
// ---------------------------------------------------------------------------
export const CHAMPS_COLONNE = [
  'immatriculation', 'marque', 'modele', 'marque_modele', 'annee', 'couleur', 'carburant', 'km', 'prix_jour', 'statut', 'garage', 'retour_garage',
  'assurance_echeance', 'ct_echeance', 'note',
  'client_nom', 'client_prenom', 'client_nom_complet', 'client_telephone', 'client_email', 'client_naissance', 'client_permis', 'client_adresse',
  'debut', 'fin', 'prix_total', 'caution',
  'chauffeur_nom', 'chauffeur_prenom', 'chauffeur_nom_complet', 'chauffeur_telephone',
] as const;
export type ChampColonne = typeof CHAMPS_COLONNE[number];
export type Colonnes = { contenu: 'vehicules' | 'clients' | 'chauffeurs' | 'locations'; entete: number; colonnes: Record<string, ChampColonne>; statuts: Record<string, string> };

const coupeNom = (s: string | null) => {
  if (!s) return { nom: null as string | null, prenom: null as string | null };
  const p = s.trim().split(/\s+/);
  if (p.length < 2) return { nom: s, prenom: null };
  // « DUPONT Jean » : le nom en capitales vient d'abord ; sinon « Jean Dupont »
  if (p[0] === p[0].toUpperCase() && p[0].length > 1 && p[1] !== p[1].toUpperCase()) return { nom: p[0], prenom: p.slice(1).join(' ') };
  return { nom: p.slice(1).join(' '), prenom: p[0] };
};

export function appliquerColonnes(lignes: string[][], c: Colonnes): any {
  const sortie: any = { vehicules: [], clients: [], locations: [], chauffeurs: [] };
  const colonnes = Object.entries(c.colonnes).filter(([, ch]) => (CHAMPS_COLONNE as readonly string[]).includes(ch));
  const statuts = Object.fromEntries(Object.entries(c.statuts ?? {}).map(([k, v]) => [sansAccent(k), v]));
  for (const ligne of lignes.slice(Math.max(0, c.entete + 1))) {
    if (!ligne.some((x) => String(x ?? '').trim())) continue;
    const val: Record<string, string> = {};
    for (const [i, ch] of colonnes) { const x = String(ligne[Number(i)] ?? '').trim(); if (x) val[ch] = val[ch] ? `${val[ch]} ${x}` : x; }
    if (val.marque_modele && !val.marque && !val.modele) { const mm = devinerMarqueModele(val.marque_modele); val.marque = mm.marque; val.modele = mm.modele; }
    if (val.client_nom_complet && !val.client_nom) Object.assign(val, Object.fromEntries(Object.entries(coupeNom(val.client_nom_complet)).map(([k, v]) => [`client_${k}`, v ?? ''])));
    if (val.chauffeur_nom_complet && !val.chauffeur_nom) Object.assign(val, Object.fromEntries(Object.entries(coupeNom(val.chauffeur_nom_complet)).map(([k, v]) => [`chauffeur_${k}`, v ?? ''])));
    const statut = val.statut ? (statuts[sansAccent(val.statut)] ?? val.statut) : null;
    if (c.contenu === 'chauffeurs') {
      if (val.chauffeur_nom || val.client_nom) sortie.chauffeurs.push({ nom: val.chauffeur_nom || val.client_nom, prenom: val.chauffeur_prenom || val.client_prenom, telephone: val.chauffeur_telephone || val.client_telephone });
      continue;
    }
    if (c.contenu === 'clients') {
      if (val.client_nom) sortie.clients.push({ nom: val.client_nom, prenom: val.client_prenom, telephone: val.client_telephone, email: val.client_email, date_naissance: val.client_naissance, numero_permis: val.client_permis, adresse: val.client_adresse });
      continue;
    }
    if (val.immatriculation || val.marque || val.modele) {
      sortie.vehicules.push({ immatriculation: val.immatriculation, marque: val.marque, modele: val.modele, annee: val.annee, couleur: val.couleur, carburant: val.carburant, km: val.km, prix_jour: val.prix_jour,
        statut, garage: val.garage, retour_garage: val.retour_garage, assurance_echeance: val.assurance_echeance, ct_echeance: val.ct_echeance, note: val.note });
    }
    if (val.client_nom) {
      sortie.clients.push({ nom: val.client_nom, prenom: val.client_prenom, telephone: val.client_telephone, email: val.client_email, date_naissance: val.client_naissance, numero_permis: val.client_permis, adresse: val.client_adresse });
      if (val.immatriculation && (val.fin || val.debut || statutNet(statut) === 'loue')) {
        sortie.locations.push({ immatriculation: val.immatriculation, client_nom: val.client_nom, client_prenom: val.client_prenom, client_telephone: val.client_telephone,
          debut: val.debut, fin: val.fin, prix_total: val.prix_total, caution: val.caution });
      }
    }
    if (val.chauffeur_nom) sortie.chauffeurs.push({ nom: val.chauffeur_nom, prenom: val.chauffeur_prenom, telephone: val.chauffeur_telephone });
  }
  return sortie;
}

// Tableau compact envoyé à l'IA pour reconnaître les colonnes (en-tête + quelques lignes représentatives)
export function echantillon(lignes: string[][], n = 12): string {
  const pleines = lignes.filter((l) => l.some((x) => String(x ?? '').trim()));
  const choisies = pleines.length <= n ? pleines : [...pleines.slice(0, n - 3), ...pleines.slice(Math.floor(pleines.length / 2), Math.floor(pleines.length / 2) + 1), ...pleines.slice(-2)];
  const largeur = Math.min(40, Math.max(...choisies.map((l) => l.length)));
  return choisies.map((l) => {
    const i = lignes.indexOf(l);
    return `L${i}\t` + Array.from({ length: largeur }, (_, k) => `C${k}=${String(l[k] ?? '').slice(0, 60).replace(/\t/g, ' ')}`).join('\t');
  }).join('\n');
}

// Un petit tableau (ou un tableau trop désordonné) est envoyé tel quel, en texte
export const tableEnTexte = (lignes: string[][]) => lignes.filter((l) => l.some((x) => String(x ?? '').trim())).map((l) => l.map((x) => String(x ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
