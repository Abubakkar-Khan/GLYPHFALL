import { SimulationState, MaterialType, Cell } from '../engine/types';
import { index } from '../engine/grid';
import { initCell } from '../engine/materials';

/**
 * Paint a material at the given grid coordinate with a brush radius and shape.
 * This mutates the supplied simulation state directly.
 */
export function handlePointer(
  state: SimulationState,
  cx: number,
  cy: number,
  material: MaterialType,
  brushSize: number = 2,
  brushShape: 'circle' | 'square' | 'line' = 'circle'
): void {
  const { width, height, grid } = state;

  if (brushShape === 'line') {
    // Horizontal line stroke of length 2 * brushSize + 1
    const dy = 0;
    for (let dx = -brushSize * 2; dx <= brushSize * 2; dx++) {
      const x = cx + dx;
      const y = cy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const idx = index(width, x, y);
      if (material === MaterialType.EMPTY || grid[idx].type === MaterialType.EMPTY) {
        initCell(grid[idx], material);
      }
    }
    return;
  }

  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      // Shape checks
      if (brushShape === 'circle' && dx * dx + dy * dy > brushSize * brushSize) {
        continue;
      }
      
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const idx = index(width, x, y);
      
      // Paint material: if empty, or overwriting with EMPTY (eraser)
      if (material === MaterialType.EMPTY || grid[idx].type === MaterialType.EMPTY) {
        initCell(grid[idx], material);
      }
    }
  }
}
