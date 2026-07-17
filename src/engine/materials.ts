import { MaterialType } from './types';

export interface MaterialDef {
  glyph: string;
  color: string; // CSS color string
  // Additional physics parameters could be added here
}

export const Materials: Record<MaterialType, MaterialDef> = {
  [MaterialType.EMPTY]:   { glyph: ' ',  color: '#000000' },
  [MaterialType.TERRAIN]: { glyph: '█',  color: '#8b5a2b' }, // earth tone
  [MaterialType.WATER]:   { glyph: '≈',  color: '#1e90ff' }, // dodger blue
  [MaterialType.SAND]:    { glyph: '▒',  color: '#c2b280' }, // sand
  [MaterialType.FIRE]:    { glyph: '*',  color: '#ff4500' }, // orange red
  [MaterialType.SMOKE]:   { glyph: '°',  color: '#808080' }, // gray
  [MaterialType.BOMB]:    { glyph: '●',  color: '#ff0000' }, // bright red
};
