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
  tableRotationDeg?: number; // 0, 90, 180, 270
  predictedCuePath?: Vector2D[];
  scratchPocketId?: string | null;
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
  tableRotationDeg = 0,
  predictedCuePath = [],
  scratchPocketId = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dragging state
  const [draggingBallId, setDraggingBallId] = useState<number | null>(null);
  const [isAimingWithMouse, setIsAimingWithMouse] = useState<boolean>(false);
  const [aimMode, setAimMode] = useState<'forward' | 'cue_stick' | null>(null);
  const [hoveredBallId, setHoveredBallId] = useState<number | null>(null);

  // Table screen dimensions calculated to maintain exact 2:1 aspect ratio
  const [scale, setScale] = useState<number>(450); // pixels per meter
  const railPadding = 75; // pixels for wooden rail border, diamonds, and cue stick extension
  const woodBorder = 44; // width of wooden rail border around cloth

  const isVertical = tableRotationDeg === 90 || tableRotationDeg === 270;
  const unrotatedWidth = config.lengthM * scale + railPadding * 2;
  const unrotatedHeight = config.widthM * scale + railPadding * 2;

  const canvasWidth = isVertical ? unrotatedHeight : unrotatedWidth;
  const canvasHeight = isVertical ? unrotatedWidth : unrotatedHeight;

  // Resize observer to auto-fit table cleanly in view
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const availWidth = containerRef.current.clientWidth - 24;
      const availHeight = window.innerHeight - 340; // leave room for controls & toolbar

      const dimW = isVertical ? config.widthM : config.lengthM;
      const dimH = isVertical ? config.lengthM : config.widthM;

      const maxScaleW = (availWidth - railPadding * 2) / dimW;
      const maxScaleH = (availHeight - railPadding * 2) / dimH;
      const optimalScale = Math.max(180, Math.min(520, Math.min(maxScaleW, maxScaleH)));
      setScale(optimalScale);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [config.lengthM, config.widthM, isVertical]);

  // Coordinate transforms (in unrotated table space)
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

    // Apply Table View Rotation around center of canvas
    ctx.save();
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate((tableRotationDeg * Math.PI) / 180);
    ctx.translate(-unrotatedWidth / 2, -unrotatedHeight / 2);

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

    ctx.restore();
  }, [
    canvasWidth,
    canvasHeight,
    unrotatedWidth,
    unrotatedHeight,
    tableRotationDeg,
    config,
    scale,
    displayBalls,
    aimInfo,
    shot,
    guides,
    isSimulating,
    draggingBallId,
    hoveredBallId,
    isAimingWithMouse,
    aimMode,
    cueBall,
    activeTargetPocketId,
  ]);

  // Helper Drawing Functions
  const drawTableFrame = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const tableX = railPadding - woodBorder;
    const tableY = railPadding - woodBorder;
    const tableW = config.lengthM * scale + woodBorder * 2;
    const tableH = config.widthM * scale + woodBorder * 2;

    // Dark mahogany/slate composite wood rail
    ctx.fillStyle = '#161922';
    ctx.beginPath();
    ctx.roundRect(tableX, tableY, tableW, tableH, 18);
    ctx.fill();

    // Subtle brushed wood grain bevel
    ctx.strokeStyle = '#272a38';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Outer drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    ctx.restore();
  };

  const drawCloth = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const tableWidthPx = config.lengthM * scale;
    const tableHeightPx = config.widthM * scale;

    // Simonis 860 Tournament Blue felt with subtle ambient gradient
    const feltGrad = ctx.createRadialGradient(
      unrotatedWidth / 2,
      unrotatedHeight / 2,
      scale * 0.4,
      unrotatedWidth / 2,
      unrotatedHeight / 2,
      scale * 1.5
    );
    feltGrad.addColorStop(0, '#1d558a');
    feltGrad.addColorStop(0.7, '#16436e');
    feltGrad.addColorStop(1, '#0f3254');

    ctx.fillStyle = feltGrad;
    ctx.beginPath();
    ctx.rect(railPadding, railPadding, tableWidthPx, tableHeightPx);
    ctx.fill();

    // Inner cushion bevel shadow
    ctx.strokeStyle = '#0a233b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Subtle head string line (1/4 mark of table length)
    const headStringX = railPadding + (tableWidthPx / 4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(headStringX, railPadding);
    ctx.lineTo(headStringX, railPadding + tableHeightPx);
    ctx.stroke();
    ctx.setLineDash([]);

    // Head spot & foot spot
    const footSpotX = railPadding + (tableWidthPx * 3) / 4;
    const centerY = railPadding + tableHeightPx / 2;

    [headStringX, footSpotX].forEach((x) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(x, centerY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  };

  const drawCoordinateGrid = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;

    const R = config.ballRadiusM;
    const playableWidthPx = (config.lengthM - 2 * R) * scale;
    const playableHeightPx = (config.widthM - 2 * R) * scale;
    const startX = railPadding + R * scale;
    const startY = railPadding + R * scale;
    const tableWidthPx = config.lengthM * scale;
    const tableHeightPx = config.widthM * scale;

    const colStep = playableWidthPx / 49;
    for (let c = 1; c <= 50; c++) {
      const gx = startX + (c - 1) * colStep;
      ctx.beginPath();
      ctx.moveTo(gx, railPadding);
      ctx.lineTo(gx, railPadding + tableHeightPx);
      ctx.stroke();

      // Column labels on top rail
      if (c === 1 || c === 50 || c % 5 === 0) {
        ctx.save();
        ctx.translate(gx, railPadding - 10);
        ctx.rotate((-tableRotationDeg * Math.PI) / 180);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.toString(), 0, 0);
        ctx.restore();
      }
    }

    // Rows A to Z
    const rowStep = playableHeightPx / 25;
    for (let r = 1; r <= 26; r++) {
      const gy = startY + (r - 1) * rowStep;
      ctx.beginPath();
      ctx.moveTo(railPadding, gy);
      ctx.lineTo(railPadding + tableWidthPx, gy);
      ctx.stroke();

      const letter = String.fromCharCode(64 + r);
      if (r === 1 || r === 26 || r % 4 === 1) {
        ctx.save();
        ctx.translate(railPadding - 14, gy);
        ctx.rotate((-tableRotationDeg * Math.PI) / 180);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, 0, 0);
        ctx.restore();
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
    const tableWidthPx = config.lengthM * scale;
    const tableHeightPx = config.widthM * scale;

    const renderDiamond = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - diamondSize);
      ctx.lineTo(cx + diamondSize, cy);
      ctx.lineTo(cx, cy + diamondSize);
      ctx.lineTo(cx - diamondSize, cy);
      ctx.closePath();
      ctx.fill();
    };

    // Long rails: 8 segments
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue; // Side pocket
      const x = railPadding + (tableWidthPx * i) / 8;
      renderDiamond(x, railPadding - 24);
      renderDiamond(x, railPadding + tableHeightPx + 24);
    }

    // Short rails: 4 segments
    for (let j = 1; j < 4; j++) {
      const y = railPadding + (tableHeightPx * j) / 4;
      renderDiamond(railPadding - 24, y);
      renderDiamond(railPadding + tableWidthPx + 24, y);
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
      const isScratch = scratchPocketId === p.id;

      if (isScratch) {
        // Red glowing scratch warning ring
        ctx.beginPath();
        ctx.arc(sx, sy, sr + 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx, sy, sr + 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (isTarget) {
        // Glowing animated target ring
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
      ctx.fillStyle = isScratch ? '#2b0707' : isTarget ? '#041c2c' : '#080a0f';
      ctx.fill();

      // Pocket casting rim
      ctx.strokeStyle = isScratch ? '#ef4444' : isTarget ? '#06b6d4' : '#272a38';
      ctx.lineWidth = isScratch ? 4 : isTarget ? 4 : 3;
      ctx.stroke();

      // Pocket ID label (counter-rotated to stay upright)
      const labelOffset = p.isCorner ? (p.y === 0 ? -14 : 14) : p.y === 0 ? -12 : 12;
      ctx.save();
      ctx.translate(sx, sy + labelOffset);
      ctx.rotate((-tableRotationDeg * Math.PI) / 180);
      ctx.fillStyle = isScratch ? '#f87171' : isTarget ? '#22d3ee' : '#64748b';
      ctx.font = isScratch ? '800 12px "JetBrains Mono", monospace' : isTarget ? '700 12px "JetBrains Mono", monospace' : '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isScratch ? `⚠️ SCRATCH (${p.id})` : isTarget ? `🎯 ${p.id}` : p.id, 0, 0);
      ctx.restore();
    });

    ctx.restore();
  };

  const drawArrowhead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, size: number = 8) => {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
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
    const aimEndX = cbScreenX + Math.cos(actualAimAngle) * aimLength;
    const aimEndY = cbScreenY + Math.sin(actualAimAngle) * aimLength;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cbScreenX, cbScreenY);
    ctx.lineTo(aimEndX, aimEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Extended realistic cue stick visual behind cue ball (extends beyond table rails)
    const stickLength = Math.max(280, 0.72 * scale);
    const tipGap = ballR + 6;
    const cueStartX = cbScreenX - Math.cos(actualAimAngle) * tipGap;
    const cueStartY = cbScreenY - Math.sin(actualAimAngle) * tipGap;
    const cueEndX = cbScreenX - Math.cos(actualAimAngle) * (tipGap + stickLength);
    const cueEndY = cbScreenY - Math.sin(actualAimAngle) * (tipGap + stickLength);

    const uX = -Math.cos(actualAimAngle);
    const uY = -Math.sin(actualAimAngle);

    // Tip: Master Chalk Blue (5px)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cueStartX, cueStartY);
    ctx.lineTo(cueStartX + uX * 5, cueStartY + uY * 5);
    ctx.stroke();

    // Ferrule: Ivory White (12px)
    const ferruleX = cueStartX + uX * 5;
    const ferruleY = cueStartY + uY * 5;
    const ferruleEndX = ferruleX + uX * 12;
    const ferruleEndY = ferruleY + uY * 12;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(ferruleX, ferruleY);
    ctx.lineTo(ferruleEndX, ferruleEndY);
    ctx.stroke();

    // Shaft: Tapered Maple Wood
    const shaftLen = stickLength * 0.52;
    const jointX = ferruleEndX + uX * shaftLen;
    const jointY = ferruleEndY + uY * shaftLen;
    const shaftGrad = ctx.createLinearGradient(ferruleEndX, ferruleEndY, jointX, jointY);
    shaftGrad.addColorStop(0, '#fef3c7');
    shaftGrad.addColorStop(0.5, '#fde68a');
    shaftGrad.addColorStop(1, '#d97706');
    ctx.strokeStyle = shaftGrad;
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(ferruleEndX, ferruleEndY);
    ctx.lineTo(jointX, jointY);
    ctx.stroke();

    // Joint Collar: Silver & Ebony
    const jointLen = 14;
    const jointEndX = jointX + uX * jointLen;
    const jointEndY = jointY + uY * jointLen;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 9.5;
    ctx.beginPath();
    ctx.moveTo(jointX, jointY);
    ctx.lineTo(jointEndX, jointEndY);
    ctx.stroke();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 9.5;
    ctx.beginPath();
    ctx.moveTo(jointX + uX * 4, jointY + uY * 4);
    ctx.lineTo(jointX + uX * 6, jointY + uY * 6);
    ctx.stroke();

    // Butt & Wrap: Midnight Indigo Grip
    const wrapEndX = cueEndX - uX * 18;
    const wrapEndY = cueEndY - uY * 18;
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(jointEndX, jointEndY);
    ctx.lineTo(wrapEndX, wrapEndY);
    ctx.stroke();

    // Butt Cap & Bumper (Black)
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wrapEndX, wrapEndY);
    ctx.lineTo(cueEndX, cueEndY);
    ctx.stroke();

    // Aim Handle Grip Ring at Cue Butt (Touch/Drag to swivel cue stick smoothly)
    const isGrabbingCue = isAimingWithMouse && aimMode === 'cue_stick';
    ctx.beginPath();
    ctx.arc(cueEndX, cueEndY, isGrabbingCue ? 14 : 11, 0, Math.PI * 2);
    ctx.fillStyle = isGrabbingCue ? 'rgba(56, 189, 248, 0.4)' : 'rgba(56, 189, 248, 0.15)';
    ctx.fill();
    ctx.strokeStyle = isGrabbingCue ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = isGrabbingCue ? 2.5 : 1.5;
    ctx.setLineDash(isGrabbingCue ? [] : [3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // If an object ball is in line of fire
    if (aimInfo.hitTarget && aimInfo.ghostBallPos && aimInfo.targetBallPos) {
      const gbScreenX = toScreenX(aimInfo.ghostBallPos.x);
      const gbScreenY = toScreenY(aimInfo.ghostBallPos.y);
      const tbScreenX = toScreenX(aimInfo.targetBallPos.x);
      const tbScreenY = toScreenY(aimInfo.targetBallPos.y);

      // Line from Cue Ball to Ghost Ball with Arrowhead
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cbScreenX, cbScreenY);
      ctx.lineTo(gbScreenX, gbScreenY);
      ctx.stroke();
      drawArrowhead(ctx, cbScreenX, cbScreenY, gbScreenX, gbScreenY, '#38bdf8', 9);

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
        const targetEndX = gbScreenX + aimInfo.lineOfCenters.x * locLen;
        const targetEndY = gbScreenY + aimInfo.lineOfCenters.y * locLen;

        ctx.strokeStyle = '#f59e0b'; // Amber yellow
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(gbScreenX, gbScreenY);
        ctx.lineTo(targetEndX, targetEndY);
        ctx.stroke();
        drawArrowhead(ctx, gbScreenX, gbScreenY, targetEndX, targetEndY, '#f59e0b', 10);

        // Line of centers label (counter-rotated for readability)
        ctx.save();
        const lblX = tbScreenX + aimInfo.lineOfCenters.x * (ballR + 15);
        const lblY = tbScreenY + aimInfo.lineOfCenters.y * (ballR + 15);
        ctx.translate(lblX, lblY);
        ctx.rotate((-tableRotationDeg * Math.PI) / 180);
        ctx.fillStyle = '#fef08a';
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Target Line (${aimInfo.cutAngleDeg.toFixed(1)}° cut)`, 0, 0);
        ctx.restore();
      }

      // 90° TANGENT LINE
      if (guides.showTangentLine) {
        const tangentLen = 1.3 * scale;
        const tx = aimInfo.tangentLine.x;
        const ty = aimInfo.tangentLine.y;
        const tEndX = gbScreenX + tx * tangentLen;
        const tEndY = gbScreenY + ty * tangentLen;

        ctx.strokeStyle = '#06b6d4'; // Bright Cyan
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);

        ctx.beginPath();
        ctx.moveTo(gbScreenX, gbScreenY);
        ctx.lineTo(tEndX, tEndY);
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrowhead(ctx, gbScreenX, gbScreenY, tEndX, tEndY, '#06b6d4', 10);

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

        // 90° Tangent Line Badge (counter-rotated)
        ctx.save();
        const labelX = gbScreenX + tx * (tangentLen * 0.45);
        const labelY = gbScreenY + ty * (tangentLen * 0.45);
        ctx.translate(labelX, labelY);
        ctx.rotate((-tableRotationDeg * Math.PI) / 180);
        ctx.fillStyle = '#06b6d4';
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.fillText('90° STUN TANGENT', 8, -8);
        ctx.restore();
      }

      // Predicted Actual Cue Ball Trajectory & Curve
      if (guides.showPredictedPath) {
        if (predictedCuePath && predictedCuePath.length > 2) {
          ctx.beginPath();
          ctx.moveTo(toScreenX(predictedCuePath[0].x), toScreenY(predictedCuePath[0].y));

          for (let i = 1; i < predictedCuePath.length; i++) {
            ctx.lineTo(toScreenX(predictedCuePath[i].x), toScreenY(predictedCuePath[i].y));
          }

          if (scratchPocketId) {
            const pockets = getTablePockets(config);
            const scratchP = pockets.find((p) => p.id === scratchPocketId);
            if (scratchP) {
              ctx.lineTo(toScreenX(scratchP.x), toScreenY(scratchP.y));
            }
            // High-visibility dashed Coral/Red path indicating SCRATCH
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw warning label along path
            const midIdx = Math.floor(predictedCuePath.length * 0.5);
            const midPt = predictedCuePath[midIdx];
            if (midPt) {
              ctx.save();
              ctx.translate(toScreenX(midPt.x), toScreenY(midPt.y) - 14);
              ctx.rotate((-tableRotationDeg * Math.PI) / 180);
              ctx.fillStyle = '#ef4444';
              ctx.font = '800 12px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText(`⚠️ SCRATCH IN ${scratchPocketId}!`, 0, 0);
              ctx.restore();
            }
          } else {
            // Full Safe Predicted Roll Path
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Ghost ball indicator at final resting point
            const lastPt = predictedCuePath[predictedCuePath.length - 1];
            if (lastPt) {
              const lx = toScreenX(lastPt.x);
              const ly = toScreenY(lastPt.y);
              ctx.beginPath();
              ctx.arc(lx, ly, ballR, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
              ctx.fill();
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Trajectory label
              ctx.save();
              ctx.translate(lx + ballR + 8, ly);
              ctx.rotate((-tableRotationDeg * Math.PI) / 180);
              ctx.fillStyle = '#94a3b8';
              ctx.font = '600 10px "JetBrains Mono", monospace';
              const label =
                aimInfo.spinStateAtImpact === 'natural_roll'
                  ? 'Roll Path (~30°)'
                  : aimInfo.spinStateAtImpact === 'sliding_draw'
                  ? 'Draw Path'
                  : 'Stun Path';
              ctx.fillText(label, 0, 0);
              ctx.restore();
            }
          }
        } else {
          // Fallback short curve if simulation path not yet ready
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(gbScreenX, gbScreenY);
          const curveFactor = aimInfo.spinStateAtImpact === 'sliding_draw' ? -0.3 : 0.4;
          const ctrlX = gbScreenX + aimInfo.tangentLine.x * (0.3 * scale);
          const ctrlY = gbScreenY + aimInfo.tangentLine.y * (0.3 * scale);
          const endX = ctrlX + Math.cos(shot.angleRad) * (curveFactor * scale);
          const endY = ctrlY + Math.sin(shot.angleRad) * (curveFactor * scale);
          ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
          ctx.stroke();
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
        solidGrad.addColorStop(0.2, color.primary);
        solidGrad.addColorStop(1, '#0a0a0f');
        ctx.fillStyle = solidGrad;
        ctx.fill();

        // White circle for number
        ctx.beginPath();
        ctx.arc(sx, sy, ballR * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Ball number (counter-rotated so it stays right-side up)
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((-tableRotationDeg * Math.PI) / 180);
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.id.toString(), 0, 0);
        ctx.restore();
      } else {
        // Striped ball
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Center colored stripe
        ctx.beginPath();
        ctx.rect(sx - ballR, sy - ballR * 0.5, ballR * 2, ballR);
        ctx.fillStyle = color.primary;
        ctx.fill();

        // Outer circular clip
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // White circle for number
        ctx.beginPath();
        ctx.arc(sx, sy, ballR * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Ball number (counter-rotated)
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((-tableRotationDeg * Math.PI) / 180);
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.id.toString(), 0, 0);
        ctx.restore();
      }

      // Target Ball Highlight ring
      if (b.id === targetBallId) {
        ctx.beginPath();
        ctx.arc(sx, sy, ballR + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ball selection/hover halo
      if (b.id === hoveredBallId || b.id === draggingBallId) {
        ctx.beginPath();
        ctx.arc(sx, sy, ballR + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    });
  };

  const drawBallHUD = (ctx: CanvasRenderingContext2D, b: { id: number; x: number; y: number; isPocketed: boolean }) => {
    ctx.save();
    const sx = toScreenX(b.x);
    const sy = toScreenY(b.y);
    const grid = metersToGrid(b.x, b.y, config);
    const dia = metersToDiamonds(b.x, b.y, config);

    const text = b.id === 0 ? `Cue Ball` : `Ball ${b.id}`;
    const subText = `${formatGridCoord(grid.col, grid.row)} · ${dia.longRailDiamond.toFixed(1)}x, ${dia.shortRailDiamond.toFixed(1)}y`;

    ctx.font = '700 11px "JetBrains Mono", monospace';
    const boxW = Math.max(130, ctx.measureText(subText).width + 24);
    const boxH = 34;

    // Position HUD above the ball, counter-rotated so it is always right-side up
    ctx.translate(sx, sy);
    ctx.rotate((-tableRotationDeg * Math.PI) / 180);

    const boxX = -boxW / 2;
    const boxY = -48;

    // HUD background pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, boxY + 14);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText(subText, 0, boxY + 27);

    ctx.restore();
  };

  // --- Coordinate Unrotation Helper for Screen Pointer Events ---
  const getUnrotatedMeters = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { xm: 0, ym: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const rad = (-tableRotationDeg * Math.PI) / 180;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const unrotatedX = unrotatedWidth / 2 + (dx * Math.cos(rad) - dy * Math.sin(rad));
    const unrotatedY = unrotatedHeight / 2 + (dx * Math.sin(rad) + dy * Math.cos(rad));

    return {
      xm: (unrotatedX - railPadding) / scale,
      ym: (unrotatedY - railPadding) / scale,
    };
  };

  // --- Pointer Event Handlers (Touch, Pen, Mouse) ---
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || isSimulating) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const { xm, ym } = getUnrotatedMeters(e.clientX, e.clientY);
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

    // Check if clicked directly on an object ball (id > 0)
    const clickedBall = balls.find(
      (b) => !b.isPocketed && Math.hypot(b.x - xm, b.y - ym) <= ballR * 1.08
    );

    if (clickedBall && clickedBall.id > 0) {
      setDraggingBallId(clickedBall.id);
      onSelectTargetBall(clickedBall.id);
      return;
    }

    // Check if clicked directly on cue ball center
    if (clickedBall && clickedBall.id === 0) {
      setDraggingBallId(0);
      return;
    }

    // Cue Stick & Aiming Interaction
    if (cueBall && !cueBall.isPocketed) {
      const dx = xm - cueBall.x;
      const dy = ym - cueBall.y;

      // Project click vector onto current aim direction
      const dot = dx * Math.cos(shot.angleRad) + dy * Math.sin(shot.angleRad);

      if (dot < -0.05) {
        // Behind cue ball: user grabbed cue stick handle to swivel
        setAimMode('cue_stick');
        onAimAngleChange(Math.atan2(-dy, -dx));
      } else {
        // Ahead of cue ball: target aiming forward towards object ball or pocket
        setAimMode('forward');
        onAimAngleChange(Math.atan2(dy, dx));
      }
      setIsAimingWithMouse(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { xm, ym } = getUnrotatedMeters(e.clientX, e.clientY);
    const R = config.ballRadiusM;

    // Hover detection
    if (!draggingBallId) {
      const hovered = balls.find(
        (b) => !b.isPocketed && Math.hypot(b.x - xm, b.y - ym) <= R * 1.15
      );
      setHoveredBallId(hovered ? hovered.id : null);
    }

    // Dragging a ball (with anti-collision and cushion clamping)
    if (draggingBallId !== null) {
      let newX = Math.max(R, Math.min(config.lengthM - R, xm));
      let newY = Math.max(R, Math.min(config.widthM - R, ym));

      for (const other of balls) {
        if (other.id === draggingBallId || other.isPocketed) continue;
        const dist = Math.hypot(newX - other.x, newY - other.y);
        if (dist < 2 * R) {
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

      if (aimMode === 'cue_stick') {
        // Swiveling cue stick from behind the ball (smooth 360° pivot without flips)
        onAimAngleChange(Math.atan2(-dy, -dx));
      } else {
        // Aiming forward towards target point
        onAimAngleChange(Math.atan2(dy, dx));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    setDraggingBallId(null);
    setIsAimingWithMouse(false);
    setAimMode(null);
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center p-1 relative overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          maxWidth: '100%',
          maxHeight: '76vh',
        }}
        className="rounded-2xl cursor-crosshair shadow-2xl touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          setHoveredBallId(null);
          setIsAimingWithMouse(false);
          setDraggingBallId(null);
        }}
      />
    </div>
  );
};
