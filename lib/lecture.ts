// Lecture automatique d'un papier par un modèle d'IA (clé ANTHROPIC_API_KEY dans Vercel)
export const consignes: Record<string, string> = {
  carte_grise: `Carte grise française (certificat d'immatriculation). Renvoie uniquement ce JSON :
{"immatriculation": champ A, "marque": champ D.1, "modele": nom commercial champ D.3, "carburant": champ P.3 traduit en "essence" | "diesel" | "hybride" | "electrique" | "gpl" ou null, "date_premiere_immatriculation": champ B au format AAAA-MM-JJ, "vin": champ E}`,
  permis: `Permis de conduire. Renvoie uniquement ce JSON :
{"nom": champ 1, "prenom": champ 2, "date_naissance": date du champ 3 au format AAAA-MM-JJ, "lieu_naissance": lieu du champ 3 (ville et département ou pays, tel qu'écrit), "numero_permis": champ 5, "date_permis": date d'obtention de la catégorie B (colonne 10) ou à défaut date de délivrance (4a), format AAAA-MM-JJ}`,
  amende: `Avis de contravention français (ANTAI). Renvoie uniquement ce JSON :
{"immatriculation": immatriculation du véhicule sans espaces ni tirets, "date_infraction": date et heure de l'infraction au format AAAA-MM-JJTHH:MM, "lieu": lieu de l'infraction, "type": nature de l'infraction en quelques mots (ex. "Excès de vitesse", "Stationnement"), "montant": montant de l'amende forfaitaire en euros (nombre), "numero_avis": numéro de l'avis}`,
  fps: `Avis de paiement de forfait post-stationnement (FPS) français. Renvoie uniquement ce JSON :
{"immatriculation": immatriculation du véhicule sans espaces ni tirets, "date_constat": date et heure de constatation au format AAAA-MM-JJTHH:MM, "lieu": adresse du stationnement (rue, code postal, ville), "collectivite": nom de la collectivité (ex. "Ville de Paris"), "montant": montant du FPS en euros (nombre), "numero_avis": numéro de l'avis de paiement en chiffres sans espaces ni clé, "date_avis": date d'envoi de l'avis au format AAAA-MM-JJ, "limite_paiement": date limite de paiement au format AAAA-MM-JJ}`,
  kbis: `Extrait Kbis français (extrait d'immatriculation au RCS). Renvoie uniquement ce JSON :
{"date_kbis": date à laquelle l'extrait a été délivré / mis à jour ("à jour au", "extrait délivré le"), format AAAA-MM-JJ, "denomination": dénomination sociale, "siren": numéro SIREN (9 chiffres), "forme_juridique": forme juridique (SAS, SARL…), "rcs": greffe et numéro, ex. "RCS Paris 123 456 789", "adresse": adresse du siège}`,
  compteur: `Photo du tableau de bord d'une voiture, moteur allumé. Renvoie uniquement ce JSON :
{"km": kilométrage total affiché par le compteur (odomètre, pas le trip partiel A/B), nombre entier sans espace ni unité, "carburant_huitiemes": niveau de la jauge de carburant ou de la batterie de 0 (vide) à 8 (plein), entier arrondi, ou null si la jauge n'est pas visible}`,
  identite: `Pièce d'identité (carte d'identité ou passeport). Renvoie uniquement ce JSON :
{"nom": nom de famille, "prenom": premier prénom, "date_naissance": format AAAA-MM-JJ, "adresse": adresse si elle figure sur le document sinon null}`,
};


export async function lireDocument(image: string, genre: string): Promise<{ champs?: Record<string, unknown>; erreur?: string; statut: number }> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return { erreur: 'La lecture automatique n’est pas encore activée. Remplissez à la main.', statut: 503 };
  const estPdf = typeof image === 'string' && image.startsWith('data:application/pdf');
  if (!consignes[genre] || typeof image !== 'string' || !(image.startsWith('data:image/') || estPdf)) return { erreur: 'Photo illisible.', statut: 400 };
  const [entete, donnees] = image.split(',');
  const type = entete.slice(5, entete.indexOf(';'));
  if (donnees.length > 14_000_000) return { erreur: 'Document trop lourd.', statut: 413 };
  // Un PDF (avis reçu par e-mail, scan) est lu tel quel ; une photo comme image
  const piece = estPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: donnees } }
    : { type: 'image', source: { type: 'base64', media_type: type, data: donnees } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LECTURE_MODELE || 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        piece,
        { type: 'text', text: `${consignes[genre]}\nMets null pour tout champ illisible ou absent. Aucun texte en dehors du JSON.` },
      ] }],
    }),
  });
  if (!r.ok) return { erreur: 'Lecture impossible pour le moment. Remplissez à la main.', statut: 502 };
  const rep = await r.json();
  const texte: string = rep?.content?.find((c: any) => c.type === 'text')?.text ?? '';
  try {
    return { champs: JSON.parse(texte.slice(texte.indexOf('{'), texte.lastIndexOf('}') + 1)), statut: 200 };
  } catch {
    return { erreur: 'Document non reconnu. Reprenez la photo bien à plat, sans reflet.', statut: 422 };
  }
}
