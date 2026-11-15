import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Sube un archivo local (imagen o audio) a Cloudinary y retorna la URL segura.
 */
import * as FileSystem from 'expo-file-system/legacy';

export async function subirImagenStorage(
  uri: string,
  ruta: string
): Promise<string> {
  if (!uri) throw new Error('La URI es inválida');
  if (uri.startsWith('http')) return uri;

  const finalUri = uri.startsWith('file://') ? uri : `file://${uri}`;
  const tipoArchivo = ruta.endsWith('.m4a') ? 'audio/mp4' : 'image/jpeg';

  try {
    const upload = await FileSystem.uploadAsync(
      'https://api.cloudinary.com/v1_1/lojirksg/auto/upload',
      finalUri,
      {
        fieldName: 'file',
        httpMethod: 'POST',
        uploadType: 1, // FileSystem.FileSystemUploadType.MULTIPART = 1
        parameters: { upload_preset: 'chofera_preset' },
      }
    );

    const data = JSON.parse(upload.body);
    if (upload.status !== 200) throw new Error(data.error?.message || 'Error en subida');
    return data.secure_url;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

export async function subirAudioStorage(uri: string): Promise<string> {
  return subirImagenStorage(uri, 'audio.m4a');
}
export { subirImagenStorage as uploadFileToStorage };

