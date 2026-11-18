import { seededRandom, shuffled } from './puzzle.js';

function slotsIn(box, cellWidth, cellHeight, padding, tab) {
  const stepX = cellWidth + padding * 2;
  const stepY = cellHeight + padding * 2;
  const cols = Math.floor((box.right - box.left) / stepX);
  const rows = Math.floor((box.bottom - box.top) / stepY);
  if (cols < 1 || rows < 1) return [];
  const spareX = (box.right - box.left - cols * stepX) / 2;
  const spareY = (box.bottom - box.top - rows * stepY) / 2;
  const jitterX = padding - tab + (cols === 1 ? spareX * .79 : 0);
  const jitterY = padding - tab + (rows === 1 ? spareY * .79 : 0);
  const startX = box.left + spareX + padding;
  const startY = box.top + spareY + padding;
  return Array.from({ length: cols * rows }, (_, index) => ({
    x: startX + (index % cols) * stepX,
    y: startY + Math.floor(index / cols) * stepY,
    jitterX,
    jitterY,
  }));
}

export function createDesk(puzzle, viewWidth, viewHeight) {
  const { width, height, cellWidth, cellHeight, pieces } = puzzle;
  const shortEdge = Math.min(cellWidth, cellHeight);
  const compact = viewWidth < 640;
  const padding = shortEdge * .38;
  const gap = shortEdge * .11;
  let scale = Math.min(viewWidth * (compact ? .78 : .60) / width, viewHeight * .59 / height);

  for (;;) {
    const left = (width - viewWidth / scale) / 2;
    const top = (height - viewHeight / scale) / 2;
    const right = width - left;
    const bottom = height - top;
    const safe = { left: left + gap, right: right - gap, top: top + gap, bottom: bottom - gap };
    const regions = [
      { ...safe, bottom: -gap },
      { ...safe, top: 0, bottom: height, left: width + gap },
      { ...safe, top: height + gap },
      { ...safe, top: 0, bottom: height, right: -gap },
    ];
    const sides = regions.map((region) => slotsIn(region, cellWidth, cellHeight, padding, shortEdge * .292));
    const slots = sides.reduce((sum, side) => sum + side.length, 0);
    const haveFourSides = sides.every((side) => side.length > 0);
    const needFourSides = !compact && width / height >= .65 && width / height <= 2.25;
    if (slots >= Math.ceil(pieces.length * 1.14) && (!needFourSides || haveFourSides)) {
      return { scale, left, top, right, bottom, sides, inset: shortEdge * .31 };
    }
    scale *= .955;
  }
}

export function spreadPieces(desk, order, seed) {
  const random = seededRandom(seed ^ 0x39a2b013);
  const sides = shuffled(desk.sides, random).map((side) => shuffled(side, random));
  const positions = new Map();
  let index = 0;
  while (index < order.length) {
    for (const side of sides) {
      if (!side.length || index === order.length) continue;
      const { x, y, jitterX, jitterY } = side.pop();
      positions.set(order[index++], {
        x: x + (random() * 2 - 1) * jitterX,
        y: y + (random() * 2 - 1) * jitterY,
      });
    }
  }
  return positions;
}
