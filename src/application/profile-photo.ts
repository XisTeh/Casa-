const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 512;
const OUTPUT_QUALITY = 0.82;

export const INVALID_PROFILE_PHOTO_MESSAGE = 'Escolha uma imagem JPG, PNG ou WebP.';
export const OVERSIZED_PROFILE_PHOTO_MESSAGE =
  'A imagem deve ter no máximo 20 MB para ser processada neste dispositivo.';

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function optimizeProfilePhoto(file: File): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
  if (file.size > MAX_INPUT_BYTES) throw new Error(OVERSIZED_PROFILE_PHOTO_MESSAGE);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
  }

  try {
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    if (!sourceSize) throw new Error(INVALID_PROFILE_PHOTO_MESSAGE);
    const outputSize = Math.min(MAX_AVATAR_DIMENSION, sourceSize);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar esta imagem neste dispositivo.');

    const sourceX = Math.floor((bitmap.width - sourceSize) / 2);
    const sourceY = Math.floor((bitmap.height - sourceSize) / 2);
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    const webp = await canvasToBlob(canvas, 'image/webp', OUTPUT_QUALITY);
    if (webp?.type === 'image/webp') return webp;
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', OUTPUT_QUALITY);
    if (jpeg) return jpeg;
    throw new Error('Não foi possível otimizar esta imagem. Tente outra foto.');
  } finally {
    bitmap.close();
  }
}
