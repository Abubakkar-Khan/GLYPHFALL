import { Cell, MaterialType, SimulationState } from './types';
import { index, getCell, setCell, swapCells, isEmpty } from './grid';
import { Materials } from './materials';

/**
 * Process a single simulation tick.
 * The grid is stored as a flat array (row‑major order). We iterate
 * bottom‑to‑top so that falling particles are processed before the cells
 * above them. A `updated` frame counter prevents a cell from being moved
 * twice in the same tick.
 */
export function updateSimulation(state: SimulationState): void {
  const { width, height, grid, tick } = state;
  const frameId = tick + 1; // unique identifier for this tick

  // Randomize horizontal sweep direction each row to avoid bias
  for (let y = height - 1; y >= 0; y--) {
    const leftToRight = Math.random() < 0.5;
    const startX = leftToRight ? 0 : width - 1;
    const endX = leftToRight ? width : -1;
    const stepX = leftToRight ? 1 : -1;
    for (let x = startX; x !== endX; x += stepX) {
      const idx = index(width, x, y);
      const cell = grid[idx];
      if (cell.type === MaterialType.EMPTY) continue;
      if (cell.updated === frameId) continue; // already moved this tick

      switch (cell.type) {
        case MaterialType.SAND:
          handleSand(state, x, y, idx, frameId);
          break;
        case MaterialType.WATER:
          handleWater(state, x, y, idx, frameId);
          break;
        case MaterialType.FIRE:
          handleFire(state, x, y, idx, frameId);
          break;
        case MaterialType.SMOKE:
          handleSmoke(state, x, y, idx, frameId);
          break;
        case MaterialType.BOMB:
          handleBomb(state, x, y, idx, frameId);
          break;
        // Terrain is static – nothing to do
        default:
          break;
      }
    }
  }

  state.tick = frameId;
}

/** Helper utilities */
function markUpdated(grid: Cell[], idx: number, frameId: number) {
  grid[idx].updated = frameId;
}

function tryMove(state: SimulationState, srcX: number, srcY: number, dstX: number, dstY: number, frameId: number): boolean {
  const { width, height, grid } = state;
  if (!inBounds(width, height, dstX, dstY)) return false;
  const dstIdx = index(width, dstX, dstY);
  const dstCell = grid[dstIdx];
  if (dstCell.type !== MaterialType.EMPTY) return false;
  // swap source and destination
  swapCells(grid, width, srcX, srcY, dstX, dstY);
  markUpdated(grid, dstIdx, frameId);
  return true;
}

function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/** Sand behavior – falls straight down, then diagonally */
function handleSand(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  // Try down
  if (tryMove(state, x, y, x, y + 1, frameId)) return;
  // Randomize diagonal order
  const leftFirst = Math.random() < 0.5;
  if (leftFirst) {
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
  } else {
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
  }
  // Settled – mark updated so it won't be processed again
  markUpdated(state.grid, idx, frameId);
}

/** Water behavior – falls, then spreads sideways */
function handleWater(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  // Down
  if (tryMove(state, x, y, x, y + 1, frameId)) return;
  // Diagonal down-left / down-right
  const leftFirst = Math.random() < 0.5;
  if (leftFirst) {
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
  } else {
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
  }
  // Horizontal spread (check up to 2 cells each side for fluidity)
  const spread = Math.random() < 0.5 ? -1 : 1;
  if (tryMove(state, x, y, x + spread, y, frameId)) return;
  if (tryMove(state, x, y, x - spread, y, frameId)) return;
  // Settled
  markUpdated(state.grid, idx, frameId);
}

