import { createPuzzle, piecePath, shuffled, targetFor } from './puzzle.js';

const $ = (id) => document.getElementById(id);
const board = $('board');
const tray = $('tray');
const dragLayer = $('drag-layer');

function fitCanvas(canvas, width, height) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

function paintPiece(context, image, piece, path, x, y, scale, stroke, shadow = false) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  if (shadow) {
    context.shadowColor = '#25382c70';
    context.shadowBlur = 6;
    context.shadowOffsetY = 2;
    context.fillStyle = '#f3efe2';
    context.fill(path);
    context.shadowColor = 'transparent';
  }
  context.save();
  context.clip(path);
  context.drawImage(image, -piece.x, -piece.y, image.naturalWidth, image.naturalHeight);
  context.restore();
  context.lineWidth = 1 / scale;
  context.strokeStyle = stroke;
  context.stroke(path);
  context.restore();
}

export function paintPostcard(canvas, image) {
  const puzzle = createPuzzle(image.naturalWidth, image.naturalHeight, 'easy', 39);
  if (puzzle.cols !== 4 || puzzle.rows !== 3) return;
  const width = 840;
  const scale = width / puzzle.width;
  const height = puzzle.height * scale;
  const context = fitCanvas(canvas, width, height);
  context.fillStyle = '#d7ddc7';
  context.fillRect(0, 0, width, height);
  const lifted = puzzle.pieces[3];
  for (const piece of puzzle.pieces) {
    const path = piecePath(puzzle, piece);
    if (piece === lifted) continue;
    paintPiece(context, image, piece, path, piece.x * scale, piece.y * scale, scale, '#25382c65');
  }
  context.save();
  context.translate(width * .835, height * .24);
  context.rotate(.12);
  const x = -puzzle.cellWidth * scale / 2;
  const y = -puzzle.cellHeight * scale / 2;
  paintPiece(context, image, lifted, piecePath(puzzle, lifted), x, y, scale, '#2d493b90', true);
  context.restore();
  canvas.hidden = false;
}

export class PuzzleBoard {
  constructor(game, image, onChange) {
    this.game = game;
    this.image = image;
    this.onChange = onChange;
    this.puzzle = createPuzzle(image.naturalWidth, image.naturalHeight, game.level, game.seed);
    this.paths = this.puzzle.pieces.map((piece) => piecePath(this.puzzle, piece));
    this.placed = new Set(game.placed);
    this.loose = new Map(game.loose);
    this.order = game.order;
    this.selected = null;
    this.pointer = null;
    this.keyboardCell = null;
    this.guide = false;
    this.edges = false;
    this.suppressClick = 0;
    this.listeners = new AbortController();
    $('toggle-guide').setAttribute('aria-pressed', 'false');
    $('toggle-edges').setAttribute('aria-pressed', 'false');
    const listen = (node, name, action) => node.addEventListener(name, action, { signal: this.listeners.signal });
    listen($('toggle-guide'), 'click', () => {
      this.guide = !this.guide;
      $('toggle-guide').setAttribute('aria-pressed', String(this.guide));
      this.render();
    });
    listen($('toggle-edges'), 'click', () => {
      this.edges = !this.edges;
      $('toggle-edges').setAttribute('aria-pressed', String(this.edges));
      this.select(null);
      this.renderTray();
    });
    listen($('shuffle'), 'click', () => {
      this.loose.clear();
      this.order = shuffled(this.order);
      this.select(null);
      this.update();
    });
    listen(tray, 'click', (event) => {
      if (event.detail > 0 && performance.now() < this.suppressClick) return;
      const button = event.target.closest('[data-piece]');
      if (!button) return;
      this.select(Number(button.dataset.piece));
      if (event.detail === 0) board.focus({ preventScroll: true });
    });
    listen(tray, 'pointerdown', (event) => {
      const button = event.target.closest('[data-piece]');
      if (button) this.press(event, Number(button.dataset.piece), button);
    });
    listen(tray, 'scroll', () => this.updateTrayControls());
    for (const [id, direction] of [['tray-prev', -1], ['tray-next', 1]]) {
      listen($(id), 'click', () => tray.scrollBy({
        left: tray.clientWidth * .8 * direction,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      }));
    }
    listen(board, 'pointerdown', (event) => {
      if (!this.layout || this.done) return;
      const loose = this.findLoose(this.worldAt(event.clientX, event.clientY));
      if (loose !== undefined && (this.selected === null || this.selected === loose)) {
        this.press(event, loose, board);
      }
    });
    listen(board, 'click', (event) => {
      if (performance.now() < this.suppressClick || this.selected === null || this.done) return;
      const point = this.worldAt(event.clientX, event.clientY);
      if (this.insidePicture(point)) this.tryCell(this.cellAt(point));
    });
    listen(board, 'keydown', (event) => this.onKey(event));
    listen(board, 'blur', () => {
      this.keyboardCell = null;
      this.render();
    });
    listen(window, 'pointermove', (event) => this.move(event));
    listen(window, 'pointerup', (event) => this.release(event));
    listen(window, 'pointercancel', (event) => this.cancel(event));
    listen(window, 'blur', () => this.cancel());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(board);
    this.refreshProgress();
    this.renderTray();
  }

