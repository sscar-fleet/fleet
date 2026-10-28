'use server';
// Écriture de l'import de la flotte, une fois l'aperçu validé par le loueur.
// Règles : rien n'est écrasé (une fiche existante est seulement complétée), rien n'est bloquant
// (une ligne incomplète est mise de côté et listée), et tout passe par les droits de l'agence (RLS).
import { revalidatePath } from 'next/cache';
import { utilisateurCourant } from '@/lib/agence';
import { depuisParis, memePersonne } from '@/lib/format';
import { nettoyerLot, etatLocation, maintenantParis, chiffresTel, LIMITES, type Lot } from '@/lib/importCommun';
import { equipementsDeLAgence, rattacherEquipements } from '@/lib/annuaireSscs';

export type Bilan = {
  vehicules: number; completes: number; sansPlaque: number; cartesGrises: number;
  clients: number; clientsRetrouves: number; locations: number; garage: number; chauffeurs: number;
  aReprendre: string[];
};

const vide = (v: unknown) => v === null || v === undefined || v === '';
// La base renvoie 1 000 lignes au plus par demande : on lit par pages
async function toutLire(requete: (de: number, a: number) => any): Promise<any[]> {
  const tout: any[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await requete(de, de + 999);
    if (error || !data?.length) break;
    tout.push(...data);
    if (data.length < 1000) break;
  }
  return tout;
}

