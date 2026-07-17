'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimulationState, MaterialType } from '../../engine/types';
import { createGrid } from '../../engine/grid';
import { Materials } from '../../engine/materials';
import { startLoop } from '../../engine/loop';
import { handlePointer } from '../../input/input';

// Canvas size and cell dimensions
const CELL_SIZE = 10;
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 560;

const cols = Math.floor(CANVAS_WIDTH / CELL_SIZE);
const rows = Math.floor(CANVAS_HEIGHT / CELL_SIZE);

export default function CanvasComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SimulationState | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType>(MaterialType.SAND);
  const [brushSize, setBrushSize] = useState(2);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const [fps, setFps] = useState(0);
  const isPainting = useRef(false);
  const selectedMaterialRef = useRef(selectedMaterial);
  const brushSizeRef = useRef(brushSize);

  // Keep refs in sync
  useEffect(() => { selectedMaterialRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

  // Initialize simulation state
  useEffect(() => {
    const grid = createGrid(cols, rows);
    // Add ground terrain
    for (let x = 0; x < cols; x++) {
      for (let y = rows - 3; y < rows; y++) {
        const idx = y * cols + x;
        grid[idx] = {
          type: MaterialType.TERRAIN,
          char: Materials[MaterialType.TERRAIN].glyph,
          color: Materials[MaterialType.TERRAIN].color,
          lifetime: 0,
          velocity: 0,
          updated: 0,
        };
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
      octx.font = `${CELL_SIZE}px "JetBrains Mono", monospace`;
      octx.textBaseline = 'top';
      octx.fillText(char, 0, 0);
      glyphCache[key] = off;
      return off;
    }

    // FPS counter
    let frameCount = 0;
    let lastFpsTime = performance.now();

    function render() {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const { grid, width, height } = state;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const cell = grid[idx];
          if (cell.type === MaterialType.EMPTY) continue;
          const materialDef = Materials[cell.type];
          const glyph = getGlyph(materialDef.glyph, materialDef.color);
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
    handlePointer(state, pos.x, pos.y, selectedMaterialRef.current, brushSizeRef.current);
  }, [getGridPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isPainting.current = true;
    paint(e);
  }, [paint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPainting.current) paint(e);
  }, [paint]);

  const handleMouseUp = useCallback(() => {
    isPainting.current = false;
  }, []);

  // Clear grid
  const handleClear = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    const grid = createGrid(cols, rows);
    for (let x = 0; x < cols; x++) {
      for (let y = rows - 3; y < rows; y++) {
        const idx = y * cols + x;
        grid[idx] = {
          type: MaterialType.TERRAIN,
          char: Materials[MaterialType.TERRAIN].glyph,
          color: Materials[MaterialType.TERRAIN].color,
          lifetime: 0,
          velocity: 0,
          updated: 0,
        };
      }
    }
    state.grid = grid;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const materialKeys: Record<string, MaterialType> = {
      '1': MaterialType.SAND,
      '2': MaterialType.WATER,
      '3': MaterialType.FIRE,
      '4': MaterialType.SMOKE,
      '5': MaterialType.TERRAIN,
      '6': MaterialType.BOMB,
      '0': MaterialType.EMPTY,
    };

    const handler = (e: KeyboardEvent) => {
      if (materialKeys[e.key] !== undefined) {
        setSelectedMaterial(materialKeys[e.key]);
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPaused(p => !p);
      }
      if (e.key === 'c' || e.key === 'C') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClear]);

  // Material tool definitions
  const tools: { type: MaterialType; label: string; shortcut: string }[] = [
    { type: MaterialType.SAND, label: 'Sand', shortcut: '1' },
    { type: MaterialType.WATER, label: 'Water', shortcut: '2' },
    { type: MaterialType.FIRE, label: 'Fire', shortcut: '3' },
    { type: MaterialType.SMOKE, label: 'Smoke', shortcut: '4' },
    { type: MaterialType.TERRAIN, label: 'Wall', shortcut: '5' },
    { type: MaterialType.BOMB, label: 'Bomb', shortcut: '6' },
    { type: MaterialType.EMPTY, label: 'Erase', shortcut: '0' },
  ];

  // Count active particles
  const particleCount = stateRef.current
    ? stateRef.current.grid.filter(c => c.type !== MaterialType.EMPTY).length
    : 0;

  return (
    <div className="app-container fade-in">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <div>
            <div className="logo-icon">GLYPHFALL</div>
            <div className="logo-sub">ASCII Physics Sandbox</div>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span>FPS</span>
            <span className="stat-value">{fps}</span>
          </div>
          <div className="stat">
            <span>TICK</span>
            <span className="stat-value">{tick}</span>
          </div>
          <div className="stat">
            <span>CELLS</span>
            <span className="stat-value">{particleCount}</span>
          </div>
        </div>
      </header>

      {/* Canvas */}
      <div className="canvas-area">
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
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="tool-group">
          {tools.map(tool => {
            const matDef = Materials[tool.type];
            const isActive = selectedMaterial === tool.type;
            return (
              <button
                key={tool.type}
                className={`tool-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedMaterial(tool.type)}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <span
                  className="tool-glyph"
                  style={{ color: tool.type === MaterialType.EMPTY ? '#666' : matDef.color }}
                >
                  {tool.type === MaterialType.EMPTY ? '✕' : matDef.glyph}
                </span>
                <span className="tool-label">{tool.label}</span>
                <span className="shortcut-hint">{tool.shortcut}</span>
              </button>
            );
          })}
        </div>

        <div className="divider" />

        <div className="brush-control">
          <span className="brush-label">Brush</span>
          <input
            type="range"
            className="brush-slider"
            min={1}
            max={6}
            value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
          />
          <span className="brush-value">{brushSize}</span>
        </div>

        <div className="divider" />

        <button
          className={`control-btn ${paused ? 'active' : ''}`}
          onClick={() => setPaused(p => !p)}
          title="Pause/Resume (Space)"
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button
          className="control-btn danger"
          onClick={handleClear}
          title="Clear (C)"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
