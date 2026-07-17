import { Cell, MaterialType, SimulationState } from './types';
import { index, getCell, setCell, swapCells, isEmpty } from './grid';
import { initCell, updateCellVisuals } from './materials';
import { AudioSystem } from './audio';

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

  // Track if any explosions or sizzling happened this tick to play sounds
  let explosionTriggered = false;
  let sizzleCount = 0;
  let acidFizzCount = 0;

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

      // Update color/glyph animation frames dynamically
      updateCellVisuals(cell);

      switch (cell.type) {
        case MaterialType.SAND:
          handleSand(state, x, y, idx, frameId);
          break;
        case MaterialType.WATER:
          handleWater(state, x, y, idx, frameId);
          break;
        case MaterialType.FIRE:
          handleFire(state, x, y, idx, frameId);
          if (Math.random() < 0.002) sizzleCount++;
          break;
        case MaterialType.SMOKE:
          handleSmoke(state, x, y, idx, frameId);
          break;
        case MaterialType.BOMB:
          if (handleBomb(state, x, y, idx, frameId)) {
            explosionTriggered = true;
          }
          break;
        case MaterialType.ACID:
          if (handleAcid(state, x, y, idx, frameId)) {
            acidFizzCount++;
          }
          break;
        case MaterialType.OIL:
          if (handleOil(state, x, y, idx, frameId)) {
            sizzleCount += 3; // ignites fast!
          }
          break;
        case MaterialType.WOOD:
          handleWood(state, x, y, idx, frameId);
          break;
        // Terrain is static – nothing to do
        default:
          break;
      }
    }
  }

  // Play audio system ambiance
  if (explosionTriggered) {
    AudioSystem.playExplosion();
  }
  if (sizzleCount > 0 && Math.random() < 0.4) {
    AudioSystem.playSizzle();
  }
  if (acidFizzCount > 0 && Math.random() < 0.3) {
    AudioSystem.playAcidFizz();
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
  if (tryMove(state, x, y, x, y + 1, frameId)) {
    if (Math.random() < 0.001) AudioSystem.playSplash();
    return;
  }
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
      initCell(cell, MaterialType.SMOKE);
      initCell(nCell, MaterialType.EMPTY);
      markUpdated(state.grid, idx, frameId);
      markUpdated(state.grid, nIdx, frameId);
      return;
    }
  }

  // Decrease lifetime
  if (cell.lifetime <= 0) {
    // Transition to smoke
    initCell(cell, MaterialType.SMOKE);
    markUpdated(state.grid, idx, frameId);
    return;
  }
  cell.lifetime--;

  // Spread to flammable terrain
  for (const [nx, ny] of neighbors) {
    const nIdx = index(state.width, nx, ny);
    const nCell = state.grid[nIdx];
    if (nCell.type === MaterialType.TERRAIN && Math.random() < 0.1) {
      initCell(nCell, MaterialType.FIRE);
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
    initCell(cell, MaterialType.EMPTY);
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

/** Bomb falls like sand; explodes on impact. Returns true if exploded */
function handleBomb(state: SimulationState, x: number, y: number, idx: number, frameId: number): boolean {
  // Simple fall first – reuse sand logic
  if (tryMove(state, x, y, x, y + 1, frameId)) {
    if (Math.random() < 0.05) AudioSystem.playTick();
    return false;
  }
  
  // If cannot fall, explode!
  explode(state, x, y);
  const cell = state.grid[idx];
  initCell(cell, MaterialType.EMPTY);
  markUpdated(state.grid, idx, frameId);
  return true;
}

/** Acid behaves like a liquid, dissolving cells it contacts */
function handleAcid(state: SimulationState, x: number, y: number, idx: number, frameId: number): boolean {
  const { width, height, grid } = state;
  const cell = grid[idx];
  let didDissolve = false;

  // Corrode neighbors
  const neighbors = getNeighborCoords(state, x, y);
  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type !== MaterialType.EMPTY && nCell.type !== MaterialType.ACID) {
      if (Math.random() < 0.18) {
        // Dissolve neighbor cell, turn into neon toxic green smoke
        initCell(nCell, MaterialType.SMOKE);
        nCell.color = '#39ff14'; 
        nCell.char = '°';
        nCell.lifetime = 25 + Math.random() * 15;

        // Dissolve acid itself
        initCell(cell, MaterialType.EMPTY);
        
        markUpdated(grid, idx, frameId);
        markUpdated(grid, nIdx, frameId);
        didDissolve = true;
        break;
      }
    }
  }

  if (didDissolve) return true;

  // Fall like liquid
  if (tryMove(state, x, y, x, y + 1, frameId)) return false;
  
  const leftFirst = Math.random() < 0.5;
  if (leftFirst) {
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return false;
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return false;
  } else {
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return false;
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return false;
  }
  
  const spread = Math.random() < 0.5 ? -1 : 1;
  if (tryMove(state, x, y, x + spread, y, frameId)) return false;
  if (tryMove(state, x, y, x - spread, y, frameId)) return false;

  markUpdated(grid, idx, frameId);
  return false;
}