export async function importerFlotte(json: string, sources: { total: number; ratees: number }): Promise<{ bilan?: Bilan; erreur?: string }> {
  try {
    const { supabase, profil, transport } = await utilisateurCourant();
    const agence = profil.agence_id;
    const brut = JSON.parse(json) as Lot;
    const lot = nettoyerLot(brut, 'import');
    // Photos de carte grise : uniquement des fichiers déposés par l'agence pendant l'import
    const cartes = new Map<string, string>();
    for (const v of brut.vehicules ?? []) {
      const p = String(v?.immatriculation ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (p && typeof v?.carte_grise === 'string' && v.carte_grise.startsWith(`${agence}/import/`) && !v.carte_grise.includes('..')) cartes.set(p, v.carte_grise);
    }
    const bilan: Bilan = { vehicules: 0, completes: 0, sansPlaque: 0, cartesGrises: 0, clients: 0, clientsRetrouves: 0, locations: 0, garage: 0, chauffeurs: 0, aReprendre: [] };
    const maintenant = maintenantParis();
    const aujourdhui = maintenant.slice(0, 10);

    // 1. Véhicules : nouveaux créés, existants complétés (jamais écrasés)
    const existants = await toutLire((de, a) => supabase.from('vehicules').select('*').order('id').range(de, a));
    const parPlaque = new Map<string, any>(existants.map((v: any) => [v.immatriculation, v]));
    const nouveaux: any[] = [];
    for (const v of lot.vehicules.slice(0, LIMITES.vehicules)) {
      if (!v.immatriculation) { bilan.sansPlaque++; continue; }
      const champs = {
        marque: v.marque, modele: v.modele, carburant: v.carburant, km: v.km, prix_jour: v.prix_jour, annee: v.annee, couleur: v.couleur,
        assurance_echeance: v.assurance_echeance, ct_echeance: v.ct_echeance, carte_grise_path: cartes.get(v.immatriculation) ?? null,
      };
      const e = parPlaque.get(v.immatriculation);
      const choix = v.visuel !== 'auto' ? { visuel: v.visuel } : {};
      if (e) {
        // Le choix du visuel ne remplace qu'un réglage resté « auto » (rien n'est écrasé)
        if (choix.visuel && e.visuel === 'auto') await supabase.from('vehicules').update(choix).eq('id', e.id);
        // Base pas encore à jour (mise à jour 0026) : pas de colonne annee sur les fiches existantes
        const maj = Object.fromEntries(Object.entries(champs).filter(([k, val]) => !vide(val) && vide(e[k]) && k in e));
        if (Object.keys(maj).length) {
          const { error } = await supabase.from('vehicules').update(maj).eq('id', e.id);
          if (error) bilan.aReprendre.push(`${v.immatriculation} : ${error.message}`);
          else { bilan.completes++; if (maj.carte_grise_path) bilan.cartesGrises++; Object.assign(e, maj); }
        }
      } else if (!nouveaux.some((n) => n.immatriculation === v.immatriculation)) {
        nouveaux.push({ agence_id: agence, immatriculation: v.immatriculation, ...champs, ...choix, date_entree: aujourdhui });
      }
    }
    if (nouveaux.length) {
      const inserer = (lignes: any[]) => supabase.from('vehicules').upsert(lignes, { onConflict: 'agence_id,immatriculation', ignoreDuplicates: true })
        .select('id, immatriculation, km, statut, carte_grise_path');
      let { data, error } = await inserer(nouveaux);
      if (error && /couleur/.test(error.message)) ({ data, error } = await inserer(nouveaux.map(({ couleur, ...reste }) => reste)));
      if (error && /annee|visuel/.test(error.message)) ({ data, error } = await inserer(nouveaux.map(({ annee, visuel, couleur, ...reste }) => reste)));
      if (error) return { erreur: `Import des véhicules impossible : ${error.message}` };
      for (const v of data ?? []) { parPlaque.set(v.immatriculation, v); bilan.vehicules++; if (v.carte_grise_path) bilan.cartesGrises++; }
    }

    // 2. Clients (location) : retrouvés par téléphone, e-mail ou nom ; sinon créés
    const clientsFleet: any[] = [];
    if (!transport && (lot.clients.length || lot.locations.length)) {
      clientsFleet.push(...await toutLire((de, a) => supabase.from('clients').select('id, nom, prenom, telephone, email, date_naissance, numero_permis, adresse').order('id').range(de, a)));
    }
    // Même règle que l'aperçu : deux téléphones différents = deux personnes, même avec le même nom
    const trouver = (c: { nom: string | null; prenom: string | null; telephone: string | null; email?: string | null }) =>
      clientsFleet.find((x) => {
        const a = chiffresTel(x.telephone), b = chiffresTel(c.telephone);
        if (a.length >= 9 && b.length >= 9) return a === b;
        return (!!c.email && !!x.email && x.email.toLowerCase() === c.email) || memePersonne(x, c as any);
      });
    if (!transport) {
      const aCreer: any[] = [];
      for (const c of lot.clients.slice(0, LIMITES.clients)) {
        const e = trouver(c);
        if (e) {
          bilan.clientsRetrouves++;
          const maj = Object.fromEntries(Object.entries({ telephone: c.telephone, email: c.email, date_naissance: c.date_naissance, numero_permis: c.numero_permis, adresse: c.adresse })
            .filter(([k, val]) => !vide(val) && vide(e[k])));
          if (Object.keys(maj).length) { await supabase.from('clients').update(maj).eq('id', e.id); Object.assign(e, maj); }
        } else {
          const fiche = { agence_id: agence, nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email, date_naissance: c.date_naissance, numero_permis: c.numero_permis, adresse: c.adresse };
          aCreer.push(fiche); clientsFleet.push({ ...fiche, id: null });
        }
      }
      for (let i = 0; i < aCreer.length; i += 200) {
        const { data, error } = await supabase.from('clients').insert(aCreer.slice(i, i + 200)).select('id, nom, prenom, telephone, email');
        if (error) { bilan.aReprendre.push(`Clients : ${error.message}`); continue; }
        bilan.clients += data?.length ?? 0;
        for (const d of data ?? []) {
          const x = clientsFleet.find((y) => y.id === null && y.nom === d.nom && (y.prenom ?? null) === (d.prenom ?? null) && (y.telephone ?? null) === (d.telephone ?? null));
          if (x) x.id = d.id;
        }
      }
    }

    // 3. Locations en cours et à venir
    const louees = new Set<string>();
    if (!transport) {
      for (const l of lot.locations.slice(0, LIMITES.locations)) {
        const etat = etatLocation(l, maintenant);
        const nom = `${l.immatriculation ?? 'véhicule ?'} (${[l.client_prenom, l.client_nom].filter(Boolean).join(' ') || 'client ?'})`;
        if (etat === 'terminee') continue;
        if (etat === 'incomplete') { bilan.aReprendre.push(`Location ${nom} : ${!l.fin ? 'date de retour manquante' : 'véhicule ou client manquant'}`); continue; }
        const v = parPlaque.get(l.immatriculation!);
        if (!v?.id) { bilan.aReprendre.push(`Location ${nom} : véhicule non créé`); continue; }
        if (['sorti', 'hors_service'].includes(v.statut)) { bilan.aReprendre.push(`Location ${nom} : ce véhicule est sorti de la flotte ou hors service`); continue; }
        let c = trouver({ nom: l.client_nom, prenom: l.client_prenom, telephone: l.client_telephone });
        if (!c?.id) {
          // Client saisi ou corrigé dans l'aperçu, absent de la liste des clients : créé ici
          const { data: nouveau, error } = await supabase.from('clients').insert({ agence_id: agence, nom: l.client_nom, prenom: l.client_prenom, telephone: l.client_telephone })
            .select('id, nom, prenom, telephone, email').single();
          if (error || !nouveau) { bilan.aReprendre.push(`Location ${nom} : client non créé`); continue; }
          clientsFleet.push(nouveau); c = nouveau; bilan.clients++;
        }
        // Départ inconnu d'une location en cours : ce matin 8 h, ou maintenant si l'import est fait plus tôt
        const huitHeures = `${aujourdhui}T08:00`;
        const debutLocal = l.debut && l.debut <= l.fin! ? l.debut : (etat === 'en_cours' ? (maintenant < huitHeures ? maintenant : huitHeures) : null);
        const debut = depuisParis(debutLocal), fin = depuisParis(l.fin);
        if (!debut || !fin || new Date(fin) <= new Date(debut)) { bilan.aReprendre.push(`Location ${nom} : dates incohérentes`); continue; }
        const { data: deja } = await supabase.from('locations').select('id, numero').eq('vehicule_id', v.id)
          .in('statut', ['reservee', 'en_cours']).lt('debut', fin).gt('fin_prevue', debut).limit(1);
        if (deja?.length) { bilan.aReprendre.push(`Location ${nom} : le véhicule a déjà le contrat n° ${deja[0].numero} sur ces dates`); continue; }
        const { error } = await supabase.from('locations').insert({
          agence_id: agence, vehicule_id: v.id, client_id: c.id, debut, fin_prevue: fin, statut: etat,
          prix_total: l.prix_total, caution_montant: l.caution, caution_statut: etat === 'en_cours' && l.caution ? 'prise' : 'a_prendre',
          km_depart: v.km ?? null, note: `Importée dans Fleet le ${aujourdhui.split('-').reverse().join('/')}${l.debut ? '' : ' (date de départ inconnue)'}`,
        });
        if (error) { bilan.aReprendre.push(`Location ${nom} : ${error.message}`); continue; }
        bilan.locations++;
        if (etat === 'en_cours') { louees.add(v.id); await supabase.from('vehicules').update({ statut: 'loue' }).eq('id', v.id).eq('statut', 'disponible'); }
      }
    }

    // 4. Véhicules au garage : un entretien en cours, la voiture passe « en maintenance »
    const auGarage = lot.vehicules.filter((v) => v.statut === 'garage' && v.immatriculation);
    if (auGarage.length) {
      const ids = auGarage.map((v) => parPlaque.get(v.immatriculation!)?.id).filter(Boolean);
      const { data: ouverts } = await supabase.from('entretiens').select('vehicule_id').in('vehicule_id', ids).in('statut', ['prevu', 'en_cours']);
      const dejaOuverts = new Set((ouverts ?? []).map((e: any) => e.vehicule_id));
      for (const g of auGarage) {
        const v = parPlaque.get(g.immatriculation!);
        if (!v?.id || dejaOuverts.has(v.id) || louees.has(v.id)) continue;
        const { error } = await supabase.from('entretiens').insert({
          agence_id: agence, vehicule_id: v.id, type: 'reparation', raison: 'Au garage (import)', garage: g.garage,
          retour_prevu: g.retour_garage ? depuisParis(`${g.retour_garage}T18:00`) : null, statut: 'en_cours', debut: new Date().toISOString(),
          commentaire: g.note,
        });
        if (error) { bilan.aReprendre.push(`${g.immatriculation} au garage : ${error.message}`); continue; }
        await supabase.from('vehicules').update({ statut: 'maintenance' }).eq('id', v.id).in('statut', ['disponible']);
        bilan.garage++;
      }
    }

    // 5. Chauffeurs (transport)
    if (transport && lot.chauffeurs.length) {
      const { data: deja } = await supabase.from('chauffeurs').select('nom, prenom, telephone');
      const aCreer = lot.chauffeurs.filter((c) => !(deja ?? []).some((d: any) => memePersonne(d, c)))
        .map((c) => ({ agence_id: agence, nom: c.nom, prenom: c.prenom, telephone: c.telephone }));
      if (aCreer.length) {
        const { data, error } = await supabase.from('chauffeurs').insert(aCreer).select('id');
        if (error) bilan.aReprendre.push(`Chauffeurs : ${error.message}`); else bilan.chauffeurs = data?.length ?? 0;
      }
    }

    const resume = [
      bilan.vehicules && `${bilan.vehicules} véhicule${bilan.vehicules > 1 ? 's' : ''}`, bilan.clients && `${bilan.clients} client${bilan.clients > 1 ? 's' : ''}`,
      bilan.locations && `${bilan.locations} location${bilan.locations > 1 ? 's' : ''}`, bilan.garage && `${bilan.garage} au garage`,
      bilan.chauffeurs && `${bilan.chauffeurs} chauffeur${bilan.chauffeurs > 1 ? 's' : ''}`,
    ].filter(Boolean).join(', ');
    await supabase.from('historique').insert({ agence_id: agence, action: 'Flotte importée', detail: resume || 'fiches complétées', auteur: profil.id });
    await supabase.from('imports_flotte').insert({ agence_id: agence, genre: 'import', ok: bilan.aReprendre.length === 0, cree_par: profil.id,
      detail: { ...bilan, aReprendre: bilan.aReprendre.slice(0, 30), sources } }).then(() => null, () => null);
    revalidatePath('/', 'layout');
    return { bilan };
  } catch (e: any) {
    if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    return { erreur: e instanceof SyntaxError ? 'Aperçu illisible : rechargez la page.' : (e?.message || 'Import impossible.') };
  }
}

// Client SS CAR SYSTEM reconnu (même adresse e-mail de connexion) : ses véhicules équipés arrivent reliés à leurs boîtiers
export async function ajouterEquipementsSscs(): Promise<{ ajoutes?: number; relies?: number; erreur?: string }> {
  try {
    const { supabase, profil } = await utilisateurCourant();
    if (profil.role !== 'gerant') return { erreur: 'Seul le gérant peut rattacher les boîtiers.' };
    const trouve = await equipementsDeLAgence(supabase);
    if (!trouve) return { erreur: 'Aucun véhicule équipé SS CAR SYSTEM trouvé à votre nom.' };
    const r = await rattacherEquipements(profil.agence_id, trouve.client, trouve.vehicules, profil.id);
    revalidatePath('/', 'layout');
    return r;
  } catch (e: any) {
    if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    return { erreur: e?.message || 'Rattachement impossible.' };
  }
}


