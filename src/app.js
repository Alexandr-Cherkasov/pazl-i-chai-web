import { PuzzleBoard } from './board.js?v=workshop';
import { loadImage, prepareImage, sample } from './images.js';
import { levels, shuffled } from './puzzle.js';
import { finishGame, getActive, getCompleted, saveActive } from './storage.js';

const $ = (id) => document.getElementById(id);
const fileLimit = 20 * 1024 * 1024;
const uploadTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const libraryDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });
const galleryUrls = [];
const ready = restore();
let source = null;
let uploadVersion = 0;
let processing = false;
let starting = false;
let active;
let game;
let puzzleBoard;
let routeVersion = 0;
let sourceUrl;
let finishUrl;
let previewUrl;
let saveQueue = Promise.resolve();

function report(id, message = '') {
  const box = $(id);
  box.textContent = message;
  box.hidden = !message;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function setSource(data) {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  source = data;
  sourceUrl = data ? URL.createObjectURL(data.thumbnail) : undefined;
  $('source-photo').src = sourceUrl ?? sample.url;
  $('source-name').textContent = data?.name ?? sample.name + ' · пример';
  $('source-name').title = $('source-name').textContent;
  $('reset-photo').hidden = !data;
  $('drop-title').textContent = data ? 'Заменить фото' : 'Добавить своё фото';
}

function refreshStart() {
  $('start-game').disabled = processing || starting;
  $('start-game').querySelector('span').textContent = starting ? 'Готовим пазл…' : 'Начать сборку';
  $('drop-help').textContent = processing ? 'Загружаем изображение…' : 'Перетащите сюда или выберите файл';
}

async function chooseFile(file) {
  if (!file || starting) return;
  const version = ++uploadVersion;
  processing = true;
  refreshStart();
  report('upload-error');
  try {
    if (!uploadTypes.includes(file.type) && (file.type || !/\.(jpe?g|png|webp|avif|gif)$/i.test(file.name))) {
      throw new Error('Подойдут файлы JPG, PNG, WebP, AVIF или GIF.');
    }
    if (file.size > fileLimit) throw new Error('Файл больше 20 МБ. Выберите файл поменьше.');
    const filename = file.name;
    const name = filename.replace(/\.[^.]+$/, '').trim() || 'Моя картинка';
    const data = await prepareImage(file, filename, name);
    if (version === uploadVersion) setSource(data);
  } catch (error) {
    if (version === uploadVersion) {
      report('upload-error', error instanceof DOMException ? 'Не удалось открыть изображение. Попробуйте другой файл.' : error.message);
    }
  } finally {
    if (version === uploadVersion) {
      processing = false;
      refreshStart();
    }
  }
}

function showResume() {
  $('resume-panel').hidden = !active;
  if (!active) return;
  $('resume-name').textContent = active.name;
  $('resume-progress').textContent = 'В процессе · ' + active.placed.length + ' из ' + levels[active.level].count;
}

async function restore() {
  try {
    const [current, completed] = await Promise.all([getActive(), getCompleted()]);
    active = current;
    showResume();
    showLibraryCount(completed.length);
  } catch {
    report('upload-error', 'Хранилище браузера недоступно. Картинки и прогресс могут не сохраниться.');
  }
}

async function startGame() {
  if (processing || starting) return;
  starting = true;
  refreshStart();
  await ready;
  if (active?.placed.length || active?.loose.length) {
    if (!window.confirm('Начать новый пазл? Текущая незаконченная сборка будет заменена.')) {
      starting = false;
      refreshStart();
      return;
    }
  }
  report('upload-error');
  let storageWarning = '';
  try {
    let data = source;
    if (!data) {
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error('Не удалось загрузить пример.');
      data = await prepareImage(await response.blob(), sample.filename, sample.name);
    }
    const level = document.querySelector('input[name="level"]:checked').value;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const id = crypto.randomUUID?.() ?? [Date.now(), seed].join('-');
    const order = shuffled(Array.from({ length: levels[level].count }, (_, index) => index));
    const next = { ...data, id, level, seed, order, placed: [], loose: [] };
    await saveQueue;
    try {
      await saveActive(next, true);
    } catch {
      storageWarning = 'Не удалось сохранить прогресс. Проверьте, доступно ли хранилище браузера.';
    }
    active = next;
    game = next;
    showResume();
    location.hash = 'play';
  } catch {
    report('upload-error', 'Не удалось создать пазл. Попробуйте выбрать другую картинку.');
  } finally {
    starting = false;
    refreshStart();
  }
  if (storageWarning) report('game-error', storageWarning);
}

function showLibraryCount(count) {
  $('library-count').hidden = count === 0;
  $('library-count').textContent = String(count);
}

function clearGallery() {
  galleryUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  $('gallery').replaceChildren();
}

function downloadFor(anchor, entry, url) {
  anchor.href = url;
  anchor.download = entry.filename;
}

function openPreview(entry) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(entry.original);
  $('preview-title').textContent = entry.name;
  $('preview-photo').src = previewUrl;
  $('preview-photo').alt = entry.name;
  downloadFor($('preview-download'), entry, previewUrl);
  $('preview-dialog').showModal();
}

