import { useCallback } from 'react';

export function useBlobImageSource(blob?: Blob | null) {
  return useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || !blob) return;
      const url = URL.createObjectURL(blob);
      image.src = url;
      return () => {
        image.removeAttribute('src');
        URL.revokeObjectURL(url);
      };
    },
    [blob],
  );
}
