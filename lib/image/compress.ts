/** Compress an image under ~20KB for cheap Spore cells (same approach as Spore ID). */
export async function compressForProfile(
  file: File,
): Promise<{ file: File; note: string }> {
  if (!file.type.startsWith('image/')) {
    return { file, note: 'Using original file format.' };
  }

  const originalKb = file.size / 1024;
  const bitmap = await fileToImage(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.floor(bitmap.width * scale));
  const height = Math.max(1, Math.floor(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { file, note: 'Compression unavailable; using original image.' };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const qualityLevels = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  let bestBlob: Blob | null = null;
  for (const quality of qualityLevels) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!blob) continue;
    if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
    if (blob.size <= 20 * 1024) break;
  }

  if (!bestBlob || bestBlob.size >= file.size) {
    return {
      file,
      note: `Original ${originalKb.toFixed(1)}KB kept (already optimized).`,
    };
  }

  const compressedFile = new File(
    [bestBlob],
    file.name.replace(/\.[^.]+$/, '.jpg'),
    { type: 'image/jpeg' },
  );

  return {
    file: compressedFile,
    note: `${originalKb.toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB`,
  };
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed.'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mime, quality);
  });
}
