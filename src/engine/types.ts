export enum MaterialType {
  EMPTY = 0,
  TERRAIN = 1,
  WATER = 2,
  SAND = 3,
  FIRE = 4,
  BOMB = 5,
  ACID = 6,
  OIL = 7,
  WOOD = 8,
  PLANT = 9,
  BUG = 10,
}

export interface Cell {
  type: MaterialType;
  char: string; // glyph to render
  color: string; // CSS color string
  lifetime: number; // for decay (e.g. fire/bugs)
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
