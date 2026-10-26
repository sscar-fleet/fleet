// Journée d'un responsable transport : les tournées du jour, qui n'est pas encore parti (avec le bouton pour l'appeler),
// ce qui manque (chauffeur, camion), et l'accès au planning de la semaine
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Ecran, GrosBouton, Titre, Vide, Chargement, BandeauHorsLigne, Tuile, Carte, Ligne, BoutonRond } from '@/composants/ui';
import Logo from '@/composants/Logo';
import Synchro from '@/composants/Synchro';
import ClocheAppli from '@/composants/ClocheAppli';
import Icone from '@/composants/Icone';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { useGps } from '@/lib/gps';
import { appeler } from '@/lib/messages';
import { plaque } from '@/lib/format';
import { chargerTransport, jourParis, heureCourte, nomChauffeur, type Tournee } from '@/lib/transport';

const minutes = (h: string) => { const [a, b] = String(h).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const AVANCE = 45; // le délai exact est réglé dans le logiciel ; l'appli prévient dès 45 min avant

export default function JourneeTransport() {
  const c = useCouleurs();
  const { profil } = useSession();
  const { gps } = useGps();
  const jour = jourParis();
  const charger = useCallback(() => chargerTransport(jour, jour), [jour]);
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(charger);
  const maintenant = (() => { const p = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })); return p.getHours() * 60 + p.getMinutes(); })();
  const tournees = donnees?.tournees ?? [];
  const ch = (id: string | null) => donnees?.chauffeurs.find((x) => x.id === id);
  const ca = (id: string | null) => donnees?.camions.find((x) => x.id === id);
  const don = (id: string | null) => donnees?.donneurs.find((x) => x.id === id);
  const etat = (t: Tournee) => (t.vehicule_id ? gps.parVehicule[t.vehicule_id] : undefined);
  const pasParti = (t: Tournee) => {
    const e = etat(t); if (!e || t.statut !== 'prevue' || e.etat === 'hors_ligne') return false;
    const d = minutes(t.debut); const enRoute = e.etat === 'roule' || e.contact === true;
    return maintenant >= d - AVANCE && maintenant < d + 30 && !enRoute;
  };
  const enRetard = tournees.filter(pasParti);
  const sansChauffeur = tournees.filter((t) => !t.chauffeur_id).length;
  const faites = tournees.filter((t) => t.statut === 'faite').length;
  const h = new Date().getHours();
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Ecran titre={`${h < 18 ? 'Bonjour' : 'Bonsoir'}${profil?.nom ? ' ' + profil.nom.split(' ')[0] : ''}`} sousTitre={`${date.charAt(0).toUpperCase() + date.slice(1)} · ${profil?.agence ?? ''}`}
      rafraichir={recharger} enChargement={enChargement && !!donnees}
      haut={<Ligne style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Logo largeur={92} variante="fleet" />
        <Ligne style={{ flexWrap: 'nowrap' }}><Synchro /><ClocheAppli /><BoutonRond icone="outil" label="Mon compte" onPress={() => router.push('/compte')} /></Ligne>
      </Ligne>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger la journée" texte={erreur} />}
      {donnees && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Tuile valeur={tournees.length} libelle={faites ? `Tournées · ${faites} faites` : 'Tournées'} couleur={c.accent} icone="locations" onPress={() => router.push('/(onglets)/tournees' as any)} />
          <Tuile valeur={enRetard.length} libelle="Pas encore partis" couleur={enRetard.length ? c.orange : c.vert} icone="horloge" alerte={enRetard.length > 0} />
          <Tuile valeur={sansChauffeur} libelle="Sans chauffeur" couleur={sansChauffeur ? c.rouge : c.vert} icone="client" alerte={sansChauffeur > 0} onPress={() => router.push('/(onglets)/tournees' as any)} />
        </View>

        {enRetard.length > 0 && <>
          <Titre>Pas encore partis</Titre>
          {enRetard.map((t) => {
            const chauffeur = ch(t.chauffeur_id);
            return (
              <Carte key={t.id} accent={c.orange}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{nomChauffeur(chauffeur) || 'Sans chauffeur'}</Text>
                    <Text style={{ color: c.texte2, fontSize: 13.5 }}>Tournée de {heureCourte(t.debut)} · {plaque(ca(t.vehicule_id)?.immatriculation)} à l’arrêt</Text>
                  </View>
                  {chauffeur?.telephone ? (
                    <Pressable onPress={() => appeler(chauffeur.telephone!)} accessibilityLabel={`Appeler ${nomChauffeur(chauffeur)}`}
                      style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: c.vert, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: pressed ? 0.8 : 1 })}>
                      <Icone nom="tel" couleur="#fff" taille={18} /><Text style={{ color: '#fff', fontWeight: '800' }}>Appeler</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Carte>
            );
          })}
        </>}

        <Titre action="Semaine" onAction={() => router.push('/(onglets)/tournees' as any)}>Aujourd’hui</Titre>
        {!tournees.length && <Vide icone="calendrier" titre="Aucune tournée aujourd’hui" texte="Ajoutez vos tournées depuis le planning." />}
        {tournees.map((t) => {
          const e = etat(t); const d = don(t.donneur_id);
          // L'état du camion n'a de sens que pendant la tournée : avant on affiche l'heure, après « à confirmer »
          const d0 = minutes(t.debut); let f0 = minutes(t.fin); if (f0 <= d0) f0 += 1440;
          const enCours = maintenant >= d0 && maintenant < f0;
          const libelleEtat = t.statut === 'faite' ? 'Faite' : pasParti(t) ? 'Pas encore parti' : !enCours ? (maintenant < d0 ? 'À venir' : 'Fin à confirmer')
            : e?.etat === 'roule' ? 'Roule' : e?.etat === 'arret' ? 'À l’arrêt' : e?.etat === 'hors_ligne' ? 'Hors ligne' : 'En cours';
          const couleurEtat = t.statut === 'faite' ? c.vert : pasParti(t) ? c.orange : enCours && e?.etat === 'roule' ? c.bleu : c.gris;
          return (
            <Carte key={t.id} accent={d?.couleur ?? c.bord}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: c.texte, fontSize: 15.5, fontWeight: '800' }}>{heureCourte(t.debut)}–{heureCourte(t.fin)} <Text style={{ color: c.gris, fontWeight: '600' }}>{d?.nom ?? t.libelle ?? ''}</Text></Text>
                  <Text style={{ color: t.chauffeur_id ? c.texte2 : c.rouge, fontSize: 13.5, fontWeight: t.chauffeur_id ? '500' : '800' }}>
                    {nomChauffeur(ch(t.chauffeur_id)) || 'Sans chauffeur'}{t.vehicule_id ? ` · ${plaque(ca(t.vehicule_id)?.immatriculation)}` : ' · sans camion'}
                  </Text>
                  {t.statut === 'faite' && t.livres != null ? <Text style={{ color: c.gris, fontSize: 12.5 }}>{t.livres} livrés{t.absents ? ` · ${t.absents} absent${t.absents > 1 ? "s" : ""}` : ''}</Text> : null}
                </View>
                {libelleEtat ? <Text style={{ color: couleurEtat, fontWeight: '800', fontSize: 13 }}>{libelleEtat}</Text> : null}
              </View>
            </Carte>
          );
        })}
        <GrosBouton secondaire icone="calendrier" titre="Planning de la semaine" onPress={() => router.push('/(onglets)/tournees' as any)} />
      </>}
    </Ecran>
  );
}
