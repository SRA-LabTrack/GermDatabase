const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

function extensionOf(name = '') {
  const part = String(name).split('.').pop();
  return part ? part.toLowerCase() : '';
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode WebP image.')), 'image/webp', quality);
  });
}

async function normalizeHeic(file) {
  const extension = extensionOf(file.name);
  const isHeic = HEIC_EXTENSIONS.has(extension) || /image\/hei[cf]/i.test(file.type || '');
  if (!isHeic) return file;
  const mod = await import('heic2any');
  const heic2any = mod.default || mod;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  return Array.isArray(converted) ? converted[0] : converted;
}

async function decodeImage(blob) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close?.()
      };
    } catch {}
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
      draw: (ctx, width, height) => ctx.drawImage(image, 0, 0, width, height),
      close: () => {}
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderVariant(decoded, maxDimension, quality) {
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
  const blob = await canvasToBlob(canvas, quality);
  return { blob, width, height };
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
 * Produces two WebP files per selected image:
 * - full: high-quality documentation image, capped at 2200px
 * - thumb: small list/card image, capped at 520px
 * This keeps Appwrite Storage and list bandwidth low without sacrificing detail views.
 */
export async function prepareImageVariants(file) {
  if (!file) throw new Error('Choose an image first.');
  const source = await normalizeHeic(file);
  let decoded;
  try {
    decoded = await decodeImage(source);
  } catch {
    throw new Error(`Unsupported or damaged image: ${file.name}`);
  }

  try {
    let full = await renderVariant(decoded, 2200, 0.88);
    if (full.blob.size > 3.5 * 1024 * 1024) full = await renderVariant(decoded, 2000, 0.82);
    const thumb = await renderVariant(decoded, 520, 0.76);
    return {
      originalName: file.name || 'image',
      originalSize: file.size || 0,
      full,
      thumb
    };
  } finally {
    decoded.close?.();
  }
}
