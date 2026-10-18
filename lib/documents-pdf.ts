// Les 5 documents de Fleet, fabriqués dans le navigateur
import { Doc, Agence } from './pdf';
import { date, dateHeure, euros, km, joursEntre, libellePosition, checklistEdl, typeDommage, graviteDommage, carburants } from './format';

export type AgenceDoc = Agence & {
  logo?: string | null; signature?: string | null; tampon?: string | null;
  conditions?: string | null; tva_taux?: number | null;
  kbis?: string | null; piece_gerant?: string | null;
};
export type VehiculeDoc = { immatriculation: string; marque?: string | null; modele?: string | null; carburant?: string | null;
  carte_grise?: string | null; assurance?: string | null };
export type ClientDoc = { nom: string; prenom?: string | null; telephone?: string | null; email?: string | null; adresse?: string | null;
  date_naissance?: string | null; date_permis?: string | null; numero_permis?: string | null };
export type LocationDoc = {
  numero?: number | null; debut: string; fin_prevue: string; fin_reelle?: string | null; prix_total?: number | null;
  km_depart?: number | null; km_retour?: number | null; km_inclus?: number | null; prix_km_sup?: number | null;
  carburant_depart?: number | null; carburant_retour?: number | null;
  caution_montant?: number | null; caution_statut?: string | null; caution_retenue?: number | null; caution_motif?: string | null;
  signature?: string | null;
};
export type DommageDoc = { type: string; gravite: string; zone?: string | null; cout?: number | null; statut: string;
  photo_zone?: string | null; photo_gros_plan?: string | null; created_at: string };
export type EdlDoc = { type: 'depart' | 'retour'; km?: number | null; carburant?: number | null; checklist?: Record<string, boolean>;
  signe_le?: string | null; latitude?: number | null; longitude?: number | null; signature?: string | null;
  created_at: string; photos: { position: string; url: string }[] };

const nomClient = (c: ClientDoc) => [c.prenom, c.nom].filter(Boolean).join(' ');
const nomVehicule = (v: VehiculeDoc) => [v.marque, v.modele].filter(Boolean).join(' ') + ' · ' + v.immatriculation;
const numero = (l: LocationDoc) => String(l.numero ?? '').padStart(5, '0');
const PIED = 'Document édité avec SS CAR FLEET';

export function kmSupplementaires(l: LocationDoc) {
  if (l.km_inclus == null || l.km_depart == null || l.km_retour == null) return { parcourus: null as number | null, enTrop: 0, montant: 0 };
  const parcourus = l.km_retour - l.km_depart;
  const enTrop = Math.max(0, parcourus - l.km_inclus);
  return { parcourus, enTrop, montant: enTrop * Number(l.prix_km_sup ?? 0) };
}

async function signatures(d: Doc, gauche: { titre: string; url?: string | null }, droite: { titre: string; url?: string | null; tampon?: string | null }) {
  d.place(110);
  const y = d.y;
  const larg = 220;
  d.texte(gauche.titre, { taille: 9, gras: true, couleur: undefined });
  if (gauche.url) await d.image(gauche.url, larg, 70);
  const basGauche = d.y;
  d.y = y;
  d.texte(droite.titre, { taille: 9, gras: true, x: 595.28 - 48 - larg });
  if (droite.url) await d.image(droite.url, larg / 2, 70, 595.28 - 48 - larg);
  if (droite.tampon) { d.y += 70; await d.image(droite.tampon, larg / 2, 70, 595.28 - 48 - larg / 2); }
  d.y = Math.min(d.y, basGauche) - 10;
}

