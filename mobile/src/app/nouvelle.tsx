// Nouvelle location en 4 gestes : quand → quelle voiture (seules les libres sont proposées) → quel client → prix.
// Tout se fait par des choix ; on ne tape que le strict nécessaire. Marche sans réseau.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, Carte, GrosBouton, Ligne, Texte, Titre, Vide, Chargement, Etapes, Etiquette, Rangee } from '@/composants/ui';
import { Champ, Puce, Puces, Recherche } from '@/composants/champs';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Fenetre from '@/composants/Fenetre';
import Icone from '@/composants/Icone';
import { useToast } from '@/composants/Toast';
import { chargerVehicules, chargerClients, chargerLocations, chevauche, type VehiculeLigne, type ClientLigne, type LocationLigne } from '@/lib/donnees';
import { garder, mettreEnFile } from '@/lib/hors-ligne';
import { nouvelId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { signatureDistance } from '@/lib/capacites';
import { lirePapier } from '@/lib/ia';
import { prendrePhoto } from '@/lib/photo';
import { urlSite } from '@/lib/site';
import { ouvrirWhatsApp, msg } from '@/lib/messages';
import { euros, jour, heure, nomClient, nomVehicule } from '@/lib/format';

const ETAPES = ['Quand', 'Voiture', 'Client', 'Prix'] as const;
const RAPIDES = [['maintenant', 'Maintenant'], ['h1', 'Dans 1 h'], ['0-18', 'Ce soir 18 h'], ['1-9', 'Demain 9 h'], ['1-14', 'Demain 14 h'], ['2-9', 'Après-demain 9 h']] as const;
const DUREES = [[1, '1 jour'], [2, '2 j'], [3, '3 j'], [4, '4 j'], [5, '5 j'], [7, '1 sem.'], [14, '2 sem.'], [30, '1 mois']] as const;

function depart(choix: string) {
  const d = new Date();
  if (choix === 'maintenant') { d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; }
  if (choix === 'h1') { d.setHours(d.getHours() + 1, 0, 0, 0); return d; }
  const [j, h] = choix.split('-').map(Number); // « 1-9 » = demain 9 h
  d.setDate(d.getDate() + j); d.setHours(h, 0, 0, 0); return d;
}
const joursProches = Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; });

