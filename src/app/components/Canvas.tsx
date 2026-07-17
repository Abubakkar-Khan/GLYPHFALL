'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimulationState, MaterialType, Cell } from '../../engine/types';
import { createGrid } from '../../engine/grid';
import { Materials, initCell } from '../../engine/materials';
import { startLoop } from '../../engine/loop';
import { handlePointer } from '../../input/input';
import { AudioSystem } from '../../engine/audio';

// Simulation grid size
const COLS = 160;
const ROWS = 90;
const CELL_SIZE = 10;

// Canvas display size
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 520;

// Center Camera math: W_v - W_g * scale / 2
const defaultZoom = 0.55;
const defaultPanX = Math.floor((CANVAS_WIDTH - COLS * CELL_SIZE * defaultZoom) / 2); // (920 - 880)/2 = 20
const defaultPanY = Math.floor((CANVAS_HEIGHT - ROWS * CELL_SIZE * defaultZoom) / 2); // (520 - 495)/2 = 12.5

// Helper to apply rigid borders inside the grid
function applyBorders(grid: Cell[]) {
  // Bottom ground floor
  for (let x = 0; x < COLS; x++) {
    for (let y = ROWS - 3; y < ROWS; y++) {
      initCell(grid[y * COLS + x], MaterialType.TERRAIN);
    }
  }
  // Side walls
  for (let y = 0; y < ROWS; y++) {
    initCell(grid[y * COLS + 0], MaterialType.TERRAIN);
    initCell(grid[y * COLS + (COLS - 1)], MaterialType.TERRAIN);
  }
  // Top ceiling
  for (let x = 0; x < COLS; x++) {
    initCell(grid[x], MaterialType.TERRAIN);
  }
}

