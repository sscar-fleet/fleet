// Cahier de tests de l'ANTAI (20250613_CahierDeTests_GPC_v2.3) joué automatiquement en sandbox.
// Les 62 tests sont répartis en 5 étapes (une étape = un appel serveur de moins d'une minute).
// Chaque requête et chaque réponse sont gardées pour remplir le cahier à renvoyer à l'ANTAI.
import { supabaseAdmin } from './supabaseAdmin';
import { init, login, appel, lireContexte, ecrireContexte, lireDossier, Reponse, ErreurAntai } from './antai';

const ENV = 'sandbox' as const;
type Ctx = Record<string, any>;
type Test = { n: number; route: string; attendu: number | number[]; obligatoire?: boolean; lancer: (c: Ctx) => Promise<Reponse | string>; apres?: (r: Reponse, c: Ctx) => void };

// Plaques fictives au format SIV, nouvelles à chaque passage (évite « déjà saisi par votre société »)
function plaques(): string[] {
  const L = 'BCDFGHJKLMNPRSTVWXZ';
  const l = () => L[Math.floor(Math.random() * L.length)];
  const base = `${l()}${l()}`;
  const n = 100 + Math.floor(Math.random() * 800);
  return Array.from({ length: 8 }, (_, i) => `${base}${n + i}${l()}${l()}`);
}

const ADRESSE = { numeroVoie: '12', voie: 'RUE DE TEST', codePostal: '75015', ville: 'PARIS', pays: 'FRA' };
const FLOTTE_CLIENT = { nom: 'SOCIETE CLIENTE TEST', siret: '79773190800019', courriel: 'test@sscarfleet.com', adresse: ADRESSE };
const physique = (id: number, modif: (d: any) => void = () => {}) => {
  const d: any = {
    identifiantDesignation: id, statut: 'DESIGNATION', flotteClient: { ...FLOTTE_CLIENT },
    detenteur: { civilite: 'M.', nom: 'MARTIN', prenom: 'Karim', courriel: 'conducteur.test@sscarfleet.com', adresse: { ...ADRESSE }, dateNaissance: '1985-04-12', lieuNaissance: 'PARIS' },
    permisDesigne: { numeroPermis: '051227308989', dateDelivrance: '2005-06-01', lieuDelivrance: 'PARIS', nationalite: 'FRA' },
  };
  modif(d);
  return d;
};
const morale = (id: number, modif: (d: any) => void = () => {}) => {
  const d: any = {
    identifiantDesignation: id, statut: 'DESIGNATION', flotteClient: { ...FLOTTE_CLIENT },
    detenteur: { civilite: 'SOCIETE', nom: 'ENTREPRISE TEST', siret: '79773190800020', courriel: 'societe.test@sscarfleet.com', adresse: { ...ADRESSE } },
  };
  modif(d);
  return d;
};
const veh = (immat: string, x: any = {}) => ({ immatriculation: immat, paysImmatriculation: 'FRA', ...x });
const LONG = 'X'.repeat(30);

