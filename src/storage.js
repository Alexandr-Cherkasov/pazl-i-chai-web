let connection;

function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('pazl-i-chai', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('active');
      request.result.createObjectStore('completed', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

async function read(store, key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const objectStore = db.transaction(store, 'readonly').objectStore(store);
    const request = key ? objectStore.get(key) : objectStore.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(stores, change) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage write aborted'));
    change(transaction);
  });
}

export const getActive = () => read('active', 'current');
export const getCompleted = () => read('completed');

export function saveActive(game, isNew = false) {
  return write(['active'], (transaction) => {
    const active = transaction.objectStore('active');
    if (isNew) {
      active.put(game, 'current');
      return;
    }
    const current = active.get('current');
    current.onsuccess = () => {
      if (current.result?.id === game.id) active.put(game, 'current');
    };
  });
}

export function finishGame(game) {
  return write(['active', 'completed'], (transaction) => {
    transaction.objectStore('completed').put({
      id: game.id,
      name: game.name,
      filename: game.filename,
      original: game.original,
      thumbnail: game.thumbnail,
      level: game.level,
      completedAt: game.completedAt,
    });
    const active = transaction.objectStore('active');
    const current = active.get('current');
    current.onsuccess = () => {
      if (current.result?.id === game.id) active.delete('current');
    };
  });
}