export default function CanvasComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SimulationState | null>(null);

  // Tool / Brush config
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType | 'pan'>(MaterialType.SAND);
  const [brushSize, setBrushSize] = useState(2);
  const [brushShape, setBrushShape] = useState<'circle' | 'square' | 'line'>('circle');
  
  // Camera Nav (Centered on startup)
  const [zoom, setZoom] = useState(defaultZoom);
  const [panX, setPanX] = useState(defaultPanX);
  const [panY, setPanY] = useState(defaultPanY);

  // States
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tick, setTick] = useState(0);
  const [fps, setFps] = useState(0);
  const [particleCount, setParticleCount] = useState(0);

  const isPainting = useRef(false);
  const isPanning = useRef(false);
  const startDrag = useRef({ x: 0, y: 0 });
  const startPan = useRef({ x: 0, y: 0 });

  const selectedMaterialRef = useRef(selectedMaterial);
  const brushSizeRef = useRef(brushSize);
  const brushShapeRef = useRef(brushShape);
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);

  // Keep refs updated for callback access
  useEffect(() => { selectedMaterialRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { brushShapeRef.current = brushShape; }, [brushShape]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panXRef.current = panX; }, [panX]);
  useEffect(() => { panYRef.current = panY; }, [panY]);

  // Sync mute state
  useEffect(() => {
    setMuted(AudioSystem.getMuteState());
  }, []);

  // Initialize simulation grid
  useEffect(() => {
    const grid = createGrid(COLS, ROWS);
    applyBorders(grid);

    // Starting plant and wood blocks in center
    const midY = Math.floor(ROWS / 2);
    for (let x = 40; x < COLS - 40; x++) {
      if (x % 20 < 10) {
        initCell(grid[midY * COLS + x], MaterialType.WOOD);
      } else {
        initCell(grid[midY * COLS + x], MaterialType.PLANT);
      }
    }
    // Spawn some initial bugs on the center structure
    for (let i = 0; i < 5; i++) {
      const bx = 45 + i * 15;
      initCell(grid[(midY - 2) * COLS + bx], MaterialType.BUG);
    }

    stateRef.current = {
      width: COLS,
      height: ROWS,
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

    let frameCount = 0;
    let lastFpsTime = performance.now();

    function render() {
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.save();
      // Apply pan/zoom camera matrix
      ctx.translate(panXRef.current, panYRef.current);
      ctx.scale(zoomRef.current, zoomRef.current);

      const { grid, width, height } = state;

      // Camera frustum culling: only render visible blocks
      const minX = Math.max(0, Math.floor(-panXRef.current / (CELL_SIZE * zoomRef.current)));
      const maxX = Math.min(width, Math.ceil((CANVAS_WIDTH - panXRef.current) / (CELL_SIZE * zoomRef.current)));
      const minY = Math.max(0, Math.floor(-panYRef.current / (CELL_SIZE * zoomRef.current)));
      const maxY = Math.min(height, Math.ceil((CANVAS_HEIGHT - panYRef.current) / (CELL_SIZE * zoomRef.current)));

      let count = 0;
      for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
          const idx = y * width + x;
          const cell = grid[idx];
          if (cell.type === MaterialType.EMPTY) continue;
          
          count++;
          const glyph = getGlyph(cell.char, cell.color);
          ctx.drawImage(glyph, x * CELL_SIZE, y * CELL_SIZE);
        }
      }

      // Draw simulation grid borders inside viewport (scaled)
      ctx.strokeStyle = '#6e451b'; // clear copper-amber outline
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, 0, width * CELL_SIZE, height * CELL_SIZE);

      ctx.restore();
      setParticleCount(count);
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

  // Update pause states
  useEffect(() => {
    if (stateRef.current) stateRef.current.paused = paused;
  }, [paused]);

  // Coordinate translator
  const getGridPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const canvasX = clientX * scaleX;
    const canvasY = clientY * scaleY;

    const gridX = Math.floor((canvasX - panX) / (CELL_SIZE * zoom));
    const gridY = Math.floor((canvasY - panY) / (CELL_SIZE * zoom));
    return { x: gridX, y: gridY };
  }, [panX, panY, zoom]);

  const paint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    if (!state || selectedMaterialRef.current === 'pan') return;
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

  const playMaterialSound = (mat: MaterialType | 'pan') => {
    if (mat === 'pan') {
      AudioSystem.playClick();
      return;
    }
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

  // Drag pan and drawing handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || e.button === 1 || e.shiftKey || selectedMaterial === 'pan') {
      isPanning.current = true;
      startDrag.current = { x: e.clientX, y: e.clientY };
      startPan.current = { x: panX, y: panY };
      AudioSystem.playClick();
    } else {
      isPainting.current = true;
      playMaterialSound(selectedMaterialRef.current);
      paint(e);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      const dx = e.clientX - startDrag.current.x;
      const dy = e.clientY - startDrag.current.y;
      setPanX(startPan.current.x + dx);
      setPanY(startPan.current.y + dy);
    } else if (isPainting.current) {
      if (Math.random() < 0.1) {
        playMaterialSound(selectedMaterialRef.current);
      }
      paint(e);
    }
  };

  const handleMouseUp = () => {
    isPainting.current = false;
    isPanning.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const mouseX = clientX * scaleX;
    const mouseY = clientY * scaleY;

    const zoomIntensity = 0.08;
    const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
    const newZoom = Math.max(0.4, Math.min(3.5, zoom * zoomFactor));

    const newPanX = mouseX - (mouseX - panX) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - panY) * (newZoom / zoom);

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);

    if (Math.random() < 0.15) {
      AudioSystem.playClick();
    }
  };

  const resetCamera = useCallback(() => {
    AudioSystem.playClick();
    setZoom(defaultZoom);
    setPanX(defaultPanX);
    setPanY(defaultPanY);
  }, []);

  const handleClear = useCallback(() => {
    AudioSystem.playClick();
    const state = stateRef.current;
    if (!state) return;
    const grid = createGrid(COLS, ROWS);
    applyBorders(grid);
    state.grid = grid;
  }, []);

  const loadPreset = useCallback((presetName: string) => {
    const state = stateRef.current;
    if (!state) return;
    AudioSystem.playClick();

    const grid = createGrid(COLS, ROWS);

    if (presetName === 'dambreak') {
      const midX = Math.floor(COLS / 2);
      // Wood partition
      for (let y = 5; y < ROWS - 3; y++) {
        initCell(grid[y * COLS + midX], MaterialType.WOOD);
      }
      // Water reservoir (left)
      for (let y = 20; y < ROWS - 3; y++) {
        for (let x = 10; x < midX; x++) {
          initCell(grid[y * COLS + x], MaterialType.WATER);
        }
      }
      // Moss/Plants on the floor of right side
      for (let y = ROWS - 5; y < ROWS - 3; y++) {
        for (let x = midX + 1; x < COLS - 10; x++) {
          initCell(grid[y * COLS + x], MaterialType.PLANT);
        }
      }
      // Bomb in the center of the wall
      initCell(grid[Math.floor(ROWS / 2) * COLS + midX], MaterialType.BOMB);
    } 
    else if (presetName === 'bombtest') {
      const midY = Math.floor(ROWS / 2);

      // Wooden scaffolding
      for (let x = 20; x < COLS - 20; x++) {
        initCell(grid[(midY - 6) * COLS + x], MaterialType.WOOD);
        initCell(grid[(midY + 4) * COLS + x], MaterialType.WOOD);
      }
      for (let y = midY - 6; y < ROWS - 3; y++) {
        initCell(grid[y * COLS + 25], MaterialType.WOOD);
        initCell(grid[y * COLS + COLS - 26], MaterialType.WOOD);
      }

      // Pour combustible fuels (Oil, plants, and bugs)
      for (let x = 30; x < COLS - 30; x++) {
        if (x % 35 < 8) {
          initCell(grid[(midY - 7) * COLS + x], MaterialType.OIL);
        } else if (x % 35 < 16) {
          initCell(grid[(midY - 7) * COLS + x], MaterialType.PLANT);
        } else if (x % 35 < 24) {
          initCell(grid[(midY - 7) * COLS + x], MaterialType.BUG);
        }
      }

      // Bombs on top decks
      initCell(grid[(midY - 7) * COLS + Math.floor(COLS / 3)], MaterialType.BOMB);
      initCell(grid[(midY - 7) * COLS + Math.floor(COLS * 2 / 3)], MaterialType.BOMB);

      // Acid reservoir below
      for (let x = 40; x < COLS - 40; x++) {
        if (x % 20 < 6) {
          initCell(grid[(midY + 3) * COLS + x], MaterialType.ACID);
        }
      }
    }

    applyBorders(grid);
    state.grid = grid;
  }, []);

  // Keyboard controls
  useEffect(() => {
    const materialKeys: Record<string, MaterialType | 'pan'> = {
      '1': MaterialType.SAND,
      '2': MaterialType.WATER,
      '3': MaterialType.FIRE,
      '4': MaterialType.TERRAIN,
      '5': MaterialType.BOMB,
      '6': MaterialType.OIL,
      '7': MaterialType.WOOD,
      '8': MaterialType.PLANT,
      '9': MaterialType.BUG,
      'b': MaterialType.BUG,
      'B': MaterialType.BUG,
      'a': MaterialType.ACID,
      'A': MaterialType.ACID,
      '0': MaterialType.EMPTY,
      'p': 'pan',
      'P': 'pan'
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
      if (e.key === 'r' || e.key === 'R') {
        resetCamera();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClear, resetCamera]);

  const toggleMute = () => {
    const isNowMuted = AudioSystem.toggleMute();
    setMuted(isNowMuted);
    if (!isNowMuted) {
      AudioSystem.playClick();
    }
  };

  // Material tool palette definitions (retro monospace, no smoke)
  const tools = [
    { type: MaterialType.SAND, label: 'SAND', shortcut: '1', color: '#eedc82' },
    { type: MaterialType.WATER, label: 'WATER', shortcut: '2', color: '#1e90ff' },
    { type: MaterialType.FIRE, label: 'FIRE', shortcut: '3', color: '#ff4500' },
    { type: MaterialType.TERRAIN, label: 'WALL', shortcut: '4', color: '#8d6e63' },
    { type: MaterialType.BOMB, label: 'BOMB', shortcut: '5', color: '#ff1744' },
    { type: MaterialType.ACID, label: 'ACID', shortcut: 'a', color: '#39ff14' },
    { type: MaterialType.OIL, label: 'OIL', shortcut: '6', color: '#bd53ff' },
    { type: MaterialType.WOOD, label: 'WOOD', shortcut: '7', color: '#d2b48c' },
    { type: MaterialType.PLANT, label: 'PLANT', shortcut: '8', color: '#4caf50' },
    { type: MaterialType.BUG, label: 'BUG', shortcut: '9', color: '#ffc107' },
    { type: MaterialType.EMPTY, label: 'ERASE', shortcut: '0', color: '#555570' },
  ];

  return (
    <div className="terminal-container app-container fade-in">
      <div className="crt-glow" />
      <div className="crt-scanlines" />

      {/* RETRO HEADER */}
      <div className="terminal-header-box">
        <div className="ascii-border-top">┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐</div>
        <div className="terminal-header-content">
          <div className="header-logo-container">
            <div className="header-swiss-logo">GLYPHFALL // TERMINAL</div>
            <div className="header-description">
              <span className="subtitle-tag">[CORE // ENG.ACTIVE]</span>
              <span className="subtitle-desc">MONOCHROME AMBER CRT MONITOR FRAME v3.1</span>
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

      {/* WORKSPACE PANELS */}
      <div className="terminal-swiss-workspace">
        {/* LEFT COLUMN: Controls & Presets */}
        <div className="terminal-side-panel">
          <div className="side-section-title">┌─ SCENE PRESETS ──┐</div>
          <div className="side-section-body">
            <button className="console-action-btn" onClick={() => loadPreset('dambreak')}>
              [PRESET: RESERVOIR]
            </button>
            <button className="console-action-btn" onClick={() => loadPreset('bombtest')}>
              [PRESET: TEST SITE]
            </button>
          </div>
          <div className="side-section-footer">└──────────────────┘</div>

          <div className="side-section-title" style={{ marginTop: '12px' }}>┌─ VIEWPORT NAV ───┐</div>
          <div className="side-section-body">
            <button 
              className={`console-action-btn ${selectedMaterial === 'pan' ? 'active-pan' : ''}`}
              onClick={() => { setSelectedMaterial('pan'); AudioSystem.playClick(); }}
            >
              {selectedMaterial === 'pan' ? '[PANNING FEED ACTIVE]' : '[DRAG PAN MODE (P)]'}
            </button>
            
            <button className="console-action-btn" onClick={resetCamera}>
              [CAMERA RESET (R)]
            </button>

            <div className="camera-info-readout">
              <div>ZOOM: {zoom.toFixed(2)}x</div>
              <div>X: {Math.floor(panX)} Y: {Math.floor(panY)}</div>
            </div>
          </div>
          <div className="side-section-footer">└──────────────────┘</div>

          <div className="side-section-title" style={{ marginTop: '12px' }}>┌─ BRUSH CONFIG ───┐</div>
          <div className="side-section-body">
            <div className="brush-shape-selectors">
              <button 
                className={`brush-shape-btn ${brushShape === 'circle' ? 'active' : ''}`}
                onClick={() => { setBrushShape('circle'); AudioSystem.playClick(); }}
              >
                SHAPE: CIRCLE
              </button>
              <button 
                className={`brush-shape-btn ${brushShape === 'square' ? 'active' : ''}`}
                onClick={() => { setBrushShape('square'); AudioSystem.playClick(); }}
              >
                SHAPE: SQUARE
              </button>
              <button 
                className={`brush-shape-btn ${brushShape === 'line' ? 'active' : ''}`}
                onClick={() => { setBrushShape('line'); AudioSystem.playClick(); }}
              >
                SHAPE: HORIZ LINE
              </button>
            </div>
            
            <div className="setting-slider-container">
              <span className="slider-label">RADIUS: {brushSize}</span>
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

          <div className="side-section-title" style={{ marginTop: '12px' }}>┌─ SYSTEM AUDIO ───┐</div>
          <div className="side-section-body">
            <button 
              className={`console-action-btn ${muted ? 'muted' : ''}`}
              onClick={toggleMute}
            >
              {muted ? '[AUDIO MUTED]' : '[AUDIO ENG.ACTIVE]'}
            </button>
          </div>
          <div className="side-section-footer">└──────────────────┘</div>
        </div>

        {/* FEED PANEL: Viewport with Zoom and Pan */}
        <div className="terminal-body">
          <div className="canvas-frame">
            <div className="frame-header">
              <span>┌── CRT SIMULATION VIEWPORT ───────────────────────────────────────────────────────────────────┐</span>
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
                onContextMenu={handleContextMenu}
                onWheel={handleWheel}
              />
            </div>
            <div className="frame-footer">
              <span>└─────────────────────────────────────────────── SCROLL: ZOOM ── RIGHT-CLICK: DRAG PAN ─┘</span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER BAR: Material palette selection */}
      <div className="terminal-footer">
        <div className="ascii-border-top">┌── MATERIAL MATRIX SELECTOR ───────────────────────────────────────────────────────────────────────┐</div>
        
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
              {paused ? '▶ SYSTEM RUN' : '⏸ SYSTEM HALT'}
            </button>
            <button
              className="console-action-btn danger"
              onClick={handleClear}
              title="C Key"
            >
              ✕ CLEAN GRID
            </button>
          </div>
        </div>

        <div className="ascii-border-bottom">└───────────────────────────────────────────────────────────────────────────────────────────────────┘</div>
      </div>
    </div>
  );
}