export const ETAPES: { titre: string; tests: Test[] }[] = [
  {
    titre: '1. Connexion et création de véhicules',
    tests: [
      { n: 1, route: 'GET Init', attendu: 200, obligatoire: true, lancer: async (c) => { c.p = plaques(); return init(ENV); } },
      { n: 2, route: 'POST Login Loueur', attendu: 200, obligatoire: true, lancer: () => login(ENV) },
      { n: 3, route: 'POST Créer un véhicule', attendu: 200, obligatoire: true, lancer: (c) => appel('POST', '/vehicule', veh(c.p[0], { marque: 'Peugeot', modele: '208' }), { env: ENV }) },
      { n: 4, route: 'POST Créer un véhicule (déjà dans une autre société)', attendu: 400, lancer: () => appel('POST', '/vehicule', veh('DC789HD'), { env: ENV }), apres: (r, c) => { if (r.statut === 200) c.nettoyer = ['DC789HD']; } },
      { n: 5, route: 'POST Créer un véhicule (déjà dans notre société)', attendu: 400, lancer: (c) => appel('POST', '/vehicule', veh(c.p[0]), { env: ENV }) },
      { n: 6, route: 'POST Créer un véhicule (pays non conforme)', attendu: 400, lancer: (c) => appel('POST', '/vehicule', veh(c.p[7], { paysImmatriculation: 'FR' }), { env: ENV }) },
      { n: 7, route: 'POST Créer un véhicule (immatriculation incorrecte)', attendu: 400, lancer: () => appel('POST', '/vehicule', veh('@@-***-##'), { env: ENV }) },
      { n: 8, route: 'POST Créer un véhicule (immatriculation trop longue)', attendu: 400, lancer: () => appel('POST', '/vehicule', veh('AB123CDAB123CDAB123CD'), { env: ENV }) },
      { n: 9, route: 'POST Créer un véhicule (marque trop longue)', attendu: 400, lancer: (c) => appel('POST', '/vehicule', veh(c.p[7], { marque: LONG }), { env: ENV }) },
      { n: 10, route: 'POST Créer un véhicule (modèle trop long)', attendu: 400, lancer: (c) => appel('POST', '/vehicule', veh(c.p[7], { modele: LONG }), { env: ENV }) },
      { n: 11, route: 'POST Créer un véhicule (pays absent)', attendu: 400, lancer: (c) => appel('POST', '/vehicule', { immatriculation: c.p[7] }, { env: ENV }) },
      { n: 12, route: 'POST Créer un véhicule (immatriculation absente)', attendu: 400, lancer: () => appel('POST', '/vehicule', { paysImmatriculation: 'FRA' }, { env: ENV }) },
      { n: 22, route: 'GET Récupérer un véhicule', attendu: 200, obligatoire: true, lancer: (c) => appel('GET', `/vehicule?immatriculation=${c.p[0]}&paysImmatriculation=FRA`, undefined, { env: ENV }) },
      { n: 23, route: 'GET Récupérer un véhicule (introuvable)', attendu: 404, lancer: () => appel('GET', '/vehicule?immatriculation=ZZ999ZZ&paysImmatriculation=FRA', undefined, { env: ENV }) },
    ],
  },
  {
    titre: '2. Flotte de véhicules',
    tests: [
      { n: 27, route: 'POST Création de plusieurs véhicules', attendu: 200, obligatoire: true, lancer: (c) => appel('POST', '/flotte/vehicules', [veh(c.p[1]), veh(c.p[2]), veh(c.p[3])], { env: ENV }) },
      { n: 28, route: 'POST Création de plusieurs véhicules (avec erreurs)', attendu: 200, lancer: (c) => appel('POST', '/flotte/vehicules', [veh(c.p[1]), veh(c.p[7], { paysImmatriculation: 'FR' }), veh('@@@')], { env: ENV }) },
      { n: 30, route: 'GET Récupérer une flotte de véhicule', attendu: 200, obligatoire: true, lancer: () => appel('GET', '/flotte/vehicules?sort=id&desc=false&page=0&nombreParPage=1000', undefined, { env: ENV }) },
      { n: 31, route: 'GET Récupérer une flotte (tri incorrect)', attendu: 400, lancer: () => appel('GET', '/flotte/vehicules?sort=inconnu&desc=false&page=0&nombreParPage=1000', undefined, { env: ENV }) },
      { n: 32, route: 'GET Récupérer une flotte (page non numérique)', attendu: 400, lancer: () => appel('GET', '/flotte/vehicules?sort=id&desc=false&page=abc&nombreParPage=1000', undefined, { env: ENV }) },
      { n: 33, route: 'GET Récupérer une flotte (sens du tri incorrect)', attendu: 400, lancer: () => appel('GET', '/flotte/vehicules?sort=id&desc=peutetre&page=0&nombreParPage=1000', undefined, { env: ENV }) },
      { n: 34, route: 'POST Création de plusieurs véhicules en mode asynchrone', attendu: 200, lancer: (c) => appel('POST', '/flotte/vehiculesAsync', [veh(c.p[4]), veh(c.p[5])], { env: ENV }),
        apres: (r, c) => { c.async = r.corps?.identifiant ?? r.corps?.id ?? (typeof r.corps === 'string' ? r.corps : null); } },
      { n: 35, route: "GET État d'insertion d'une flotte", attendu: 200, lancer: async (c) => { await new Promise((ok) => setTimeout(ok, 2500)); return appel('GET', `/flotte/vehicules/identifiant?identifiant=${encodeURIComponent(c.async ?? '')}&withDetail=true&sort=id&desc=false&page=0&nombreParPage=20`, undefined, { env: ENV }); } },
      { n: 36, route: "GET État d'insertion (identifiant incorrect)", attendu: 400, lancer: () => appel('GET', '/flotte/vehicules/identifiant?identifiant=identifiant-faux&withDetail=true&sort=id&desc=false&page=0&nombreParPage=20', undefined, { env: ENV }) },
      { n: 37, route: "GET État d'insertion (tri incorrect)", attendu: 400, lancer: (c) => appel('GET', `/flotte/vehicules/identifiant?identifiant=${encodeURIComponent(c.async ?? '')}&withDetail=true&sort=inconnu&desc=false&page=0&nombreParPage=20`, undefined, { env: ENV }) },
      { n: 38, route: "GET État d'insertion (paramètre incorrect)", attendu: 400, lancer: (c) => appel('GET', `/flotte/vehicules/identifiant?identifiant=${encodeURIComponent(c.async ?? '')}&withDetail=peutetre&sort=id&desc=false&page=0&nombreParPage=20`, undefined, { env: ENV }) },
      { n: 39, route: "GET État d'insertion (nombreParPage < 20)", attendu: 400, lancer: (c) => appel('GET', `/flotte/vehicules/identifiant?identifiant=${encodeURIComponent(c.async ?? '')}&withDetail=true&sort=id&desc=false&page=0&nombreParPage=5`, undefined, { env: ENV }) },
      { n: 40, route: "GET État d'insertion (paramètre manquant)", attendu: 400, lancer: (c) => appel('GET', `/flotte/vehicules/identifiant?identifiant=${encodeURIComponent(c.async ?? '')}&sort=id&desc=false&page=0&nombreParPage=20`, undefined, { env: ENV }) },
    ],
  },
  {
    titre: '3. Infractions',
    tests: [
      { n: 41, route: "POST Création d'infractions pour test", attendu: 200, obligatoire: true, lancer: async () => {
        const r = await appel('POST', '/editeur/infraction', undefined, { env: ENV });
        return r.statut === 404 ? appel('POST', '/editeur/infraction', undefined, { env: ENV, sansVersion: true }) : r;
      } },
      { n: 42, route: "GET Récupérer une liste d'infractions", attendu: 200, obligatoire: true, lancer: async () => { await new Promise((ok) => setTimeout(ok, 2000)); return appel('GET', '/infractions?sort=dateInfraction&desc=true&page=0&nombreParPage=1000', undefined, { env: ENV }); },
        apres: (r, c) => {
          const liste = (r.corps?.infractions ?? []).map(lireDossier);
          const nous = new Set((c.p ?? []) as string[]);
          const tri = [...liste.filter((d: any) => nous.has(d.immatriculation)), ...liste.filter((d: any) => !nous.has(d.immatriculation))].filter((d: any) => d.identifiantDesignation);
          c.ids = tri.slice(0, 4).map((d: any) => Number(d.identifiantDesignation));
          c.aco = tri[0]?.numeroDossier ?? null;
          c.nbInfractions = liste.length;
        } },
      { n: 43, route: "GET Liste d'infractions (paramètre manquant)", attendu: 400, lancer: () => appel('GET', '/infractions?sort=dateInfraction&desc=false&page=0', undefined, { env: ENV }) },
      { n: 44, route: "GET Liste d'infractions (tri incorrect)", attendu: 400, lancer: () => appel('GET', '/infractions?sort=inconnu&desc=false&page=0&nombreParPage=1000', undefined, { env: ENV }) },
      { n: 45, route: "GET Récupérer un dossier d'infraction", attendu: 200, obligatoire: true, lancer: async (c) => c.aco ? appel('GET', `/infraction/${c.aco}`, undefined, { env: ENV }) : 'Aucune infraction disponible (étape 41/42 à refaire).' },
      { n: 46, route: "GET Dossier d'infraction (ACO introuvable)", attendu: 404, lancer: () => appel('GET', '/infraction/9999999999', undefined, { env: ENV }) },
      { n: 47, route: "GET Dossier d'infraction (ACO incorrect)", attendu: 400, lancer: () => appel('GET', '/infraction/ABC', undefined, { env: ENV }) },
    ],
  },
  {
    titre: '4. Désignations',
    tests: [
      { n: 48, route: 'POST Créer une désignation', attendu: 200, obligatoire: true, lancer: async (c) => c.ids?.[0] ? appel('POST', '/designation', physique(c.ids[0]), { env: ENV }) : 'Aucun identifiant de désignation (étape 3 à refaire).' },
      { n: 49, route: 'POST Désignation (format incorrect)', attendu: 400, lancer: async (c) => c.ids?.[1] ? appel('POST', '/designation', physique(c.ids[1], (d) => { d.detenteur.dateNaissance = '12/04/1985'; d.detenteur.civilite = 'MONSIEUR'; }), { env: ENV }) : 'Pas de 2e infraction.' },
      { n: 50, route: 'POST Désignation (déjà faite)', attendu: 400, lancer: async (c) => c.ids?.[0] ? appel('POST', '/designation', physique(c.ids[0]), { env: ENV }) : 'Pas d\'infraction.' },
      { n: 51, route: 'POST Désignation (identifiant inconnu)', attendu: 400, lancer: () => appel('POST', '/designation', physique(1), { env: ENV }) },
      { n: 52, route: 'POST Désignation (conducteur absent)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { delete d.detenteur; }), { env: ENV }) },
      { n: 53, route: 'POST Désignation (adresse absente)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { delete d.detenteur.adresse; }), { env: ENV }) },
      { n: 54, route: 'POST Désignation (e-mail incorrect)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { d.flotteClient.courriel = 'pas-un-email'; }), { env: ENV }) },
      { n: 55, route: 'POST Désignation (SIRET pour une personne physique)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { d.detenteur.siret = '79773190800020'; }), { env: ENV }) },
      { n: 56, route: 'POST Désignation (âge invalide)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { d.detenteur.dateNaissance = '1890-01-01'; }), { env: ENV }) },
      { n: 57, route: 'POST Désignation (date du permis incohérente)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { d.permisDesigne.dateDelivrance = '1980-01-01'; }), { env: ENV }) },
      { n: 58, route: 'POST Désignation (prénom manquant)', attendu: 400, lancer: async (c) => appel('POST', '/designation', physique(c.ids?.[1] ?? 1, (d) => { delete d.detenteur.prenom; }), { env: ENV }) },
      { n: 59, route: 'POST Désignation (SIRET manquant, personne morale)', attendu: 400, lancer: async (c) => appel('POST', '/designation', morale(c.ids?.[1] ?? 1, (d) => { delete d.detenteur.siret; }), { env: ENV }) },
      { n: 60, route: 'POST Désignation (permis pour une personne morale)', attendu: 400, lancer: async (c) => appel('POST', '/designation', morale(c.ids?.[1] ?? 1, (d) => { d.permisDesigne = { numeroPermis: '051227308989', dateDelivrance: '2005-06-01', lieuDelivrance: 'PARIS', nationalite: 'FRA' }; }), { env: ENV }) },
      { n: 61, route: 'POST Désignation (SIRET non conforme)', attendu: 400, lancer: async (c) => appel('POST', '/designation', morale(c.ids?.[1] ?? 1, (d) => { d.detenteur.siret = '123'; }), { env: ENV }) },
      { n: 62, route: "POST Récupérer l'état des désignations", attendu: 200, obligatoire: true, lancer: async (c) => appel('POST', '/statutInfractions', { identifiantDesignation: (c.ids ?? []).slice(0, 2).length ? c.ids.slice(0, 2) : [1] }, { env: ENV }) },
    ],
  },
  {
    titre: '5. Sortie de flotte',
    tests: [
      { n: 13, route: 'PUT Désactiver un véhicule', attendu: 200, obligatoire: true, lancer: (c) => appel('PUT', '/vehicule', { vehicule: veh(c.p[0]) }, { env: ENV }) },
      { n: 14, route: 'PUT Désactiver un véhicule (date de fin incohérente)', attendu: 400, lancer: (c) => appel('PUT', '/vehicule', { vehicule: veh(c.p[1]), date_fin_gestion: '2020-01-01T00:00:00.000Z' }, { env: ENV }) },
      { n: 15, route: 'PUT Désactiver un véhicule (introuvable)', attendu: 404, lancer: () => appel('PUT', '/vehicule', { vehicule: veh('ZZ999ZZ') }, { env: ENV }) },
      { n: 16, route: 'PUT Désactiver un véhicule (immatriculation trop longue)', attendu: 400, lancer: () => appel('PUT', '/vehicule', { vehicule: veh('AB123CDAB123CDAB123CD') }, { env: ENV }) },
      { n: 17, route: 'PUT Désactiver un véhicule (pays non conforme)', attendu: 400, lancer: (c) => appel('PUT', '/vehicule', { vehicule: veh(c.p[1], { paysImmatriculation: 'FR' }) }, { env: ENV }) },
      { n: 18, route: 'PUT Désactiver un véhicule (marque trop longue)', attendu: 400, lancer: (c) => appel('PUT', '/vehicule', { vehicule: veh(c.p[1], { marque: LONG }) }, { env: ENV }) },
      { n: 19, route: 'PUT Désactiver un véhicule (modèle trop long)', attendu: 400, lancer: (c) => appel('PUT', '/vehicule', { vehicule: veh(c.p[1], { modele: LONG }) }, { env: ENV }) },
      { n: 20, route: 'PUT Désactiver un véhicule (immatriculation absente)', attendu: 400, lancer: () => appel('PUT', '/vehicule', { vehicule: { paysImmatriculation: 'FRA' } }, { env: ENV }) },
      { n: 21, route: 'PUT Désactiver un véhicule (pays absent)', attendu: 400, lancer: (c) => appel('PUT', '/vehicule', { vehicule: { immatriculation: c.p[1] } }, { env: ENV }) },
      { n: 24, route: 'GET Récupérer un véhicule (désactivé)', attendu: 404, lancer: (c) => appel('GET', `/vehicule?immatriculation=${c.p[0]}&paysImmatriculation=FRB`, undefined, { env: ENV }) },
      { n: 25, route: 'PUT Désactiver une liste de véhicules', attendu: 200, obligatoire: true, lancer: (c) => appel('PUT', '/vehicules/desactiver', [{ vehicule: veh(c.p[1]) }, { vehicule: veh(c.p[2]) }], { env: ENV }) },
      { n: 26, route: 'PUT Désactiver une liste (avec erreurs)', attendu: 200, lancer: (c) => appel('PUT', '/vehicules/desactiver', [{ vehicule: veh('ZZ999ZZ') }, { vehicule: veh(c.p[3], { paysImmatriculation: 'FR' }) }, { vehicule: veh(c.p[3]), date_fin_gestion: '2020-01-01T00:00:00.000Z' }], { env: ENV }) },
      { n: 29, route: 'PUT Désactiver une flotte de véhicules', attendu: 200, lancer: async (c) => {
        // Nettoyage éventuel du véhicule d'une autre société créé par erreur au test 4
        for (const p of c.nettoyer ?? []) await appel('PUT', '/vehicule', { vehicule: veh(p) }, { env: ENV });
        return appel('PUT', '/flotte/vehicules/desactiver', undefined, { env: ENV });
      } },
    ],
  },
];

export const NUMEROS_OBLIGATOIRES = ETAPES.flatMap((e) => e.tests.filter((t) => t.obligatoire).map((t) => t.n));

const texteRequete = (r: Reponse) => `${r.requete.methode} ${r.requete.url}${r.requete.corps !== undefined ? '\n' + JSON.stringify(r.requete.corps, null, 1) : ''}`;
const texteReponse = (r: Reponse) => `HTTP ${r.statut}\n${(typeof r.corps === 'object' && r.corps !== null ? JSON.stringify(r.corps, null, 1) : r.texte).slice(0, 6000)}`;

// Joue une étape et enregistre chaque résultat. S'arrête si la connexion échoue (jamais d'insistance).
export async function lancerEtape(i: number): Promise<{ ok: number; ko: number; erreur?: string }> {
  const etape = ETAPES[i];
  if (!etape) return { ok: 0, ko: 0, erreur: 'Étape inconnue.' };
  const c: Ctx = i === 0 ? {} : await lireContexte(ENV);
  if (i > 0 && !c.p) return { ok: 0, ko: 0, erreur: 'Lancez d\'abord l\'étape 1.' };
  let ok = 0, ko = 0;
  const admin = supabaseAdmin();
  for (const t of etape.tests) {
    let r: Reponse | string;
    try { r = await t.lancer(c); }
    catch (e: any) {
      await admin.from('antai_tests').upsert({ env: ENV, numero: t.n, route: t.route, attendu: String(t.attendu), ok: false, statut: (e as ErreurAntai).statut ?? null, requete: null, reponse: null, remarque: e?.message ?? String(e), lance_le: new Date().toISOString() });
      ko++;
      await ecrireContexte(c, ENV);
      return { ok, ko, erreur: e?.message ?? String(e) };
    }
    if (typeof r === 'string') {
      await admin.from('antai_tests').upsert({ env: ENV, numero: t.n, route: t.route, attendu: String(t.attendu), ok: false, statut: null, requete: null, reponse: null, remarque: r, lance_le: new Date().toISOString() });
      ko++; continue;
    }
    try { t.apres?.(r, c); } catch { /* sans effet sur le résultat */ }
    const attendus = Array.isArray(t.attendu) ? t.attendu : [t.attendu];
    const reussi = attendus.includes(r.statut);
    reussi ? ok++ : ko++;
    await admin.from('antai_tests').upsert({
      env: ENV, numero: t.n, route: t.route, attendu: attendus.join(' ou '), ok: reussi, statut: r.statut,
      requete: texteRequete(r), reponse: texteReponse(r), remarque: null, lance_le: new Date().toISOString(),
    });
    // Connexion refusée : on s'arrête aussitôt pour ne pas risquer de bloquer le compte
    if (t.n === 2 && r.statut !== 200) { await ecrireContexte(c, ENV); return { ok, ko, erreur: 'Connexion refusée par l\'ANTAI : vérifiez l\'identifiant et le mot de passe dans Vercel.' }; }
  }
  await ecrireContexte(c, ENV);
  return { ok, ko };
}
