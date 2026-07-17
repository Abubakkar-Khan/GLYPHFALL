import { SimulationState, MaterialType, Cell } from '../engine/types';
import { index } from '../engine/grid';
import { Materials } from '../engine/materials';

/**
 * Paint a material at the given grid coordinate with a brush radius.
 * This mutates the supplied simulation state directly.
 */
export function handlePointer(
  state: SimulationState,
  cx: number,
  cy: number,
  material: MaterialType,
  brushSize: number = 2
): void {
  const { width, height, grid } = state;
  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      if (dx * dx + dy * dy > brushSize * brushSize) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const idx = index(width, x, y);
      // Don't overwrite non-empty cells when placing EMPTY (eraser)
      if (material === MaterialType.EMPTY || grid[idx].type === MaterialType.EMPTY) {
        const matDef = Materials[material];
        grid[idx] = {
          type: material,
          char: matDef.glyph,
          color: matDef.color,
          lifetime:
            material === MaterialType.FIRE
              ? 30 + Math.random() * 20
              : material === MaterialType.SMOKE
              ? 40 + Math.random() * 20
              : 0,
          velocity: 0,
          updated: 0,
        };
      }
    }
  }
}
