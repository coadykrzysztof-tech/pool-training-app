import { Ball, Drill, PocketDef, ShotSettings, TableConfig, Vector2D } from './types';
import { getTablePockets } from './geometry';
import { speedToPower, powerToSpeed } from './constants';
import { metersToGrid } from '../utils/coordinates';
import { SimulationResult } from './simulator';
import { CoachingAdvice } from '../components/CoachFeedback';

// Helper to get friendly name of tip position
export function getTipName(tipX: number, tipY: number): string {
  const ax = tipX || 0;
  const ay = tipY || 0;

  if (Math.abs(ax) <= 0.15 && Math.abs(ay) <= 0.18) {
    return 'Center Ball (Stun)';
  }
  if (ay > 0.18) {
    if (ax > 0.15) return 'Top-Right English';
    if (ax < -0.15) return 'Top-Left English';
    return 'High Follow';
  }
  if (ay < -0.18) {
    if (ax > 0.15) return 'Bottom-Right (Draw + Right)';
    if (ax < -0.15) return 'Bottom-Left (Draw + Left)';
    return 'Low Draw';
  }
  if (ax > 0.15) return 'Right English';
  if (ax < -0.15) return 'Left English';
  return 'Center Ball';
}

export function analyzeShotAndCoach(
  initialCue: Ball,
  targetBall: Ball | null,
  shot: ShotSettings,
  simResult: SimulationResult,
  activeDrill: Drill | null,
  config: TableConfig,
  allBalls: Ball[] = [],
  aimedPocketId?: string | null
): CoachingAdvice | null {
  if (!targetBall) return null;

  const R = config.ballRadiusM;
  const pockets = getTablePockets(config);

  // 1. Identify target pocket: prioritize player's actual aimed pocket over drill book default
  const runStep = activeDrill?.run?.find((s) => s.ball === targetBall.id) || (activeDrill?.run ? activeDrill.run[0] : null);
  const bookPocketId = runStep?.pocket || null;

  let targetPocketId = aimedPocketId || bookPocketId || 'P5';
  let targetPocket = pockets.find((p) => p.id === targetPocketId);

  // If pocket not found, fallback to closest
  if (!targetPocket) {
    let bestDist = Infinity;
    for (const p of pockets) {
      const d = Math.hypot(p.x - targetBall.x, p.y - targetBall.y);
      if (d < bestDist) {
        bestDist = d;
        targetPocket = p;
      }
    }
    targetPocket = targetPocket || pockets[4];
    targetPocketId = targetPocket.id;
  }

  const recommendedPower = runStep?.power || 5;
  const leaveRow = runStep?.leave_row || '';
  const leaveCol = runStep?.leave_col || null;

  // 2. Next ball in sequence (e.g. Ball 1 -> Ball 2)
  const remainingBalls = allBalls.filter((b) => b.id > 0 && !b.isPocketed && b.id !== targetBall.id);
  remainingBalls.sort((a, b) => a.id - b.id);
  const nextBall = remainingBalls.length > 0 ? remainingBalls[0] : null;

  // 3. Compute Ideal Aim Angle to pocket targetBall into targetPocket
  const dirX = targetPocket.x - targetBall.x;
  const dirY = targetPocket.y - targetBall.y;
  const len = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / len;
  const ny = dirY / len;

  // Ideal Ghost Ball Position
  const idealGhostX = targetBall.x - 2 * R * nx;
  const idealGhostY = targetBall.y - 2 * R * ny;

  // Ideal Aim Angle from Cue Ball
  const idealAimAngleRad = Math.atan2(idealGhostY - initialCue.y, idealGhostX - initialCue.x);
  const idealAimDeg = ((idealAimAngleRad * 180) / Math.PI + 360) % 360;

  // User's Aim Angle in Degrees
  const userAimDeg = ((shot.angleRad * 180) / Math.PI + 360) % 360;

  // Difference in degrees normalized to [-180, 180]
  let diffDeg = userAimDeg - idealAimDeg;
  while (diffDeg > 180) diffDeg -= 360;
  while (diffDeg < -180) diffDeg += 360;

  // Determine cut direction (cross product from CB->OB to OB->Pocket)
  const cbToObX = targetBall.x - initialCue.x;
  const cbToObY = targetBall.y - initialCue.y;
  const crossZ = cbToObX * ny - cbToObY * nx;
  const isCutToRight = crossZ > 0;

  // 4. Aim Advice Formulation
  const isDifferentFromBook = bookPocketId && targetPocketId !== bookPocketId;
  const bookNote = isDifferentFromBook
    ? ` (Adjusted for your shot on ${targetPocketId}; drill book planned for ${bookPocketId}).`
    : '';

  let aimAdvice = '';
  if (Math.abs(diffDeg) <= 0.6) {
    aimAdvice = `Aim was on line (${userAimDeg.toFixed(1)}°). Your line through the ghost ball matched pocket ${targetPocket.id}.${bookNote}`;
  } else if (isCutToRight) {
    if (diffDeg > 0) {
      aimAdvice = `You aimed at ${userAimDeg.toFixed(1)}° for ${targetPocket.id}, which was ${Math.abs(diffDeg).toFixed(1)}° too far right (cut too thin). Aim fuller at ${idealAimDeg.toFixed(1)}° to drive the ball into ${targetPocket.id}.${bookNote}`;
    } else {
      aimAdvice = `You aimed at ${userAimDeg.toFixed(1)}° for ${targetPocket.id}, which was ${Math.abs(diffDeg).toFixed(1)}° too full / thick. Aim ${Math.abs(diffDeg).toFixed(1)}° further right to ${idealAimDeg.toFixed(1)}° for ${targetPocket.id}.${bookNote}`;
    }
  } else {
    // Cut to Left
    if (diffDeg < 0) {
      aimAdvice = `You aimed at ${userAimDeg.toFixed(1)}° for ${targetPocket.id}, which was ${Math.abs(diffDeg).toFixed(1)}° too far left (cut too thin). Aim fuller at ${idealAimDeg.toFixed(1)}° into ${targetPocket.id}.${bookNote}`;
    } else {
      aimAdvice = `You aimed at ${userAimDeg.toFixed(1)}° for ${targetPocket.id}, which was ${Math.abs(diffDeg).toFixed(1)}° too full / thick. Aim ${Math.abs(diffDeg).toFixed(1)}° further left to ${idealAimDeg.toFixed(1)}° for ${targetPocket.id}.${bookNote}`;
    }
  }

  // 5. Intelligent Tip & English Strategy Analysis
  const userTipX = shot.tipOffsetX || 0;
  const userTipY = shot.tipOffsetY || 0;
  const userTipName = getTipName(userTipX, userTipY);

  // Determine recommended tip strategy
  let recTipX = 0;
  let recTipY = 0;
  let recTipName = 'Center Ball (Stun)';
  let tipAdvice = '';

  // Calculate 90° tangent line vector
  const lineOfCenters = { x: nx, y: ny };
  // Tangent line perpendicular: for cut to right, tangent is [-ny, nx], for cut to left [ny, -nx]
  const tangentVec = isCutToRight
    ? { x: -ny, y: nx }
    : { x: ny, y: -nx };

  // Check where next ball is located relative to tangent line
  if (nextBall) {
    const toNextX = nextBall.x - targetBall.x;
    const toNextY = nextBall.y - targetBall.y;
    // Dot product with tangent vector
    const alongTangent = toNextX * tangentVec.x + toNextY * tangentVec.y;
    // Dot product with shot line (forward vs backward)
    const alongShot = toNextX * lineOfCenters.x + toNextY * lineOfCenters.y;

    if (alongShot > 0.3) {
      // Next ball is forward down table
      recTipY = 0.35; // High follow
      // Check cushion running english
      if (isCutToRight) {
        recTipX = 0.25; // Top-Right provides running english on standard rail rebounds
        recTipName = 'Top-Right English';
      } else {
        recTipX = -0.25; // Top-Left provides running english
        recTipName = 'Top-Left English';
      }
    } else if (alongShot < -0.3) {
      // Next ball requires pull back
      recTipY = -0.35; // Low draw
      recTipX = 0;
      recTipName = 'Low Draw';
    } else {
      // Pure 90° tangent line stun
      recTipY = 0;
      recTipX = 0;
      recTipName = 'Center Ball (Stun)';
    }
  }

  // Generate detailed coaching advice comparing user's tip to recommendation
  if (simResult.cueBallPocketed) {
    tipAdvice = `Scratch occurred! You struck with ${userTipName}. Striked with ${recTipName} (center-ball stun) so the cue ball tracks purely along the 90° tangent line and stays away from the pocket.`;
  } else if (userTipName !== recTipName) {
    if (userTipName.includes('Left') && recTipName.includes('Right')) {
      tipAdvice = `You used ${userTipName}. For this cut shot, left english acted as check / reverse english and squirted your aim off line. Switch to ${recTipName} to open the rebound angle off the rail toward the next ball.`;
    } else if (userTipName.includes('Right') && recTipName.includes('Left')) {
      tipAdvice = `You used ${userTipName}. On this line, right english pinched off the rail. Switch to ${recTipName} for natural running english and cleaner rail clearance.`;
    } else if (Math.abs(userTipX) > 0.15 && Math.abs(recTipX) <= 0.1) {
      tipAdvice = `You applied sidespin (${userTipName}), which introduces squirt deflection (pushing the cue ball off line). Use ${recTipName} for maximum pocketing accuracy.`;
    } else if (userTipY > 0.25 && recTipY <= 0.1) {
      tipAdvice = `You used ${userTipName}. Follow spin caused the cue ball to roll forward past your desired position line. Stun (${recTipName}) holds the 90° tangent line.`;
    } else if (userTipY < -0.2 && recTipY >= 0.2) {
      tipAdvice = `You used ${userTipName}. Backspin drew the cue ball away from the next shot. Use ${recTipName} to roll smoothly forward toward Ball ${nextBall ? nextBall.id : 2}.`;
    } else {
      tipAdvice = `You used ${userTipName}. Recommended tip is ${recTipName} for optimal cue ball control on this pattern.`;
    }
  } else {
    tipAdvice = `Excellent tip contact (${userTipName})! Spin matched the recommended path.`;
  }

  // 6. Power & Leave Analysis
  const powerUsed = speedToPower(shot.speedMs);
  let powerAdvice = '';
  if (powerUsed < recommendedPower - 1) {
    powerAdvice = `Stroke was soft (Power ${powerUsed}/10). Recommended was Power ${recommendedPower}/10 to carry through to the position zone.`;
  } else if (powerUsed > recommendedPower + 1) {
    powerAdvice = `Stroke was firm (Power ${powerUsed}/10). Soften stroke to Power ${recommendedPower}/10 to prevent over-running your leave.`;
  } else {
    powerAdvice = `Stroke power was well judged (Power ${powerUsed}/10).`;
  }

  // 7. Actual Leave Analysis
  const actualGrid = metersToGrid(simResult.finalCuePos.x, simResult.finalCuePos.y, config);
  let leaveAdvice = '';
  if (leaveRow && leaveCol) {
    leaveAdvice = `Cue ball stopped at Row ${actualGrid.row}, Col ${actualGrid.col} (Pattern recommended: Row ${leaveRow}, Col ${leaveCol}).`;
  } else if (nextBall) {
    const distToNext = Math.hypot(nextBall.x - simResult.finalCuePos.x, nextBall.y - simResult.finalCuePos.y);
    const distFt = (distToNext * 3.28084).toFixed(1);
    leaveAdvice = `Cue ball finished at Row ${actualGrid.row}, Col ${actualGrid.col} (${distFt} ft from Ball ${nextBall.id}).`;
  } else {
    leaveAdvice = `Cue ball stopped at Row ${actualGrid.row}, Col ${actualGrid.col}.`;
  }

  // Determine outcome status
  let shotOutcome: CoachingAdvice['shotOutcome'] = 'missed_object_ball';
  if (simResult.cueBallPocketed) {
    shotOutcome = 'scratch';
  } else if (simResult.objectBallPocketed) {
    if (leaveRow && leaveCol) {
      const rowDiff = Math.abs(actualGrid.rowIdx - (leaveRow.charCodeAt(0) - 64));
      const colDiff = Math.abs(actualGrid.col - leaveCol);
      if (rowDiff <= 3 && colDiff <= 6) {
        shotOutcome = 'pocketed_good_leave';
      } else {
        shotOutcome = 'pocketed_bad_leave';
      }
    } else {
      shotOutcome = 'pocketed_good_leave';
    }
  }

  const recommendedShot: ShotSettings = {
    angleRad: idealAimAngleRad,
    speedMs: powerToSpeed(recommendedPower),
    tipOffsetX: recTipX,
    tipOffsetY: recTipY,
    elevationDeg: 0,
  };

  return {
    shotOutcome,
    targetBall: targetBall.id,
    targetPocket: targetPocket.id,
    userAimDeg,
    idealAimDeg,
    aimDiffDeg: diffDeg,
    aimAdvice,
    tipAdvice,
    powerUsed,
    recommendedPower,
    powerAdvice,
    leaveRow,
    leaveCol,
    actualLeaveRow: actualGrid.row,
    actualLeaveCol: actualGrid.col,
    leaveAdvice,
    recommendedShot,
  };
}
