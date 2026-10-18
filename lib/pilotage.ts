// Calcul de la rentabilité de la flotte, par jour, semaine ou mois (heure de Paris)
import { depuisParis, versJour, JOUR } from './format';

export type Granularite = 'jour' | 'semaine' | 'mois';

export type Poste = {
  locations: number; kmSup: number; cautions: number; transferts: number; // recettes
  vehicules: number; entretien: number; degats: number; depenses: number; amendes: number; // coûts
  departs: number; retours: number; joursLoues: number;
};
export type Periode = Poste & { debut: Date; fin: Date; libelle: string; recettes: number; couts: number; resultat: number };

const vide = (): Poste => ({ locations: 0, kmSup: 0, cautions: 0, transferts: 0, vehicules: 0, entretien: 0, degats: 0, depenses: 0, amendes: 0, departs: 0, retours: 0, joursLoues: 0 });
const minuit = (jour: string) => new Date(depuisParis(jour + 'T00:00')!);
const plusJours = (d: Date, n: number) => minuit(versJour(new Date(d.getTime() + n * JOUR + 12 * 3600 * 1000)));

// Découpe : 30 jours, 12 semaines (lundi) ou 12 mois, la dernière période étant celle en cours
export function periodes(g: Granularite): { debut: Date; fin: Date; libelle: string }[] {
  const aujourdhui = versJour(new Date());
  const liste: { debut: Date; fin: Date; libelle: string }[] = [];
  if (g === 'jour') {
    for (let i = 29; i >= 0; i--) {
      const debut = plusJours(minuit(aujourdhui), -i);
      liste.push({ debut, fin: plusJours(debut, 1), libelle: debut.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }) });
    }
  } else if (g === 'semaine') {
    const auj = minuit(aujourdhui);
    const jourSemaine = (new Date(auj.getTime() + 12 * 3600 * 1000).getUTCDay() + 6) % 7; // 0 = lundi
    const lundi = plusJours(auj, -jourSemaine);
    for (let i = 11; i >= 0; i--) {
      const debut = plusJours(lundi, -7 * i);
      liste.push({ debut, fin: plusJours(debut, 7), libelle: 'sem. ' + debut.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }) });
    }
  } else {
    const [a, m] = aujourdhui.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(a, m - 1 - i, 1));
      const s = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const n = new Date(Date.UTC(a, m - i, 1));
      const s2 = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-01`;
      liste.push({ debut: minuit(s), fin: minuit(s2), libelle: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
    }
  }
  return liste;
}

const chevauchement = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

export async function calculerPilotage(supabase: any, g: Granularite) {
  const liste = periodes(g);
  const debut = liste[0].debut; const fin = liste[liste.length - 1].fin;
  const dIso = debut.toISOString(); const fIso = fin.toISOString();
  const dJour = versJour(debut); const fJour = versJour(fin);

  const [{ data: vehicules }, { data: locations }, { data: entretiens }, { data: dommages }, { data: depenses }, { data: amendes }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, cout_mensuel, prix_achat, financement, date_entree, date_sortie, created_at, statut').order('immatriculation'),
    supabase.from('locations').select('id, vehicule_id, debut, fin_prevue, fin_reelle, statut, prix_total, km_depart, km_retour, km_inclus, prix_km_sup, caution_retenue, caution_statut')
      .in('statut', ['en_cours', 'terminee']).lt('debut', fIso).gte('fin_prevue', new Date(debut.getTime() - 60 * JOUR).toISOString()),
    supabase.from('entretiens').select('vehicule_id, type, cout, montant_recu, debut, fin, created_at'),
    supabase.from('dommages').select('vehicule_id, cout, created_at, statut').neq('statut', 'annule').not('cout', 'is', null).gte('created_at', dIso).lt('created_at', fIso),
    supabase.from('depenses').select('vehicule_id, categorie, montant, date').gte('date', dJour).lt('date', fJour),
    supabase.from('amendes').select('vehicule_id, montant, date_infraction').eq('statut', 'payee').gte('date_infraction', dIso).lt('date_infraction', fIso),
  ]);

  const res = liste.map(() => vide());
  const parVehicule: Record<string, Poste[]> = {};
  (vehicules ?? []).forEach((v: any) => { parVehicule[v.id] = liste.map(() => vide()); });
  const ajouter = (vid: string | null, quand: number, cle: keyof Poste, montant: number) => {
    const i = liste.findIndex((p) => quand >= p.debut.getTime() && quand < p.fin.getTime());
    if (i < 0 || !montant) return;
    res[i][cle] += montant;
    if (vid && parVehicule[vid]) parVehicule[vid][i][cle] += montant;
  };
  const repartir = (vid: string, a: number, b: number, cle: keyof Poste, total: number, parJour = false) => {
    const duree = b - a;
    if (duree <= 0) return;
    liste.forEach((p, i) => {
      const part = chevauchement(a, b, p.debut.getTime(), p.fin.getTime());
      if (!part) return;
      const montant = parJour ? (total * part) / JOUR : (total * part) / duree;
      res[i][cle] += montant;
      if (parVehicule[vid]) parVehicule[vid][i][cle] += montant;
    });
  };

  // Recettes de location réparties sur la durée ; km en trop et retenues au retour
  (locations ?? []).forEach((l: any) => {
    const a = new Date(l.debut).getTime();
    const b = new Date(l.fin_reelle ?? (l.statut === 'en_cours' ? new Date(Math.max(Date.now(), new Date(l.fin_prevue).getTime())) : l.fin_prevue)).getTime();
    repartir(l.vehicule_id, a, b, 'locations', Number(l.prix_total ?? 0));
    repartir(l.vehicule_id, a, Math.min(b, Date.now()), 'joursLoues', 1, true);
    ajouter(l.vehicule_id, a, 'departs', 1);
    if (l.fin_reelle) {
      const r = new Date(l.fin_reelle).getTime();
      ajouter(l.vehicule_id, r, 'retours', 1);
      if (l.km_inclus != null && l.km_retour != null && l.km_depart != null) {
        const trop = Math.max(0, l.km_retour - l.km_depart - l.km_inclus);
        ajouter(l.vehicule_id, r, 'kmSup', trop * Number(l.prix_km_sup ?? 0));
      }
      if (l.caution_statut === 'encaissee') ajouter(l.vehicule_id, r, 'cautions', Number(l.caution_retenue ?? 0));
    }
  });

  // Coût mensuel du véhicule (leasing, crédit, amortissement), au jour près, depuis son entrée dans la flotte
  (vehicules ?? []).forEach((v: any) => {
    // Acheté comptant sans coût mensuel saisi : prix d'achat amorti sur 3 ans
    const mensuel = v.cout_mensuel ? Number(v.cout_mensuel) : v.prix_achat ? Number(v.prix_achat) / 36 : 0;
    if (!mensuel) return;
    const entree = minuit(v.date_entree ?? versJour(v.created_at)).getTime();
    const parJour = (mensuel * 12) / 365;
    const sortie = v.date_sortie ? minuit(v.date_sortie).getTime() : Infinity;
    repartir(v.id, Math.max(entree, debut.getTime()), Math.min(fin.getTime(), Date.now() + JOUR, sortie), 'vehicules', parJour, true);
  });

  (entretiens ?? []).forEach((e: any) => {
    const quand = new Date(e.fin ?? e.debut ?? e.created_at).getTime();
    if (e.cout) ajouter(e.vehicule_id, quand, 'entretien', Number(e.cout));
    if (e.montant_recu) ajouter(e.vehicule_id, quand, 'transferts', Number(e.montant_recu));
  });
  (dommages ?? []).forEach((d: any) => ajouter(d.vehicule_id, new Date(d.created_at).getTime(), 'degats', Number(d.cout)));
  (depenses ?? []).forEach((d: any) => ajouter(d.vehicule_id, minuit(d.date).getTime() + 12 * 3600 * 1000, 'depenses', Number(d.montant)));
  (amendes ?? []).forEach((a: any) => ajouter(a.vehicule_id, new Date(a.date_infraction).getTime(), 'amendes', Number(a.montant ?? 0)));

  const finir = (p: Poste, i: number): Periode => {
    const recettes = p.locations + p.kmSup + p.cautions + p.transferts;
    const couts = p.vehicules + p.entretien + p.degats + p.depenses + p.amendes;
    return { ...p, ...liste[i], recettes, couts, resultat: recettes - couts };
  };
  return {
    periodes: res.map(finir),
    vehicules: (vehicules ?? []).filter((v: any) => !v.date_sortie || minuit(v.date_sortie).getTime() > debut.getTime()).map((v: any) => ({ ...v, periodes: parVehicule[v.id].map(finir) })),
    nbVehicules: (vehicules ?? []).filter((v: any) => !['hors_service', 'sorti'].includes(v.statut)).length,
  };
}