function galleryCard(entry) {
  const card = document.createElement('article');
  card.className = 'gallery-card';
  const figure = document.createElement('button');
  figure.type = 'button';
  figure.className = 'gallery-photo';
  figure.setAttribute('aria-label', 'Открыть картинку «' + entry.name + '»');
  figure.addEventListener('click', () => openPreview(entry));
  const image = document.createElement('img');
  const thumbnailUrl = URL.createObjectURL(entry.thumbnail);
  galleryUrls.push(thumbnailUrl);
  image.src = thumbnailUrl;
  image.alt = '';
  image.loading = 'lazy';
  figure.append(image);

  const details = document.createElement('div');
  details.className = 'gallery-details';
  const heading = document.createElement('div');
  const name = document.createElement('h2');
  name.textContent = entry.name;
  const caption = document.createElement('p');
  caption.textContent = levels[entry.level].label + ' · ' + libraryDate.format(entry.completedAt);
  heading.append(name, caption);
  const download = document.createElement('a');
  download.className = 'icon-button';
  download.title = 'Скачать изображение';
  download.setAttribute('aria-label', 'Скачать «' + entry.name + '»');
  const originalUrl = URL.createObjectURL(entry.original);
  galleryUrls.push(originalUrl);
  downloadFor(download, entry, originalUrl);
  download.append(icon('download'));
  details.append(heading, download);
  card.append(figure, details);
  return card;
}

async function renderLibrary(version) {
  clearGallery();
  report('library-error');
  $('library-empty').hidden = true;
  try {
    await saveQueue;
    const entries = await getCompleted();
    if (version !== routeVersion) return;
    showLibraryCount(entries.length);
    $('library-empty').hidden = entries.length > 0;
    entries.sort((a, b) => b.completedAt - a.completedAt);
    $('gallery').append(...entries.map(galleryCard));
  } catch {
    if (version === routeVersion) report('library-error', 'Не удалось открыть библиотеку. Проверьте, доступно ли хранилище браузера.');
  }
}

function showFinish(state, message) {
  $('finish-panel').hidden = false;
  $('finish-message').textContent = message;
  $('retry-finish').hidden = state !== 'error';
  $('finish-panel').querySelector('a[href="#library"]').hidden = state !== 'saved';
  if (finishUrl) URL.revokeObjectURL(finishUrl);
  finishUrl = URL.createObjectURL(game.original);
  downloadFor($('finish-download'), game, finishUrl);
}

function persistCompletion(current) {
  showFinish('saving', 'Сохраняем картинку в библиотеку…');
  saveQueue = saveQueue.then(async () => {
    try {
      await finishGame(current);
      if (game?.id === current.id) {
        game = { ...current, saved: true };
        if (active?.id === current.id) active = undefined;
        report('game-error');
        showResume();
        showFinish('saved', 'Картинка добавлена в библиотеку.');
      }
      showLibraryCount((await getCompleted()).length);
    } catch {
      if (game?.id === current.id && !game.saved) {
        showFinish('error', 'Не удалось сохранить картинку. Её можно скачать сейчас.');
      }
    }
  });
}

