// Logo de la marque à partir de ce qui est saisi (« Renaut », « VW », « Mercedes »…), tolérant aux fautes.
// Logos : jeu de données public car-logos-dataset, servi par jsDelivr.
const MARQUES = ('abarth alfa-romeo alpine aston-martin audi bentley bmw byd cadillac chevrolet chrysler citroen cupra dacia daewoo daihatsu dodge ds ferrari fiat ford genesis honda hummer hyundai infiniti isuzu jaguar jeep kia lada lamborghini lancia land-rover lexus lotus maserati mazda mclaren mercedes-benz mg mini mitsubishi nissan opel peugeot polestar porsche renault rolls-royce rover saab seat skoda smart ssangyong subaru suzuki tesla toyota volkswagen volvo aixam aiways').split(' ');
const ALIAS: Record<string, string> = {
  vw: 'volkswagen', volks: 'volkswagen', mercedes: 'mercedes-benz', merco: 'mercedes-benz', benz: 'mercedes-benz', mb: 'mercedes-benz',
  'range-rover': 'land-rover', range: 'land-rover', landrover: 'land-rover', alfa: 'alfa-romeo', alfaromeo: 'alfa-romeo',
  'ds-automobiles': 'ds', rolls: 'rolls-royce', aston: 'aston-martin', lambo: 'lamborghini', chevy: 'chevrolet', 'mercedes-amg': 'mercedes-benz',
};
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function slugMarque(marque?: string | null) {
  if (!marque) return null;
  const n = normal(marque);
  if (!n) return null;
  if (ALIAS[n]) return ALIAS[n];
  if (MARQUES.includes(n)) return n;
  const premier = n.split('-')[0];
  if (ALIAS[premier]) return ALIAS[premier];
  if (MARQUES.includes(premier)) return premier;
  let meilleur: string | null = null; let score = 99;
  for (const m of MARQUES) {
    const s = Math.min(distance(n, m), distance(premier, m.replace(/-/g, '')));
    if (s < score) { score = s; meilleur = m; }
  }
  return score <= (n.length <= 4 ? 1 : 2) ? meilleur : null;
}

// Marque retrouvée à partir du modèle quand la marque n'est pas saisie (« Twingo 2 » → Renault)
const MODELES: Record<string, string> = {
  clio: 'renault', twingo: 'renault', megane: 'renault', captur: 'renault', kadjar: 'renault', zoe: 'renault', austral: 'renault', arkana: 'renault', scenic: 'renault', kangoo: 'renault', trafic: 'renault', master: 'renault',
  sandero: 'dacia', logan: 'dacia', duster: 'dacia', spring: 'dacia', jogger: 'dacia',
  '108': 'peugeot', '208': 'peugeot', '2008': 'peugeot', '308': 'peugeot', '3008': 'peugeot', '508': 'peugeot', '5008': 'peugeot', partner: 'peugeot', rifter: 'peugeot', expert: 'peugeot',
  c1: 'citroen', c3: 'citroen', c4: 'citroen', c5: 'citroen', berlingo: 'citroen', jumpy: 'citroen', jumper: 'citroen', ami: 'citroen',
  golf: 'volkswagen', polo: 'volkswagen', tiguan: 'volkswagen', 't-roc': 'volkswagen', passat: 'volkswagen', touran: 'volkswagen', id3: 'volkswagen', 'id-3': 'volkswagen',
  yaris: 'toyota', corolla: 'toyota', 'c-hr': 'toyota', chr: 'toyota', rav4: 'toyota', aygo: 'toyota', prius: 'toyota',
  '500': 'fiat', panda: 'fiat', tipo: 'fiat', ducato: 'fiat', corsa: 'opel', astra: 'opel', mokka: 'opel', vivaro: 'opel',
  fiesta: 'ford', focus: 'ford', puma: 'ford', kuga: 'ford', transit: 'ford', 'model-3': 'tesla', 'model-y': 'tesla',
  ibiza: 'seat', leon: 'seat', arona: 'seat', ateca: 'seat', fabia: 'skoda', octavia: 'skoda', kamiq: 'skoda', superb: 'skoda',
  picanto: 'kia', rio: 'kia', ceed: 'kia', niro: 'kia', sportage: 'kia', i10: 'hyundai', i20: 'hyundai', i30: 'hyundai', tucson: 'hyundai', kona: 'hyundai',
  qashqai: 'nissan', juke: 'nissan', micra: 'nissan', leaf: 'nissan', a1: 'audi', a3: 'audi', a4: 'audi', q3: 'audi', q5: 'audi',
  'classe-a': 'mercedes-benz', 'classe-c': 'mercedes-benz', 'classe-e': 'mercedes-benz', gla: 'mercedes-benz', glc: 'mercedes-benz', vito: 'mercedes-benz', sprinter: 'mercedes-benz',
  'serie-1': 'bmw', 'serie-3': 'bmw', x1: 'bmw', x3: 'bmw', cooper: 'mini', countryman: 'mini', mg4: 'mg', zs: 'mg', ds3: 'ds', ds4: 'ds', ds7: 'ds',
};
export function marqueDuModele(modele?: string | null) {
  if (!modele) return null;
  const n = normal(modele);
  return MODELES[n] ?? MODELES[n.split('-').slice(0, 2).join('-')] ?? MODELES[n.split('-')[0]] ?? null;
}

export function logoMarque(marque?: string | null, modele?: string | null) {
  const s = slugMarque(marque) ?? (marque ? null : marqueDuModele(modele));
  return s ? `https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/${s}.png` : null;
}

