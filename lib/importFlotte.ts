// Fleet AI lit ce que le loueur dépose en vrac (texte, liste collée, photo de carte grise ou de contrat, PDF, tableur)
// et en sort les véhicules, les clients, les locations en cours et les voitures au garage. Rien n'est écrit ici :
// le loueur voit l'aperçu, corrige et valide (voir importerFlotte dans app/actions.ts).
import { CHAMPS_COLONNE, type Colonnes } from './importCommun';

const URL_IA = (process.env.ANTHROPIC_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const MODELE = () => process.env.IMPORT_MODELE || 'claude-sonnet-5-5';
const MODELE_SECOURS = () => process.env.LECTURE_MODELE || 'claude-haiku-4-5-20251001';

export type Piece = { genre: 'texte' | 'image' | 'pdf'; contenu: string; nom: string };
export type Contexte = { metier: 'location' | 'transport'; aujourdhui: string; jour: string; plaques: string[] };

async function appeler(contenu: any[], maxTokens: number): Promise<string> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) throw new Error('La lecture automatique n’est pas encore activée.');
  // Une seule échéance pour tout l'appel (la fonction serveur est coupée à 60 s) : le modèle de secours
  // n'est tenté que si le premier refuse tout de suite (modèle inconnu, surcharge), jamais après une attente
  const fin = Date.now() + 52_000;
  let derniere = '';
  for (const modele of [MODELE(), MODELE_SECOURS()]) {
    const reste = fin - Date.now();
    if (reste < 8_000) break;
    try {
      const r = await fetch(`${URL_IA}/v1/messages`, {
        method: 'POST', signal: AbortSignal.timeout(reste),
        headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: modele, max_tokens: maxTokens, messages: [{ role: 'user', content: contenu }] }),
      });
      if (!r.ok) { derniere = `HTTP ${r.status}`; if (r.status === 400 || r.status === 404 || r.status === 429 || r.status >= 500) continue; break; }
      const rep = await r.json();
      if (rep?.stop_reason === 'max_tokens') throw new Error('trop long');
      return (rep?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    } catch (e: any) {
      if (e?.message === 'trop long') throw new Error('Ce document contient trop de lignes d’un coup : découpez-le en plusieurs morceaux.');
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') { derniere = 'délai dépassé'; break; }
      derniere = e?.message ?? 'erreur';
    }
  }
  throw new Error(derniere === 'délai dépassé' ? 'La lecture a pris trop de temps : envoyez ce document en plus petits morceaux.' : 'Lecture impossible pour le moment. Réessayez dans un instant.');
}

const json = (t: string) => {
  const debut = t.indexOf('{'), fin = t.lastIndexOf('}');
  if (debut < 0 || fin < debut) throw new Error('Document non reconnu.');
  return JSON.parse(t.slice(debut, fin + 1));
};

const FORMAT = `{
 "type_document": "carte_grise|contrat|liste|autre",
 "vehicules": [{"immatriculation": "AB123CD", "marque": "Renault", "modele": "Clio 5 (version exacte si elle est écrite : RS3, GTI, AMG…)", "annee": "année de première mise en circulation (carte grise champ B) ou null", "couleur": "couleur de la carrosserie si elle est écrite (noir, gris, blanc, bleu…) ou null", "carburant": "essence|diesel|hybride|electrique|gpl|null", "km": 42000, "prix_jour": 45, "statut": "disponible|loue|garage|vendu|null", "garage": "nom du garage ou null", "retour_garage": "AAAA-MM-JJ ou null", "assurance_echeance": "AAAA-MM-JJ ou null", "ct_echeance": "AAAA-MM-JJ ou null", "note": "court, ou null"}],
 "clients": [{"nom": "Dupont", "prenom": "Jean", "telephone": "0612345678", "email": null, "date_naissance": "AAAA-MM-JJ ou null", "numero_permis": null, "adresse": null}],
 "locations": [{"immatriculation": "AB123CD", "client_nom": "Dupont", "client_prenom": "Jean", "client_telephone": null, "debut": "AAAA-MM-JJTHH:MM ou null", "fin": "AAAA-MM-JJTHH:MM ou null", "prix_total": null, "caution": null}],
 "chauffeurs": [{"nom": "Martin", "prenom": "Karim", "telephone": null}],
 "remarques": ["ce qui n'a pas pu être compris, en une phrase courte, ou rien"]
}`;

