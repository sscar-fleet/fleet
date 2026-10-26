// Test du moteur de planning : node scripts/test-planning.mjs
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'fs';
const js = ts.transpileModule(readFileSync('lib/planning.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
writeFileSync('/tmp/planning.mjs', js);
const { planifier, controler } = await import('/tmp/planning.mjs?' + Date.now());
let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC :', m); } };

// Semaine type : 1 dépôt, 3 camions, 12 tournées par jour (4 créneaux par camion) du lundi au samedi, 10 chauffeurs dans 3 villes
const lundi = '2026-11-02';
const jours = Array.from({ length: 6 }, (_, i) => { const d = new Date(lundi + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
const creneaux = [['07:00', '10:30'], ['11:00', '13:30'], ['14:00', '17:00'], ['17:30', '20:30']];
const tournees = []; jours.forEach((j) => creneaux.forEach((c, k) => { for (let n = 0; n < 3; n++) tournees.push({ id: `${j}-${k}-${n}`, jour: j, debut: c[0], fin: c[1], depot_id: 'D1' }); }));
const villes = ['Bretigny', 'Bretigny', 'Bretigny', 'Evry', 'Evry', 'Evry', 'Massy', 'Massy', 'Massy', 'Massy'];
const chauffeurs = villes.map((v, i) => ({ id: 'C' + i, depot_id: 'D1', ville: v }));
chauffeurs.push({ id: 'AUTRE', depot_id: 'D2', ville: 'Bretigny' });
chauffeurs[2].indispos = [{ du: jours[2], au: jours[3] }];
const vehicules = [{ id: 'V1', depot_id: 'D1' }, { id: 'V2', depot_id: 'D1' }, { id: 'V3', depot_id: 'D1' }, { id: 'V4', depot_id: 'D1', disponible: false }];
const t0 = Date.now();
const { affectations, manques } = planifier({ tournees, chauffeurs, vehicules });
console.log(`${tournees.length} tournées planifiées en ${Date.now() - t0} ms, manques : ${manques.length}`);
const plan = tournees.map((t) => ({ ...t, ...affectations.find((a) => a.id === t.id) }));
const alertes = controler({ tournees: plan, chauffeurs });
verif(Object.keys(alertes).length === 0, 'règles respectées : ' + JSON.stringify(alertes).slice(0, 300));
verif(!plan.some((t) => t.chauffeur_id === 'AUTRE'), 'chauffeur d’un autre dépôt jamais utilisé');
verif(!plan.some((t) => t.vehicule_id === 'V4'), 'camion indisponible jamais utilisé');
verif(!plan.some((t) => t.chauffeur_id === 'C2' && (t.jour === jours[2] || t.jour === jours[3])), 'absence respectée');
const conflits = plan.filter((a) => plan.some((b) => b !== a && b.vehicule_id && b.vehicule_id === a.vehicule_id && b.jour === a.jour && b.debut < a.fin && a.debut < b.fin));
verif(conflits.length === 0, 'camion en double : ' + conflits.length);
const compte = {}; plan.forEach((t) => { if (t.chauffeur_id) compte[t.chauffeur_id] = (compte[t.chauffeur_id] ?? 0) + 1; });
const valeurs = chauffeurs.filter((c) => !['AUTRE', 'C2'].includes(c.id)).map((c) => compte[c.id] ?? 0);
console.log('tournées par chauffeur :', JSON.stringify(compte));
verif(Math.max(...valeurs) - Math.min(...valeurs) <= 2, 'équité');
const parJour = {}; plan.forEach((t) => { if (t.chauffeur_id) { const k = t.chauffeur_id + t.jour; parJour[k] = (parJour[k] ?? 0) + 1; } });
const doubles = Object.values(parJour).filter((n) => n === 2).length / Object.values(parJour).length;
console.log('part des journées à 2 créneaux :', Math.round(doubles * 100) + ' %');
verif(doubles > 0.7, 'regroupement des créneaux');
let partages = 0, voisins = 0;
jours.forEach((j) => ['V1', 'V2', 'V3'].forEach((v) => {
  const cs = [...new Set(plan.filter((t) => t.jour === j && t.vehicule_id === v).map((t) => t.chauffeur_id))];
  if (cs.length > 1) { partages++; const vs = new Set(cs.map((c) => chauffeurs.find((x) => x.id === c).ville)); if (vs.size === 1) voisins++; }
}));
console.log(`camions partagés : ${partages}, entre voisins : ${voisins}`);
// Partage entre voisins : à égalité, l'après-midi va au voisin du chauffeur du matin, sur son camion
const pv = planifier({ tournees: [
  { id: 'M', jour: lundi, debut: '07:00', fin: '13:00', depot_id: 'D1', chauffeur_id: 'A', vehicule_id: 'V1', verrouillee: true },
  { id: 'M2', jour: lundi, debut: '07:00', fin: '13:00', depot_id: 'D1', chauffeur_id: 'D', vehicule_id: 'V2', verrouillee: true },
  { id: 'P', jour: lundi, debut: '14:00', fin: '20:00', depot_id: 'D1' }],
  chauffeurs: [{ id: 'A', depot_id: 'D1', ville: 'Évry' }, { id: 'D', depot_id: 'D1', ville: 'Massy' }, { id: 'B', depot_id: 'D1', ville: 'Massy' }, { id: 'C', depot_id: 'D1', ville: 'Evry' }],
  vehicules: [{ id: 'V1', depot_id: 'D1' }, { id: 'V2', depot_id: 'D1' }, { id: 'V3', depot_id: 'D1' }] });
verif(pv.affectations[0].vehicule_id && ['V1', 'V2'].includes(pv.affectations[0].vehicule_id), 'camion repris par un voisin : ' + JSON.stringify(pv.affectations));
const voisinOk = (pv.affectations[0].chauffeur_id === 'C' && pv.affectations[0].vehicule_id === 'V1') || (pv.affectations[0].chauffeur_id === 'B' && pv.affectations[0].vehicule_id === 'V2');
verif(voisinOk, 'le voisin reprend le camion de son voisin');
const v = planifier({ tournees: [{ id: 'X', jour: lundi, debut: '07:00', fin: '10:00', depot_id: 'D1', chauffeur_id: 'C5', vehicule_id: 'V3', verrouillee: true }, { id: 'Y', jour: lundi, debut: '07:00', fin: '10:00', depot_id: 'D1' }], chauffeurs, vehicules });
verif(v.affectations.length === 1 && v.affectations[0].vehicule_id !== 'V3' && v.affectations[0].chauffeur_id !== 'C5', 'verrouillage respecté');
const s = planifier({ tournees: [{ id: 'Z', jour: lundi, debut: '07:00', fin: '10:00' }], chauffeurs: [{ id: 'A' }], vehicules, joursTravailles: { A: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'] } });
verif(s.affectations[0].chauffeur_id === null && s.manques[0].raison.includes('chauffeur'), 'jours d’affilée');
const r = planifier({ tournees: tournees.filter((t) => t.jour === lundi), chauffeurs, vehicules, regles: { creneauxMaxJour: 1, partageCamion: false } });
const planR = tournees.filter((t) => t.jour === lundi).map((t) => ({ ...t, ...r.affectations.find((a) => a.id === t.id) }));
verif(Object.keys(controler({ tournees: planR, chauffeurs, regles: { creneauxMaxJour: 1 } })).length === 0, 'règle 1 créneau');
const multi = ['V1', 'V2', 'V3'].some((x) => new Set(planR.filter((t) => t.vehicule_id === x).map((t) => t.chauffeur_id)).size > 1);
verif(!multi, 'pas de partage quand interdit');
console.log(`${ok} vérifications réussies, ${ko} échecs`);
process.exit(ko ? 1 : 0);
