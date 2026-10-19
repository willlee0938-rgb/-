var PhotoCompression = (function () {
  const targetBytes = 500 * 1024;
  async function prepare(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const originalWidth = bitmap.width, originalHeight = bitmap.height;
      if (!originalWidth || !originalHeight) throw new Error('照片尺寸不正確。');
      if (Math.max(originalWidth, originalHeight) <= 1600 && file.size <= targetBytes) {
        return { file, originalSize: file.size, width: originalWidth, height: originalHeight, compressed: false };
      }
      let side = Math.min(1600, Math.max(originalWidth, originalHeight)), best = null;
      while (true) {
        const scale = Math.min(1, side / Math.max(originalWidth, originalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(originalWidth * scale)); canvas.height = Math.max(1, Math.round(originalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('瀏覽器無法處理照片，請更新瀏覽器後重試。');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.84, 0.72, 0.6]) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (!blob) throw new Error('照片壓縮失敗，請換一張照片重試。');
          if (!best || blob.size < best.blob.size) best = { blob, width: canvas.width, height: canvas.height };
          if (blob.size <= targetBytes) break;
        }
        canvas.width = canvas.height = 1;
        if (best.blob.size <= targetBytes || side <= 960) break;
        side = Math.max(960, Math.round(side * 0.8));
      }
      // Never replace a smaller original with a larger recompressed file when no resize is needed.
      if (file.size < best.blob.size && Math.max(originalWidth, originalHeight) <= 1600) {
        return { file, originalSize: file.size, width: originalWidth, height: originalHeight, compressed: false };
      }
      const output = new File([best.blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
      return { file: output, originalSize: file.size, width: best.width, height: best.height, compressed: true };
    } finally { bitmap.close(); }
  }
  return { prepare, targetBytes };
})();