function consignes(c: Contexte) {
  return `Tu aides une ${c.metier === 'transport' ? 'société de transport et de livraison' : 'agence de location de véhicules'} française à mettre sa flotte dans son nouveau logiciel.
Nous sommes le ${c.jour} ${c.aujourdhui} (heure de Paris).
Le document ci-dessus vient du loueur, tel quel : liste, tableau, notes, message dicté, photo de carte grise, de contrat, de tableau blanc, PDF…
Extrais uniquement ce qui y figure vraiment, sans rien inventer ni compléter de tête :
- les véhicules (immatriculation, marque, modèle, kilométrage, prix par jour, carburant, échéances d'assurance et de contrôle technique) ;
- leur situation actuelle : "loue" s'il est chez un client, "garage" s'il est en réparation / à l'atelier / chez le carrossier / immobilisé (avec le garage et la date de retour prévue si elles sont données), "disponible" s'il est libre, "vendu" s'il est vendu ou rendu ;
- les clients (nom, prénom, téléphone, e-mail, date de naissance, numéro de permis) ;
- les locations en cours ou à venir : quel véhicule, quel client, départ et retour. "jusqu'à vendredi" = le prochain vendredi par rapport à aujourd'hui ; une date sans heure : départ 09:00, retour 18:00 ; ignore les locations déjà terminées ;
${c.metier === 'transport' ? '- les chauffeurs (nom, prénom, téléphone) : ce sont des salariés, pas des clients ;\n' : ''}- une carte grise : immatriculation = champ A, marque = D.1, modèle = nom commercial D.3, année = champ B, carburant = P.3, et aucun client ;
- un contrat de location : le véhicule, le client (nom, prénom, téléphone, permis, naissance) et la location (départ, retour, prix, caution).
Immatriculation sans espaces ni tirets. Téléphone tel qu'écrit. Mets null pour ce qui est absent ou illisible.
${c.plaques.length ? `Véhicules déjà dans le logiciel (garde la même plaque si tu reconnais l'un d'eux) : ${c.plaques.slice(0, 300).join(', ')}.\n` : ''}Réponds uniquement avec ce JSON, sans texte autour (listes vides si rien) :
${FORMAT}`;
}

export async function extraire(p: Piece, c: Contexte): Promise<any> {
  const contenu: any[] = [];
  if (p.genre === 'image' || p.genre === 'pdf') {
    const [entete, donnees] = p.contenu.split(',');
    if (!donnees || donnees.length * 0.75 > 14_000_000) throw new Error('Fichier trop lourd (14 Mo au plus).');
    const type = entete.slice(5, entete.indexOf(';'));
    contenu.push(p.genre === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: donnees } }
      : { type: 'image', source: { type: 'base64', media_type: type, data: donnees } });
    contenu.push({ type: 'text', text: `Fichier : « ${p.nom} ».\n${consignes(c)}` });
  } else {
    const texte = p.contenu.slice(0, 9_000);
    if (!texte.trim()) throw new Error('Rien à lire.');
    contenu.push({ type: 'text', text: `Document « ${p.nom} » :\n"""\n${texte}\n"""\n\n${consignes(c)}` });
  }
  return json(await appeler(contenu, 8_000));
}

// Tableur : on montre l'en-tête et quelques lignes ; l'IA dit à quoi correspond chaque colonne, le navigateur fait le reste
export async function reconnaitreColonnes(echantillon: string, nomFichier: string, c: Contexte): Promise<Colonnes> {
  const texte = `Voici quelques lignes d'un tableur « ${nomFichier} » d'une ${c.metier === 'transport' ? 'société de transport' : 'agence de location de véhicules'}.
Chaque ligne commence par son numéro (L0 = première ligne du fichier) ; chaque case est notée C<numéro de colonne>=valeur.
"""
${echantillon}
"""
Dis à quoi correspond chaque colonne utile. Champs possibles : ${CHAMPS_COLONNE.join(', ')}.
- annee : année de mise en circulation ou date de première immatriculation.
- couleur : couleur de la carrosserie.
- marque_modele : une seule colonne avec marque et modèle ensemble ; client_nom_complet / chauffeur_nom_complet : prénom et nom dans la même case.
- debut / fin : départ et retour d'une location en cours ; retour_garage : date de sortie de garage prévue.
- statut : colonne qui dit si le véhicule est loué, disponible, au garage, vendu… Donne la traduction de chaque valeur rencontrée vers "disponible", "loue", "garage" ou "vendu".
- contenu : "vehicules" (une ligne = un véhicule, éventuellement avec son client actuel), "clients" (une ligne = un client), "chauffeurs" (une ligne = un salarié chauffeur) ou "locations" (une ligne = une location).
- entete : numéro de la ligne des titres de colonnes (-1 s'il n'y en a pas).
N'associe pas une colonne dont tu n'es pas sûr. Réponds uniquement avec ce JSON :
{"contenu": "vehicules", "entete": 0, "colonnes": {"C0": "immatriculation", "C3": "km"}, "statuts": {"Loué": "loue", "Atelier": "garage"}}`;
  const r = json(await appeler([{ type: 'text', text: texte }], 1500));
  const colonnes: Record<string, any> = {};
  for (const [k, v] of Object.entries(r?.colonnes ?? {})) {
    const i = Number(String(k).replace(/\D/g, ''));
    if (Number.isInteger(i) && i >= 0 && i < 60 && (CHAMPS_COLONNE as readonly string[]).includes(String(v))) colonnes[String(i)] = v;
  }
  const contenu = ['vehicules', 'clients', 'chauffeurs', 'locations'].includes(r?.contenu) ? r.contenu : 'vehicules';
  const entete = Number.isInteger(r?.entete) ? Math.max(-1, Math.min(50, r.entete)) : 0;
  const statuts: Record<string, string> = {};
  for (const [k, v] of Object.entries(r?.statuts ?? {})) if (['disponible', 'loue', 'garage', 'vendu'].includes(String(v))) statuts[String(k).slice(0, 60)] = String(v);
  return { contenu, entete, colonnes, statuts };
}
