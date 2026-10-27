// Lecture d'un tableur dans le navigateur, sans dépendance : Excel (.xlsx), CSV, ou lignes collées depuis Excel.
// Renvoie un tableau de lignes (tableaux de textes). Les dates Excel (nombres de jours) restent des nombres en texte.

async function decompresser(donnees: Uint8Array, methode: number): Promise<Uint8Array> {
  if (methode === 0) return donnees;
  if (methode !== 8) throw new Error('Format de fichier Excel non pris en charge.');
  const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

// Fichiers contenus dans un .xlsx (c'est une archive zip)
async function lireZip(tampon: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const v = new DataView(tampon); const octets = new Uint8Array(tampon);
  let fin = -1;
  for (let i = tampon.byteLength - 22; i >= Math.max(0, tampon.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('Ce fichier n’est pas un Excel (.xlsx) lisible.');
  const nb = v.getUint16(fin + 10, true); let p = v.getUint32(fin + 16, true);
  const fichiers = new Map<string, () => Promise<string>>();
  const dec = new TextDecoder();
  for (let k = 0; k < nb; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const methode = v.getUint16(p + 10, true), taille = v.getUint32(p + 20, true);
    const lnom = v.getUint16(p + 28, true), lextra = v.getUint16(p + 30, true), lcom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = dec.decode(octets.subarray(p + 46, p + 46 + lnom));
    fichiers.set(nom, async () => {
      const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      return dec.decode(await decompresser(octets.subarray(debut, debut + taille), methode));
    });
    p += 46 + lnom + lextra + lcom;
  }
  return fichiers;
}

const colonne = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

async function lireXlsx(tampon: ArrayBuffer): Promise<string[][]> {
  return (await lireFeuilles(tampon))[0]?.lignes ?? [];
}

// Toutes les feuilles d'un classeur Excel, avec leur nom (une feuille « Véhicules », une « Clients »…)
async function lireFeuilles(tampon: ArrayBuffer): Promise<{ nom: string; lignes: string[][] }[]> {
  const zip = await lireZip(tampon);
  const xml = (t: string) => new DOMParser().parseFromString(t, 'application/xml');
  const partages: string[] = [];
  const ss = zip.get('xl/sharedStrings.xml');
  if (ss) xml(await ss()).querySelectorAll('si').forEach((si) => partages.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')));
  const feuilles = Array.from(zip.keys()).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!feuilles.length) throw new Error('Aucune feuille trouvée dans ce fichier.');
  const noms: string[] = [];
  const wb = zip.get('xl/workbook.xml');
  if (wb) xml(await wb()).querySelectorAll('sheet').forEach((f) => noms.push(f.getAttribute('name') ?? ''));
  const sortie: { nom: string; lignes: string[][] }[] = [];
  for (const [k, f] of feuilles.entries()) sortie.push({ nom: noms[k] || `Feuille ${k + 1}`, lignes: lireFeuille(xml(await zip.get(f)!()), partages) });
  return sortie;
}

function lireFeuille(doc: Document, partages: string[]): string[][] {
  const lignes: string[][] = [];
  doc.querySelectorAll('sheetData > row').forEach((r) => {
    const ligne: string[] = [];
    r.querySelectorAll('c').forEach((c, i) => {
      const t = c.getAttribute('t'); const ref = c.getAttribute('r');
      const val = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const texte = t === 's' ? partages[Number(val)] ?? '' : t === 'inlineStr' ? Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('') : val;
      ligne[ref ? colonne(ref) : i] = texte.trim();
    });
    lignes.push(Array.from(ligne, (x) => x ?? ''));
  });
  return lignes;
}

function lireTexte(texte: string): string[][] {
  const lignes = texte.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lignes.length) return [];
  const sep = lignes[0].includes('\t') ? '\t' : (lignes[0].split(';').length >= lignes[0].split(',').length ? ';' : ',');
  return lignes.map((l) => {
    const cases: string[] = []; let cur = ''; let guill = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (guill && l[i + 1] === '"') { cur += '"'; i++; } else guill = !guill; }
      else if (ch === sep && !guill) { cases.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cases.push(cur.trim());
    return cases;
  });
}

export async function lireClasseur(source: File): Promise<{ nom: string; lignes: string[][] }[]> {
  const nom = source.name.toLowerCase();
  if (nom.endsWith('.xls')) throw new Error('Ancien format Excel (.xls) : ouvrez-le dans Excel et enregistrez-le en .xlsx, ou copiez-collez les lignes.');
  if (nom.endsWith('.xlsx') || nom.endsWith('.xlsm')) return lireFeuilles(await source.arrayBuffer());
  return [{ nom: source.name, lignes: lireTexte(await source.text()) }];
}

export async function lireTableur(source: File | string): Promise<string[][]> {
  if (typeof source === 'string') return lireTexte(source);
  const nom = source.name.toLowerCase();
  if (nom.endsWith('.xls')) throw new Error('Ancien format Excel (.xls) : ouvrez-le dans Excel et enregistrez-le en .xlsx, ou copiez-collez les lignes.');
  if (nom.endsWith('.xlsx')) return lireXlsx(await source.arrayBuffer());
  return lireTexte(await source.text());
}
