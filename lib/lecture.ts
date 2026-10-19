// Lecture automatique d'un papier par un modèle d'IA (clé ANTHROPIC_API_KEY dans Vercel)
export const consignes: Record<string, string> = {
  carte_grise: `Carte grise française (certificat d'immatriculation). Renvoie uniquement ce JSON :
{"immatriculation": champ A, "marque": champ D.1, "modele": nom commercial champ D.3, "carburant": champ P.3 traduit en "essence" | "diesel" | "hybride" | "electrique" | "gpl" ou null, "date_premiere_immatriculation": champ B au format AAAA-MM-JJ, "vin": champ E}`,
  permis: `Permis de conduire. Renvoie uniquement ce JSON :
{"nom": champ 1, "prenom": champ 2, "date_naissance": champ 3 au format AAAA-MM-JJ, "numero_permis": champ 5, "date_permis": date d'obtention de la catégorie B (colonne 10) ou à défaut date de délivrance (4a), format AAAA-MM-JJ}`,
  amende: `Avis de contravention français (ANTAI). Renvoie uniquement ce JSON :
{"immatriculation": immatriculation du véhicule sans espaces ni tirets, "date_infraction": date et heure de l'infraction au format AAAA-MM-JJTHH:MM, "lieu": lieu de l'infraction, "type": nature de l'infraction en quelques mots (ex. "Excès de vitesse", "Stationnement"), "montant": montant de l'amende forfaitaire en euros (nombre), "numero_avis": numéro de l'avis}`,
  identite: `Pièce d'identité (carte d'identité ou passeport). Renvoie uniquement ce JSON :
{"nom": nom de famille, "prenom": premier prénom, "date_naissance": format AAAA-MM-JJ, "adresse": adresse si elle figure sur le document sinon null}`,
};


export async function lireDocument(image: string, genre: string): Promise<{ champs?: Record<string, unknown>; erreur?: string; statut: number }> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return { erreur: 'La lecture automatique n’est pas encore activée. Remplissez à la main.', statut: 503 };
  if (!consignes[genre] || typeof image !== 'string' || !image.startsWith('data:image/')) return { erreur: 'Photo illisible.', statut: 400 };
  const [entete, donnees] = image.split(',');
  const type = entete.slice(5, entete.indexOf(';'));
  if (donnees.length > 7_000_000) return { erreur: 'Photo trop lourde.', statut: 413 };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LECTURE_MODELE || 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: type, data: donnees } },
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
