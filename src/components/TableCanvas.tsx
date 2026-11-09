import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Ball, GhostBallInfo, PocketDef, ShotSettings, TableConfig, TrajectoryFrame, Vector2D } from '../physics/types';
import { BALL_COLORS } from '../physics/constants';
import { getTablePockets } from '../physics/geometry';
import { metersToGrid, metersToDiamonds, formatGridCoord } from '../utils/coordinates';
import { soundFx } from '../utils/audio';

interface TableCanvasProps {
  config: TableConfig;
  balls: Ball[];
  shot: ShotSettings;
  aimInfo: GhostBallInfo;
  isSimulating: boolean;
  currentFrame: TrajectoryFrame | null;
  guides: {
    showGhostBall: boolean;
    showLineOfCenters: boolean;
    showTangentLine: boolean;
    showPredictedPath: boolean;
    showGrid: boolean;
    showDiamonds: boolean;
    showPocketTargets: boolean;
  };
  onAimAngleChange: (angleRad: number) => void;
  onBallMove: (ballId: number, newX: number, newY: number) => void;
  onAddBall: (number: number, x: number, y: number) => void;
  onRemoveBall: (ballId: number) => void;
  targetBallId: number | null;
  onSelectTargetBall: (ballId: number | null) => void;
  activeTargetPocketId?: string | null;
  onSelectPocket?: (pocketId: string) => void;
}

