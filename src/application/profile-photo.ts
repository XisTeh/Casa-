import {
  DEFAULT_AVATAR_CROP,
  type AvatarCrop,
  type ProfileAvatarData,
} from '../domain/profile-avatar';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 1600;
const AVATAR_DIMENSION = 512;
const OUTPUT_QUALITY = 0.86;
export const MAX_AVATAR_ZOOM = 3;

export const INVALID_PROFILE_PHOTO_MESSAGE = 'Escolha uma imagem JPG, PNG ou WebP.';
export const OVERSIZED_PROFILE_PHOTO_MESSAGE =
  'A imagem deve ter no máximo 20 MB para ser processada neste dispositivo.';

type ImageSize = { width: number; height: number };

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function exportCanvas(canvas: HTMLCanvasElement) {
  const webp = await canvasToBlob(canvas, 'image/webp', OUTPUT_QUALITY);
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', OUTPUT_QUALITY);
  if (jpeg) return jpeg;
  throw new Error('Não foi possível otimizar esta imagem. Tente outra foto.');
}

async function decodeImage(blob: Blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(blob);
    } catch {
      throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
    }
  }
}

export function constrainAvatarCrop(crop: AvatarCrop, image: ImageSize): AvatarCrop {
  const zoom = Math.min(MAX_AVATAR_ZOOM, Math.max(1, crop.zoom));
  if (!image.width || !image.height) return { ...DEFAULT_AVATAR_CROP, zoom };

  const cropSize = Math.min(image.width, image.height) / zoom;
  const minX = cropSize / (2 * image.width);
  const minY = cropSize / (2 * image.height);

  return {
    zoom,
    centerX: Math.min(1 - minX, Math.max(minX, crop.centerX)),
    centerY: Math.min(1 - minY, Math.max(minY, crop.centerY)),
  };
}

export function getAvatarPreviewGeometry(image: ImageSize, viewportSize: number, crop: AvatarCrop) {
  const constrained = constrainAvatarCrop(crop, image);
  const scale = (viewportSize / Math.min(image.width, image.height)) * constrained.zoom;
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    width,
    height,
    left: viewportSize / 2 - constrained.centerX * width,
    top: viewportSize / 2 - constrained.centerY * height,
  };
}

export function moveAvatarCrop(
  crop: AvatarCrop,
  image: ImageSize,
  viewportSize: number,
  deltaX: number,
  deltaY: number,
) {
  const geometry = getAvatarPreviewGeometry(image, viewportSize, crop);
  return constrainAvatarCrop(
    {
      ...crop,
      centerX: crop.centerX - deltaX / geometry.width,
      centerY: crop.centerY - deltaY / geometry.height,
    },
    image,
  );
}

export async function prepareProfilePhotoSource(file: File): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
  if (file.size > MAX_INPUT_BYTES) throw new Error(OVERSIZED_PROFILE_PHOTO_MESSAGE);

  const bitmap = await decodeImage(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
    const scale = Math.min(1, MAX_SOURCE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar esta imagem neste dispositivo.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await exportCanvas(canvas);
  } finally {
    bitmap.close();
  }
}

export async function createProfileAvatar(
  sourceBlob: Blob,
  crop: AvatarCrop,
): Promise<ProfileAvatarData> {
  const bitmap = await decodeImage(sourceBlob);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
    const constrained = constrainAvatarCrop(crop, bitmap);
    const sourceSize = Math.min(bitmap.width, bitmap.height) / constrained.zoom;
    const sourceX = constrained.centerX * bitmap.width - sourceSize / 2;
    const sourceY = constrained.centerY * bitmap.height - sourceSize / 2;
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_DIMENSION;
    canvas.height = AVATAR_DIMENSION;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar esta imagem neste dispositivo.');
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_DIMENSION,
      AVATAR_DIMENSION,
    );

    return {
      avatarBlob: await exportCanvas(canvas),
      avatarSourceBlob: sourceBlob,
      avatarCrop: constrained,
    };
  } finally {
    bitmap.close();
  }
}

export async function optimizeProfilePhoto(file: File): Promise<Blob> {
  const sourceBlob = await prepareProfilePhotoSource(file);
  return (await createProfileAvatar(sourceBlob, DEFAULT_AVATAR_CROP)).avatarBlob;
}
