// Lecture d'un planning de donneur d'ordre (texte collé ou capture d'écran, ex. planning Amazon de la semaine)
// par l'IA : il en sort la liste des tournées (jour, créneau, nombre). Rien n'est créé sans validation.
export type TourneeLue = { jour: string; debut: string; fin: string; nombre: number; donneur: string | null; depot: string | null };

export async function lirePlanning(source: { texte?: string | null; image?: string | null }, lundi: string, donneurs: string[], depots: string[]): Promise<{ tournees?: TourneeLue[]; erreur?: string }> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return { erreur: 'La lecture automatique n’est pas encore activée.' };
  const contenu: any[] = [];
  if (source.image) {
    if (!source.image.startsWith('data:image/')) return { erreur: 'Image illisible.' };
    const [entete, donnees] = source.image.split(',');
    if (donnees.length > 8_000_000) return { erreur: 'Image trop lourde.' };
    contenu.push({ type: 'image', source: { type: 'base64', media_type: entete.slice(5, entete.indexOf(';')), data: donnees } });
  }
  const texte = String(source.texte ?? '').slice(0, 20000);
  if (!source.image && !texte.trim()) return { erreur: 'Collez le planning ou ajoutez une capture.' };
  const dimanche = new Date(lundi + 'T12:00:00Z'); dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  contenu.push({ type: 'text', text: `Voici le planning de tournées d'une société de livraison pour la semaine du lundi ${lundi} au dimanche ${dimanche.toISOString().slice(0, 10)}.
${texte ? `Texte du planning :\n"""\n${texte}\n"""\n` : ''}Donneurs d'ordre connus : ${donneurs.join(', ') || 'aucun'}. Dépôts connus : ${depots.join(', ') || 'aucun'}.
Extrais toutes les tournées. Regroupe celles qui ont le même jour, le même créneau, le même donneur d'ordre et le même dépôt en indiquant leur nombre.
Renvoie uniquement ce JSON : {"tournees": [{"jour": "AAAA-MM-JJ", "debut": "HH:MM", "fin": "HH:MM", "nombre": entier, "donneur": nom exact d'un donneur connu ou null, "depot": nom exact d'un dépôt connu ou null}]}
Si l'heure de fin n'est pas indiquée, compte 4 h après le début. Les jours doivent être dans la semaine indiquée. Aucun texte en dehors du JSON.` });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(45_000),
      headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.LECTURE_MODELE || 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: contenu }] }),
    });
    if (!r.ok) return { erreur: 'Lecture impossible pour le moment.' };
    const rep = await r.json();
    const t: string = rep?.content?.find((c: any) => c.type === 'text')?.text ?? '';
    const json = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    const h = (v: any) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null);
    const tournees: TourneeLue[] = (json?.tournees ?? []).map((x: any) => ({
      jour: String(x.jour ?? ''), debut: h(x.debut) ?? '', fin: h(x.fin) ?? '', nombre: Math.min(50, Math.max(1, Math.round(Number(x.nombre) || 1))),
      donneur: donneurs.includes(x.donneur) ? x.donneur : null, depot: depots.includes(x.depot) ? x.depot : null,
    })).filter((x: TourneeLue) => /^\d{4}-\d{2}-\d{2}$/.test(x.jour) && x.debut && x.fin && x.jour >= lundi && x.jour <= dimanche.toISOString().slice(0, 10));
    if (!tournees.length) return { erreur: 'Aucune tournée trouvée. Vérifiez le texte ou la capture.' };
    return { tournees };
  } catch { return { erreur: 'Planning non reconnu. Essayez avec le texte collé.' }; }
}
