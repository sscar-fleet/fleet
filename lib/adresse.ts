// Adresse lisible d'une position (« Rue de Vaugirard, Paris 15e »), par le service public de la Géoplateforme (IGN),
// gratuit et sans clé, France seulement. Gardée en mémoire par point arrondi à ~10 m.
const memoire = new Map<string, string | null>();

export async function adresseDe(lat: number, lng: number): Promise<string | null> {
  const cle = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (memoire.has(cle)) return memoire.get(cle)!;
  try {
    const rep = await fetch(`https://data.geopf.fr/geocodage/reverse?lon=${lng}&lat=${lat}&limit=1`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    if (!rep.ok) return null;
    const p = (await rep.json())?.features?.[0]?.properties;
    if (!p) { memoire.set(cle, null); return null; }
    const rue = p.street || p.name || null;
    const ville = p.district ? String(p.district).replace(/\s*Arrondissement$/i, '') : p.city || null;
    const texte = [rue, ville].filter(Boolean).join(', ') || null;
    if (memoire.size > 3000) memoire.clear();
    memoire.set(cle, texte);
    return texte;
  } catch { return null; }
}