function onBoardChange(progress, done) {
  game = { ...game, ...progress, completedAt: done ? Date.now() : undefined };
  if (active?.id === game.id) active = game;
  showResume();
  const current = game;
  if (done) {
    persistCompletion(current);
    $('finish-title').focus({ preventScroll: true });
    return;
  }
  saveQueue = saveQueue.then(async () => {
    try {
      await saveActive(current);
      if (game?.id === current.id) report('game-error');
    } catch {
      if (game?.id === current.id) report('game-error', 'Не удалось сохранить прогресс в этом браузере.');
    }
  });
}

async function openGame(current, version) {
  if (puzzleBoard?.game.id === current.id) return;
  const image = await loadImage(current.playable);
  if (version !== routeVersion) return;
  puzzleBoard?.destroy();
  $('finish-panel').hidden = true;
  $('game-title').textContent = current.name;
  const level = levels[current.level];
  $('game-level').textContent = level.label + ' · ' + level.count + (level.count === 192 ? ' детали' : ' деталей');
  $('game-feedback').textContent = '';
  game = current;
  puzzleBoard = new PuzzleBoard(current, image, onBoardChange);
  puzzleBoard.resize();
  if (current.completedAt) {
    if (current.saved) showFinish('saved', 'Картинка добавлена в библиотеку.');
    else persistCompletion(current);
  }
  $('game-title').focus({ preventScroll: true });
}

function showView(view) {
  for (const key of ['create', 'play', 'library']) $(key + '-view').hidden = key !== view;
  $('nav-create').toggleAttribute('aria-current', view !== 'library');
  $('nav-library').toggleAttribute('aria-current', view === 'library');
  $(view === 'library' ? 'nav-library' : 'nav-create').setAttribute('aria-current', 'page');
  if (view !== 'library') clearGallery();
}

async function route() {
  const version = ++routeVersion;
  await ready;
  if (version !== routeVersion) return;
  const hash = location.hash.slice(1);
  if (hash === 'library') {
    showView('library');
    window.scrollTo(0, 0);
    $('library-title').focus({ preventScroll: true });
    await renderLibrary(version);
    return;
  }
  if (hash === 'play' && (game || active)) {
    showView('play');
    window.scrollTo(0, 0);
    try {
      await openGame(game ?? active, version);
      if (version === routeVersion) puzzleBoard?.resize();
    } catch {
      if (version === routeVersion) report('game-error', 'Не удалось открыть сохранённый пазл.');
    }
    return;
  }
  showView('create');
  if (hash === 'setup') {
    $('setup').scrollIntoView({ block: 'start' });
    $('setup-title').focus({ preventScroll: true });
  } else if (hash === 'create' || hash === 'play') {
    window.scrollTo(0, 0);
    $('hero-title').focus({ preventScroll: true });
  }
}

$('hero-upload').addEventListener('click', () => $('file').click());
$('drop-zone').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (location.hash === '#setup') $('setup').scrollIntoView({ block: 'start' });
  else location.hash = 'setup';
  chooseFile(file);
});
$('reset-photo').addEventListener('click', () => {
  uploadVersion += 1;
  processing = false;
  report('upload-error');
  setSource(null);
  refreshStart();
  $('drop-zone').focus();
});
$('sample-link').addEventListener('click', (event) => {
  uploadVersion += 1;
  processing = false;
  setSource(null);
  report('upload-error');
  refreshStart();
  if (location.hash === '#setup') {
    event.preventDefault();
    $('setup').scrollIntoView({ block: 'start' });
    $('setup-title').focus({ preventScroll: true });
  }
});

const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', (event) => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('is-dragover');
});
dropZone.addEventListener('dragleave', (event) => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragover');
});
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('is-dragover');
  chooseFile(event.dataTransfer.files[0]);
});
$('start-game').addEventListener('click', startGame);
$('retry-finish').addEventListener('click', () => persistCompletion(game));
$('close-preview').addEventListener('click', () => $('preview-dialog').close());
$('preview-dialog').addEventListener('close', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  $('preview-photo').removeAttribute('src');
});
window.addEventListener('hashchange', route);
route();
