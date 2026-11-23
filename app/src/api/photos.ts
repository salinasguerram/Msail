import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { api } from '@/api/client';

export type Photo = { id: number; image: string; caption: string; created_at: string; is_cover?: boolean };

export type PickedImage = ImagePicker.ImagePickerAsset;

/**
 * Abre el selector de fotos del sistema. Devuelve null si el usuario cancela.
 * No pide permiso para ver toda la galería: el selector del sistema solo entrega la foto elegida
 * (Google Play rechaza apps que piden acceso a todas las fotos sin necesitarlo).
 * `square` recorta al momento de elegir (para la foto de perfil).
 */
export async function pickImage({ square = false } = {}): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 0.85, // también convierte las HEIC del iPhone a JPEG
  });
  return result.canceled ? null : (result.assets[0] ?? null);
}

async function toFormData(asset: PickedImage, extra: Record<string, string> = {}) {
  const form = new FormData();
  const name = asset.fileName ?? `foto-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    // En la web el selector entrega un File (o una URL blob: que se convierte).
    const file = asset.file ?? (await (await fetch(asset.uri)).blob());
    form.append('image', file, name);
  } else {
    // En iOS/Android React Native sube el archivo directo desde su ruta local.
    form.append('image', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}

export async function uploadAvatar(asset: PickedImage) {
  return api<{ avatar: string }>('/profiles/me/avatar/', { method: 'POST', body: await toFormData(asset) });
}

export const deleteAvatar = () => api('/profiles/me/avatar/', { method: 'DELETE' });

export async function uploadProfilePhoto(asset: PickedImage, caption = '') {
  return api<Photo>('/profiles/me/photos/', { method: 'POST', body: await toFormData(asset, { caption }) });
}

export const deleteProfilePhoto = (id: number) => api(`/profiles/me/photos/${id}/`, { method: 'DELETE' });

export async function uploadBoatPhoto(boatId: number, asset: PickedImage, caption = '') {
  return api<Photo>(`/boats/${boatId}/photos/`, { method: 'POST', body: await toFormData(asset, { caption }) });
}

export const setBoatCover = (boatId: number, id: number) =>
  api<Photo>(`/boats/${boatId}/photos/${id}/`, { method: 'PATCH', body: { is_cover: true } });

export const deleteBoatPhoto = (boatId: number, id: number) => api(`/boats/${boatId}/photos/${id}/`, { method: 'DELETE' });
