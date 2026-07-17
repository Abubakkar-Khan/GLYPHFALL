'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimulationState, MaterialType } from '../../engine/types';
import { createGrid } from '../../engine/grid';
import { Materials, initCell } from '../../engine/materials';
import { startLoop } from '../../engine/loop';
import { handlePointer } from '../../input/input';
import { AudioSystem } from '../../engine/audio';

// Canvas size and cell dimensions
const CELL_SIZE = 10;
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 520;

const cols = Math.floor(CANVAS_WIDTH / CELL_SIZE);
const rows = Math.floor(CANVAS_HEIGHT / CELL_SIZE);

export default function CanvasComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SimulationState | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType>(MaterialType.SAND);
  const [brushSize, setBrushSize] = useState(2);
  const [brushShape, setBrushShape] = useState<'circle' | 'square' | 'line'>('circle');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tick, setTick] = useState(0);
  const [fps, setFps] = useState(0);
  
  const isPainting = useRef(false);
  const selectedMaterialRef = useRef(selectedMaterial);
  const brushSizeRef = useRef(brushSize);
  const brushShapeRef = useRef(brushShape);

  // Keep refs in sync
  useEffect(() => { selectedMaterialRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { brushShapeRef.current = brushShape; }, [brushShape]);

  // Sync initial mute state
  useEffect(() => {
    setMuted(AudioSystem.getMuteState());
  }, []);

  // Initialize simulation state
  useEffect(() => {
    const grid = createGrid(cols, rows);
    // Add ground terrain with variation
    for (let x = 0; x < cols; x++) {
      for (let y = rows - 3; y < rows; y++) {
        const idx = y * cols + x;
        initCell(grid[idx], MaterialType.TERRAIN);
      }
    }
    // Add some random starting blocks
    for (let i = 0; i < 4; i++) {
      const bx = Math.floor(20 + Math.random() * (cols - 40));
      const by = Math.floor(rows / 2 + Math.random() * 8);
      const bwidth = Math.floor(8 + Math.random() * 10);
      for (let x = bx; x < bx + bwidth; x++) {
        const idx = by * cols + x;
        if (idx >= 0 && idx < grid.length) {
          initCell(grid[idx], MaterialType.WOOD);
        }
      }
    }

    stateRef.current = {
      width: cols,
      height: rows,
      grid,
      tick: 0,
      paused: false,
    };
  }, []);

  // Render + game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Glyph cache for performance
    const glyphCache: Record<string, HTMLCanvasElement> = {};
    function getGlyph(char: string, color: string) {
      const key = `${char}_${color}`;
      if (glyphCache[key]) return glyphCache[key];
      const off = document.createElement('canvas');
      off.width = CELL_SIZE;
      off.height = CELL_SIZE;
      const octx = off.getContext('2d')!;
      octx.fillStyle = color;
      octx.font = `bold ${CELL_SIZE}px "JetBrains Mono", monospace`;
      octx.textBaseline = 'top';
      octx.fillText(char, 0, 0);
      glyphCache[key] = off;
      return off;
    }

    // FPS counter
    let frameCount = 0;
    let lastFpsTime = performance.now();

    function render() {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const { grid, width, height } = state;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const cell = grid[idx];
          if (cell.type === MaterialType.EMPTY) continue;
          
          const glyph = getGlyph(cell.char, cell.color);
          ctx.drawImage(glyph, x * CELL_SIZE, y * CELL_SIZE);
        }
      }
    }

    const cleanup = startLoop(state, (newState) => {
      render();
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }
      setTick(newState.tick);
    });

    return cleanup;
  }, []);

  // Pause sync
  useEffect(() => {
    if (stateRef.current) {
      stateRef.current.paused = paused;
    }
  }, [paused]);

  // Mouse handlers
  const getGridPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);
    return { x, y };
  }, []);

  const paint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    if (!state) return;
    const pos = getGridPos(e);
    if (!pos) return;
    handlePointer(
      state, 
      pos.x, 
      pos.y, 
      selectedMaterialRef.current, 
      brushSizeRef.current,
      brushShapeRef.current
    );
  }, [getGridPos]);

  // Play retro paint synth sound on mousedown based on material
  const playMaterialSound = (mat: MaterialType) => {
    switch (mat) {
      case MaterialType.WATER:
        AudioSystem.playSplash();
        break;
      case MaterialType.FIRE:
        AudioSystem.playSizzle();
        break;
      case MaterialType.ACID:
        AudioSystem.playAcidFizz();
        break;
      case MaterialType.BOMB:
        AudioSystem.playTick();
        break;
      default:
        AudioSystem.playClick();
        break;
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isPainting.current = true;
    playMaterialSound(selectedMaterialRef.current);
    paint(e);
  }, [paint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPainting.current) {
      if (Math.random() < 0.12) {
        playMaterialSound(selectedMaterialRef.current);
      }
      paint(e);
    }
  }, [paint]);

  const handleMouseUp = useCallback(() => {
    isPainting.current = false;
  }, []);

  // Clear grid
  const handleClear = useCallback(() => {
    AudioSystem.playClick();
    const state = stateRef.current;
    if (!state) return;
    const grid = createGrid(cols, rows);
    for (let x = 0; x < cols; x++) {
      for (let y = rows - 3; y < rows; y++) {
        const idx = y * cols + x;
        initCell(grid[idx], MaterialType.TERRAIN);
      }
    }
    state.grid = grid;
  }, []);

  // Presets loader
  const loadPreset = (presetName: string) => {
    const state = stateRef.current;
    if (!state) return;
    AudioSystem.playClick();
    
    const grid = createGrid(cols, rows);
    
    if (presetName === 'hourglass') {
      const midX = Math.floor(cols / 2);
      const midY = Math.floor(rows / 2);
      
      // Draw double funnel
      for (let y = 4; y < rows - 4; y++) {
        const offset = Math.abs(y - midY);
        const leftX = midX - Math.floor(offset * 0.8) - 1;
        const rightX = midX + Math.floor(offset * 0.8) + 1;
        
        if (leftX >= 5 && leftX < cols - 5 && rightX >= 5 && rightX < cols - 5) {
          if (offset > 1) {
            initCell(grid[y * cols + leftX], MaterialType.TERRAIN);
            initCell(grid[y * cols + rightX], MaterialType.TERRAIN);
          } else {
            // Spout opening gap
            if (y !== midY) {
              initCell(grid[y * cols + leftX], MaterialType.TERRAIN);
              initCell(grid[y * cols + rightX], MaterialType.TERRAIN);
            }
          }
        }
      }
      
      // Top and bottom horizontal caps
      for (let x = 5; x < cols - 5; x++) {
        initCell(grid[4 * cols + x], MaterialType.TERRAIN);
        initCell(grid[(rows - 5) * cols + x], MaterialType.TERRAIN);
      }
      
      // Populate sand in top chamber
      for (let y = 5; y < midY - 2; y++) {
        const offset = midY - y;
        const leftX = midX - Math.floor(offset * 0.8) + 2;
        const rightX = midX + Math.floor(offset * 0.8) - 2;
        for (let x = leftX; x <= rightX; x++) {
          initCell(grid[y * cols + x], MaterialType.SAND);
        }
      }
    } 
    else if (presetName === 'dambreak') {
      const midX = Math.floor(cols / 2);
      
      // Vertical wood divider in the center
      for (let y = 6; y < rows - 3; y++) {
        const idx = y * cols + midX;
        initCell(grid[idx], MaterialType.WOOD);
      }
      
      // Fill left side with water
      for (let y = 14; y < rows - 3; y++) {
        for (let x = 6; x < midX; x++) {
          initCell(grid[y * cols + x], MaterialType.WATER);
        }
      }

      // Place a trigger bomb right in the center of the wood wall
      const bombIdx = Math.floor(rows / 2) * cols + midX;
      initCell(grid[bombIdx], MaterialType.BOMB);
    } 
    else if (presetName === 'bombtest') {
      const midY = Math.floor(rows / 2);
      
      // Platform 1 (Wood)
      for (let x = 12; x < cols - 12; x++) {
        initCell(grid[(midY - 4) * cols + x], MaterialType.WOOD);
        initCell(grid[(midY + 4) * cols + x], MaterialType.WOOD);
      }

      // Vertical support posts
      for (let y = midY - 4; y < rows - 3; y++) {
        initCell(grid[y * cols + 16], MaterialType.WOOD);
        initCell(grid[y * cols + cols - 17], MaterialType.WOOD);
      }
      
      // Pools on top platform (Oil, Sand, Acid)
      for (let x = 20; x < cols - 20; x++) {
        if (x % 30 < 8) {
          initCell(grid[(midY - 5) * cols + x], MaterialType.OIL);
        } else if (x % 30 < 16) {
          initCell(grid[(midY - 5) * cols + x], MaterialType.SAND);
        } else if (x % 30 < 24) {
          initCell(grid[(midY - 5) * cols + x], MaterialType.ACID);
        }
      }

      // Spawn bombs on wood platforms
      initCell(grid[(midY - 5) * cols + Math.floor(cols / 3)], MaterialType.BOMB);
      initCell(grid[(midY - 5) * cols + Math.floor(cols * 2 / 3)], MaterialType.BOMB);

      // Water on lower platform
      for (let x = 24; x < cols - 24; x++) {
        if (x % 16 < 8) {
          initCell(grid[(midY + 3) * cols + x], MaterialType.WATER);
        }
      }
    }

    // Standard base floor
    for (let x = 0; x < cols; x++) {
      for (let y = rows - 3; y < rows; y++) {
        initCell(grid[y * cols + x], MaterialType.TERRAIN);
      }
    }

    state.grid = grid;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const materialKeys: Record<string, MaterialType> = {
      '1': MaterialType.SAND,
      '2': MaterialType.WATER,
      '3': MaterialType.FIRE,
      '4': MaterialType.SMOKE,
      '5': MaterialType.TERRAIN,
      '6': MaterialType.BOMB,
      '7': MaterialType.ACID,
      '8': MaterialType.OIL,
      '9': MaterialType.WOOD,
      '0': MaterialType.EMPTY,
    };

    const handler = (e: KeyboardEvent) => {
      if (materialKeys[e.key] !== undefined) {
        setSelectedMaterial(materialKeys[e.key]);
        playMaterialSound(materialKeys[e.key]);
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPaused(p => !p);
        AudioSystem.playClick();
      }
      if (e.key === 'c' || e.key === 'C') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClear]);

  // Audio mute toggler
  const toggleMute = () => {
    const isNowMuted = AudioSystem.toggleMute();
    setMuted(isNowMuted);
    if (!isNowMuted) {
      AudioSystem.playClick();
    }
  };

  // Material tool definitions
  const tools = [
    { type: MaterialType.SAND, label: 'SAND', shortcut: '1', color: '#eedc82' },
    { type: MaterialType.WATER, label: 'WATER', shortcut: '2', color: '#00bfff' },
    { type: MaterialType.FIRE, label: 'FIRE', shortcut: '3', color: '#ff4500' },
    { type: MaterialType.SMOKE, label: 'SMOKE', shortcut: '4', color: '#a0a0a0' },
    { type: MaterialType.TERRAIN, label: 'WALL', shortcut: '5', color: '#8d6e63' },
    { type: MaterialType.BOMB, label: 'BOMB', shortcut: '6', color: '#ff1744' },
    { type: MaterialType.ACID, label: 'ACID', shortcut: '7', color: '#39ff14' },
    { type: MaterialType.OIL, label: 'OIL', shortcut: '8', color: '#bd53ff' },
    { type: MaterialType.WOOD, label: 'WOOD', shortcut: '9', color: '#d2b48c' },
    { type: MaterialType.EMPTY, label: 'ERASE', shortcut: '0', color: '#555570' },
  ];

  // Count active particles
  const particleCount = stateRef.current
    ? stateRef.current.grid.filter(c => c.type !== MaterialType.EMPTY).length
    : 0;

  return (
    <div className="terminal-container app-container fade-in">
      <div className="crt-glow" />
      <div className="crt-scanlines" />

      {/* SWISS RETRO HUD HEADER */}
      <div className="terminal-header-box">
        <div className="ascii-border-top">┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐</div>
        <div className="terminal-header-content">
          <div className="header-logo-container">
            <div className="header-swiss-logo">GLYPHFALL // ASC.SIM</div>
            <div className="header-description">
              <span className="subtitle-tag">[CORE: ONLINE]</span>
              <span className="subtitle-desc">SWISS MONOCHROME GRID TERMINAL v2.0</span>
            </div>
          </div>

          <div className="ascii-stats-grid">
            <div className="ascii-stat-card">
              <span className="stat-label">FPS</span>
              <span className="stat-val">{String(fps).padStart(3, '0')}</span>
            </div>
            <div className="ascii-stat-card">
              <span className="stat-label">TICK</span>
              <span className="stat-val">{String(tick % 1000000).padStart(6, '0')}</span>
            </div>
            <div className="ascii-stat-card">
              <span className="stat-label">CELLS</span>
              <span className="stat-val">{String(particleCount).padStart(6, '0')}</span>
            </div>
          </div>
        </div>
        <div className="ascii-border-bottom">└────────────────────────────────────────────────────────────────────────────────────────────────────────┘</div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="terminal-swiss-workspace">
        {/* SIDE PANEL: Presets & Controls */}
        <div className="terminal-side-panel">
          <div className="side-section-title">┌─ SCENE PRESETS ──┐</div>
          <div className="side-section-body">
            <button className="console-action-btn" onClick={() => loadPreset('hourglass')}>
              [⏳] HOURGLASS
            </button>
            <button className="console-action-btn" onClick={() => loadPreset('dambreak')}>
              [🌊] DAM BREAK
            </button>
            <button className="console-action-btn" onClick={() => loadPreset('bombtest')}>
              [💣] BOMB TEST
            </button>
          </div>
          <div className="side-section-footer">└──────────────────┘</div>

          <div className="side-section-title" style={{ marginTop: '12px' }}>┌─ BRUSH CONFIG ───┐</div>
          <div className="side-section-body">
            <div className="brush-shape-selectors">
              <button 
                className={`brush-shape-btn ${brushShape === 'circle' ? 'active' : ''}`}
                onClick={() => { setBrushShape('circle'); AudioSystem.playClick(); }}
              >
                ● CIRCLE
              </button>
              <button 
                className={`brush-shape-btn ${brushShape === 'square' ? 'active' : ''}`}
                onClick={() => { setBrushShape('square'); AudioSystem.playClick(); }}
              >
                ■ SQUARE
              </button>
              <button 
                className={`brush-shape-btn ${brushShape === 'line' ? 'active' : ''}`}
                onClick={() => { setBrushShape('line'); AudioSystem.playClick(); }}
              >
                ▬ LINE
              </button>
            </div>
            
            <div className="setting-slider-container">
              <span className="slider-label">SIZE: {brushSize}</span>
              <input
                type="range"
                className="retro-slider"
                min={1}
                max={6}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="side-section-footer">└──────────────────┘</div>

          <div className="side-section-title" style={{ marginTop: '12px' }}>┌─ AUDIO CONTROL ──┐</div>
          <div className="side-section-body">
            <button 
              className={`console-action-btn ${muted ? 'muted' : ''}`}
              onClick={toggleMute}
            >
              {muted ? '[🔇] AUDIO MUTED' : '[🔊] AUDIO ACTIVE'}
            </button>
          </div>
          <div className="side-section-footer">└──────────────────┘</div>
        </div>

        {/* FEED PANEL: Grid Canvas */}
        <div className="terminal-body">
          <div className="canvas-frame">
            <div className="frame-header">
              <span>┌── FEED: SIMULATION_GRID ────────────────────────────────────────────────────────────────────────┐</span>
            </div>
            <div className="canvas-wrapper">
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
            <div className="frame-footer">
              <span>└────────────────────────────────────────────────────────────── RESOLUTION: {CANVAS_WIDTH}x{CANVAS_HEIGHT} ─┘</span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER BAR: Material Palette */}
      <div className="terminal-footer">
        <div className="ascii-border-top">┌── MATERIAL SELECTOR ──────────────────────────────────────────────────────────────────────────────┐</div>
        
        <div className="terminal-console-controls">
          <div className="console-materials-group">
            <div className="materials-list">
              {tools.map(tool => {
                const isActive = selectedMaterial === tool.type;
                const matDef = Materials[tool.type];
                const displayChar = tool.type === MaterialType.EMPTY ? '✕' : matDef.glyphs[0];
                return (
                  <button
                    key={tool.type}
                    className={`console-tool-btn ${isActive ? 'active' : ''}`}
                    onClick={() => { setSelectedMaterial(tool.type); playMaterialSound(tool.type); }}
                    style={{ '--tool-accent': tool.color } as React.CSSProperties}
                  >
                    <span className="btn-selector">{isActive ? '►' : ' '}</span>
                    <span className="btn-key">[{tool.shortcut}]</span>
                    <span className="btn-glyph">{displayChar}</span>
                    <span className="btn-label">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="footer-console-settings">
            <button
              className={`console-action-btn ${paused ? 'paused' : ''}`}
              onClick={() => { setPaused(p => !p); AudioSystem.playClick(); }}
              title="Spacebar"
            >
              {paused ? '▶ PLAY' : '⏸ PAUS'}
            </button>
            <button
              className="console-action-btn danger"
              onClick={handleClear}
              title="C Key"
            >
              ✕ CLEAR
            </button>
          </div>
        </div>

        <div className="ascii-border-bottom">└───────────────────────────────────────────────────────────────────────────────────────────────────┘</div>
      </div>
    </div>
  );
}
