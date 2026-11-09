import { Ball, GhostBallInfo, PocketDef, ShotSettings, TableConfig, Vector2D } from './types';
import { GRAVITY } from './constants';

export function getTablePockets(config: TableConfig): PocketDef[] {
  const L = config.lengthM;
  const W = config.widthM;
  // Corner pocket mouth ~ 0.055m, side pocket mouth ~ 0.065m
  const cornerR = 0.065;
  const sideR = 0.070;

  return [
    { id: 'P1', name: 'P1 Top-Left (Corner)', x: 0, y: 0, radius: cornerR, isCorner: true },
    { id: 'P2', name: 'P2 Top-Center (Side)', x: L / 2, y: 0, radius: sideR, isCorner: false },
    { id: 'P3', name: 'P3 Top-Right (Corner)', x: L, y: 0, radius: cornerR, isCorner: true },
    { id: 'P4', name: 'P4 Bottom-Left (Corner)', x: 0, y: W, radius: cornerR, isCorner: true },
    { id: 'P5', name: 'P5 Bottom-Center (Side)', x: L / 2, y: W, radius: sideR, isCorner: false },
    { id: 'P6', name: 'P6 Bottom-Right (Corner)', x: L, y: W, radius: cornerR, isCorner: true },
  ];
}

/**
 * Calculates ghost ball, line of centers, cut angle, and tangent line.
 * Also tracks spin evolution over travel distance to determine whether
 * impact is stun, rolling, follow, or draw!
 */
