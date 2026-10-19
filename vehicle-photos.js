(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VehiclePhotos = factory();
})(globalThis, function () {
  'use strict';
  const bucket = 'driveos-vehicle-photos';
  const mime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function validateFiles(files, existingCount, input = false) {
    if (!files.length || files.length > 10) throw new Error('每次請選擇 1–10 張照片。');
    if (existingCount + files.length > 20) throw new Error('每台車最多 20 張照片，請先移除不需要的照片。');
    for (const file of files) {
      if (!mime[file.type]) throw new Error('目前支援 JPG、PNG、WebP；手機 HEIC 照片請先轉成 JPG。');
      if (!file.size || file.size > (input ? 25 : 5) * 1024 * 1024) throw new Error(input ? '原始照片每張須介於 1 byte 至 25MB。' : '處理後每張照片須介於 1 byte 至 5MB。');
    }
  }
  function objectPath(ownerId, vehicleId, contentType) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId) || !vehicleId || !mime[contentType]) throw new Error('照片上傳需要有效的帳號、車源與圖片格式。');
    return `${ownerId}/${encodeURIComponent(vehicleId)}/${crypto.randomUUID()}.${mime[contentType]}`;
  }
  const owned = (path, ownerId) => typeof path === 'string' && path.startsWith(ownerId + '/') && !path.split('/').some(part => part === '..' || part === '.');
  function gallery(car) {
    if (Array.isArray(car.images) && car.images.length) return car.images.filter(image => image && (image.url || image.storagePath)).map(image => ({ ...image }));
    return car.image ? [{ url: car.image, type: 'cover', position: 1 }] : [];
  }
  function setGallery(car, images) {
    if (images.length > 20) throw new Error('每台車最多 20 張照片。');
    return { ...car, images: images.map((image, index) => ({ ...image, position: index + 1, type: index ? 'other' : 'cover' })), image: images[0]?.url || '' };
  }
  function setCover(car, index) {
    const images = gallery(car);
    if (!Number.isInteger(index) || !images[index]) throw new Error('找不到這張照片，請重新開啟圖庫。');
    const [selected] = images.splice(index, 1); return setGallery(car, [selected, ...images]);
  }
  function remove(car, index) {
    const images = gallery(car);
    if (!Number.isInteger(index) || !images[index]) throw new Error('找不到這張照片，請重新開啟圖庫。');
    const [removed] = images.splice(index, 1); return { car: setGallery(car, images), removed };
  }
  function usage(cars, ownerId) {
    const files = new Map();
    for (const car of cars) for (const image of gallery(car)) {
      if (!image.storagePath || (ownerId && !owned(image.storagePath, ownerId))) continue;
      const size = Number.isFinite(image.size) && image.size > 0 ? image.size : null;
      const previous = files.get(image.storagePath);
      files.set(image.storagePath, size === null ? previous ?? null : Math.max(size, previous || 0));
    }
    return { count: files.size, bytes: [...files.values()].reduce((sum, size) => sum + (size || 0), 0), unknown: [...files.values()].filter(size => size === null).length };
  }
  return { bucket, validateFiles, objectPath, owned, gallery, setGallery, setCover, remove, usage };
});