// Marque et modèle devinés à partir du nom donné au boîtier (« TOYOTA RAV 4 GZ185HD » → Toyota / RAV 4)
const AFFICHAGE: Record<string, string> = { 'mercedes-benz': 'Mercedes', 'land-rover': 'Land Rover', 'alfa-romeo': 'Alfa Romeo', 'aston-martin': 'Aston Martin', 'rolls-royce': 'Rolls-Royce', bmw: 'BMW', mg: 'MG', ds: 'DS', byd: 'BYD' };
const joli = (slug: string) => AFFICHAGE[slug] ?? slug.split('-').map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(' ');
export function devinerMarqueModele(nom?: string | null): { marque: string; modele: string } {
  const propre = String(nom ?? '').replace(/\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b/gi, '').replace(/\s+/g, ' ').trim();
  if (!propre) return { marque: '', modele: '' };
  const mots = propre.split(' ');
  for (const n of [2, 1]) {
    const tete = normal(mots.slice(0, n).join(' '));
    const slug = ALIAS[tete] ?? (MARQUES.includes(tete) ? tete : null);
    if (slug && mots.length > n) return { marque: joli(slug), modele: mots.slice(n).join(' ').replace(/^./, (c) => c.toUpperCase()) };
  }
  const parModele = marqueDuModele(propre);
  return parModele ? { marque: joli(parModele), modele: propre } : { marque: '', modele: propre };
}

// Badge sport, pour le fun : RS chez Audi, AMG chez Mercedes, M chez BMW, GTI ou R chez Volkswagen…
// Déduit de la marque et du modèle saisis (« Audi RS3 », « Mercedes C63 AMG », « Golf 8 GTI »).
export type BadgeSport = { texte: string; fond: string; encre: string };
const ROUGE = { fond: '#e30613', encre: '#fff' }, NOIR = { fond: '#0b0b0b', encre: '#fff' };
export function badgeSport(marque?: string | null, modele?: string | null): BadgeSport | null {
  const slug = slugMarque(marque) ?? (marque ? null : marqueDuModele(modele));
  const m = ` ${normal(`${marque ?? ''} ${modele ?? ''}`).replace(/-/g, ' ')} `;
  const a = (re: RegExp) => re.test(m);
  if (slug === 'audi' && a(/ (rs ?\d|rs ?q\d|rs ?e ?tron|rs) /)) return { texte: 'RS', ...ROUGE };
  if (slug === 'audi' && a(/ (s ?\d|sq\d) /)) return { texte: 'S', fond: '#c0c4c8', encre: '#111' };
  if (slug === 'mercedes-benz' && a(/ (amg|[a-z]{1,3} ?(35|43|45|53|55|63|65)) /)) return { texte: 'AMG', ...NOIR };
  if (slug === 'mercedes-benz' && a(/ brabus /)) return { texte: 'BRABUS', ...NOIR };
  if (slug === 'bmw' && a(/ (m ?\d|x\d ?m|m ?performance|m ?sport|m) /)) return { texte: 'M', fond: 'linear-gradient(90deg,#0166b1 0 33%,#1c2b6b 33% 66%,#e22028 66%)', encre: '#fff' };
  if (slug === 'volkswagen' && a(/ gti /)) return { texte: 'GTI', ...ROUGE };
  if (slug === 'volkswagen' && a(/ gtd /)) return { texte: 'GTD', fond: '#c0c4c8', encre: '#111' };
  if (slug === 'volkswagen' && a(/ (golf|tiguan|arteon|touareg|t roc) .*\br\b|\br line\b|\br \d/)) return { texte: a(/ r line /) ? 'R-Line' : 'R', fond: '#0d3b8c', encre: '#fff' };
  if (slug === 'cupra' || (slug === 'seat' && a(/ cupra /))) return { texte: 'CUPRA', fond: '#a9643c', encre: '#fff' };
  if (slug === 'renault' && a(/ (rs|r s|gordini) /)) return { texte: a(/ gordini /) ? 'Gordini' : 'R.S.', fond: '#f8c300', encre: '#111' };
  if (slug === 'alpine') return { texte: 'A110', fond: '#0a4ea2', encre: '#fff' };
  if (slug === 'peugeot' && a(/ (gti|pse|gt) /)) return { texte: a(/ pse /) ? 'PSE' : a(/ gti /) ? 'GTI' : 'GT', fond: '#111', encre: '#fff' };
  if (slug === 'ford' && a(/ (st|rs|raptor) /)) return { texte: a(/ raptor /) ? 'Raptor' : a(/ rs /) ? 'RS' : 'ST', fond: '#0b2e6f', encre: '#fff' };
  if (slug === 'hyundai' && a(/ (i20 ?n|i30 ?n|kona ?n|ioniq ?5 ?n|n) /)) return { texte: 'N', fond: '#00a3e0', encre: '#fff' };
  if (slug === 'toyota' && a(/ (gr|gr yaris|gr86|supra) /)) return { texte: 'GR', ...ROUGE };
  if (slug === 'honda' && a(/ type ?r /)) return { texte: 'Type R', ...ROUGE };
  if (slug === 'mini' && a(/ (jcw|john cooper works) /)) return { texte: 'JCW', ...ROUGE };
  if (slug === 'fiat' && a(/ abarth /)) return { texte: 'Abarth', ...ROUGE };
  if (slug === 'porsche' && a(/ (gt3|gt2|turbo|gts) /)) return { texte: a(/ gt3 /) ? 'GT3' : a(/ gt2 /) ? 'GT2' : a(/ gts /) ? 'GTS' : 'Turbo', ...NOIR };
  if (slug === 'lamborghini' || slug === 'ferrari' || slug === 'mclaren') return { texte: 'SUPERCAR', fond: '#d4a017', encre: '#111' };
  return null;
}
