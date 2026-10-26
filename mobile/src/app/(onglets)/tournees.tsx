// Planning de la semaine sur le téléphone : on choisit le jour, on voit chaque tournée avec son chauffeur et son camion,
// un geste pour remplir la semaine automatiquement, un toucher pour changer un chauffeur ou un camion
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ecran, GrosBouton, Vide, Chargement, BandeauHorsLigne, Carte } from '@/composants/ui';
import Feuille from '@/composants/Feuille';
import { Puce, Puces } from '@/composants/champs';
import { useToast } from '@/composants/Toast';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { plaque } from '@/lib/format';
import { chargerTransport, remplirSemaine, affecter, jourParis, ajouterJours, lundiDe, jourCourt, jourLong, heureCourte, nomChauffeur, type Tournee } from '@/lib/transport';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function PlanningTournees() {
  const c = useCouleurs();
  const toast = useToast();
  const aujourdhui = jourParis();
  const [lundi, setLundi] = useState(lundiDe(aujourdhui));
  const [jour, setJour] = useState(aujourdhui);
  const [choisie, setChoisie] = useState<Tournee | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const charger = useCallback(() => chargerTransport(lundi, ajouterJours(lundi, 6)), [lundi]);
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(charger);
  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i)), [lundi]);
  const tournees = (donnees?.tournees ?? []).filter((t) => t.jour === jour);
  const ch = (id: string | null) => donnees?.chauffeurs.find((x) => x.id === id);
  const ca = (id: string | null) => donnees?.camions.find((x) => x.id === id);
  const don = (id: string | null) => donnees?.donneurs.find((x) => x.id === id);
  const manquesSemaine = (donnees?.tournees ?? []).filter((t) => !t.chauffeur_id || !t.vehicule_id).length;

  const changerSemaine = (n: number) => { const l = ajouterJours(lundi, 7 * n); setLundi(l); setJour(n === 0 ? aujourdhui : l); };
  async function remplir() {
    setEnvoi(true);
    try { const r = await remplirSemaine(lundi); toast(r.message, 'ok'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); recharger(); }
    catch (e: any) { toast(e?.message ?? 'Planning impossible', 'alerte'); }
    setEnvoi(false);
  }
  async function choisir(champ: 'chauffeur_id' | 'vehicule_id', valeur: string | null) {
    if (!choisie) return;
    try { await affecter(choisie.id, champ, valeur); setChoisie({ ...choisie, [champ]: valeur, verrouillee: true }); recharger(); }
    catch (e: any) { toast(e?.message ?? 'Modification impossible', 'alerte'); }
  }
  // Occupés sur le même créneau : affichés en gris dans les choix
  const occupe = (champ: 'chauffeur_id' | 'vehicule_id', id: string) => !!choisie && (donnees?.tournees ?? []).some((t) =>
    t.id !== choisie.id && t.jour === choisie.jour && t[champ] === id && t.debut < choisie.fin && choisie.debut < t.fin);

  return (
    <Ecran titre="Planning" sousTitre={`Semaine du ${jourCourt(lundi)}${manquesSemaine ? ` · ${manquesSemaine} à compléter` : ''}`} rafraichir={recharger} enChargement={enChargement && !!donnees}
      actions={<View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => changerSemaine(-1)} accessibilityLabel="Semaine précédente" style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.panneau2, justifyContent: 'center' }}><Text style={{ color: c.texte, fontWeight: '800' }}>←</Text></Pressable>
        <Pressable onPress={() => changerSemaine(0)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.panneau2, justifyContent: 'center' }}><Text style={{ color: c.texte, fontWeight: '800' }}>Aujourd’hui</Text></Pressable>
        <Pressable onPress={() => changerSemaine(1)} accessibilityLabel="Semaine suivante" style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.panneau2, justifyContent: 'center' }}><Text style={{ color: c.texte, fontWeight: '800' }}>→</Text></Pressable>
      </View>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {jours.map((j, i) => {
          const duJour = (donnees?.tournees ?? []).filter((t) => t.jour === j);
          const manque = duJour.some((t) => !t.chauffeur_id || !t.vehicule_id);
          const actif = j === jour;
          return (
            <Pressable key={j} onPress={() => setJour(j)} accessibilityLabel={jourLong(j)}
              style={{ width: 58, paddingVertical: 8, borderRadius: 14, alignItems: 'center', gap: 2, backgroundColor: actif ? c.accent : c.panneau, borderWidth: 1, borderColor: j === aujourdhui && !actif ? c.accent : c.bord }}>
              <Text style={{ color: actif ? c.surAccent : c.gris, fontWeight: '800', fontSize: 12 }}>{JOURS[i]}</Text>
              <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '900', fontSize: 17 }}>{Number(j.slice(8))}</Text>
              <Text style={{ color: actif ? c.surAccent : manque ? c.rouge : c.gris, fontWeight: '800', fontSize: 11.5 }}>{duJour.length || '–'}{manque ? ' !' : ''}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <GrosBouton titre={envoi ? 'Remplissage…' : 'Remplir la semaine'} icone="eclair" desactive={envoi} onPress={remplir} sousTitre="Chauffeurs et camions placés selon vos règles" />
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger le planning" texte={erreur} />}
      {donnees && !tournees.length && <Vide icone="calendrier" titre="Aucune tournée ce jour-là" texte="Ajoutez vos tournées depuis le logiciel (ou collez le planning Amazon)." />}
      {tournees.map((t) => {
        const d = don(t.donneur_id);
        return (
          <Carte key={t.id} accent={!t.chauffeur_id ? c.rouge : !t.vehicule_id ? c.orange : d?.couleur ?? c.bord} onPress={t.statut === 'faite' ? undefined : () => setChoisie(t)}>
            <Text style={{ color: c.texte, fontSize: 15.5, fontWeight: '800' }}>{heureCourte(t.debut)}–{heureCourte(t.fin)} <Text style={{ color: c.gris, fontWeight: '600' }}>{d?.nom ?? t.libelle ?? ''}{t.verrouillee ? ' · choisi à la main' : ''}</Text></Text>
            <Text style={{ color: t.chauffeur_id ? c.texte : c.rouge, fontSize: 14.5, fontWeight: '700' }}>{nomChauffeur(ch(t.chauffeur_id)) || 'Sans chauffeur'}</Text>
            <Text style={{ color: t.vehicule_id ? c.texte2 : c.orange, fontSize: 13.5, fontWeight: t.vehicule_id ? '500' : '700' }}>{t.vehicule_id ? `${plaque(ca(t.vehicule_id)?.immatriculation)} · ${[ca(t.vehicule_id)?.marque, ca(t.vehicule_id)?.modele].filter(Boolean).join(' ')}` : 'Sans camion'}</Text>
            {t.statut === 'faite' ? <Text style={{ color: c.vert, fontWeight: '800', fontSize: 13 }}>Faite{t.livres != null ? ` · ${t.livres} livré${t.livres > 1 ? "s" : ""}${t.absents ? `, ${t.absents} absent${t.absents > 1 ? "s" : ""}` : ''}` : ''}</Text> : null}
          </Carte>
        );
      })}

      <Feuille visible={!!choisie} titre={choisie ? `${heureCourte(choisie.debut)}–${heureCourte(choisie.fin)} · ${jourLong(choisie.jour)}` : ''} onFermer={() => setChoisie(null)}>
        {choisie && <>
          <Text style={{ color: c.gris, fontWeight: '800', fontSize: 12.5, letterSpacing: 0.4 }}>CHAUFFEUR</Text>
          <Puces>
            <Puce titre="Personne" actif={!choisie.chauffeur_id} onPress={() => choisir('chauffeur_id', null)} couleur={c.rouge} />
            {(donnees?.chauffeurs ?? []).map((x) => <Puce key={x.id} titre={`${nomChauffeur(x)}${occupe('chauffeur_id', x.id) ? ' (occupé)' : ''}`} actif={choisie.chauffeur_id === x.id} onPress={() => choisir('chauffeur_id', x.id)} />)}
          </Puces>
          <Text style={{ color: c.gris, fontWeight: '800', fontSize: 12.5, letterSpacing: 0.4, marginTop: 8 }}>CAMION</Text>
          <Puces>
            <Puce titre="Aucun" actif={!choisie.vehicule_id} onPress={() => choisir('vehicule_id', null)} couleur={c.orange} />
            {(donnees?.camions ?? []).map((x) => <Puce key={x.id} titre={`${plaque(x.immatriculation)}${occupe('vehicule_id', x.id) ? ' (pris)' : ['maintenance', 'hors_service'].includes(x.statut) ? ' (atelier)' : ''}`} actif={choisie.vehicule_id === x.id} onPress={() => choisir('vehicule_id', x.id)} />)}
          </Puces>
          <Text style={{ color: c.gris, fontSize: 13, marginTop: 6 }}>Un choix fait à la main est gardé quand vous remplissez la semaine.</Text>
        </>}
      </Feuille>
    </Ecran>
  );
}
