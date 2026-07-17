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
            sizzleCount += 3;
          }
          break;
        case MaterialType.WOOD:
          handleWood(state, x, y, idx, frameId);
          break;
        case MaterialType.PLANT:
          handlePlant(state, x, y, idx, frameId);
          break;
        case MaterialType.BUG:
          handleBug(state, x, y, idx, frameId);
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
  // Respect boundary walls inside the engine
  return x >= 0 && x < width && y >= 0 && y < height;
}

/** Sand behavior – falls straight down, then diagonally */
function handleSand(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  if (tryMove(state, x, y, x, y + 1, frameId)) return;
  const leftFirst = Math.random() < 0.5;
  if (leftFirst) {
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
  } else {
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
  }
  markUpdated(state.grid, idx, frameId);
}

/** Water behavior – falls, then spreads sideways */
function handleWater(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  if (tryMove(state, x, y, x, y + 1, frameId)) {
    if (Math.random() < 0.001) AudioSystem.playSplash();
    return;
  }
  const leftFirst = Math.random() < 0.5;
  if (leftFirst) {
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
  } else {
    if (tryMove(state, x, y, x + 1, y + 1, frameId)) return;
    if (tryMove(state, x, y, x - 1, y + 1, frameId)) return;
  }
  const spread = Math.random() < 0.5 ? -1 : 1;
  if (tryMove(state, x, y, x + spread, y, frameId)) return;
  if (tryMove(state, x, y, x - spread, y, frameId)) return;
  markUpdated(state.grid, idx, frameId);
}

/** Fire behavior – burns, spreads, extinguishes on water */
function handleFire(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  const cell = state.grid[idx];
  const neighbors = getNeighborCoords(state, x, y);
  for (const [nx, ny] of neighbors) {
    const nIdx = index(state.width, nx, ny);
    const nCell = state.grid[nIdx];
    if (nCell.type === MaterialType.WATER) {
      // Extinguish (both turn to empty/evaporate)
      initCell(cell, MaterialType.EMPTY);
      initCell(nCell, MaterialType.EMPTY);
      markUpdated(state.grid, idx, frameId);
      markUpdated(state.grid, nIdx, frameId);
      return;
    }
  }

  if (cell.lifetime <= 0) {
    initCell(cell, MaterialType.EMPTY);
    markUpdated(state.grid, idx, frameId);
    return;
  }
  cell.lifetime--;

  for (const [nx, ny] of neighbors) {
    const nIdx = index(state.width, nx, ny);
    const nCell = state.grid[nIdx];
    if ((nCell.type === MaterialType.TERRAIN || nCell.type === MaterialType.PLANT) && Math.random() < 0.15) {
      initCell(nCell, MaterialType.FIRE);
      markUpdated(state.grid, nIdx, frameId);
    }
  }

  if (Math.random() < 0.1) {
    tryMove(state, x, y, x, y - 1, frameId);
  }

  markUpdated(state.grid, idx, frameId);
}

/** Bomb falls like sand; explodes on impact. Returns true if exploded */
function handleBomb(state: SimulationState, x: number, y: number, idx: number, frameId: number): boolean {
  if (tryMove(state, x, y, x, y + 1, frameId)) {
    if (Math.random() < 0.05) AudioSystem.playTick();
    return false;
  }
  
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

  const neighbors = getNeighborCoords(state, x, y);
  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type !== MaterialType.EMPTY && nCell.type !== MaterialType.ACID) {
      if (Math.random() < 0.18) {
        // Corrode: turn both neighbor and acid itself to empty
        initCell(nCell, MaterialType.EMPTY);
        initCell(cell, MaterialType.EMPTY);
        
        markUpdated(grid, idx, frameId);
        markUpdated(grid, nIdx, frameId);
        didDissolve = true;
        break;
      }
    }
  }

  if (didDissolve) return true;

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

  const neighbors = getNeighborCoords(state, x, y);
  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type === MaterialType.FIRE) {
      initCell(cell, MaterialType.FIRE);
      cell.lifetime = 85 + Math.random() * 45;
      markUpdated(grid, idx, frameId);
      return true;
    }
  }

  if (y + 1 < height) {
    const belowIdx = index(width, x, y + 1);
    const belowCell = grid[belowIdx];
    if (belowCell.type === MaterialType.WATER) {
      swapCells(grid, width, x, y, x, y + 1);
      markUpdated(grid, belowIdx, frameId);
      return false;
    }
  }

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
    const nIdx = index(state.width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type === MaterialType.WATER) {
      hasWaterNeighbor = true;
      if (Math.random() < 0.06) {
        initCell(nCell, MaterialType.EMPTY);
      }
    } else if (nCell.type === MaterialType.FIRE) {
      hasFireNeighbor = true;
    }
  }

  if (hasFireNeighbor && Math.random() < 0.2) {
    initCell(cell, MaterialType.FIRE);
    cell.lifetime = 90 + Math.random() * 50;
    markUpdated(grid, idx, frameId);
    return;
  }

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

/** Plant behavior - moss grows in empty spots when adjacent to water. Burns extremely fast */
function handlePlant(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  const { width, height, grid } = state;
  const cell = grid[idx];

  const neighbors = getNeighborCoords(state, x, y);
  let hasWater = false;
  let hasFire = false;

  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type === MaterialType.WATER) {
      hasWater = true;
      if (Math.random() < 0.08) {
        initCell(nCell, MaterialType.EMPTY);
      }
    } else if (nCell.type === MaterialType.FIRE) {
      hasFire = true;
    }
  }

  if (hasFire) {
    initCell(cell, MaterialType.FIRE);
    cell.lifetime = 15 + Math.random() * 10;
    markUpdated(grid, idx, frameId);
    return;
  }

  if (hasWater && Math.random() < 0.04) {
    const emptySpots: [number, number][] = [];
    for (const [nx, ny] of neighbors) {
      const nIdx = index(width, nx, ny);
      if (grid[nIdx].type === MaterialType.EMPTY) {
        emptySpots.push([nx, ny]);
      }
    }
    if (emptySpots.length > 0) {
      const [gx, gy] = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      const gIdx = index(width, gx, gy);
      initCell(grid[gIdx], MaterialType.PLANT);
      markUpdated(grid, gIdx, frameId);
    }
  }

  markUpdated(grid, idx, frameId);
}

