export enum MaterialType {
  EMPTY = 0,
  TERRAIN = 1,
  WATER = 2,
  SAND = 3,
  FIRE = 4,
  SMOKE = 5,
  BOMB = 6,
}

export interface Cell {
  type: MaterialType;
  char: string; // glyph to render
  color: string; // CSS color string
  lifetime: number; // for fire/smoke decay
  velocity: number; // optional for fluid momentum
  updated: number; // frame counter to prevent double processing
}

export interface SimulationState {
  width: number;
  height: number;
  grid: Cell[]; // flat array of cells
  tick: number;
  paused: boolean;
}
