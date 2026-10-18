// Réduit une photo du téléphone (souvent 4 à 8 Mo) avant l'envoi : 1600 px max, JPEG.
export async function compresser(fichier: File, max = 1600): Promise<Blob> {
  if (!fichier.type.startsWith('image/') || fichier.type === 'image/svg+xml') return fichier;
  try {
    const bitmap = await createImageBitmap(fichier);
    const echelle = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * echelle);
    canvas.height = Math.round(bitmap.height * echelle);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob ?? fichier;
  } catch {
    return fichier;
  }
}