/** Bug crawler behavior - walks horizontally, climbs walls, eats Wood/Plant, dies from Acid/Fire, reproduces */
function handleBug(state: SimulationState, x: number, y: number, idx: number, frameId: number) {
  const { width, height, grid } = state;
  const cell = grid[idx];

  cell.lifetime--;
  if (cell.lifetime <= 0) {
    initCell(cell, MaterialType.EMPTY);
    markUpdated(grid, idx, frameId);
    return;
  }

  const neighbors = getNeighborCoords(state, x, y);
  let adjacentFoodIdxs: number[] = [];
  for (const [nx, ny] of neighbors) {
    const nIdx = index(width, nx, ny);
    const nCell = grid[nIdx];
    if (nCell.type === MaterialType.FIRE) {
      initCell(cell, MaterialType.FIRE);
      cell.lifetime = 15 + Math.random() * 10;
      markUpdated(grid, idx, frameId);
      return;
    }
    if (nCell.type === MaterialType.ACID) {
      initCell(cell, MaterialType.EMPTY);
      markUpdated(grid, idx, frameId);
      return;
    }
    if (nCell.type === MaterialType.WOOD || nCell.type === MaterialType.PLANT) {
      adjacentFoodIdxs.push(nIdx);
    }
  }

  if (adjacentFoodIdxs.length > 0 && Math.random() < 0.1) {
    const foodIdx = adjacentFoodIdxs[Math.floor(Math.random() * adjacentFoodIdxs.length)];
    initCell(grid[foodIdx], MaterialType.EMPTY);
    cell.lifetime = Math.min(180, cell.lifetime + 45);
    if (Math.random() < 0.1) {
      AudioSystem.playSizzle();
    }
  }

  if (cell.lifetime > 165 && Math.random() < 0.015) {
    const emptyNeighbors = neighbors.filter(([nx, ny]) => grid[index(width, nx, ny)].type === MaterialType.EMPTY);
    if (emptyNeighbors.length > 0) {
      const [ex, ey] = emptyNeighbors[Math.floor(Math.random() * emptyNeighbors.length)];
      const childIdx = index(width, ex, ey);
      initCell(grid[childIdx], MaterialType.BUG);
      grid[childIdx].lifetime = 80;
      cell.lifetime = 80;
      markUpdated(grid, childIdx, frameId);
    }
  }

  if (y + 1 < height) {
    const belowIdx = index(width, x, y + 1);
    const belowCell = grid[belowIdx];
    if (belowCell.type === MaterialType.EMPTY || belowCell.type === MaterialType.WATER || belowCell.type === MaterialType.OIL || belowCell.type === MaterialType.ACID) {
      if (tryMove(state, x, y, x, y + 1, frameId)) return;
    }
  }

  let dir = cell.velocity === 0 ? 1 : cell.velocity;
  const frontX = x + dir;
  const frontY = y;
  
  if (inBounds(width, height, frontX, frontY)) {
    const fIdx = index(width, frontX, frontY);
    const fCell = grid[fIdx];

    if (fCell.type !== MaterialType.EMPTY) {
      const climbX = frontX;
      const climbY = y - 1;
      const headSpaceIdx = index(width, x, y - 1);
      
      if (inBounds(width, height, climbX, climbY) && inBounds(width, height, x, y - 1)) {
        const climbIdx = index(width, climbX, climbY);
        if (grid[climbIdx].type === MaterialType.EMPTY && grid[headSpaceIdx].type === MaterialType.EMPTY) {
          if (tryMove(state, x, y, climbX, climbY, frameId)) return;
        }
      }
      cell.velocity = -dir;
    } else {
      const belowFrontY = y + 1;
      if (inBounds(width, height, frontX, belowFrontY)) {
        const bfIdx = index(width, frontX, belowFrontY);
        const bfCell = grid[bfIdx];
        if (bfCell.type === MaterialType.EMPTY) {
          if (Math.random() < 0.7) {
            if (tryMove(state, x, y, frontX, belowFrontY, frameId)) return;
          } else {
            cell.velocity = -dir;
          }
        } else {
          if (tryMove(state, x, y, frontX, frontY, frameId)) return;
        }
      } else {
        if (tryMove(state, x, y, frontX, frontY, frameId)) return;
      }
    }
  } else {
    cell.velocity = -dir;
  }

  markUpdated(grid, idx, frameId);
}

function explode(state: SimulationState, cx: number, cy: number) {
  const radius = 10;
  const { width, height, grid } = state;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(width, height, x, y)) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      const chance = 1 - dist / radius;
      if (Math.random() > chance) continue;
      const idx = index(width, x, y);
      const cell = grid[idx];
      switch (cell.type) {
        case MaterialType.TERRAIN:
        case MaterialType.WOOD:
        case MaterialType.SAND:
        case MaterialType.PLANT:
        case MaterialType.BUG:
        case MaterialType.WATER:
        case MaterialType.ACID:
          initCell(cell, MaterialType.EMPTY); // Vaporized or blown up
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
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
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