export const TableCanvas: React.FC<TableCanvasProps> = ({
  config,
  balls,
  shot,
  aimInfo,
  isSimulating,
  currentFrame,
  guides,
  onAimAngleChange,
  onBallMove,
  targetBallId,
  onSelectTargetBall,
  activeTargetPocketId,
  onSelectPocket,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dragging state
  const [draggingBallId, setDraggingBallId] = useState<number | null>(null);
  const [isAimingWithMouse, setIsAimingWithMouse] = useState<boolean>(false);
  const [hoveredBallId, setHoveredBallId] = useState<number | null>(null);

  // Table screen dimensions calculated to maintain exact 2:1 aspect ratio
  const [scale, setScale] = useState<number>(450); // pixels per meter
  const railPadding = 48; // pixels for wooden rail border & diamonds

  const tableWidthPx = config.lengthM * scale;
  const tableHeightPx = config.widthM * scale;
  const canvasWidth = tableWidthPx + railPadding * 2;
  const canvasHeight = tableHeightPx + railPadding * 2;

  // Resize observer to auto-fit table cleanly in view
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const availWidth = containerRef.current.clientWidth - 32;
      const availHeight = window.innerHeight - 340; // leave room for controls & header

      const maxScaleW = (availWidth - railPadding * 2) / config.lengthM;
      const maxScaleH = (availHeight - railPadding * 2) / config.widthM;
      const optimalScale = Math.max(250, Math.min(520, Math.min(maxScaleW, maxScaleH)));
      setScale(optimalScale);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [config.lengthM, config.widthM]);

  // Coordinate transforms
  const toScreenX = useCallback((xm: number) => railPadding + xm * scale, [scale, railPadding]);
  const toScreenY = useCallback((ym: number) => railPadding + ym * scale, [scale, railPadding]);
  const toMetersX = useCallback((px: number) => (px - railPadding) / scale, [scale, railPadding]);
  const toMetersY = useCallback((py: number) => (py - railPadding) / scale, [scale, railPadding]);

  // Active balls (interpolated from simulation frame or live balls)
  const displayBalls = currentFrame ? currentFrame.balls : balls;
  const cueBall = displayBalls.find((b) => b.id === 0) || balls.find((b) => b.id === 0);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI crispness
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 1. Draw Wooden Table Rails & Frame
    drawTableFrame(ctx);

    // 2. Draw Table Cloth (Simonis Tournament Blue)
    drawCloth(ctx);

    // 3. Draw Grid & Diamonds if enabled
    if (guides.showGrid) drawCoordinateGrid(ctx);
    if (guides.showDiamonds) drawDiamonds(ctx);

    // 4. Draw Pockets
    drawPockets(ctx);

    // 5. Draw Aiming Guides, Ghost Ball, Line of Centers & Tangent Line
    if (!isSimulating && cueBall && !cueBall.isPocketed) {
      drawAimGuides(ctx, cueBall);
    }

    // 6. Draw Balls
    drawBalls(ctx);

    // 7. Draw Ball Hover / Drag HUD
    if (hoveredBallId !== null || draggingBallId !== null) {
      const activeId = draggingBallId ?? hoveredBallId;
      const b = displayBalls.find((x) => x.id === activeId);
      if (b && !b.isPocketed) {
        drawBallHUD(ctx, b);
      }
    }
  }, [
    canvasWidth,
    canvasHeight,
    config,
    scale,
    displayBalls,
    aimInfo,
    shot,
    guides,
    isSimulating,
    draggingBallId,
    hoveredBallId,
    cueBall,
  ]);

  // Helper Drawing Functions
  const drawTableFrame = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    // Dark mahogany/slate composite wood rail
    ctx.fillStyle = '#161922';
    ctx.beginPath();
    ctx.roundRect(4, 4, canvasWidth - 8, canvasHeight - 8, 20);
    ctx.fill();

    // Subtle brushed inner bevel
    ctx.strokeStyle = '#2d3345';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Table drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.restore();
  };

  const drawCloth = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const x = railPadding;
    const y = railPadding;
    const w = tableWidthPx;
    const h = tableHeightPx;

    // Tournament Electric Blue gradient
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#1a5f9c');
    grad.addColorStop(0.5, '#1e68a8');
    grad.addColorStop(1, '#155288');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Inner cushion nose border
    ctx.strokeStyle = '#0f385c';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    // Head string line (1/4 distance from left)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.25, y + h);
    ctx.stroke();

    // Center spot & foot spot
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    [0.25, 0.5, 0.75].forEach((frac) => {
      ctx.beginPath();
      ctx.arc(x + w * frac, y + h * 0.5, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  };

  const drawCoordinateGrid = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.8;

    // Columns 1 to 50 (aligned with playable ball centers)
    const R = config.ballRadiusM;
    const playableWidthPx = (config.lengthM - 2 * R) * scale;
    const playableHeightPx = (config.widthM - 2 * R) * scale;
    const startX = railPadding + R * scale;
    const startY = railPadding + R * scale;

    const colStep = playableWidthPx / 49;
    for (let c = 1; c <= 50; c++) {
      const gx = startX + (c - 1) * colStep;
      ctx.beginPath();
      ctx.moveTo(gx, railPadding);
      ctx.lineTo(gx, railPadding + tableHeightPx);
      ctx.stroke();

      // Column labels on top rail
      if (c === 1 || c === 50 || c % 5 === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(c.toString(), gx, railPadding - 10);
        ctx.fillText(c.toString(), gx, railPadding + tableHeightPx + 18);
      }
    }

    // Rows A to Z (26 letters, 25 intervals)
    const rowStep = playableHeightPx / 25;
    for (let r = 1; r <= 26; r++) {
      const gy = startY + (r - 1) * rowStep;
      ctx.beginPath();
      ctx.moveTo(railPadding, gy);
      ctx.lineTo(railPadding + tableWidthPx, gy);
      ctx.stroke();

      const letter = String.fromCharCode(64 + r);
      if (r === 1 || r === 26 || r % 4 === 1) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, railPadding - 14, gy);
        ctx.fillText(letter, railPadding + tableWidthPx + 14, gy);
      }
    }
    ctx.restore();
  };

  const drawDiamonds = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2;

    const diamondSize = 4;

    // Helper to draw small diamond
    const renderDiamond = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - diamondSize);
      ctx.lineTo(cx + diamondSize, cy);
      ctx.lineTo(cx, cy + diamondSize);
      ctx.lineTo(cx - diamondSize, cy);
      ctx.closePath();
      ctx.fill();
    };

    // Long rails: 8 segments (diamonds at 1/8, 2/8, 3/8, 5/8, 6/8, 7/8; 4/8 is side pocket)
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue; // Side pocket
      const x = railPadding + (tableWidthPx * i) / 8;
      renderDiamond(x, railPadding - 24); // Top rail
      renderDiamond(x, railPadding + tableHeightPx + 24); // Bottom rail
    }

    // Short rails: 4 segments (diamonds at 1/4, 2/4, 3/4)
    for (let j = 1; j < 4; j++) {
      const y = railPadding + (tableHeightPx * j) / 4;
      renderDiamond(railPadding - 24, y); // Left rail
      renderDiamond(railPadding + tableWidthPx + 24, y); // Right rail
    }

    ctx.restore();
  };

  const drawPockets = (ctx: CanvasRenderingContext2D) => {
    const pockets = getTablePockets(config);
    ctx.save();

    pockets.forEach((p) => {
      const sx = toScreenX(p.x);
      const sy = toScreenY(p.y);
      const sr = p.radius * scale;
      const isTarget = activeTargetPocketId === p.id;

      if (isTarget) {
        // Glowing target ring
        ctx.beginPath();
        ctx.arc(sx, sy, sr + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx, sy, sr + 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dark pocket well
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? '#041c2c' : '#080a0f';
      ctx.fill();

      // Pocket casting rim
      ctx.strokeStyle = isTarget ? '#06b6d4' : '#272a38';
      ctx.lineWidth = isTarget ? 4 : 3;
      ctx.stroke();

      // Pocket ID label (P1..P6)
      ctx.fillStyle = isTarget ? '#22d3ee' : '#64748b';
      ctx.font = isTarget ? '700 12px "JetBrains Mono", monospace' : '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelOffset = p.isCorner ? (p.y === 0 ? -14 : 14) : p.y === 0 ? -12 : 12;
      ctx.fillText(isTarget ? `🎯 ${p.id}` : p.id, sx, sy + labelOffset);
    });

    ctx.restore();
  };

  const drawAimGuides = (ctx: CanvasRenderingContext2D, cb: { x: number; y: number }) => {
    ctx.save();
    const cbScreenX = toScreenX(cb.x);
    const cbScreenY = toScreenY(cb.y);
    const ballR = config.ballRadiusM * scale;

    const actualAimAngle = shot.angleRad - config.squirtFactor * (shot.tipOffsetX || 0);

    // 1. Aim direction line (dotted white cue-stick extension)
    const aimLength = 2.5 * scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cbScreenX, cbScreenY);
    ctx.lineTo(cbScreenX + Math.cos(actualAimAngle) * aimLength, cbScreenY + Math.sin(actualAimAngle) * aimLength);
    ctx.stroke();

    // 2. Cue stick visual behind cue ball
    const stickLength = 140;
    const cueStartX = cbScreenX - Math.cos(actualAimAngle) * (ballR + 10);
    const cueStartY = cbScreenY - Math.sin(actualAimAngle) * (ballR + 10);
    const cueEndX = cbScreenX - Math.cos(actualAimAngle) * (ballR + 10 + stickLength);
    const cueEndY = cbScreenY - Math.sin(actualAimAngle) * (ballR + 10 + stickLength);

    ctx.setLineDash([]);
    ctx.strokeStyle = '#d97706'; // Amber maple cue shaft
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cueStartX, cueStartY);
    ctx.lineTo(cueEndX, cueEndY);
    ctx.stroke();

    // Cue tip
    ctx.strokeStyle = '#38bdf8'; // Blue master chalk tip
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cueStartX, cueStartY);
    ctx.lineTo(cueStartX - Math.cos(actualAimAngle) * 6, cueStartY - Math.sin(actualAimAngle) * 6);
    ctx.stroke();

    // If an object ball is in line of fire
    if (aimInfo.hitTarget && aimInfo.ghostBallPos && aimInfo.targetBallPos) {
      const gbScreenX = toScreenX(aimInfo.ghostBallPos.x);
      const gbScreenY = toScreenY(aimInfo.ghostBallPos.y);
      const tbScreenX = toScreenX(aimInfo.targetBallPos.x);
      const tbScreenY = toScreenY(aimInfo.targetBallPos.y);

      // Line from Cue Ball to Ghost Ball
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cbScreenX, cbScreenY);
      ctx.lineTo(gbScreenX, gbScreenY);
      ctx.stroke();

      // Ghost Ball (transparent circle with dashed cyan rim)
      if (guides.showGhostBall) {
        ctx.beginPath();
        ctx.arc(gbScreenX, gbScreenY, ballR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Small center dot
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(gbScreenX, gbScreenY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Line of Centers (Solid Amber Line passing through object ball into pocket)
      if (guides.showLineOfCenters) {
        const locLen = 1.6 * scale;
        ctx.strokeStyle = '#f59e0b'; // Amber yellow
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(gbScreenX, gbScreenY);
        ctx.lineTo(
          gbScreenX + aimInfo.lineOfCenters.x * locLen,
          gbScreenY + aimInfo.lineOfCenters.y * locLen
        );
        ctx.stroke();

        // Line of centers label
        ctx.fillStyle = '#fef08a';
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(
          `Target Line (${aimInfo.cutAngleDeg.toFixed(1)}° cut)`,
          tbScreenX + aimInfo.lineOfCenters.x * (ballR + 15),
          tbScreenY + aimInfo.lineOfCenters.y * (ballR + 15)
        );
      }

      // 90° TANGENT LINE (THE CORE EDUCATIONAL OVERLAY!)
      if (guides.showTangentLine) {
        const tangentLen = 1.3 * scale;
        const tx = aimInfo.tangentLine.x;
        const ty = aimInfo.tangentLine.y;

        ctx.strokeStyle = '#06b6d4'; // Bright Cyan
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);

        ctx.beginPath();
        ctx.moveTo(gbScreenX, gbScreenY);
        ctx.lineTo(gbScreenX + tx * tangentLen, gbScreenY + ty * tangentLen);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw 90-degree right angle indicator symbol at contact point
        const symbolSize = 14;
        const nx = aimInfo.lineOfCenters.x;
        const ny = aimInfo.lineOfCenters.y;
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gbScreenX + nx * symbolSize, gbScreenY + ny * symbolSize);
        ctx.lineTo(
          gbScreenX + nx * symbolSize + tx * symbolSize,
          gbScreenY + ny * symbolSize + ty * symbolSize
        );
        ctx.lineTo(gbScreenX + tx * symbolSize, gbScreenY + ty * symbolSize);
        ctx.stroke();

        // 90° Tangent Line Badge
        ctx.fillStyle = '#06b6d4';
        ctx.font = '700 11px "JetBrains Mono", monospace';
        const labelX = gbScreenX + tx * (tangentLen * 0.45);
        const labelY = gbScreenY + ty * (tangentLen * 0.45);
        ctx.fillText('90° STUN TANGENT', labelX + 8, labelY - 8);
      }

      // Predicted Actual Cue Ball Trajectory & Curve
      if (guides.showPredictedPath) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2.5;

        if (aimInfo.spinStateAtImpact === 'pure_stun') {
          // Pure stun travels right along the tangent line
          ctx.beginPath();
          ctx.moveTo(gbScreenX, gbScreenY);
          const pDist = 0.5 * scale;
          ctx.lineTo(gbScreenX + aimInfo.tangentLine.x * pDist, gbScreenY + aimInfo.tangentLine.y * pDist);
          ctx.stroke();
        } else {
          // Curved path for follow or draw
          ctx.beginPath();
          ctx.moveTo(gbScreenX, gbScreenY);

          // Quadratic bezier curve showing forward or draw deflection
          const curveFactor = aimInfo.spinStateAtImpact === 'sliding_draw' ? -0.3 : 0.4;
          const ctrlX = gbScreenX + aimInfo.tangentLine.x * (0.3 * scale);
          const ctrlY = gbScreenY + aimInfo.tangentLine.y * (0.3 * scale);
          const endX = ctrlX + Math.cos(shot.angleRad) * (curveFactor * scale);
          const endY = ctrlY + Math.sin(shot.angleRad) * (curveFactor * scale);

          ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
          ctx.stroke();

          // Trajectory label
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
          const label =
            aimInfo.spinStateAtImpact === 'natural_roll'
              ? 'Natural Roll Curve (~30°)'
              : aimInfo.spinStateAtImpact === 'sliding_draw'
              ? 'Draw Curve (Backspin)'
              : 'Follow Curve (Topspin)';
          ctx.fillText(label, endX + 6, endY);
        }
      }
    }

    ctx.restore();
  };

  const drawBalls = (ctx: CanvasRenderingContext2D) => {
    const ballR = config.ballRadiusM * scale;

    displayBalls.forEach((b) => {
      if (b.isPocketed) return;

      const sx = toScreenX(b.x);
      const sy = toScreenY(b.y);
      const color = BALL_COLORS[b.id] || { primary: '#94a3b8', isStripe: false, text: '#ffffff' };

      ctx.save();

      // Ball shadow
      ctx.beginPath();
      ctx.arc(sx + 2, sy + 3, ballR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();

      // Ball base circle
      ctx.beginPath();
      ctx.arc(sx, sy, ballR, 0, Math.PI * 2);

      if (b.id === 0) {
        // Cue ball: glossy white with subtle gradient
        const cueGrad = ctx.createRadialGradient(sx - ballR * 0.3, sy - ballR * 0.3, 2, sx, sy, ballR);
        cueGrad.addColorStop(0, '#ffffff');
        cueGrad.addColorStop(0.8, '#f1f5f9');
        cueGrad.addColorStop(1, '#cbd5e1');
        ctx.fillStyle = cueGrad;
        ctx.fill();

        // Red dot for measle ball / spin tracking
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (!color.isStripe) {
        // Solid ball
        const solidGrad = ctx.createRadialGradient(sx - ballR * 0.3, sy - ballR * 0.3, 2, sx, sy, ballR);
        solidGrad.addColorStop(0, '#ffffff');
        solidGrad.addColorStop(0.3, color.primary);
        solidGrad.addColorStop(1, '#000000');
        ctx.fillStyle = solidGrad;
        ctx.fill();
      } else {
        // Striped ball
        // White ball base
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        // Colored stripe band
        ctx.beginPath();
        ctx.rect(sx - ballR, sy - ballR * 0.55, ballR * 2, ballR * 1.1);
        ctx.fillStyle = color.primary;
        ctx.fill();
      }

      // Ball Number Badge (white circle with crisp number)
      if (b.id > 0) {
        ctx.beginPath();
        ctx.arc(sx, sy, ballR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.max(9, Math.round(ballR * 0.55))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.id.toString(), sx, sy + 0.5);
      }

      // Ball outline
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, ballR, 0, Math.PI * 2);
      ctx.stroke();

      // Highlight ring if selected as target
      if (b.id === targetBallId) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, ballR + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });
  };

  const drawBallHUD = (ctx: CanvasRenderingContext2D, b: { id: number; x: number; y: number }) => {
    const sx = toScreenX(b.x);
    const sy = toScreenY(b.y);
    const grid = metersToGrid(b.x, b.y, config);
    const diamonds = metersToDiamonds(b.x, b.y, config);

    ctx.save();
    const text = b.id === 0 ? `Cue Ball: ${grid.row}-${grid.col}` : `Ball ${b.id}: ${grid.row}-${grid.col}`;
    const subText = `Dia: L${diamonds.longRailDiamond.toFixed(1)} / S${diamonds.shortRailDiamond.toFixed(1)}`;

    ctx.font = '600 10px "JetBrains Mono", monospace';
    const textWidth = Math.max(ctx.measureText(text).width, ctx.measureText(subText).width);
    const boxW = textWidth + 16;
    const boxH = 34;
    const boxX = sx - boxW / 2;
    const boxY = sy - 48;

    // HUD background pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(text, sx, boxY + 14);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText(subText, sx, boxY + 27);

    ctx.restore();
  };

  // --- Mouse / Touch Event Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || isSimulating) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xm = toMetersX(mouseX);
    const ym = toMetersY(mouseY);
    const ballR = config.ballRadiusM;

    // Check if clicked directly on a pocket
    const pockets = getTablePockets(config);
    const clickedPocket = pockets.find(
      (p) => Math.hypot(p.x - xm, p.y - ym) <= p.radius * 1.5
    );
    if (clickedPocket && onSelectPocket) {
      onSelectPocket(clickedPocket.id);
      soundFx.playCushionHit();
      return;
    }

    // Check if clicked directly on a ball
    const clickedBall = balls.find(
      (b) => !b.isPocketed && Math.hypot(b.x - xm, b.y - ym) <= ballR * 1.5
    );

    if (clickedBall) {
      setDraggingBallId(clickedBall.id);
      if (clickedBall.id > 0) {
        onSelectTargetBall(clickedBall.id);
      }
    } else {
      // Clicked on empty table: rotate cue aim towards click
      if (cueBall && !cueBall.isPocketed) {
        const dx = xm - cueBall.x;
        const dy = ym - cueBall.y;
        const mouseAngle = Math.atan2(dy, dx);
        const dist = Math.hypot(dx, dy);

        // Check if user clicked on the cue stick behind the ball
        const cueBackAngle = (shot.angleRad + Math.PI) % (Math.PI * 2);
        const angleDiff = Math.abs(((mouseAngle - cueBackAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

        if (dist > 0.04 && dist < 0.45 && angleDiff < Math.PI * 0.4) {
          onAimAngleChange(mouseAngle + Math.PI);
        } else {
          onAimAngleChange(mouseAngle);
        }
        setIsAimingWithMouse(true);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xm = toMetersX(mouseX);
    const ym = toMetersY(mouseY);
    const R = config.ballRadiusM;

    // Hover detection
    if (!draggingBallId) {
      const hovered = balls.find(
        (b) => !b.isPocketed && Math.hypot(b.x - xm, b.y - ym) <= R * 1.5
      );
      setHoveredBallId(hovered ? hovered.id : null);
    }

    // Dragging a ball (with anti-collision and cushion clamping)
    if (draggingBallId !== null) {
      // Clamp within cushions
      let newX = Math.max(R, Math.min(config.lengthM - R, xm));
      let newY = Math.max(R, Math.min(config.widthM - R, ym));

      // Check collision with all other balls to prevent overlap
      for (const other of balls) {
        if (other.id === draggingBallId || other.isPocketed) continue;
        const dist = Math.hypot(newX - other.x, newY - other.y);
        if (dist < 2 * R) {
          // Push away along separation normal
          const nx = (newX - other.x) / (dist || 1);
          const ny = (newY - other.y) / (dist || 1);
          newX = other.x + nx * (2 * R + 0.001);
          newY = other.y + ny * (2 * R + 0.001);
        }
      }

      onBallMove(draggingBallId, newX, newY);
    } else if (isAimingWithMouse && cueBall && !cueBall.isPocketed) {
      const dx = xm - cueBall.x;
      const dy = ym - cueBall.y;
      const mouseAngle = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);

      const cueBackAngle = (shot.angleRad + Math.PI) % (Math.PI * 2);
      const angleDiff = Math.abs(((mouseAngle - cueBackAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

      if (dist > 0.04 && dist < 0.45 && angleDiff < Math.PI * 0.4) {
        onAimAngleChange(mouseAngle + Math.PI);
      } else {
        onAimAngleChange(mouseAngle);
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingBallId !== null) {
      soundFx.playCushionHit();
    }
    setDraggingBallId(null);
    setIsAimingWithMouse(false);
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col items-center justify-center p-2 select-none"
    >
      <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900/60 p-2">
        <canvas
          ref={canvasRef}
          style={{ width: canvasWidth, height: canvasHeight }}
          className="cursor-crosshair block rounded-xl shadow-inner"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
};
