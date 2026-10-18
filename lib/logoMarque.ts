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

export function logoMarque(marque?: string | null) {
  const s = slugMarque(marque);
  return s ? `https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/${s}.png` : null;
}