  destroy() {
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.cancel();
    tray.replaceChildren();
  }

  get done() {
    return this.placed.size === this.puzzle.pieces.length;
  }

  refreshProgress() {
    const { size } = this.placed;
    $('game-count').textContent = size + ' из ' + this.puzzle.pieces.length;
    $('game-progress').max = this.puzzle.pieces.length;
    $('game-progress').value = size;
    $('toggle-guide').disabled = this.done;
    $('toggle-edges').disabled = this.done;
    $('shuffle').disabled = this.done;
  }

  resize() {
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (!width || !height) return;
    const { width: puzzleWidth, height: puzzleHeight } = this.puzzle;
    const scale = Math.min(width * (width < 560 ? .94 : .83) / puzzleWidth, height * .88 / puzzleHeight);
    this.layout = {
      width,
      height,
      scale,
      x: (width - puzzleWidth * scale) / 2,
      y: (height - puzzleHeight * scale) / 2,
    };
    this.render();
    this.updateTrayControls();
  }

  render() {
    if (!this.layout || !board.clientWidth) return;
    const { x, y, width, height, scale } = this.layout;
    const { width: imageWidth, height: imageHeight, cellWidth, cellHeight, cols, rows } = this.puzzle;
    const context = fitCanvas(board, width, height);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    context.fillStyle = '#f7f4e8';
    context.fillRect(x, y, w, h);
    if (this.done) {
      context.drawImage(this.image, x, y, w, h);
      return;
    }
    if (this.guide) {
      context.globalAlpha = .37;
      context.drawImage(this.image, x, y, w, h);
      context.globalAlpha = 1;
    }
    context.strokeStyle = '#9ca7978d';
    context.lineWidth = 1;
    context.strokeRect(x, y, w, h);
    context.beginPath();
    context.setLineDash([3, 4]);
    for (let col = 1; col < cols; col += 1) {
      const at = x + col * cellWidth * scale;
      context.moveTo(at, y);
      context.lineTo(at, y + h);
    }
    for (let row = 1; row < rows; row += 1) {
      const at = y + row * cellHeight * scale;
      context.moveTo(x, at);
      context.lineTo(x + w, at);
    }
    context.stroke();
    context.setLineDash([]);
    for (const id of this.placed) {
      const piece = this.puzzle.pieces[id];
      paintPiece(context, this.image, piece, this.paths[id], x + piece.x * scale, y + piece.y * scale, scale, '#32473b83');
    }
    for (const [id, position] of this.loose) {
      if ((this.edges && !this.puzzle.pieces[id].border) || (this.pointer?.dragging && this.pointer.id === id)) continue;
      paintPiece(context, this.image, this.puzzle.pieces[id], this.paths[id], x + position.x * scale, y + position.y * scale, scale, id === this.selected ? '#183f28' : '#273e32c0', true);
    }
    if (this.keyboardCell !== null) {
      const cell = this.puzzle.pieces[this.keyboardCell];
      context.lineWidth = 2;
      context.strokeStyle = '#365c4a';
      context.strokeRect(x + cell.x * scale + 1, y + cell.y * scale + 1, cellWidth * scale - 2, cellHeight * scale - 2);
    }
  }

