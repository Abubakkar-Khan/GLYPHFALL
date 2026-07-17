import { Cell, MaterialType } from './types';

/**
 * Create a flat grid of Cell objects. The grid is stored as a 1‑D array
 * for optimal cache locality. Index = y * width + x.
 */
export function createGrid(width: number, height: number): Cell[] {
  const size = width * height;
  const grid: Cell[] = new Array(size);
  for (let i = 0; i < size; i++) {
    grid[i] = {
      type: MaterialType.EMPTY,
      char: ' ',
      color: '#000000',
      lifetime: 0,
      velocity: 0,
      updated: 0,
    };
  }
  return grid;
}

export function index(width: number, x: number, y: number): number {
  return y * width + x;
}

export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function getCell(grid: Cell[], width: number, x: number, y: number): Cell | null {
  if (!inBounds(width, Math.floor(grid.length / width), x, y)) return null;
  return grid[index(width, x, y)];
}

export function setCell(grid: Cell[], width: number, x: number, y: number, cell: Cell): void {
  if (!inBounds(width, Math.floor(grid.length / width), x, y)) return;
  grid[index(width, x, y)] = cell;
}

export function swapCells(grid: Cell[], width: number, x1: number, y1: number, x2: number, y2: number): void {
  const i1 = index(width, x1, y1);
  const i2 = index(width, x2, y2);
  const tmp = grid[i1];
  grid[i1] = grid[i2];
  grid[i2] = tmp;
}

export function isEmpty(grid: Cell[], width: number, x: number, y: number): boolean {
  const cell = getCell(grid, width, x, y);
  return cell?.type === MaterialType.EMPTY;
}
