export const sample = {
  name: 'Домик у озера',
  filename: 'Домик у озера.jpg',
  url: './assets/lake-cottage.jpg',
};

export function loadImage(source) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image).finally(() => {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  });
}

function raster(image, maxSide) {
  const scale = Math.min(maxSide / Math.max(image.width, image.height), 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Image encoding failed'));
    }, 'image/png');
  });
}

export async function prepareImage(original, filename, name) {
  const image = await loadImage(original);
  const ratio = Math.max(image.width, image.height) / Math.min(image.width, image.height);
  if (ratio > 8 || Math.min(image.width, image.height) < 12) {
    throw new Error('Выберите картинку с пропорциями до 8:1 и сторонами от 12 пикселей.');
  }
  const [playable, thumbnail] = await Promise.all([raster(image, 1800), raster(image, 400)]);
  return { name, filename, original, playable, thumbnail };
}