  renderTray() {
    const oldScroll = tray.scrollLeft;
    const restoreFocus = tray.contains(document.activeElement);
    const existing = new Map([...tray.querySelectorAll('[data-piece]')].map((button) => [Number(button.dataset.piece), button]));
    const ids = this.order.filter((id) => !this.placed.has(id) && !this.loose.has(id) && (!this.edges || this.puzzle.pieces[id].border));
    const buttons = ids.map((id) => {
      const button = existing.get(id) ?? this.makeTrayPiece(id);
      button.setAttribute('aria-pressed', String(id === this.selected));
      return button;
    });
    if (buttons.length) {
      tray.replaceChildren(...buttons);
    } else {
      const message = document.createElement('p');
      message.className = 'tray-empty';
      message.textContent = this.done ? 'Все детали на месте.' : (this.edges ? 'В лотке больше нет крайних деталей.' : 'Оставшиеся детали на игровом поле.');
      tray.replaceChildren(message);
    }
    tray.scrollLeft = oldScroll;
    if (restoreFocus) (buttons[0] ?? board).focus({ preventScroll: true });
    this.updateTrayControls();
  }

  makeTrayPiece(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tray-piece';
    button.dataset.piece = id;
    button.setAttribute('aria-label', 'Деталь ' + (id + 1));
    const preview = document.createElement('canvas');
    preview.setAttribute('aria-hidden', 'true');
    const size = 62;
    const context = fitCanvas(preview, size, size);
    const { cellWidth, cellHeight } = this.puzzle;
    const scale = 46 / Math.max(cellWidth, cellHeight);
    paintPiece(context, this.image, this.puzzle.pieces[id], this.paths[id], (size - cellWidth * scale) / 2, (size - cellHeight * scale) / 2, scale, '#32473b97', true);
    button.append(preview);
    return button;
  }

  updateTrayControls() {
    $('tray-prev').disabled = tray.scrollLeft <= 1;
    $('tray-next').disabled = tray.scrollLeft + tray.clientWidth >= tray.scrollWidth - 1;
  }

  select(id) {
    this.selected = id;
    board.classList.toggle('is-selected', id !== null);
    for (const button of tray.querySelectorAll('[data-piece][aria-pressed="true"]')) {
      button.setAttribute('aria-pressed', 'false');
    }
    tray.querySelector('[data-piece="' + id + '"]')?.setAttribute('aria-pressed', 'true');
    $('game-help').textContent = id === null
      ? 'Перетащите деталь на поле или выберите её, затем укажите место. На клавиатуре используйте стрелки и Enter.'
      : 'Деталь выбрана. Укажите её место на поле или нажмите Esc, чтобы снять выбор.';
    this.render();
  }