// ---------------------------------------------------------------------------
export async function contratPdf(a: AgenceDoc, l: LocationDoc, v: VehiculeDoc, c: ClientDoc) {
  const d = await Doc.creer('Contrat de location ' + numero(l), a.logo);
  d.entete('Contrat de location', a, `N° ${numero(l)} · établi le ${date(new Date().toISOString())}`);
  d.section('Locataire');
  d.infos([
    ['Nom', nomClient(c)], ['Téléphone', c.telephone], ['E-mail', c.email], ['Adresse', c.adresse],
    ['Date de naissance', date(c.date_naissance)], ['Permis', [c.numero_permis, c.date_permis ? 'du ' + date(c.date_permis) : ''].filter(Boolean).join(' ') || '—'],
  ]);
  d.section('Véhicule');
  d.infos([['Véhicule', nomVehicule(v)], ['Carburant', v.carburant ? carburants[v.carburant] : '—']]);
  d.section('Location');
  const jours = joursEntre(l.debut, l.fin_prevue);
  d.infos([
    ['Départ', dateHeure(l.debut)], ['Retour prévu', dateHeure(l.fin_prevue)],
    ['Durée', `${jours} jour${jours > 1 ? 's' : ''}`], ['Prix de la location', euros(l.prix_total)],
    ['Kilométrage au départ', km(l.km_depart)], ['Carburant au départ', l.carburant_depart != null ? l.carburant_depart + ' %' : '—'],
    ['Kilomètres inclus', km(l.km_inclus)], ['Kilomètre supplémentaire', l.prix_km_sup != null ? euros(l.prix_km_sup) + ' / km' : '—'],
    ['Dépôt de garantie', euros(l.caution_montant)], ['', ''],
  ]);
  if (a.conditions) { d.section('Conditions générales'); d.texte(a.conditions, { taille: 8.5 }); }
  d.y -= 6;
  d.texte('Le locataire reconnaît avoir pris connaissance des conditions de location, avoir reçu le véhicule dans l’état décrit par l’état des lieux de départ et s’engage à le restituer dans le même état.', { taille: 9 });
  await signatures(d, { titre: 'Signature du locataire', url: l.signature }, { titre: 'Pour l’agence', url: a.signature, tampon: a.tampon });
  d.pied(PIED);
  return d.octets();
}

// ---------------------------------------------------------------------------
export async function facturePdf(a: AgenceDoc, l: LocationDoc, v: VehiculeDoc, c: ClientDoc) {
  const d = await Doc.creer('Facture ' + numero(l), a.logo);
  const annee = new Date(l.debut).getFullYear();
  d.entete('Facture', a, `N° F-${annee}-${numero(l)} · ${date(l.fin_reelle ?? new Date().toISOString())}`);
  d.section('Facturé à');
  d.texte(nomClient(c), { gras: true, apres: 0 });
  if (c.adresse) d.texte(c.adresse, { apres: 0 });
  if (c.email) d.texte(c.email, { apres: 0 });
  d.y -= 10;
  const fin = l.fin_reelle ?? l.fin_prevue;
  const jours = joursEntre(l.debut, fin);
  const lignes: string[][] = [[`Location ${nomVehicule(v)} du ${date(l.debut)} au ${date(fin)}`, `${jours} j`, euros(l.prix_total)]];
  const sup = kmSupplementaires(l);
  if (sup.enTrop > 0) lignes.push([`Kilomètres supplémentaires (${sup.enTrop} km × ${euros(l.prix_km_sup)})`, `${sup.enTrop} km`, euros(sup.montant)]);
  if (l.caution_retenue) lignes.push([`Retenue sur dépôt de garantie${l.caution_motif ? ' : ' + l.caution_motif : ''}`, '', euros(l.caution_retenue)]);
  d.tableau(['Désignation', 'Quantité', 'Montant TTC'], lignes, [0.66, 0.14, 0.2]);
  const ttc = Number(l.prix_total ?? 0) + sup.montant + Number(l.caution_retenue ?? 0);
  const taux = Number(a.tva_taux ?? 20);
  d.trait();
  const totaux: [string, string][] = taux > 0
    ? [['Total HT', euros(ttc / (1 + taux / 100))], [`TVA ${taux} %`, euros(ttc - ttc / (1 + taux / 100))], ['Total TTC', euros(ttc)]]
    : [['Total', euros(ttc)]];
  totaux.forEach(([lib, val], i) => {
    const dernier = i === totaux.length - 1;
    d.place(18);
    const t = `${lib}   ${val}`;
    d.page.drawText(t, { x: 595.28 - 48 - d.largeur(t, dernier ? 12 : 10, dernier), y: d.y - 12, size: dernier ? 12 : 10, font: dernier ? d.fb : d.f });
    d.y -= 18;
  });
  if (taux === 0) d.texte('TVA non applicable, article 293 B du CGI.', { taille: 8.5 });
  d.y -= 10;
  d.texte('Règlement reçu par l’agence. Merci de votre confiance.', { taille: 9 });
  d.pied(PIED);
  return d.octets();
}