/** Fire behavior – burns, spreads, creates smoke, extinguishes on water */
function handleFire(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  const cell = state.grid[idx];
  // Extinguish if adjacent water
  const neighbors = getNeighborCoords(state, x, y);
  for (const [nx, ny] of neighbors) {
    const nIdx = index(state.width, nx, ny);
    const nCell = state.grid[nIdx];
    if (nCell.type === MaterialType.WATER) {
      // Turn fire into smoke (steam) and remove water cell
      cell.type = MaterialType.SMOKE;
      cell.char = Materials[MaterialType.SMOKE].glyph;
      cell.color = Materials[MaterialType.SMOKE].color;
      nCell.type = MaterialType.EMPTY;
      nCell.char = ' ';
      markUpdated(state.grid, idx, frameId);
      markUpdated(state.grid, nIdx, frameId);
      return;
    }
  }

  // Decrease lifetime
  if (cell.lifetime <= 0) {
    // Transition to smoke
    cell.type = MaterialType.SMOKE;
    cell.char = Materials[MaterialType.SMOKE].glyph;
    cell.color = Materials[MaterialType.SMOKE].color;
    cell.lifetime = 40 + Math.random() * 20; // smoke lifetime
    markUpdated(state.grid, idx, frameId);
    return;
  }
  cell.lifetime--;

  // Spread to flammable terrain (treated as TERRAIN for simplicity)
  for (const [nx, ny] of neighbors) {
    const nIdx = index(state.width, nx, ny);
    const nCell = state.grid[nIdx];
    if (nCell.type === MaterialType.TERRAIN && Math.random() < 0.2) {
      nCell.type = MaterialType.FIRE;
      nCell.char = Materials[MaterialType.FIRE].glyph;
      nCell.color = Materials[MaterialType.FIRE].color;
      nCell.lifetime = 30 + Math.random() * 20;
      markUpdated(state.grid, nIdx, frameId);
    }
  }

  // Slight upward drift for visual flicker
  if (Math.random() < 0.1) {
    tryMove(state, x, y, x, y - 1, frameId);
  }

  markUpdated(state.grid, idx, frameId);
}

/** Smoke rises and dissipates */
function handleSmoke(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  const cell = state.grid[idx];
  if (cell.lifetime <= 0) {
    cell.type = MaterialType.EMPTY;
    cell.char = ' ';
    cell.color = '#000000';
    markUpdated(state.grid, idx, frameId);
    return;
  }
  cell.lifetime--;

  // Try move up
  if (tryMove(state, x, y, x, y - 1, frameId)) return;
  // Diagonal up-left / up-right
  const leftFirst = Math.random() < 0.5;
  if (leftFirst) {
    if (tryMove(state, x, y, x - 1, y - 1, frameId)) return;
    if (tryMove(state, x, y, x + 1, y - 1, frameId)) return;
  } else {
    if (tryMove(state, x, y, x + 1, y - 1, frameId)) return;
    if (tryMove(state, x, y, x - 1, y - 1, frameId)) return;
  }
  // Lateral drift
  if (Math.random() < 0.3) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    tryMove(state, x, y, x + dir, y, frameId);
  }
  markUpdated(state.grid, idx, frameId);
}

/** Bomb falls like sand; explodes on impact */
function handleBomb(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  // Simple fall first – reuse sand logic
  if (tryMove(state, x, y, x, y + 1, frameId)) return;
  // If cannot fall, explode
  explode(state, x, y);
  // Clear bomb cell
  const cell = state.grid[idx];
  cell.type = MaterialType.EMPTY;
  cell.char = ' ';
  cell.color = '#000000';
  markUpdated(state.grid, idx, frameId);
}

function explode(state: SimulationState, cx: number, cy: number) {
  const radius = 8;
  const { width, height, grid } = state;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(width, height, x, y)) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      const chance = 1 - dist / radius; // higher chance near centre
      if (Math.random() > chance) continue;
      const idx = index(width, x, y);
      const cell = grid[idx];
      switch (cell.type) {
        case MaterialType.TERRAIN:
          // Destroy terrain – become empty
          cell.type = MaterialType.EMPTY;
          cell.char = ' ';
          cell.color = '#000000';
          break;
        case MaterialType.WATER:
          // Vaporize – turn into smoke
          cell.type = MaterialType.SMOKE;
          cell.char = Materials[MaterialType.SMOKE].glyph;
          cell.color = Materials[MaterialType.SMOKE].color;
          cell.lifetime = 30 + Math.random() * 20;
          break;
        case MaterialType.SAND:
          // Clear sand as well
          cell.type = MaterialType.EMPTY;
          cell.char = ' ';
          cell.color = '#000000';
          break;
        default:
          // Optionally ignite flammable stuff
          if (cell.type === MaterialType.TERRAIN && Math.random() < 0.1) {
            cell.type = MaterialType.FIRE;
            cell.char = Materials[MaterialType.FIRE].glyph;
            cell.color = Materials[MaterialType.FIRE].color;
            cell.lifetime = 30 + Math.random() * 20;
          }
          break;
      }
    }
  }
}

function getNeighborCoords(state: SimulationState, x: number, y: number): [number, number][] {
  const dirs = [
    [0, -1], // up
    [0, 1], // down
    [-1, 0], // left
    [1, 0], // right
    [-1, -1], // up‑left
    [1, -1], // up‑right
    [-1, 1], // down‑left
    [1, 1], // down‑right
  ];
  const res: [number, number][] = [];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(state.width, state.height, nx, ny)) {
      res.push([nx, ny]);
    }
  }
  return res;
}