  worldAt(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    const { x, y, scale } = this.layout;
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale };
  }

  insidePicture({ x, y }) {
    return x >= 0 && y >= 0 && x < this.puzzle.width && y < this.puzzle.height;
  }

  cellAt({ x, y }) {
    const { cellWidth, cellHeight, cols } = this.puzzle;
    return Math.floor(x / cellWidth) + Math.floor(y / cellHeight) * cols;
  }

  findLoose({ x, y }) {
    const context = board.getContext('2d');
    return [...this.loose].reverse().find(([id, position]) => {
      if (this.edges && !this.puzzle.pieces[id].border) return false;
      return context.isPointInPath(this.paths[id], (x - position.x) * context.getTransform().a, (y - position.y) * context.getTransform().d);
    })?.[0];
  }

  tryCell(cell) {
    if (this.selected === null) return;
    const piece = this.puzzle.pieces[cell];
    if (this.place(this.selected, piece.x, piece.y)) return;
    $('game-help').textContent = 'Для этой детали нужно другое место. Попробуйте ещё раз.';
  }

  onKey(event) {
    if (this.done) return;
    const { cols, rows } = this.puzzle;
    const start = this.keyboardCell ?? 0;
    let row = Math.floor(start / cols);
    let col = start % cols;
    switch (event.key) {
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'ArrowDown': row = Math.min(rows - 1, row + 1); break;
      case 'ArrowLeft': col = Math.max(0, col - 1); break;
      case 'ArrowRight': col = Math.min(cols - 1, col + 1); break;
      case 'Enter':
      case ' ': this.tryCell(start); break;
      case 'Escape': this.select(null); break;
      default: return;
    }
    event.preventDefault();
    this.keyboardCell = row * cols + col;
    this.render();
  }

  press(event, id, origin) {
    if (this.pointer || !this.layout || event.button !== 0) return;
    const position = this.loose.get(id);
    const point = this.worldAt(event.clientX, event.clientY);
    const offset = position
      ? { x: point.x - position.x, y: point.y - position.y }
      : { x: this.puzzle.cellWidth / 2, y: this.puzzle.cellHeight / 2 };
    this.pointer = { pointerId: event.pointerId, id, origin, x: event.clientX, y: event.clientY, offset, dragging: false };
    origin.setPointerCapture(event.pointerId);
  }

  move(event) {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    if (!pointer.dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
    if (!pointer.dragging) {
      pointer.dragging = true;
      this.select(null);
    }
    const { scale } = this.layout;
    const { cellWidth, cellHeight } = this.puzzle;
    const padding = 12 + Math.min(cellWidth, cellHeight) * .3 * scale;
    const width = Math.ceil(cellWidth * scale + padding * 2);
    const height = Math.ceil(cellHeight * scale + padding * 2);
    dragLayer.hidden = false;
    const style = dragLayer.style;
    style.left = event.clientX - pointer.offset.x * scale - padding + 'px';
    style.top = event.clientY - pointer.offset.y * scale - padding + 'px';
    style.width = width + 'px';
    style.height = height + 'px';
    const context = fitCanvas(dragLayer, width, height);
    paintPiece(context, this.image, this.puzzle.pieces[pointer.id], this.paths[pointer.id], padding, padding, scale, '#32473bc0', true);
  }

  release(event) {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    this.pointer = null;
    dragLayer.hidden = true;
    if (!pointer.dragging) {
      if (pointer.origin === board) {
        this.suppressClick = performance.now() + 160;
        this.select(pointer.id);
      }
      return;
    }
    this.suppressClick = performance.now() + 160;
    const point = this.worldAt(event.clientX, event.clientY);
    const x = point.x - pointer.offset.x;
    const y = point.y - pointer.offset.y;
    if (this.place(pointer.id, x, y)) return;
    const rect = board.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom) {
      this.loose.delete(pointer.id);
      this.loose.set(pointer.id, { x, y });
    } else {
      this.loose.delete(pointer.id);
    }
    this.update();
  }

  cancel(event) {
    if (event && event.type === 'pointercancel' && event.pointerId !== this.pointer?.pointerId) return;
    this.pointer = null;
    dragLayer.hidden = true;
    this.render();
  }

  place(id, x, y) {
    if (!targetFor(this.puzzle, this.puzzle.pieces[id], x, y)) return false;
    this.placed.add(id);
    this.loose.delete(id);
    this.select(null);
    this.update();
    return true;
  }

  update() {
    this.refreshProgress();
    this.renderTray();
    this.render();
    this.onChange({
      placed: [...this.placed],
      loose: [...this.loose],
      order: [...this.order],
    }, this.done);
  }
}