// ---------------------------------------------------------------------------
export async function edlPdf(a: AgenceDoc, l: LocationDoc, v: VehiculeDoc, c: ClientDoc, e: EdlDoc, dommages: DommageDoc[]) {
  const titre = e.type === 'depart' ? 'État des lieux de départ' : 'État des lieux de retour';
  const d = await Doc.creer(titre, a.logo);
  d.entete(titre, a, `Contrat N° ${numero(l)} · ${nomVehicule(v)} · ${nomClient(c)}`);
  d.infos([
    ['Fait le', dateHeure(e.signe_le ?? e.created_at)],
    ['Lieu (GPS)', e.latitude != null ? `${e.latitude.toFixed(5)}, ${e.longitude?.toFixed(5)}` : 'Non disponible'],
    ['Kilométrage', km(e.km)], ['Carburant', e.carburant != null ? e.carburant + ' %' : '—'],
  ]);
  d.section('Vérifications');
  d.infos(checklistEdl.map((x) => [x.libelle, e.checklist?.[x.cle] ? 'Oui' : 'Non'] as [string, string]), 3);
  if (dommages.length) {
    d.section(`Dommages (${dommages.length})`);
    d.tableau(['Type', 'Zone', 'Gravité', 'Statut'],
      dommages.map((x) => [typeDommage[x.type], x.zone ? libellePosition[x.zone] ?? x.zone : '—', graviteDommage[x.gravite], x.statut === 'ouvert' ? 'Ouvert' : x.statut === 'repare' ? 'Réparé' : 'Annulé']),
      [0.25, 0.35, 0.2, 0.2]);
  } else d.texte('Aucun dommage relevé.', { taille: 9.5 });
  await signatures(d, { titre: 'Signature du client', url: e.signature }, { titre: 'Pour l’agence', url: a.signature, tampon: a.tampon });
  d.nouvellePage();
  d.texte('Photos', { taille: 14, gras: true });
  await d.photos(e.photos.map((p) => ({ url: p.url, legende: libellePosition[p.position] ?? p.position })));
  d.pied(`${titre} · contrat ${numero(l)} · ${PIED}`);
  return d.octets();
}

// ---------------------------------------------------------------------------
export async function dommagesPdf(a: AgenceDoc, v: VehiculeDoc, dommages: DommageDoc[], l?: LocationDoc | null, c?: ClientDoc | null) {
  const d = await Doc.creer('Relevé de dommages', a.logo);
  d.entete('Relevé de dommages', a, `${nomVehicule(v)}${l ? ' · contrat N° ' + numero(l) : ''}${c ? ' · ' + nomClient(c) : ''}`);
  if (!dommages.length) d.texte('Aucun dommage enregistré.');
  for (const [i, x] of dommages.entries()) {
    d.section(`Dommage ${i + 1} · ${typeDommage[x.type]} · ${graviteDommage[x.gravite]}`);
    d.infos([['Zone', x.zone ? libellePosition[x.zone] ?? x.zone : '—'], ['Relevé le', dateHeure(x.created_at)],
      ['Coût estimé', euros(x.cout)], ['Statut', x.statut === 'ouvert' ? 'Ouvert' : x.statut === 'repare' ? 'Réparé' : 'Annulé']]);
    const photos = [x.photo_zone && { url: x.photo_zone, legende: 'Zone' }, x.photo_gros_plan && { url: x.photo_gros_plan, legende: 'Gros plan' }].filter(Boolean) as any[];
    if (photos.length) await d.photos(photos);
  }
  d.pied(PIED);
  return d.octets();
}

// ---------------------------------------------------------------------------
export type DevisDoc = { numero?: number | null; debut: string; fin: string; prix_total?: number | null; km_inclus?: number | null;
  prix_km_sup?: number | null; caution?: number | null; note?: string | null; valide_jusqu?: string | null; created_at?: string;
  client: { nom: string; telephone?: string | null; email?: string | null }; vehicule?: string | null };
export async function devisPdf(a: AgenceDoc, x: DevisDoc) {
  const num = String(x.numero ?? '').padStart(4, '0');
  const d = await Doc.creer('Devis ' + num, a.logo);
  d.entete('Devis de location', a, `N° D-${num} · ${date(x.created_at ?? new Date().toISOString())}${x.valide_jusqu ? ' · valable jusqu\u2019au ' + date(x.valide_jusqu) : ''}`);
  d.section('Pour');
  d.texte(x.client.nom, { gras: true, apres: 0 });
  if (x.client.telephone) d.texte(x.client.telephone, { apres: 0 });
  if (x.client.email) d.texte(x.client.email, { apres: 0 });
  d.y -= 8;
  const jours = joursEntre(x.debut, x.fin);
  d.tableau(['Désignation', 'Durée', 'Montant TTC'],
    [[`Location${x.vehicule ? ' ' + x.vehicule : ''} du ${dateHeure(x.debut)} au ${dateHeure(x.fin)}`, `${jours} j`, euros(x.prix_total)]], [0.66, 0.14, 0.2]);
  d.trait();
  const t = `Total TTC   ${euros(x.prix_total)}`;
  d.place(20); d.page.drawText(t, { x: 595.28 - 48 - d.largeur(t, 12, true), y: d.y - 12, size: 12, font: d.fb }); d.y -= 26;
  d.infos([['Kilomètres inclus', x.km_inclus != null ? km(x.km_inclus) : 'Illimités'], ['Kilomètre supplémentaire', x.prix_km_sup != null ? euros(x.prix_km_sup) + ' / km' : '—'],
    ['Dépôt de garantie', euros(x.caution)], ['', '']]);
  if (x.note) { d.section('Précisions'); d.texte(x.note, { taille: 10 }); }
  d.y -= 8;
  d.texte('Pièces à présenter au départ : permis de conduire et pièce d\u2019identité en cours de validité.', { taille: 9.5 });
  d.texte('Pour réserver, répondez simplement à ce devis.', { taille: 9.5 });
  d.pied(PIED);
  return d.octets();
}

