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
