// Fabrication des PDF dans le navigateur (contrat, facture, état des lieux, dommages, attestation fourrière).
// Aucun serveur ni service payant : pdf-lib assemble le document, les pièces jointes sont ajoutées à la suite.
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';

const A4: [number, number] = [595.28, 841.89];
const MARGE = 48;
const NOIR = rgb(0.04, 0.06, 0.07);
const GRIS = rgb(0.45, 0.5, 0.54);
const TURQUOISE = rgb(0.1, 0.97, 0.84);
const TRAIT = rgb(0.85, 0.88, 0.9);
const FOND = rgb(0.955, 0.965, 0.972);

// Les polices standard du PDF ne connaissent que l'alphabet occidental (WinAnsi)
const EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function propre(s: unknown) {
  return String(s ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/\t/g, ' ')
    .split('')
    .filter((c) => c === '\n' || (c >= ' ' && c <= '~') || (c >= '¡' && c <= 'ÿ') || EXTRAS.includes(c))
    .join('');
}

async function octets(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Fichier introuvable');
  return new Uint8Array(await r.arrayBuffer());
}
function genre(o: Uint8Array) {
  if (o[0] === 0x25 && o[1] === 0x50 && o[2] === 0x44 && o[3] === 0x46) return 'pdf';
  if (o[0] === 0x89 && o[1] === 0x50) return 'png';
  if (o[0] === 0xff && o[1] === 0xd8) return 'jpg';
  return 'autre';
}

export class Doc {
  pdf!: PDFDocument;
  page!: PDFPage;
  f!: PDFFont;
  fb!: PDFFont;
  y = 0;
  logo?: PDFImage;
  accent = TURQUOISE;
  accentFonce = rgb(0.03, 0.45, 0.4);
  mentions = '';

  static async creer(titre: string, logoUrl?: string | null, couleur?: string | null) {
    const d = new Doc();
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(couleur ?? '');
    if (m) {
      const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
      d.accent = rgb(r, g, b);
      d.accentFonce = rgb(r * 0.55, g * 0.55, b * 0.55); // même teinte, lisible en texte sur blanc
    }
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(propre(titre));
    d.pdf.setCreator('SS CAR FLEET');
    d.f = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.fb = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    if (logoUrl) {
      try {
        const o = await octets(logoUrl);
        const g = genre(o);
        if (g === 'png') d.logo = await d.pdf.embedPng(o);
        else if (g === 'jpg') d.logo = await d.pdf.embedJpg(o);
      } catch { /* sans logo */ }
    }
    d.nouvellePage();
    return d;
  }

