const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

function extensionOf(name = '') {
  const part = String(name).split('.').pop();
  return part ? part.toLowerCase() : '';
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('This image could not be converted to WebP.'));
    }, type, quality);
  });
}

async function normalizeHeic(file) {
  const extension = extensionOf(file.name);
  const isHeic = HEIC_EXTENSIONS.has(extension) || /image\/hei[cf]/i.test(file.type || '');
  if (!isHeic) return file;

  const heicModule = await import('heic2any');
  const heic2any = heicModule.default || heicModule;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.96 });
  return Array.isArray(converted) ? converted[0] : converted;
}

async function decodeImage(blob) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close?.()
      };
    } catch {
      // Fall through to HTMLImageElement. This path helps with formats that
      // Electron/Chromium can display but createImageBitmap rejects.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
      close: () => {}
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

/**
 * Convert browser-readable images plus HEIC/HEIF to a storage-friendly WebP.
 * Large phone photos are scaled down to a maximum edge while keeping enough
 * resolution for lab documentation and zooming.
 */
export async function compressImageToWebP(file, { maxDimension = 3000, quality = 0.9 } = {}) {
  if (!file) throw new Error('Choose an image first.');

  const source = await normalizeHeic(file);
  let decoded;
  try {
    decoded = await decodeImage(source);
  } catch (error) {
    throw new Error(`Unsupported or damaged image: ${file.name}. Try JPEG, PNG, WebP, AVIF, BMP, GIF, HEIC, or HEIF.`);
  }

  const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  decoded.draw(context, width, height);
  decoded.close?.();

  let webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp.size > 4 * 1024 * 1024) webp = await canvasToBlob(canvas, 'image/webp', 0.84);
  if (webp.size > 6 * 1024 * 1024) webp = await canvasToBlob(canvas, 'image/webp', 0.8);

  return {
    blob: webp,
    width,
    height,
    originalSize: file.size || 0,
    webpSize: webp.size,
    originalName: file.name || 'image',
    mimeType: 'image/webp'
  };
}
