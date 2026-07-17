import { MaterialType, Cell } from './types';

export interface MaterialDef {
  glyphs: string[];
  colors: string[];
}

export const Materials: Record<MaterialType, MaterialDef> = {
  [MaterialType.EMPTY]: {
    glyphs: [' '],
    colors: ['#000000']
  },
  [MaterialType.TERRAIN]: {
    glyphs: ['█', '▓', '▒', '▩', '▤', '▥', '▧', '▨'],
    colors: ['#6d4c41', '#5d4037', '#4e342e', '#3e2723', '#8d6e63', '#4a3b32', '#5c4a3c']
  },
  [MaterialType.WATER]: {
    glyphs: ['≈', '~', '≋', '∽', '∾', '∿'],
    colors: ['#1e90ff', '#00bfff', '#4169e1', '#0077be', '#5dade2', '#2471a3']
  },
  [MaterialType.SAND]: {
    glyphs: ['░', '▒', '▓', '⁛', '⁜', '⁚', '.'],
    colors: ['#c2b280', '#d2b48c', '#e5c158', '#edd190', '#dfd3c3', '#c5b596', '#eedc82']
  },
  [MaterialType.FIRE]: {
    glyphs: ['☼', '▲', '*', 'x', '^', 'v', '+', '░', '▓'],
    colors: ['#ffeb3b', '#ffd54f', '#ffb300', '#ff8f00', '#ff6f00', '#ff3d00', '#dd2c00']
  },
  [MaterialType.SMOKE]: {
    glyphs: ['°', 'o', '¤', '░', '▒', 'O'],
    colors: ['#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#212121']
  },
  [MaterialType.BOMB]: {
    glyphs: ['●', '☢', '⚙'],
    colors: ['#ff1744', '#d50000', '#ff5252', '#ff8a80']
  },
  [MaterialType.ACID]: {
    glyphs: ['░', '▒', '☣', '≈', '∴', '⁛'],
    colors: ['#39ff14', '#00ff66', '#adff2f', '#7fff00']
  },
  [MaterialType.OIL]: {
    glyphs: ['≈', '∽', '∾', '≋', '∿'],
    colors: ['#1f1430', '#2d1840', '#3b1c4f', '#120b1c', '#2c203b']
  },
  [MaterialType.WOOD]: {
    glyphs: ['▰', '▱', '🪵', '╢', '╟', '▓'],
    colors: ['#5c4033', '#6f4e37', '#8b5a2b', '#7a4f30', '#4d3319']
  }
};

/**
 * Initialize a Cell with dynamic variations for its material type
 */
export function initCell(cell: Cell, type: MaterialType): void {
  const def = Materials[type];
  cell.type = type;
  cell.char = def.glyphs[Math.floor(Math.random() * def.glyphs.length)];
  cell.color = def.colors[Math.floor(Math.random() * def.colors.length)];
  cell.updated = 0;
  cell.velocity = 0;

  if (type === MaterialType.FIRE) {
    cell.lifetime = 30 + Math.random() * 20;
  } else if (type === MaterialType.SMOKE) {
    cell.lifetime = 40 + Math.random() * 20;
  } else if (type === MaterialType.ACID) {
    cell.lifetime = 100 + Math.random() * 50; // Acid lifetime before it dilutes/neutralizes
  } else {
    cell.lifetime = 0;
  }
}

/**
 * Dynamically updates the cell's glyph and color over time for animation
 */
export function updateCellVisuals(cell: Cell): void {
  if (cell.type === MaterialType.FIRE) {
    const maxLife = 50;
    const ratio = Math.max(0, Math.min(1, cell.lifetime / maxLife));
    const fireColors = Materials[MaterialType.FIRE].colors;
    const colorIdx = Math.floor((1 - ratio) * fireColors.length);
    cell.color = fireColors[Math.min(colorIdx, fireColors.length - 1)];

    const fireGlyphs = Materials[MaterialType.FIRE].glyphs;
    cell.char = fireGlyphs[Math.floor(Math.random() * fireGlyphs.length)];
  } else if (cell.type === MaterialType.SMOKE) {
    const maxLife = 60;
    const ratio = Math.max(0, Math.min(1, cell.lifetime / maxLife));
    const smokeColors = Materials[MaterialType.SMOKE].colors;
    const colorIdx = Math.floor((1 - ratio) * smokeColors.length);
    cell.color = smokeColors[Math.min(colorIdx, smokeColors.length - 1)];

    if (cell.lifetime < 15) {
      cell.char = '°';
    } else if (cell.lifetime < 30) {
      cell.char = 'o';
    } else {
      const smokeGlyphs = Materials[MaterialType.SMOKE].glyphs;
      cell.char = smokeGlyphs[Math.floor(Math.random() * smokeGlyphs.length)];
    }
  } else if (cell.type === MaterialType.WATER) {
    if (Math.random() < 0.1) {
      const waterGlyphs = Materials[MaterialType.WATER].glyphs;
      cell.char = waterGlyphs[Math.floor(Math.random() * waterGlyphs.length)];
    }
    if (Math.random() < 0.05) {
      const waterColors = Materials[MaterialType.WATER].colors;
      cell.color = waterColors[Math.floor(Math.random() * waterColors.length)];
    }
  } else if (cell.type === MaterialType.BOMB) {
    if (Math.random() < 0.25) {
      cell.color = Math.random() < 0.5 ? '#ffffff' : '#ff1744';
      cell.char = Math.random() < 0.5 ? '☢' : '●';
    }
  } else if (cell.type === MaterialType.ACID) {
    // Acid bubbling shimmer
    if (Math.random() < 0.2) {
      const acidGlyphs = Materials[MaterialType.ACID].glyphs;
      cell.char = acidGlyphs[Math.floor(Math.random() * acidGlyphs.length)];
    }
    if (Math.random() < 0.1) {
      const acidColors = Materials[MaterialType.ACID].colors;
      cell.color = acidColors[Math.floor(Math.random() * acidColors.length)];
    }
  } else if (cell.type === MaterialType.OIL) {
    // Oil petroleum sheen shimmers slightly
    if (Math.random() < 0.08) {
      const oilColors = Materials[MaterialType.OIL].colors;
      cell.color = oilColors[Math.floor(Math.random() * oilColors.length)];
    }
  }
}