export default function NouvelleLocation() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil } = useSession();
  const params = useLocalSearchParams<{ vehicule?: string; client?: string }>();
  const [etape, setEtape] = useState(0);
  const [vehicules, setVehicules] = useState<VehiculeLigne[]>();
  const [occupations, setOccupations] = useState<LocationLigne[]>([]);
  const [clients, setClients] = useState<ClientLigne[]>();
  const [vehicule, setVehicule] = useState<VehiculeLigne>();
  const [client, setClient] = useState<ClientLigne>();
  const [nouveau, setNouveau] = useState(false);
  const [nc, setNc] = useState({ prenom: '', nom: '', telephone: '' });
  const [permis, setPermis] = useState<string>();
  const [lecture, setLecture] = useState(false);
  const [q, setQ] = useState('');
  const [qv, setQv] = useState('');
  const [quand, setQuand] = useState<string>('maintenant');
  const [autre, setAutre] = useState<{ jour: number; heure: number } | null>(null);
  const [jours, setJours] = useState(1);
  const [prix, setPrix] = useState('');
  const [prixTouche, setPrixTouche] = useState(false);
  const [caution, setCaution] = useState('');
  const [kmInclus, setKmInclus] = useState('');
  const [question, setQuestion] = useState<null | 'caution' | 'noire'>(null);
  const [cree, setCree] = useState<{ id: string; jeton: string | null; loc: any } | null>(null);
  const [distance, setDistance] = useState(false);

  useEffect(() => {
    signatureDistance().then(setDistance);
    chargerVehicules().then((r) => { setVehicules(r.donnees); if (params.vehicule) setVehicule(r.donnees.find((v) => v.id === params.vehicule)); }).catch(() => setVehicules([]));
    chargerLocations().then((r) => setOccupations(r.donnees)).catch(() => {});
    chargerClients().then((r) => { setClients(r.donnees); if (params.client) setClient(r.donnees.find((x) => x.id === params.client)); }).catch(() => setClients([]));
  }, [params.vehicule, params.client]);

  const debut = useMemo(() => {
    if (!autre) return depart(quand);
    const d = new Date(joursProches[autre.jour]); d.setHours(autre.heure, 0, 0, 0); return d;
  }, [quand, autre]);
  const fin = useMemo(() => new Date(debut.getTime() + jours * 864e5), [debut, jours]);

  // Pourquoi une voiture n'est pas libre sur ces dates
  const indispo = (v: VehiculeLigne): string | null => {
    if (v.statut === 'maintenance') return 'À l’atelier';
    if (v.statut === 'hors_service') return 'Hors service';
    // Une voiture en retard n'est pas revenue : elle reste occupée tant que le retour n'est pas fait
    const finReelle = (o: LocationLigne) => o.statut === 'en_cours' && new Date(o.fin_prevue).getTime() < Date.now() + 3600e3 ? new Date(Date.now() + 3600e3).toISOString() : o.fin_prevue;
    const conflit = occupations.find((o) => o.vehicules?.id === v.id && chevauche(debut, fin, o.debut, finReelle(o)));
    if (conflit) return conflit.statut === 'en_cours' ? (new Date(conflit.fin_prevue).getTime() < Date.now() ? 'Pas encore rendue (retour en retard)' : `Louée jusqu’au ${jour(conflit.fin_prevue)} ${heure(conflit.fin_prevue)}`) : `Réservée (n° ${conflit.numero ?? '—'}) du ${jour(conflit.debut)}`;
    return null;
  };
  const liste = (vehicules ?? []).filter((v) => !qv || `${v.immatriculation}${v.marque}${v.modele}`.toLowerCase().replace(/[\s-]/g, '').includes(qv.toLowerCase().replace(/[\s-]/g, '')));
  const libres = liste.filter((v) => !indispo(v)).sort((a, b) => Number(a.prix_jour ?? 0) - Number(b.prix_jour ?? 0));
  const prises = liste.filter((v) => indispo(v));
  useEffect(() => { if (vehicule && indispo(vehicule)) setVehicule(undefined); }, [debut, fin]); // eslint-disable-line

  const prixAuto = vehicule?.prix_jour ? Number(vehicule.prix_jour) * jours : null;
  useEffect(() => { if (!prixTouche) setPrix(prixAuto != null ? String(prixAuto) : ''); }, [prixAuto, prixTouche]);

  const cherche = q.toLowerCase().replace(/\s/g, '');
  const clientsFiltres = (clients ?? []).filter((x) => !cherche || `${x.prenom ?? ''}${x.nom}${x.telephone ?? ''}`.toLowerCase().replace(/\s/g, '').includes(cherche)).slice(0, 40);
  const clientPret = !!client || (nouveau && !!nc.nom.trim() && !!nc.telephone.trim());
  const nomChoisi = client ? nomClient(client) : `${nc.prenom} ${nc.nom}`.trim();

  async function scannerPermis() {
    const p = await prendrePhoto({ pourIa: true, qualite: 0.7 });
    if (!p) return;
    setPermis(p.uri);
    if (!p.dataUrl) return;
    setLecture(true);
    try {
      const ch = await lirePapier(p.dataUrl, 'permis');
      setNc((x) => ({ ...x, nom: String(ch.nom ?? x.nom ?? ''), prenom: String(ch.prenom ?? x.prenom ?? '') }));
      toast('Permis lu : vérifiez le nom');
    } catch (e: any) { toast(e.message ?? 'Lecture impossible, remplissez à la main', 'info'); }
    setLecture(false);
  }

  function choisirClient(x: ClientLigne) {
    setClient(x);
    if (x.liste_noire) setQuestion('noire'); else setEtape(3);
  }

  async function creer() {
    if (!vehicule || !profil) return;
    let clientId = client?.id;
    let clientObj: any = client;
    if (!clientId) {
      clientId = nouvelId();
      const champs: Record<string, unknown> = { id: clientId, agence_id: profil.agence_id, nom: nc.nom.trim().toUpperCase(), prenom: nc.prenom.trim() || null, telephone: nc.telephone.trim() || null };
      await mettreEnFile({ genre: 'ajout', table: 'clients', champs });
      if (permis) {
        const chemin = `${profil.agence_id}/clients/${clientId}/permis-${Date.now()}.jpg`;
        await mettreEnFile({ genre: 'fichier', chemin, uri: permis, type: 'image/jpeg', ensuite: { genre: 'maj', table: 'clients', id: clientId, champs: { permis_path: chemin } } });
      }
      clientObj = { ...champs, email: null, permis_path: permis ? 'x' : null, piece_identite_path: null, liste_noire: false };
    }
    const id = nouvelId();
    const jeton = distance ? nouvelId() : null;
    const loc = { id, agence_id: profil.agence_id, vehicule_id: vehicule.id, client_id: clientId, debut: debut.toISOString(), fin_prevue: fin.toISOString(),
      prix_total: prix ? Number(prix.replace(',', '.')) : null, caution_montant: caution ? Number(caution) : null,
      km_inclus: kmInclus ? Number(kmInclus) : null, km_depart: vehicule.km ?? null, ...(jeton ? { jeton_signature: jeton } : {}) };
    await mettreEnFile({ genre: 'ajout', table: 'locations', champs: loc });
    // La fiche s'affiche tout de suite, même avant l'envoi
    const fiche = { ...loc, numero: null, statut: 'reservee', caution_statut: 'a_prendre', prix_km_sup: null, carburant_depart: null, signature_contrat_path: null, vehicules: vehicule, clients: clientObj, etats_des_lieux: [] };
    await garder('location-' + id, fiche);
    setCree({ id, jeton, loc: fiche });
  }

  // --- C'est créé : on enchaîne
  if (cree) {
    const bientot = debut.getTime() - Date.now() < 2 * 3600e3;
    const tel = cree.loc.clients?.telephone;
    return (
      <Ecran titre="Location créée" sousTitre={`${nomChoisi} · ${nomVehicule(vehicule)}`}
        bas={<>
          {bientot ? <GrosBouton icone="photo" titre="Faire l’état des lieux maintenant" onPress={() => router.replace({ pathname: '/edl/[id]', params: { id: cree.id, type: 'depart' } })} /> : null}
          <GrosBouton secondaire={bientot} titre="Voir la location" onPress={() => router.replace({ pathname: '/location/[id]', params: { id: cree.id } })} />
        </>}>
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: c.accent + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.accent + '66' }}>
            <Icone nom="ok" couleur={c.accent} taille={48} epaisseur={3} />
          </View>
        </View>
        <Carte style={{ paddingVertical: 4 }}>
          <Rangee icone="calendrier" couleur={c.accent} titre={`${jour(debut.toISOString())} ${heure(debut.toISOString())}`} sous={`Retour ${jour(fin.toISOString())} ${heure(fin.toISOString())}`} />
          <Rangee fin icone="euro" couleur={c.accent} titre={prix ? euros(Number(prix.replace(',', '.'))) : 'Prix à définir'} sous={caution ? `Caution ${euros(Number(caution))}` : 'Sans caution'} />
        </Carte>
        {cree.jeton && <>
          <Titre>Gagnez du temps au comptoir</Titre>
          <Carte>
            <Texte gras>Faites signer le contrat avant son arrivée</Texte>
            <Texte gris taille={15}>{nomChoisi.split(' ')[0]} reçoit un lien, lit le contrat et signe sur son téléphone. Le jour J, il ne reste que l’état des lieux.</Texte>
            <GrosBouton icone="whatsapp" titre="Envoyer par WhatsApp" onPress={() => ouvrirWhatsApp(tel, msg.signature(cree.loc, urlSite(`/signer/${cree.jeton}`)))} style={{ marginTop: 6 }} />
          </Carte>
        </>}
      </Ecran>
    );
  }

  const suivant = etape === 0 ? <GrosBouton titre="Suivant : la voiture" sousTitre={`${jour(debut.toISOString())} ${heure(debut.toISOString())} → ${jour(fin.toISOString())} ${heure(fin.toISOString())}`} onPress={() => setEtape(1)} />
    : etape === 1 ? <GrosBouton titre="Suivant : le client" desactive={!vehicule} onPress={() => setEtape(2)} />
    : etape === 2 ? <GrosBouton titre="Suivant : le prix" desactive={!clientPret} onPress={() => setEtape(3)} />
    : <GrosBouton icone="ok" titre="Créer la location" sousTitre={prix ? euros(Number(prix.replace(',', '.'))) : undefined} onPress={() => (caution ? creer() : setQuestion('caution'))} />;

  return (
    <Ecran fermer titre="Nouvelle location" bas={suivant}>
      <Etapes etapes={ETAPES} etape={etape} onChoix={setEtape} />

      {/* Rappel de ce qui est déjà choisi */}
      {etape > 0 && (
        <Carte style={{ gap: 8 }}>
          <Pressable onPress={() => setEtape(0)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icone nom="calendrier" couleur={c.accent} taille={18} />
            <Text style={{ color: c.texte, fontWeight: '700', flex: 1 }}>{jour(debut.toISOString())} {heure(debut.toISOString())} → {jour(fin.toISOString())} {heure(fin.toISOString())} · {jours} j</Text>
          </Pressable>
          {etape > 1 && vehicule && <Pressable onPress={() => setEtape(1)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icone nom="voiture" couleur={c.accent} taille={18} /><Text style={{ color: c.texte, fontWeight: '700', flex: 1 }}>{nomVehicule(vehicule)} · {vehicule.immatriculation}</Text></Pressable>}
          {etape > 2 && clientPret && <Pressable onPress={() => setEtape(2)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icone nom="client" couleur={c.accent} taille={18} /><Text style={{ color: c.texte, fontWeight: '700', flex: 1 }}>{nomChoisi}{nouveau ? ' (nouveau)' : ''}</Text></Pressable>}
        </Carte>
      )}

      {etape === 0 && <>
        <Titre>Départ</Titre>
        <Puces>
          {RAPIDES.map(([k, t]) => <Puce key={k} titre={t} actif={!autre && quand === k} onPress={() => { setAutre(null); setQuand(k); }} />)}
          <Puce titre="Autre date" actif={!!autre} onPress={() => setAutre(autre ?? { jour: 1, heure: 10 })} />
        </Puces>
        {autre && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {joursProches.map((d, i) => (
              <Pressable key={i} onPress={() => setAutre({ ...autre, jour: i })}
                style={{ width: 62, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: autre.jour === i ? c.accent : c.panneau2, borderWidth: 1, borderColor: autre.jour === i ? c.accent : c.bord }}>
                <Text style={{ color: autre.jour === i ? c.surAccent : c.gris, fontSize: 12, fontWeight: '800' }}>{i === 0 ? 'AUJ.' : i === 1 ? 'DEM.' : d.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase()}</Text>
                <Text style={{ color: autre.jour === i ? c.surAccent : c.texte, fontSize: 20, fontWeight: '800' }}>{d.getDate()}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Puces>{[8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20].map((h) => <Puce key={h} titre={`${h} h`} actif={autre.heure === h} onPress={() => setAutre({ ...autre, heure: h })} />)}</Puces>
        </>}
        <Titre>Durée</Titre>
        <Puces>{DUREES.map(([j, t]) => <Puce key={j} titre={t} actif={jours === j} onPress={() => setJours(j)} />)}</Puces>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'center', marginTop: 4 }}>
          <Pressable onPress={() => setJours(Math.max(1, jours - 1))} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.texte, fontSize: 26, fontWeight: '700' }}>−</Text></Pressable>
          <Text style={{ color: c.texte, fontSize: 28, fontWeight: '800', minWidth: 110, textAlign: 'center' }}>{jours} jour{jours > 1 ? 's' : ''}</Text>
          <Pressable onPress={() => setJours(jours + 1)} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.texte, fontSize: 26, fontWeight: '700' }}>+</Text></Pressable>
        </View>
      </>}

      {etape === 1 && (!vehicules ? <Chargement /> : <>
        {(vehicules.length > 6) && <Recherche valeur={qv} onChange={setQv} placeholder="Immatriculation, modèle…" />}
        <Titre>{libres.length} libre{libres.length > 1 ? 's' : ''} sur ces dates</Titre>
        {libres.map((v) => (
          <Carte key={v.id} accent={vehicule?.id === v.id ? c.accent : undefined} onPress={() => { setVehicule(v); setEtape(2); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <LogoMarque marque={v.marque} modele={v.modele} />
              <View style={{ flex: 1, gap: 5 }}><Text style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>{nomVehicule(v)}</Text><Plaque immat={v.immatriculation} taille={0.7} /></View>
              {v.prix_jour ? <View style={{ alignItems: 'flex-end' }}><Text style={{ color: c.texte, fontWeight: '800', fontSize: 17 }}>{euros(Number(v.prix_jour) * jours)}</Text><Text style={{ color: c.gris, fontSize: 12 }}>{euros(v.prix_jour)}/j</Text></View> : null}
            </View>
          </Carte>
        ))}
        {!libres.length && <Vide icone="voiture" titre="Aucune voiture libre sur ces dates" texte="Changez la date ou la durée." />}
        {prises.length > 0 && <>
          <Titre>Pas disponibles</Titre>
          {prises.map((v) => (
            <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: 0.5, paddingVertical: 6 }}>
              <LogoMarque marque={v.marque} modele={v.modele} taille={36} />
              <View style={{ flex: 1 }}><Text style={{ color: c.texte, fontWeight: '700' }}>{nomVehicule(v)} · {v.immatriculation}</Text><Text style={{ color: c.gris, fontSize: 13 }}>{indispo(v)}</Text></View>
            </View>
          ))}
        </>}
      </>)}

      {etape === 2 && <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Puce titre="Client existant" actif={!nouveau} onPress={() => setNouveau(false)} />
          <Puce titre="+ Nouveau client" actif={nouveau} onPress={() => { setNouveau(true); setClient(undefined); }} />
        </View>
        {!nouveau ? <>
          <Recherche valeur={q} onChange={setQ} placeholder="Nom ou téléphone…" />
          {!clients ? <Chargement /> : clientsFiltres.length ? clientsFiltres.map((x) => (
            <Carte key={x.id} accent={x.liste_noire ? c.rouge : client?.id === x.id ? c.accent : undefined} onPress={() => choisirClient(x)}>
              <Ligne style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>{nomClient(x)}</Text>
                {x.liste_noire ? <Etiquette plein titre="Liste noire" couleur={c.rouge} icone="alerte" /> : x.permis_path && x.piece_identite_path ? <Etiquette titre="Papiers OK" couleur={c.vert} icone="ok" /> : <Etiquette titre="Papiers à faire" couleur={c.orange} />}
              </Ligne>
              <Texte gris taille={15}>{x.telephone ?? 'Pas de téléphone'}</Texte>
            </Carte>
          )) : <Vide icone="client" titre="Aucun client trouvé" texte="Touchez « + Nouveau client »." />}
        </> : <>
          <Pressable onPress={scannerPermis} style={{ borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: permis ? c.vert : c.accent, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: (permis ? c.vert : c.accent) + '12' }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: (permis ? c.vert : c.accent) + '26', alignItems: 'center', justifyContent: 'center' }}>
              {lecture ? <ActivityIndicator color={c.accent} /> : <Icone nom={permis ? 'ok' : 'carteId'} couleur={permis ? c.vert : c.accent} taille={26} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.texte, fontWeight: '800', fontSize: 17 }}>{lecture ? 'Lecture du permis…' : permis ? 'Permis photographié' : 'Scanner le permis'}</Text>
              <Text style={{ color: c.gris, fontSize: 14 }}>{permis ? 'Touchez pour reprendre la photo' : 'Le nom et le prénom se remplissent tout seuls'}</Text>
            </View>
          </Pressable>
          <Champ libelle="Prénom" valeur={nc.prenom} onChange={(t) => setNc({ ...nc, prenom: t })} />
          <Champ libelle="Nom" valeur={nc.nom} onChange={(t) => setNc({ ...nc, nom: t })} majuscules />
          <Champ libelle="Téléphone (pour WhatsApp)" valeur={nc.telephone} onChange={(t) => setNc({ ...nc, telephone: t })} clavier="phone-pad" placeholder="06 12 34 56 78" />
        </>}
      </>}

      {etape === 3 && <>
        <Titre>Prix total</Titre>
        <Champ valeur={prix} onChange={(t) => { setPrixTouche(true); setPrix(t); }} clavier="decimal-pad" placeholder={prixAuto == null ? 'Prix par jour non renseigné sur la voiture' : ''} />
        {vehicule?.prix_jour ? <Texte gris taille={14}>{jours} j × {euros(vehicule.prix_jour)} = {euros(prixAuto)}{prixTouche && Number(prix) !== prixAuto ? ' · prix modifié' : ''}</Texte> : null}
        <Titre>Caution</Titre>
        <Puces>{['300', '500', '800', '1000', '1500', '2500'].map((m) => <Puce key={m} titre={`${Number(m).toLocaleString('fr-FR')} €`} actif={caution === m} onPress={() => setCaution(caution === m ? '' : m)} />)}</Puces>
        <Champ valeur={caution} onChange={(t) => setCaution(t.replace(/\D/g, ''))} clavier="number-pad" placeholder="Autre montant" />
        <Titre>Kilomètres inclus</Titre>
        <Puces>{[['', 'Illimités'], ['200', '200 km'], ['300', '300 km'], ['500', '500 km'], ['1000', '1 000 km']].map(([k, t]) => <Puce key={t} titre={t} actif={kmInclus === k} onPress={() => setKmInclus(k)} />)}</Puces>
      </>}

      <Fenetre visible={question === 'caution'} question="Aucune caution n'est remplie" detail="Êtes-vous sûr de continuer sans caution ?"
        non="Ajouter une caution" oui="Continuer sans caution" onNon={() => setQuestion(null)} onOui={() => { setQuestion(null); creer(); }} />
      <Fenetre visible={question === 'noire'} danger question={`${client ? nomClient(client) : 'Ce client'} est en liste noire`} detail="Voulez-vous vraiment lui louer une voiture ?"
        non="Choisir un autre client" oui="Continuer quand même" onNon={() => { setQuestion(null); setClient(undefined); }} onOui={() => { setQuestion(null); setEtape(3); }} />
    </Ecran>
  );
}
