// Appli du chauffeur : ses tournées du jour et des jours suivants, et la fin de tournée en un écran
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, GrosBouton, Titre, Vide, Chargement, BandeauHorsLigne, Carte, Ligne, BoutonRond } from '@/composants/ui';
import Logo from '@/composants/Logo';
import Synchro from '@/composants/Synchro';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { plaque } from '@/lib/format';
import { chargerTransport, jourParis, ajouterJours, jourLong, heureCourte, permisAVerifier } from '@/lib/transport';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';

export default function MesTournees() {
  const c = useCouleurs();
  const { profil } = useSession();
  const jour = jourParis();
  const charger = useCallback(() => chargerTransport(jour, ajouterJours(jour, 6), profil?.chauffeur_id ?? 'aucun'), [jour, profil?.chauffeur_id]);
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(charger);
  const tournees = donnees?.tournees ?? [];
  const ca = (id: string | null) => donnees?.camions.find((x) => x.id === id);
  const don = (id: string | null) => donnees?.donneurs.find((x) => x.id === id);
  const dep = (id: string | null) => donnees?.depots.find((x) => x.id === id);
  const aujourdhui = tournees.filter((t) => t.jour === jour);
  const suivantes = tournees.filter((t) => t.jour > jour);
  const h = new Date().getHours();
  // Photo du permis à renvoyer (plus de 3 mois) : relu à chaque retour sur l'écran
  const [permisVieux, setPermisVieux] = useState(permisAVerifier(profil?.permis_valide_le));
  useFocusEffect(useCallback(() => {
    if (!profil?.chauffeur_id) return;
    supabase.from('chauffeurs').select('permis_valide_le').eq('id', profil.chauffeur_id).maybeSingle().then(({ data }) => { if (data) setPermisVieux(permisAVerifier((data as any).permis_valide_le)); });
  }, [profil?.chauffeur_id]));

  return (
    <Ecran titre={`${h < 18 ? 'Bonjour' : 'Bonsoir'}${profil?.nom ? ' ' + profil.nom.split(' ')[0] : ''}`} sousTitre={profil?.agence ?? ''}
      rafraichir={recharger} enChargement={enChargement && !!donnees}
      haut={<Ligne style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Logo largeur={92} variante="fleet" />
        <Ligne style={{ flexWrap: 'nowrap' }}><Synchro /><BoutonRond icone="outil" label="Mon compte" onPress={() => router.push('/compte')} /></Ligne>
      </Ligne>}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!profil?.chauffeur_id && <Vide icone="client" titre="Votre fiche chauffeur n’est pas encore reliée" texte="Demandez à votre responsable de vous inviter depuis la page Chauffeurs." />}
      {profil?.chauffeur_id && !donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide icone="nuage" titre="Impossible de charger vos tournées" texte={erreur} />}
      {donnees && profil?.chauffeur_id && <>
        {permisVieux && (
          <Carte accent={c.orange}>
            <Text style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>Ton responsable a besoin d’une photo récente de ton permis</Text>
            <GrosBouton titre="Envoyer la photo" icone="photo" onPress={() => router.push('/permis' as any)} style={{ marginTop: 6 }} />
          </Carte>
        )}
        <Titre>Aujourd’hui</Titre>
        {!aujourdhui.length && <Vide icone="calendrier" titre="Pas de tournée aujourd’hui" texte="Repos !" />}
        {aujourdhui.map((t) => {
          const v = ca(t.vehicule_id);
          return (
            <Carte key={t.id} accent={t.statut === 'faite' ? c.vert : don(t.donneur_id)?.couleur ?? c.accent}>
              <Text style={{ color: c.texte, fontSize: 22, fontWeight: '900' }}>{heureCourte(t.debut)} – {heureCourte(t.fin)}</Text>
              <Text style={{ color: c.texte2, fontSize: 15, fontWeight: '700' }}>{[don(t.donneur_id)?.nom ?? t.libelle, dep(t.depot_id)?.nom].filter(Boolean).join(' · ')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text style={{ color: v ? c.texte : c.orange, fontSize: 16, fontWeight: '800' }}>{v ? plaque(v.immatriculation) : 'Camion à confirmer'}</Text>
                {v ? <Text style={{ color: c.gris, fontSize: 14 }}>{[v.marque, v.modele].filter(Boolean).join(' ')}</Text> : null}
              </View>
              {t.statut === 'faite'
                ? <Text style={{ color: c.vert, fontWeight: '800', fontSize: 15, marginTop: 6 }}>Tournée terminée{t.livres != null ? ` · ${t.livres} livré${t.livres > 1 ? "s" : ""}` : ''}{t.absents ? `, ${t.absents} absent${t.absents > 1 ? "s" : ""}` : ''}</Text>
                : <GrosBouton titre="Terminer la tournée" icone="ok" onPress={() => router.push({ pathname: '/fin-tournee/[id]', params: { id: t.id } } as any)} style={{ marginTop: 8 }} />}
              <Text onPress={() => router.push({ pathname: '/accrochage/[id]', params: { id: t.id, vehicule: t.vehicule_id ?? '', plaque: v ? plaque(v.immatriculation) : '' } } as any)}
                style={{ color: c.orange, fontWeight: '800', fontSize: 15, marginTop: 10, textAlign: 'center', paddingVertical: 6 }} accessibilityRole="button">J’ai eu un accrochage</Text>
            </Carte>
          );
        })}
        {suivantes.length > 0 && <>
          <Titre>Mes prochaines tournées</Titre>
          {suivantes.map((t) => (
            <Carte key={t.id}>
              <Text style={{ color: c.texte, fontSize: 15.5, fontWeight: '800' }}>{jourLong(t.jour)}</Text>
              <Text style={{ color: c.texte2, fontSize: 14 }}>{heureCourte(t.debut)} – {heureCourte(t.fin)} · {[don(t.donneur_id)?.nom ?? t.libelle, dep(t.depot_id)?.nom].filter(Boolean).join(' · ')}{t.vehicule_id ? ` · ${plaque(ca(t.vehicule_id)?.immatriculation)}` : ''}</Text>
            </Carte>
          ))}
        </>}
      </>}
    </Ecran>
  );
}