export function calculateAimGeometry(
  cueBall: Ball,
  balls: Ball[],
  shot: ShotSettings,
  config: TableConfig
): GhostBallInfo {
  const R = config.ballRadiusM;
  const twoR = 2 * R;

  // Account for cue squirt (cue deflection)
  const squirtAngleRad = -config.squirtFactor * (shot.tipOffsetX || 0);
  const actualAimAngle = shot.angleRad + squirtAngleRad;

  const rayDir: Vector2D = {
    x: Math.cos(actualAimAngle),
    y: Math.sin(actualAimAngle),
  };

  let earliestImpactDist = Infinity;
  let targetBall: Ball | null = null;
  let ghostPos: Vector2D | null = null;

  // Find the closest object ball intersecting the ray
  for (const b of balls) {
    if (b.id === 0 || b.isPocketed) continue;

    // Vector from cue ball to object ball
    const dx = b.x - cueBall.x;
    const dy = b.y - cueBall.y;

    // Project onto ray direction: t = (d . rayDir)
    const t = dx * rayDir.x + dy * rayDir.y;
    if (t <= 0) continue; // Behind cue ball

    // Perpendicular distance squared from ball center to ray line
    const perpDistSq = dx * dx + dy * dy - t * t;
    if (perpDistSq < 0 || perpDistSq > twoR * twoR) continue; // Ray misses ball

    // Distance along ray to center of ghost ball
    const delta = Math.sqrt(Math.max(0, twoR * twoR - perpDistSq));
    const impactDist = t - delta;

    if (impactDist > 0 && impactDist < earliestImpactDist) {
      earliestImpactDist = impactDist;
      targetBall = b;
      ghostPos = {
        x: cueBall.x + rayDir.x * impactDist,
        y: cueBall.y + rayDir.y * impactDist,
      };
    }
  }

  if (!targetBall || !ghostPos) {
    return {
      hitTarget: false,
      targetBallId: null,
      targetBallPos: null,
      ghostBallPos: null,
      impactDistance: 0,
      cutAngleRad: 0,
      cutAngleDeg: 0,
      isCutToRight: false,
      lineOfCenters: { x: 0, y: 0 },
      tangentLine: { x: 0, y: 0 },
      objectBallVelocity: { x: 0, y: 0 },
      cueBallTangentVelocity: { x: 0, y: 0 },
      spinStateAtImpact: 'natural_roll',
      cueCurveDirection: 'forward',
      predictedRestPos: null,
      aimedPocketId: null,
      aimedPocketAngleErrDeg: null,
    };
  }

  // Line of centers: unit vector from ghost ball to target ball
  const nRawX = targetBall.x - ghostPos.x;
  const nRawY = targetBall.y - ghostPos.y;
  const nLen = Math.hypot(nRawX, nRawY) || 1;
  const lineOfCenters: Vector2D = { x: nRawX / nLen, y: nRawY / nLen };

  // Cut angle: angle between rayDir and lineOfCenters
  // cos(theta) = rayDir . lineOfCenters
  const dot = Math.max(-1, Math.min(1, rayDir.x * lineOfCenters.x + rayDir.y * lineOfCenters.y));
  const cutAngleRad = Math.acos(dot);
  const cutAngleDeg = (cutAngleRad * 180) / Math.PI;

  // Determine if cut is to the right or left (cross product z-component)
  const crossZ = rayDir.x * lineOfCenters.y - rayDir.y * lineOfCenters.x;
  const isCutToRight = crossZ > 0;

  // Tangent line is strictly perpendicular to line of centers
  // It points in the direction cue ball deflects
  const tangentLine: Vector2D = isCutToRight
    ? { x: lineOfCenters.y, y: -lineOfCenters.x }
    : { x: -lineOfCenters.y, y: lineOfCenters.x };

  // --- Dynamic Spin Tracking over Travel Distance ---
  // Initial velocities from stroke:
  const v0 = shot.speedMs;
  const ay = shot.tipOffsetY; // vertical offset (-1 = bottom draw, 0 = center, +1 = top follow)
  // Angular velocity imparted by vertical tip offset:
  // omega0 = (5 / (2*R)) * ay * v0 (in forward direction)
  const omega0 = (2.5 * ay * v0) / R;

  // Slip velocity at cloth contact: u0 = v0 - R * omega0
  const u0 = v0 - R * omega0;

  // Transition time to pure rolling: t_roll = 2 * |u0| / (7 * mu_s * g)
  const mu_s = config.muSliding;
  const g = GRAVITY;
  const tRoll = (2 * Math.abs(u0)) / (7 * mu_s * g);
  // Distance traveled during sliding phase:
  const dRoll = v0 * tRoll - 0.5 * Math.sign(u0) * mu_s * g * tRoll * tRoll;

  let spinStateAtImpact: 'pure_stun' | 'sliding_draw' | 'sliding_follow' | 'natural_roll';
  let cueCurveDirection: 'tangent' | 'forward' | 'backward';

  if (earliestImpactDist >= Math.max(0, dRoll)) {
    // Ball has fully transitioned to natural roll due to cloth friction
    spinStateAtImpact = 'natural_roll';
    cueCurveDirection = 'forward';
  } else {
    // Still in sliding phase at impact
    // Current slip velocity: u(t) = u0 - (7/2) * mu_s * g * t
    const tImpact = earliestImpactDist / Math.max(0.1, v0); // approx
    const currentSlip = u0 - 3.5 * mu_s * g * tImpact * Math.sign(u0);

    if (Math.abs(currentSlip) < 0.15) {
      spinStateAtImpact = 'pure_stun';
      cueCurveDirection = 'tangent';
    } else if (currentSlip > 0) {
      spinStateAtImpact = 'sliding_draw';
      cueCurveDirection = 'backward';
    } else {
      spinStateAtImpact = 'sliding_follow';
      cueCurveDirection = 'forward';
    }
  }

  // Post-impact velocities:
  // Normal component transferred to object ball
  const normalSpeed = v0 * Math.cos(cutAngleRad);
  const objectBallVelocity: Vector2D = {
    x: lineOfCenters.x * normalSpeed,
    y: lineOfCenters.y * normalSpeed,
  };

  // Tangential component retained by cue ball (instantaneous velocity at separation)
  const tangentSpeed = v0 * Math.sin(cutAngleRad);
  const cueBallTangentVelocity: Vector2D = {
    x: tangentLine.x * tangentSpeed,
    y: tangentLine.y * tangentSpeed,
  };

  // Predicted resting position estimation
  let predictedRestPos: Vector2D | null = null;
  if (spinStateAtImpact === 'pure_stun') {
    // Slides along tangent line until friction stops it
    // v^2 = 2 * a * d => d = v^2 / (2 * mu_s * g)
    const restDist = (tangentSpeed * tangentSpeed) / (2 * mu_s * g);
    predictedRestPos = {
      x: ghostPos.x + tangentLine.x * Math.min(restDist, 1.5),
      y: ghostPos.y + tangentLine.y * Math.min(restDist, 1.5),
    };
  }

  // Determine which pocket the object ball is actually aimed towards
  const pockets = getTablePockets(config);
  let aimedPocketId: string | null = null;
  let aimedPocketAngleErrDeg: number | null = null;
  let minAngleErr = Infinity;

  pockets.forEach((p) => {
    const toPocketX = p.x - targetBall.x;
    const toPocketY = p.y - targetBall.y;
    const pDist = Math.hypot(toPocketX, toPocketY);
    if (pDist > 0.05) {
      const pNormX = toPocketX / pDist;
      const pNormY = toPocketY / pDist;
      const dotPocket = lineOfCenters.x * pNormX + lineOfCenters.y * pNormY;
      if (dotPocket > 0) {
        const angleErrRad = Math.acos(Math.max(-1, Math.min(1, dotPocket)));
        const angleErrDeg = (angleErrRad * 180) / Math.PI;
        if (angleErrDeg < minAngleErr) {
          minAngleErr = angleErrDeg;
          aimedPocketId = p.id;
          aimedPocketAngleErrDeg = angleErrDeg;
        }
      }
    }
  });

  return {
    hitTarget: true,
    targetBallId: targetBall.id,
    targetBallPos: { x: targetBall.x, y: targetBall.y },
    ghostBallPos: ghostPos,
    impactDistance: earliestImpactDist,
    cutAngleRad,
    cutAngleDeg,
    isCutToRight,
    lineOfCenters,
    tangentLine,
    objectBallVelocity,
    cueBallTangentVelocity,
    spinStateAtImpact,
    cueCurveDirection,
    predictedRestPos,
    aimedPocketId,
    aimedPocketAngleErrDeg,
  };
}
