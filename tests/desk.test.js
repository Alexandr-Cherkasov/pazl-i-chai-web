import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesk, spreadPieces } from '../src/desk.js';
import { createPuzzle, levels } from '../src/puzzle.js';

test('every piece starts fully visible outside the frame, even at 192 pieces on mobile', () => {
  const viewports = [[1360, 756], [360, 590], [320, 440]];
  const images = [[1536, 1024], [900, 1200], [1600, 200], [200, 1600]];
  for (const [viewWidth, viewHeight] of viewports) {
    for (const [width, height] of images) {
      for (const level of Object.keys(levels)) {
        const puzzle = createPuzzle(width, height, level, 47);
        const desk = createDesk(puzzle, viewWidth, viewHeight);
        const order = puzzle.pieces.map(({ id }) => id);
        const spread = [...spreadPieces(desk, order, 47).values()];
        assert.equal(spread.length, order.length);
        const pad = Math.min(puzzle.cellWidth, puzzle.cellHeight) * .28;
        const boxes = spread.map(({ x, y }) => ({
          l: x - pad,
          r: x + puzzle.cellWidth + pad,
          t: y - pad,
          b: y + puzzle.cellHeight + pad,
        }));
        for (const [i, box] of boxes.entries()) {
          assert.ok(box.l >= desk.left && box.r <= desk.right);
          assert.ok(box.t >= desk.top && box.b <= desk.bottom);
          assert.ok(box.r < 0 || box.l > width || box.b < 0 || box.t > height);
          for (const other of boxes.slice(i + 1)) {
            assert.ok(box.r <= other.l || box.l >= other.r || box.b <= other.t || box.t >= other.b);
          }
        }
      }
    }
  }
});

test('desktop layouts use all four sides and resume with the same scatter', () => {
  const puzzle = createPuzzle(1536, 1024, 'easy', 42);
  const order = puzzle.pieces.map(({ id }) => id);
  const desk = createDesk(puzzle, 1360, 756);
  const pieces = spreadPieces(desk, order, 42);
  assert.deepEqual(pieces, spreadPieces(createDesk(puzzle, 1360, 756), order, 42));
  const positions = [...pieces.values()];
  assert.ok(positions.some(({ x }) => x < 0));
  assert.ok(positions.some(({ x }) => x > puzzle.width));
  assert.ok(positions.some(({ y }) => y < 0));
  assert.ok(positions.some(({ y }) => y > puzzle.height));
  assert.notDeepEqual(pieces, spreadPieces(desk, [...order].reverse(), 42));
});