// ---------------------------------------------------------------------------
// Bilan complet d'un véhicule (archive au moment de la sortie de flotte)
export type BilanDoc = {
  vehicule: { immatriculation: string; marque?: string | null; modele?: string | null; financement?: string | null; cout_mensuel?: number | null;
    date_entree?: string | null; date_sortie?: string | null; motif_sortie?: string | null; prix_sortie?: number | null; km?: number | null };
  chiffres: [string, string][];
  locations: string[][]; maintenances: string[][]; depenses: string[][]; dommages: string[][]; amendes: string[][];
};
export async function bilanPdf(a: AgenceDoc, b: BilanDoc) {
  const v = b.vehicule;
  const d = await Doc.creer('Bilan ' + v.immatriculation, a.logo);
  d.entete(`Bilan du véhicule ${v.immatriculation}`, a, `${[v.marque, v.modele].filter(Boolean).join(' ')} · édité le ${date(new Date().toISOString())}`);
  d.section('Résumé');
  d.infos(b.chiffres, 3);
  const bloc = (titre: string, entetes: string[], lignes: string[][], largeurs: number[]) => {
    d.section(`${titre} (${lignes.length})`);
    if (lignes.length) d.tableau(entetes, lignes, largeurs); else d.texte('Aucun.', { taille: 9.5 });
  };
  bloc('Locations', ['N°', 'Client', 'Du', 'Au', 'Prix'], b.locations, [0.1, 0.36, 0.17, 0.17, 0.2]);
  bloc('Maintenance et transferts', ['Type', 'Détail', 'Date', 'Coût / reçu'], b.maintenances, [0.25, 0.4, 0.15, 0.2]);
  bloc('Dépenses', ['Type', 'Détail', 'Date', 'Montant'], b.depenses, [0.2, 0.45, 0.15, 0.2]);
  bloc('Dommages', ['Type', 'Gravité', 'Date', 'Coût'], b.dommages, [0.3, 0.25, 0.2, 0.25]);
  bloc('Amendes', ['Infraction', 'Statut', 'Date', 'Montant'], b.amendes, [0.4, 0.2, 0.2, 0.2]);
  d.pied(`Bilan ${v.immatriculation} · ${PIED}`);
  return d.octets();
}

// ---------------------------------------------------------------------------
export async function attestationPdf(a: AgenceDoc, v: VehiculeDoc, personne: string, fourriere: string) {
  const d = await Doc.creer('Bon de pouvoir ' + v.immatriculation, a.logo);
  d.entete('Bon de pouvoir', a, 'Récupération d’un véhicule en fourrière');
  d.y -= 10;
  const gerant = a.gerant_nom || '[nom du gérant]';
  d.texte(`Je soussigné ${gerant}, représentant la société ${a.nom}${a.siret ? ' (SIRET ' + a.siret + ')' : ''}${a.adresse ? ', ' + a.adresse : ''}, autorise ${personne} à récupérer en mon nom le véhicule suivant :`, { taille: 11.5, apres: 12 });
  d.infos([['Immatriculation', v.immatriculation], ['Véhicule', [v.marque, v.modele].filter(Boolean).join(' ') || '—'],
    ['Fourrière', fourriere || '—'], ['Fait le', date(new Date().toISOString())]]);
  d.y -= 6;
  d.texte('Pièces jointes : carte grise, attestation d’assurance, extrait Kbis et pièce d’identité du gérant.', { taille: 9.5 });
  d.texte('À présenter avec la mainlevée s’il y en a une.', { taille: 9.5, apres: 16 });
  await signatures(d, { titre: '' }, { titre: `${gerant}, gérant`, url: a.signature, tampon: a.tampon });
  await d.joindre(v.carte_grise, 'Carte grise');
  await d.joindre(v.assurance, 'Attestation d’assurance');
  await d.joindre(a.kbis, 'Extrait Kbis');
  await d.joindre(a.piece_gerant, 'Pièce d’identité du gérant');
  d.pied(PIED);
  return d.octets();
}
