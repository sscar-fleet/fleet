// Nouvelle location en 3 étapes : quelle voiture → quel client → quand et combien.
// Tout se fait par des choix ; on ne tape que le strict nécessaire.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ecran, Carte, GrosBouton, Ligne, Texte, Titre, Vide, Chargement } from '@/composants/ui';
import { Champ, Puce, Puces, Recherche } from '@/composants/champs';
import LogoMarque from '@/composants/LogoMarque';
import Fenetre from '@/composants/Fenetre';
import { chargerVehicules, chargerClients, type VehiculeLigne, type ClientLigne } from '@/lib/donnees';
import { garder, mettreEnFile } from '@/lib/hors-ligne';
import { nouvelId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { euros, jour, heure, nomClient } from '@/lib/format';

const ETAPES = ['Voiture', 'Client', 'Quand et prix'] as const;

function depart(choix: string) {
  const d = new Date();
  if (choix === 'maintenant') { d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; }
  if (choix === 'h1') { d.setHours(d.getHours() + 1, 0, 0, 0); return d; }
  const [j, h] = choix.split('-').map(Number); // ex. "1-9" = demain 9h
  d.setDate(d.getDate() + j); d.setHours(h, 0, 0, 0); return d;
}

export default function NouvelleLocation() {
  const c = useCouleurs();
  const { profil } = useSession();
  const params = useLocalSearchParams<{ vehicule?: string; client?: string }>();
  const [etape, setEtape] = useState(params.vehicule ? 1 : 0);
  const [vehicules, setVehicules] = useState<VehiculeLigne[]>();
  const [clients, setClients] = useState<ClientLigne[]>();
  const [vehicule, setVehicule] = useState<VehiculeLigne>();
  const [client, setClient] = useState<ClientLigne>();
  const [nouveau, setNouveau] = useState(false);
  const [nc, setNc] = useState({ prenom: '', nom: '', telephone: '' });
  const [photoPermis, setPhotoPermis] = useState<string>();
  const [q, setQ] = useState('');
  const [quand, setQuand] = useState('maintenant');
  const [jours, setJours] = useState(1);
  const [prix, setPrix] = useState('');
  const [caution, setCaution] = useState('');
  const [kmInclus, setKmInclus] = useState('');
  const [question, setQuestion] = useState(false);

  useEffect(() => {
    chargerVehicules().then((r) => { setVehicules(r.donnees); if (params.vehicule) setVehicule(r.donnees.find((v) => v.id === params.vehicule)); });
    chargerClients().then((r) => { setClients(r.donnees); if (params.client) { setClient(r.donnees.find((x) => x.id === params.client)); } });
  }, [params.vehicule, params.client]);

  const debut = useMemo(() => depart(quand), [quand]);
  const fin = useMemo(() => new Date(debut.getTime() + jours * 864e5), [debut, jours]);
  const prixAuto = vehicule?.prix_jour ? Number(vehicule.prix_jour) * jours : null;
  useEffect(() => { setPrix(prixAuto != null ? String(prixAuto) : ''); }, [prixAuto]);

  const clientsFiltres = (clients ?? []).filter((x) => !q || `${x.prenom ?? ''} ${x.nom} ${x.telephone ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  const clientPret = !!client || (nouveau && !!nc.nom.trim());

  async function photographierPermis() {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled) setPhotoPermis(r.assets[0].uri);
  }

  async function creer() {
    if (!vehicule || !profil) return;
    let clientId = client?.id;
    let clientObj: any = client;
    if (!clientId) {
      clientId = nouvelId();
      const champs: Record<string, unknown> = { id: clientId, agence_id: profil.agence_id, nom: nc.nom.trim().toUpperCase(), prenom: nc.prenom.trim() || null, telephone: nc.telephone.trim() || null };
      await mettreEnFile({ genre: 'ajout', table: 'clients', champs });
      if (photoPermis) {
        const chemin = `${profil.agence_id}/clients/${clientId}/permis-${Date.now()}.jpg`;
        await mettreEnFile({ genre: 'fichier', chemin, uri: photoPermis, type: 'image/jpeg', ensuite: { genre: 'maj', table: 'clients', id: clientId, champs: { permis_path: chemin } } });
      }
      clientObj = { ...champs, email: null, permis_path: photoPermis ? 'x' : null, piece_identite_path: null, liste_noire: false };
    }
    const id = nouvelId();
    const loc = { id, agence_id: profil.agence_id, vehicule_id: vehicule.id, client_id: clientId, debut: debut.toISOString(), fin_prevue: fin.toISOString(),
      prix_total: prix ? Number(prix.replace(',', '.')) : null, caution_montant: caution ? Number(caution) : null,
      km_inclus: kmInclus ? Number(kmInclus) : null, km_depart: vehicule.km ?? null };
    await mettreEnFile({ genre: 'ajout', table: 'locations', champs: loc });
    // La fiche s'affiche tout de suite, même avant l'envoi
    await garder('location-' + id, { ...loc, numero: null, statut: 'reservee', caution_statut: 'a_prendre', vehicules: vehicule, clients: clientObj, etats_des_lieux: [] });
    router.replace({ pathname: '/location/[id]', params: { id } });
  }

  const suivant = etape === 0 ? <GrosBouton titre="Suivant : le client" desactive={!vehicule} onPress={() => setEtape(1)} />
    : etape === 1 ? <GrosBouton titre="Suivant : quand et prix" desactive={!clientPret} onPress={() => setEtape(2)} />
    : <GrosBouton titre={`Créer la location${prix ? ' · ' + euros(Number(prix)) : ''}`} onPress={() => (caution ? creer() : setQuestion(true))} />;

  return (
    <Ecran titre="Nouvelle location" sousTitre={`Étape ${etape + 1} sur 3 · ${ETAPES[etape]}`} bas={suivant}>
      <Ligne>{ETAPES.map((e, i) => <Pressable key={e} onPress={() => i < etape && setEtape(i)} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= etape ? c.accent : c.bord }} />)}</Ligne>
      <Pressable onPress={() => (etape ? setEtape(etape - 1) : router.back())}><Texte gris taille={15}>{etape ? '‹ Retour' : 'Annuler'}</Texte></Pressable>

      {/* Rappel de ce qui est déjà choisi */}
      {etape > 0 && vehicule && <Carte><Ligne style={{ flexWrap: 'nowrap', gap: 12 }}><LogoMarque marque={vehicule.marque} modele={vehicule.modele} taille={40} />
        <View style={{ flex: 1 }}><Texte gras>{[vehicule.marque, vehicule.modele].filter(Boolean).join(' ')} · {vehicule.immatriculation}</Texte>
          {etape > 1 && <Texte gris>{client ? nomClient(client) : `${nc.prenom} ${nc.nom}`.trim()}</Texte>}</View></Ligne></Carte>}

      {etape === 0 && (!vehicules ? <Chargement /> : <>
        <Titre>Voitures disponibles</Titre>
        {vehicules.filter((v) => v.statut === 'disponible').map((v) => (
          <Carte key={v.id} accent={vehicule?.id === v.id ? c.accent : undefined} onPress={() => { setVehicule(v); setEtape(1); }}>
            <Ligne style={{ flexWrap: 'nowrap', gap: 14 }}>
              <LogoMarque marque={v.marque} modele={v.modele} />
              <View style={{ flex: 1 }}><Texte gras taille={18}>{[v.marque, v.modele].filter(Boolean).join(' ') || v.immatriculation}</Texte><Texte gris>{v.immatriculation}</Texte></View>
              <Texte gras>{v.prix_jour ? euros(v.prix_jour) + '/j' : ''}</Texte>
            </Ligne>
          </Carte>
        ))}
        {!vehicules.some((v) => v.statut === 'disponible') && <Vide titre="Aucune voiture disponible" texte="Toutes les voitures sont louées ou à l'atelier." />}
      </>)}

      {etape === 1 && <>
        <Puces>
          <Puce titre="Client existant" actif={!nouveau} onPress={() => setNouveau(false)} />
          <Puce titre="+ Nouveau client" actif={nouveau} onPress={() => { setNouveau(true); setClient(undefined); }} />
        </Puces>
        {!nouveau ? <>
          <Recherche valeur={q} onChange={setQ} placeholder="Nom ou téléphone…" />
          {!clients ? <Chargement /> : clientsFiltres.map((x) => (
            <Carte key={x.id} accent={client?.id === x.id ? c.accent : undefined} onPress={() => { setClient(x); setEtape(2); }}>
              <Texte gras>{nomClient(x)}{x.liste_noire ? '  ·  Liste noire' : ''}</Texte>
              <Texte gris>{x.telephone ?? 'Pas de téléphone'} · {x.permis_path ? 'permis enregistré' : 'permis à photographier'}</Texte>
            </Carte>
          ))}
        </> : <>
          <GrosBouton secondaire titre={photoPermis ? 'Permis photographié ✓' : 'Photographier le permis'} onPress={photographierPermis} />
          <Texte gris taille={14}>La lecture automatique du permis (nom, date, numéro) arrive avec l'IA ; pour l'instant la photo est rangée dans la fiche.</Texte>
          <Champ libelle="Prénom" valeur={nc.prenom} onChange={(t) => setNc({ ...nc, prenom: t })} />
          <Champ libelle="Nom" valeur={nc.nom} onChange={(t) => setNc({ ...nc, nom: t })} majuscules />
          <Champ libelle="Téléphone" valeur={nc.telephone} onChange={(t) => setNc({ ...nc, telephone: t })} clavier="phone-pad" />
        </>}
      </>}

      {etape === 2 && <>
        <Titre>Départ</Titre>
        <Puces>
          {[['maintenant', 'Maintenant'], ['h1', 'Dans 1 h'], ['0-18', 'Ce soir 18h'], ['1-9', 'Demain 9h'], ['1-14', 'Demain 14h'], ['2-9', 'Après-demain 9h']].map(([k, t]) => (
            <Puce key={k} titre={t} actif={quand === k} onPress={() => setQuand(k)} />
          ))}
        </Puces>
        <Titre>Durée</Titre>
        <Puces>{[1, 2, 3, 4, 5, 7, 14, 30].map((j) => <Puce key={j} titre={j === 7 ? '1 sem.' : j === 14 ? '2 sem.' : j === 30 ? '1 mois' : `${j} j`} actif={jours === j} onPress={() => setJours(j)} />)}</Puces>
        <Carte>
          <Texte gras>Du {jour(debut.toISOString())} {heure(debut.toISOString())}</Texte>
          <Texte gras>au {jour(fin.toISOString())} {heure(fin.toISOString())}</Texte>
          <Texte gris>{jours} jour{jours > 1 ? 's' : ''}{vehicule?.prix_jour ? ` × ${euros(vehicule.prix_jour)}` : ''}</Texte>
        </Carte>
        <Champ libelle="Prix total (€)" valeur={prix} onChange={setPrix} clavier="decimal-pad" placeholder={prixAuto == null ? 'Prix par jour non renseigné' : ''} />
        <Titre>Caution</Titre>
        <Puces>{['300', '500', '800', '1000', '1500'].map((m) => <Puce key={m} titre={`${m} €`} actif={caution === m} onPress={() => setCaution(caution === m ? '' : m)} />)}</Puces>
        <Champ valeur={caution} onChange={(t) => setCaution(t.replace(/\D/g, ''))} clavier="number-pad" placeholder="Autre montant" />
        <Titre>Kilomètres inclus</Titre>
        <Puces>{[['', 'Illimités'], ['200', '200 km'], ['300', '300 km'], ['500', '500 km'], ['1000', '1000 km']].map(([k, t]) => <Puce key={t} titre={t} actif={kmInclus === k} onPress={() => setKmInclus(k)} />)}</Puces>
      </>}

      <Fenetre visible={question} question="Aucune caution n'est remplie. Êtes-vous sûr de continuer sans caution ?"
        non="Ajouter une caution" oui="Continuer sans caution" onNon={() => setQuestion(false)} onOui={() => { setQuestion(false); creer(); }} />
    </Ecran>
  );
}
