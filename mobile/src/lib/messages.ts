// Messages prêts à envoyer : WhatsApp s'ouvre avec le texte, c'est vous qui appuyez sur Envoyer
import { Linking, Platform } from 'react-native';
import { heure, jour, nomVehicule, prenom, telInternational, euros } from './format';
import type { LocationLigne } from './donnees';

export const ouvrirWhatsApp = (tel: string | null | undefined, texte: string) =>
  Linking.openURL(tel ? `https://wa.me/${telInternational(tel)}?text=${encodeURIComponent(texte)}` : `https://wa.me/?text=${encodeURIComponent(texte)}`);
// Sur iPhone (navigateur), un lien ouvert après une attente est bloqué : on ouvre l'onglet tout de suite au toucher,
// puis on y met l'adresse quand elle est prête.
export function fenetreEnAttente() {
  const w = Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
  return {
    aller: (url: string) => { if (w && !w.closed) w.location.href = url; else Linking.openURL(url); },
    fermer: () => { try { w?.close(); } catch {} },
  };
}
export const urlWhatsApp = (tel: string | null | undefined, texte: string) => tel ? `https://wa.me/${telInternational(tel)}?text=${encodeURIComponent(texte)}` : `https://wa.me/?text=${encodeURIComponent(texte)}`;
export const ouvrirSms = (tel: string, texte: string) => Linking.openURL(`sms:${tel}${/iPhone|iPad/.test(globalThis.navigator?.userAgent ?? '') ? '&' : '?'}body=${encodeURIComponent(texte)}`);
export const appeler = (tel: string) => Linking.openURL(`tel:${tel.replace(/\s/g, '')}`);

const bonjour = (l: LocationLigne) => `Bonjour ${prenom(l.clients)},`;
export const msg = {
  rappelDepart: (l: LocationLigne) => `${bonjour(l)} votre ${nomVehicule(l.vehicules)} vous attend ${jour(l.debut)} à ${heure(l.debut)}. Pensez à votre permis et à votre pièce d'identité. À tout à l'heure !`,
  rappelRetour: (l: LocationLigne) => `${bonjour(l)} petit rappel : le retour de la ${nomVehicule(l.vehicules)} est prévu ${jour(l.fin_prevue)} à ${heure(l.fin_prevue)}. Merci !`,
  retard: (l: LocationLigne) => `${bonjour(l)} le retour de la ${nomVehicule(l.vehicules)} était prévu à ${heure(l.fin_prevue)}. Pouvez-vous nous dire à quelle heure vous arrivez ? Merci.`,
  signature: (l: LocationLigne, lien: string) => `${bonjour(l)} voici votre contrat de location pour la ${nomVehicule(l.vehicules)} (${jour(l.debut)} à ${heure(l.debut)}). Vous pouvez le lire et le signer ici : ${lien}`,
  prolongation: (l: LocationLigne, fin: string, prix: number | null) => `${bonjour(l)} c'est noté : votre location de la ${nomVehicule(l.vehicules)} est prolongée jusqu'au ${jour(fin)} à ${heure(fin)}${prix != null ? `, pour un total de ${euros(prix)}` : ''}.`,
  recapRetour: (l: LocationLigne, km: number, kmFaits: number | null, supplement: number, carburant: number, pdf?: string | null) => `${bonjour(l)} merci d'avoir rendu la ${nomVehicule(l.vehicules)}. Kilométrage au retour : ${km.toLocaleString('fr-FR')} km${kmFaits != null ? ` (${kmFaits.toLocaleString('fr-FR')} km parcourus)` : ''}, carburant : ${carburant} %.${supplement > 0 ? ` Kilomètres supplémentaires : ${euros(supplement)}.` : ''}${pdf ? `\n\nVotre état des lieux de retour avec les photos : ${pdf}` : ''}\n\nÀ bientôt !`,
  recapDepart: (l: LocationLigne, km: number, carburant: number, pdf?: string | null) => `${bonjour(l)} bonne route avec la ${nomVehicule(l.vehicules)} ! Kilométrage au départ : ${km.toLocaleString('fr-FR')} km, carburant : ${carburant} %. Retour prévu ${jour(l.fin_prevue)} à ${heure(l.fin_prevue)}.${pdf ? `\n\nVotre état des lieux de départ avec les photos : ${pdf}` : ''}`,
};
