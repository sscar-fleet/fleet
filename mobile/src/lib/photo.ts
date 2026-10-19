// Prendre une photo (ou en choisir une sur le navigateur), avec sa version texte pour l'IA si besoin
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export async function prendrePhoto(opts: { pourIa?: boolean; qualite?: number; galerie?: boolean } = {}): Promise<{ uri: string; dataUrl?: string } | null> {
  if (Platform.OS !== 'web') {
    const p = await (opts.galerie ? ImagePicker.requestMediaLibraryPermissionsAsync() : ImagePicker.requestCameraPermissionsAsync()).catch(() => ({ granted: false }));
    if (!p.granted) return null;
  }
  const options = { quality: opts.qualite ?? 0.6, base64: !!opts.pourIa, mediaTypes: ['images'] as ImagePicker.MediaType[] };
  const r = await (opts.galerie ? ImagePicker.launchImageLibraryAsync(options) : ImagePicker.launchCameraAsync(options));
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const dataUrl = opts.pourIa ? (a.uri.startsWith('data:') ? a.uri : a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : undefined) : undefined;
  return { uri: a.uri, dataUrl };
}
