export async function compressImageFileToWebPDataUrl(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<string> {
  const { maxWidth = 1280, maxHeight = 800, quality = 0.84 } = options;

  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(blob);
    });

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Invalid image dimensions'));
        el.src = objectUrl;
      });

      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) {
        return readAsDataUrl(file);
      }

      const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
      const targetW = Math.max(1, Math.round(srcW * scale));
      const targetH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return readAsDataUrl(file);
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const webpDataUrl = canvas.toDataURL('image/webp', quality);
      if (webpDataUrl.startsWith('data:image/webp')) {
        return webpDataUrl;
      }

      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      if (jpegDataUrl.startsWith('data:image/jpeg')) {
        return jpegDataUrl;
      }

      return readAsDataUrl(file);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return readAsDataUrl(file);
  }
}