  nouvellePage() {
    this.page = this.pdf.addPage(A4);
    this.y = A4[1] - MARGE;
    this.page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: this.accent });
  }
  place(h: number) { if (this.y - h < MARGE + 20) this.nouvellePage(); }
  largeur(t: string, taille: number, gras = false) { return (gras ? this.fb : this.f).widthOfTextAtSize(propre(t), taille); }

  lignes(t: string, taille: number, gras: boolean, max: number) {
    const sortie: string[] = [];
    propre(t).split('\n').forEach((para) => {
      let ligne = '';
      para.split(' ').forEach((mot) => {
        const essai = ligne ? ligne + ' ' + mot : mot;
        if (this.largeur(essai, taille, gras) > max && ligne) { sortie.push(ligne); ligne = mot; } else ligne = essai;
      });
      sortie.push(ligne);
    });
    return sortie;
  }

  texte(t: string, o: { taille?: number; gras?: boolean; couleur?: any; x?: number; max?: number; apres?: number } = {}) {
    const taille = o.taille ?? 10.5;
    const x = o.x ?? MARGE;
    const max = o.max ?? A4[0] - x - MARGE;
    for (const l of this.lignes(t, taille, !!o.gras, max)) {
      this.place(taille * 1.45);
      this.page.drawText(l, { x, y: this.y - taille, size: taille, font: o.gras ? this.fb : this.f, color: o.couleur ?? NOIR });
      this.y -= taille * 1.45;
    }
    this.y -= o.apres ?? 4;
  }

  entete(titre: string, agence: Agence, sousTitre?: string) {
    this.mentions = mentionsLegales(agence);
    this.y -= 4;
    const haut = this.y;
    if (this.logo) {
      const h = 52; const w = Math.min(170, (this.logo.width / this.logo.height) * h);
      this.page.drawImage(this.logo, { x: MARGE, y: this.y - (w / (this.logo.width / this.logo.height)), width: w, height: w / (this.logo.width / this.logo.height) });
    } else {
      this.page.drawText(propre(agence.nom), { x: MARGE, y: this.y - 18, size: 17, font: this.fb, color: this.accentFonce });
    }
    const droite = [agence.nom, agence.adresse, [agence.telephone, agence.email].filter(Boolean).join(' · '), agence.site]
      .filter(Boolean) as string[];
    let yy = haut;
    droite.forEach((l, i) => {
      const taille = i === 0 ? 11 : 8.8;
      const font = i === 0 ? this.fb : this.f;
      for (const t of this.lignes(l, taille, i === 0, 220)) {
        this.page.drawText(t, { x: A4[0] - MARGE - font.widthOfTextAtSize(t, taille), y: yy - taille, size: taille, font, color: i === 0 ? NOIR : GRIS });
        yy -= taille * 1.5;
      }
    });
    this.y = Math.min(haut - 62, yy - 14);
    this.texte(titre, { taille: 22, gras: true, apres: 0 });
    this.page.drawRectangle({ x: MARGE, y: this.y - 2, width: 46, height: 3, color: this.accent });
    this.y -= 10;
    if (sousTitre) this.texte(sousTitre, { taille: 10, couleur: GRIS, apres: 2 });
    this.y -= 6;
  }

  // Deux encadrés côte à côte (ex. Loueur / Locataire)
  boites(gauche: { titre: string; lignes: (string | null | undefined)[] }, droite: { titre: string; lignes: (string | null | undefined)[] }) {
    const larg = (A4[0] - 2 * MARGE - 14) / 2;
    const contenu = [gauche, droite].map((b) => b.lignes.filter(Boolean).flatMap((l, i) => this.lignes(String(l), i === 0 ? 10.5 : 9.3, i === 0, larg - 24).map((t) => ({ t, gras: i === 0 }))));
    const h = 30 + Math.max(...contenu.map((c) => c.length)) * 14;
    this.place(h + 8);
    [gauche, droite].forEach((b, k) => {
      const x = MARGE + k * (larg + 14);
      this.page.drawRectangle({ x, y: this.y - h, width: larg, height: h, color: FOND });
      this.page.drawRectangle({ x, y: this.y - h, width: 3, height: h, color: this.accent });
      this.page.drawText(propre(b.titre.toUpperCase()), { x: x + 14, y: this.y - 16, size: 8, font: this.fb, color: this.accentFonce });
      contenu[k].forEach((l, i) => this.page.drawText(l.t, { x: x + 14, y: this.y - 32 - i * 14, size: l.gras ? 10.5 : 9.3, font: l.gras ? this.fb : this.f, color: l.gras ? NOIR : GRIS }));
    });
    this.y -= h + 12;
  }

  // Encadré des totaux, à droite
  totaux(paires: [string, string][], note?: string) {
    const larg = 230; const h = 14 + paires.length * 20;
    this.place(h + 10);
    const x = A4[0] - MARGE - larg;
    this.page.drawRectangle({ x, y: this.y - h, width: larg, height: h, color: FOND });
    paires.forEach(([lib, val], i) => {
      const dernier = i === paires.length - 1;
      const taille = dernier ? 13 : 10;
      const font = dernier ? this.fb : this.f;
      const yy = this.y - 18 - i * 20;
      if (dernier) this.page.drawRectangle({ x, y: yy - 8, width: larg, height: 24, color: this.accent, opacity: 0.18 });
      this.page.drawText(propre(lib), { x: x + 12, y: yy, size: taille, font, color: NOIR });
      this.page.drawText(propre(val), { x: x + larg - 12 - font.widthOfTextAtSize(propre(val), taille), y: yy, size: taille, font, color: NOIR });
    });
    if (note) this.page.drawText(propre(note), { x: MARGE, y: this.y - 18, size: 8.5, font: this.f, color: GRIS });
    this.y -= h + 12;
  }

  trait() {
    this.place(12);
    this.page.drawLine({ start: { x: MARGE, y: this.y - 4 }, end: { x: A4[0] - MARGE, y: this.y - 4 }, thickness: 0.7, color: TRAIT });
    this.y -= 14;
  }

  section(t: string) {
    this.y -= 6;
    this.place(20);
    this.page.drawRectangle({ x: MARGE, y: this.y - 10, width: 3, height: 10, color: this.accent });
    this.page.drawText(propre(t.toUpperCase()), { x: MARGE + 9, y: this.y - 9.5, size: 9, font: this.fb, color: this.accentFonce });
    this.y -= 18;
  }

  // Paires libellé / valeur sur deux colonnes
  infos(paires: [string, unknown][], colonnes = 2) {
    const larg = (A4[0] - 2 * MARGE) / colonnes;
    for (let i = 0; i < paires.length; i += colonnes) {
      this.place(30);
      let bas = this.y;
      paires.slice(i, i + colonnes).forEach(([l, v], j) => {
        if (!l) return;
        const x = MARGE + j * larg;
        this.page.drawText(propre(l), { x, y: this.y - 8, size: 8, font: this.f, color: GRIS });
        const ls = this.lignes(String(v ?? '—') || '—', 10.5, true, larg - 10);
        ls.forEach((ligne, k) => this.page.drawText(ligne, { x, y: this.y - 22 - k * 14, size: 10.5, font: this.fb, color: NOIR }));
        bas = Math.min(bas, this.y - 22 - (ls.length - 1) * 14 - 10);
      });
      this.y = bas - 4;
    }
  }

  tableau(entetes: string[], lignes: string[][], largeurs: number[]) {
    const total = A4[0] - 2 * MARGE;
    const xs = largeurs.reduce<number[]>((a, w, i) => [...a, (a[i - 1] ?? MARGE) + (i ? largeurs[i - 1] * total : 0)], []);
    const ligne = (cells: string[], gras: boolean, couleur = NOIR) => {
      this.place(18);
      cells.forEach((c, i) => {
        const t = this.lignes(c, 9.5, gras, largeurs[i] * total - 6)[0] ?? '';
        const droite = i === cells.length - 1;
        const x = droite ? MARGE + total - this.largeur(t, 9.5, gras) : xs[i];
        this.page.drawText(t, { x, y: this.y - 10, size: 9.5, font: gras ? this.fb : this.f, color: couleur });
      });
      this.y -= 16;
    };
    this.place(26);
    this.page.drawRectangle({ x: MARGE, y: this.y - 16, width: total, height: 20, color: FOND });
    this.y -= 1;
    ligne(entetes, true, GRIS);
    this.y -= 4;
    lignes.forEach((l) => {
      ligne(l, false);
      this.page.drawLine({ start: { x: MARGE, y: this.y + 3 }, end: { x: MARGE + total, y: this.y + 3 }, thickness: 0.5, color: TRAIT });
    });
    this.y -= 4;
  }

  async image(url: string | null | undefined, largeurMax: number, hauteurMax: number, x?: number) {
    if (!url) return 0;
    try {
      const o = await octets(url);
      const g = genre(o);
      if (g !== 'png' && g !== 'jpg') return 0;
      const img = g === 'png' ? await this.pdf.embedPng(o) : await this.pdf.embedJpg(o);
      const e = Math.min(largeurMax / img.width, hauteurMax / img.height);
      const w = img.width * e; const h = img.height * e;
      this.place(h + 6);
      this.page.drawImage(img, { x: x ?? MARGE, y: this.y - h, width: w, height: h });
      return h;
    } catch { return 0; }
  }

  // Grille de photos 2 par ligne, avec légende
  async photos(liste: { url: string; legende: string }[]) {
    const larg = (A4[0] - 2 * MARGE - 12) / 2;
    const haut = 165;
    for (let i = 0; i < liste.length; i += 2) {
      this.place(haut + 24);
      const yHaut = this.y;
      for (let j = 0; j < 2 && i + j < liste.length; j++) {
        const p = liste[i + j];
        const x = MARGE + j * (larg + 12);
        this.y = yHaut;
        this.page.drawText(propre(p.legende).slice(0, 60), { x, y: yHaut - 9, size: 8.5, font: this.fb, color: GRIS });
        this.y = yHaut - 14;
        await this.image(p.url, larg, haut, x);
      }
      this.y = yHaut - haut - 24;
    }
  }

  // Ajoute un document en pièce jointe : PDF fusionné page par page, ou image sur une page
  async joindre(url: string | null | undefined, titre: string) {
    if (!url) return;
    try {
      const o = await octets(url);
      const g = genre(o);
      if (g === 'pdf') {
        const autre = await PDFDocument.load(o, { ignoreEncryption: true });
        const pages = await this.pdf.copyPages(autre, autre.getPageIndices());
        pages.forEach((p) => this.pdf.addPage(p));
      } else if (g === 'png' || g === 'jpg') {
        this.nouvellePage();
        this.texte(titre, { taille: 12, gras: true });
        await this.image(url, A4[0] - 2 * MARGE, A4[1] - 2 * MARGE - 40);
      }
    } catch { /* pièce illisible : ignorée */ }
  }

  pied(t: string) {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: MARGE, y: 40 }, end: { x: A4[0] - MARGE, y: 40 }, thickness: 0.5, color: TRAIT });
      if (this.mentions) {
        const m = this.lignes(this.mentions, 7, false, A4[0] - 2 * MARGE)[0];
        p.drawText(m, { x: (A4[0] - this.largeur(m, 7)) / 2, y: 29, size: 7, font: this.f, color: GRIS });
      }
      const s = propre(`${t} · page ${i + 1}/${pages.length}`);
      p.drawText(s, { x: (A4[0] - this.largeur(s, 6.5)) / 2, y: 18, size: 6.5, font: this.f, color: GRIS });
    });
  }

  async octets() { return this.pdf.save(); }
}

export type Agence = {
  nom: string; adresse?: string | null; telephone?: string | null; email?: string | null; siret?: string | null;
  gerant_nom?: string | null; forme_juridique?: string | null; rcs?: string | null; tva_intra?: string | null;
  iban?: string | null; site?: string | null; couleur?: string | null;
};

// Ligne de mentions légales en bas de chaque page
export function mentionsLegales(a: Agence) {
  return [
    [a.nom, a.forme_juridique].filter(Boolean).join(' '),
    a.siret ? 'SIRET ' + a.siret : '', a.rcs ?? '', a.tva_intra ? 'TVA ' + a.tva_intra : '', a.adresse ?? '',
  ].filter(Boolean).join(' · ');
}

export async function livrer(octetsPdf: Uint8Array, nom: string, partager = false) {
  const blob = new Blob([octetsPdf], { type: 'application/pdf' });
  const fichier = new File([blob], nom, { type: 'application/pdf' });
  const nav: any = navigator;
  if (partager && nav.canShare && nav.canShare({ files: [fichier] })) {
    try { await nav.share({ files: [fichier], title: nom }); return; } catch { /* annulé : on télécharge */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
