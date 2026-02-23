/**
 * Compress an image file by resizing and reducing quality.
 * Returns a base64 string (without the data URI prefix).
 */
export function compressImage(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.split(',')[1];

      const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
      console.log(`Image compressed: ${file.size / 1024 | 0}KB → ~${sizeKB}KB (${width}x${height})`);

      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Fast compress for image search — smaller dimensions & lower quality
 * for minimal upload time.
 */
export function compressImageForSearch(file: File): Promise<string> {
  return compressImage(file, 256, 256, 0.35);
}