/** Oil behavior – sticky, floats on water, highly flammable */
function handleOil(state: SimulationState, x: number, y: number, idx: number, frameId: number): boolean {
  const { width, height, grid } = state;
  const cell = grid[idx];

  // Catch fire from neighbors
  const neighbors = getNeighborCoords(state, x, y);
  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type === MaterialType.FIRE) {
      initCell(cell, MaterialType.FIRE);
      cell.lifetime = 85 + Math.random() * 45; // Burns long
      markUpdated(grid, idx, frameId);
      return true;
    }
  }

  // Floats on water (if cell directly below is water, swap)
  if (y + 1 < height) {
    const belowIdx = index(width, x, y + 1);
    const belowCell = grid[belowIdx];
    if (belowCell.type === MaterialType.WATER) {
      swapCells(grid, width, x, y, x, y + 1);
      markUpdated(grid, belowIdx, frameId);
      return false;
    }
  }

  // Slow flow (75% lateral rate)
  if (tryMove(state, x, y, x, y + 1, frameId)) return false;
  
  if (Math.random() < 0.75) {
    const leftFirst = Math.random() < 0.5;
    if (leftFirst) {
      if (tryMove(state, x, y, x - 1, y + 1, frameId)) return false;
      if (tryMove(state, x, y, x + 1, y + 1, frameId)) return false;
    } else {
      if (tryMove(state, x, y, x + 1, y + 1, frameId)) return false;
      if (tryMove(state, x, y, x - 1, y + 1, frameId)) return false;
    }
    
    const spread = Math.random() < 0.5 ? -1 : 1;
    if (tryMove(state, x, y, x + spread, y, frameId)) return false;
    if (tryMove(state, x, y, x - spread, y, frameId)) return false;
  }

  markUpdated(grid, idx, frameId);
  return false;
}

/** Wood behavior – solid, grows on water absorb, ignites easily */
function handleWood(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  const { width, height, grid } = state;
  const cell = grid[idx];

  const neighbors = getNeighborCoords(state, x, y);
  let hasWaterNeighbor = false;
  let hasFireNeighbor = false;

  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type === MaterialType.WATER) {
      hasWaterNeighbor = true;
      // Drink water
      if (Math.random() < 0.06) {
        initCell(nCell, MaterialType.EMPTY);
      }
    } else if (nCell.type === MaterialType.FIRE) {
      hasFireNeighbor = true;
    }
  }

  // Catch fire
  if (hasFireNeighbor && Math.random() < 0.2) {
    initCell(cell, MaterialType.FIRE);
    cell.lifetime = 90 + Math.random() * 50; // burns a long time
    markUpdated(grid, idx, frameId);
    return;
  }

  // Grow wood upwards/laterally if it has water
  if (hasWaterNeighbor && Math.random() < 0.015) {
    const growthDirs = [[0, -1], [-1, 0], [1, 0]];
    const emptySpots: [number, number][] = [];
    for (const [dx, dy] of growthDirs) {
      const gx = x + dx;
      const gy = y + dy;
      if (inBounds(width, height, gx, gy)) {
        const gIdx = index(width, gx, gy);
        if (grid[gIdx].type === MaterialType.EMPTY) {
          emptySpots.push([gx, gy]);
        }
      }
    }
    if (emptySpots.length > 0) {
      const [gx, gy] = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      const gIdx = index(width, gx, gy);
      initCell(grid[gIdx], MaterialType.WOOD);
      markUpdated(grid, gIdx, frameId);
    }
  }

  markUpdated(grid, idx, frameId);
}

function explode(state: SimulationState, cx: number, cy: number) {
  const radius = 9;
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
        case MaterialType.WOOD:
        case MaterialType.SAND:
          initCell(cell, MaterialType.EMPTY);
          break;
        case MaterialType.WATER:
        case MaterialType.ACID:
          // Vaporize
          initCell(cell, MaterialType.SMOKE);
          break;
        default:
          if (Math.random() < 0.3) {
            initCell(cell, MaterialType.FIRE);
            cell.lifetime = 40 + Math.random() * 20;
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
