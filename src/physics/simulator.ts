import { Ball, PocketDef, ShotSettings, TableConfig, TrajectoryFrame, Vector2D } from './types';
import { GRAVITY } from './constants';
import { getTablePockets } from './geometry';

export interface SimulationResult {
  frames: TrajectoryFrame[];
  objectBallPocketed: boolean;
  pocketedBallIds: number[];
  cueBallPocketed: boolean; // Scratch
  cueBallPocketId: string | null; // e.g. 'P4'
  objectBallPocketId: string | null; // e.g. 'P1'
  firstBallHitId: number | null;
  impactFrameIndex: number | null;
  targetBallId: number | null;
  finalCuePos: Vector2D;
  separationAngleDeg: number | null;
  durationSeconds: number;
}

/**
 * High-precision billiards physics simulation.
 * Integrates equations of motion for sliding friction, rolling friction,
 * ball-ball impacts, cushion rebounds, and pocketing.
 */
export function simulateShot(
  initialBalls: Ball[],
  shot: ShotSettings,
  config: TableConfig,
  targetBallId: number | null = null,
  maxDuration: number = 8.0
): SimulationResult {
  const dt = 0.002; // 2 millisecond physics time step
  const subSteps = 1;
  const R = config.ballRadiusM;
  const twoR = 2 * R;
  const twoRSq = twoR * twoR;
  const m = config.ballMassKg;
  const g = GRAVITY;
  const L = config.lengthM;
  const W = config.widthM;
  const pockets = getTablePockets(config);

  // Deep clone balls to run simulation without mutating original state
  const balls: Ball[] = initialBalls.map((b) => ({ ...b }));

  // Find cue ball (id === 0)
  const cue = balls.find((b) => b.id === 0);
  if (!cue) {
    throw new Error('Cue ball (id 0) not found on table');
  }
  cue.isPocketed = false;

  // Apply cue strike with squirt (cue deflection)
  const squirtAngleRad = -config.squirtFactor * (shot.tipOffsetX || 0);
  const actualAimAngle = shot.angleRad + squirtAngleRad;
  const v0 = shot.speedMs;

  cue.vx = v0 * Math.cos(actualAimAngle);
  cue.vy = v0 * Math.sin(actualAimAngle);

  // Tip offsets (-1 to +1 of ball radius)
  const ax = shot.tipOffsetX * R; // horizontal (left/right sidespin)
  const ay = shot.tipOffsetY * R; // vertical (top/bottom draw)

  // Angular velocities from tip strike (rigid body impulse):
  // omega_pitch (around X in shot frame): forward topspin or backspin
  // omega_yaw (around Z): vertical axis sidespin
  const shotCos = Math.cos(actualAimAngle);
  const shotSin = Math.sin(actualAimAngle);

  // Magnitude of pitch spin:
  const omegaPitch = (2.5 * (shot.tipOffsetY || 0) * v0) / R;
  // Rotate pitch axis to global table coordinates:
  cue.omegaX = -omegaPitch * shotSin;
  cue.omegaY = omegaPitch * shotCos;
  // Sidespin around Z:
  cue.omegaZ = (2.5 * (shot.tipOffsetX || 0) * v0) / R;

  cue.state = 'sliding';

  // Metrics tracking
  let firstBallHitId: number | null = null;
  let impactFrameIndex: number | null = null;
  let cueBallPocketed = false;
  let cueBallPocketId: string | null = null;
  let objectBallPocketed = false;
  let objectBallPocketId: string | null = null;
  const pocketedBallIds: number[] = [];
  let separationAngleDeg: number | null = null;

  const frames: TrajectoryFrame[] = [];
  let lastFrameTime = -1;
  const frameInterval = 1 / 60; // 60 FPS recording

  let simTime = 0;
  let allBallsAtRest = false;

  while (simTime < maxDuration && !allBallsAtRest) {
    // Record animation frame
    if (simTime - lastFrameTime >= frameInterval) {
      frames.push({
        time: simTime,
        balls: balls.map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          isPocketed: b.isPocketed,
        })),
      });
      lastFrameTime = simTime;
    }

    // 1. Update ball positions and motion on cloth
    allBallsAtRest = true;

    for (const b of balls) {
      if (b.isPocketed) continue;

      const speed = Math.hypot(b.vx, b.vy);

      // Contact point slip velocity: u = v - R (omega x k)
      // u_x = v_x - R * omega_y
      // u_y = v_y + R * omega_x
      const ux = b.vx - R * b.omegaY;
      const uy = b.vy + R * b.omegaX;
      const uSpeed = Math.hypot(ux, uy);

      if (speed > 0.005 || uSpeed > 0.01 || Math.abs(b.omegaZ) > 0.1) {
        allBallsAtRest = false;

        if (uSpeed > 0.015) {
          // --- SLIDING STATE ---
          b.state = 'sliding';
          const uNormX = ux / uSpeed;
          const uNormY = uy / uSpeed;

          // Linear deceleration from cloth sliding friction
          const aFriction = config.muSliding * g;
          b.vx -= aFriction * uNormX * dt;
          b.vy -= aFriction * uNormY * dt;

          // Angular acceleration from sliding friction torque
          const alphaFriction = (2.5 * config.muSliding * g) / R;
          b.omegaX -= alphaFriction * uNormY * dt;
          b.omegaY += alphaFriction * uNormX * dt;
        } else {
          // --- ROLLING STATE ---
          b.state = 'rolling';
          if (speed > 0.005) {
            const vNormX = b.vx / speed;
            const vNormY = b.vy / speed;
            const aRoll = config.muRolling * g;
            const newSpeed = Math.max(0, speed - aRoll * dt);
            b.vx = vNormX * newSpeed;
            b.vy = vNormY * newSpeed;

            // Enforce pure rolling kinematics
            b.omegaX = -b.vy / R;
            b.omegaY = b.vx / R;
          } else {
            b.vx = 0;
            b.vy = 0;
            b.omegaX = 0;
            b.omegaY = 0;
          }
        }

        // Spin decay (sidespin around vertical axis)
        if (Math.abs(b.omegaZ) > 0.05) {
          const spinDecay = (2.5 * config.muSpin * g) / R;
          const signZ = Math.sign(b.omegaZ);
          b.omegaZ -= signZ * spinDecay * dt;
          if (Math.sign(b.omegaZ) !== signZ) b.omegaZ = 0;
        } else {
          b.omegaZ = 0;
        }

        // Integrate position
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      } else {
        b.vx = 0;
        b.vy = 0;
        b.omegaX = 0;
        b.omegaY = 0;
        b.omegaZ = 0;
        b.state = 'at_rest';
      }
    }

    // 2. Ball-ball collisions
    for (let i = 0; i < balls.length; i++) {
      const b1 = balls[i];
      if (b1.isPocketed) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const b2 = balls[j];
        if (b2.isPocketed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < twoRSq && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist; // Line of centers
          const ny = dy / dist;

          // Relative velocity along line of centers
          const kx = b1.vx - b2.vx;
          const ky = b1.vy - b2.vy;
          const vRelNormal = kx * nx + ky * ny;

          if (vRelNormal > 0) {
            // Balls are moving toward each other
            if (b1.id === 0 && firstBallHitId === null) {
              firstBallHitId = b2.id;
              impactFrameIndex = frames.length;

              // Calculate initial separation angle at collision instant
              const cbPreSpeed = Math.hypot(b1.vx, b1.vy);
              const obPostSpeed = vRelNormal;
              const cbPostVx = b1.vx - nx * vRelNormal;
              const cbPostVy = b1.vy - ny * vRelNormal;
              const cbPostSpeed = Math.hypot(cbPostVx, cbPostVy);

              if (cbPreSpeed > 0.1 && obPostSpeed > 0.1 && cbPostSpeed > 0.1) {
                const dot = (cbPostVx * nx + cbPostVy * ny) / (cbPostSpeed * 1);
                const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
                separationAngleDeg = (angleRad * 180) / Math.PI;
              }
            }

            // Restitution for phenolic balls
            const e = 0.96;
            const impulse = ((1 + e) / 2) * vRelNormal;

            b1.vx -= nx * impulse;
            b1.vy -= ny * impulse;
            b2.vx += nx * impulse;
            b2.vy += ny * impulse;

            // Cut-induced throw & spin friction (approximate tangential impulse)
            const tx = -ny;
            const ty = nx;
            const vRelTangential = kx * tx + ky * ty;
            const muBallBall = 0.035; // Ball-ball friction coefficient
            const throwImpulse = Math.max(-muBallBall * impulse, Math.min(muBallBall * impulse, vRelTangential * 0.5));
            b1.vx -= tx * throwImpulse;
            b1.vy -= ty * throwImpulse;
            b2.vx += tx * throwImpulse;
            b2.vy += ty * throwImpulse;

            // Positional separation to prevent sticking
            const overlap = twoR - dist;
            b1.x -= nx * overlap * 0.5;
            b1.y -= ny * overlap * 0.5;
            b2.x += nx * overlap * 0.5;
            b2.y += ny * overlap * 0.5;
          }
        }
      }
    }

    // 3. Pocket detection & capture
    const cornerCaptureR = 0.058;
    const sideCaptureHalfW = 0.052;

    for (const b of balls) {
      if (b.isPocketed) continue;

      let captured = false;
      let capturedPocketId: string | null = null;

      // P1: Top-Left (0, 0)
      if (b.x < 0.075 && b.y < 0.075 && Math.hypot(b.x, b.y) < cornerCaptureR) {
        captured = true;
        capturedPocketId = 'P1';
      }
      // P3: Top-Right (L, 0)
      else if (b.x > L - 0.075 && b.y < 0.075 && Math.hypot(b.x - L, b.y) < cornerCaptureR) {
        captured = true;
        capturedPocketId = 'P3';
      }
      // P4: Bottom-Left (0, W)
      else if (b.x < 0.075 && b.y > W - 0.075 && Math.hypot(b.x, b.y - W) < cornerCaptureR) {
        captured = true;
        capturedPocketId = 'P4';
      }
      // P6: Bottom-Right (L, W)
      else if (b.x > L - 0.075 && b.y > W - 0.075 && Math.hypot(b.x - L, b.y - W) < cornerCaptureR) {
        captured = true;
        capturedPocketId = 'P6';
      }
      // P2: Top-Side (L/2, 0)
      else if (Math.abs(b.x - L / 2) < sideCaptureHalfW && b.y <= R + 0.005 && b.vy <= 0) {
        captured = true;
        capturedPocketId = 'P2';
      }
      // P5: Bottom-Side (L/2, W)
      else if (Math.abs(b.x - L / 2) < sideCaptureHalfW && b.y >= W - R - 0.005 && b.vy >= 0) {
        captured = true;
        capturedPocketId = 'P5';
      }

      if (captured) {
        b.isPocketed = true;
        b.vx = 0;
        b.vy = 0;
        b.omegaX = 0;
        b.omegaY = 0;
        b.omegaZ = 0;

        pocketedBallIds.push(b.id);
        if (b.id === 0) {
          cueBallPocketed = true;
          if (!cueBallPocketId) cueBallPocketId = capturedPocketId;
        }
        if (targetBallId !== null && b.id === targetBallId) {
          objectBallPocketed = true;
          if (!objectBallPocketId) objectBallPocketId = capturedPocketId;
        }
      }
    }

    // 4. Cushion rebounds
    const eCushion = config.cushionRestitution;
    const cornerMouth = 0.082;
    const sideMouth = 0.062;

    for (const b of balls) {
      if (b.isPocketed) continue;

      // Top cushion
      if (b.y - R <= 0 && b.vy < 0) {
        const inCorner1 = b.x < cornerMouth;
        const inSide = Math.abs(b.x - L / 2) < sideMouth;
        const inCorner2 = b.x > L - cornerMouth;

        if (!inCorner1 && !inSide && !inCorner2) {
          b.y = R;
          b.vy = -b.vy * eCushion;
          b.vx -= b.omegaZ * R * 0.2;
        } else if (inSide && Math.abs(b.x - L / 2) >= sideCaptureHalfW) {
          b.y = R;
          b.vy = -b.vy * 0.6;
          b.vx += (b.x < L / 2 ? -0.4 : 0.4) * Math.abs(b.vy);
        }
      }

      // Bottom cushion
      if (b.y + R >= W && b.vy > 0) {
        const inCorner1 = b.x < cornerMouth;
        const inSide = Math.abs(b.x - L / 2) < sideMouth;
        const inCorner2 = b.x > L - cornerMouth;

        if (!inCorner1 && !inSide && !inCorner2) {
          b.y = W - R;
          b.vy = -b.vy * eCushion;
          b.vx += b.omegaZ * R * 0.2;
        } else if (inSide && Math.abs(b.x - L / 2) >= sideCaptureHalfW) {
          b.y = W - R;
          b.vy = -b.vy * 0.6;
          b.vx += (b.x < L / 2 ? -0.4 : 0.4) * Math.abs(b.vy);
        }
      }

      // Left cushion
      if (b.x - R <= 0 && b.vx < 0) {
        if (b.y >= cornerMouth && b.y <= W - cornerMouth) {
          b.x = R;
          b.vx = -b.vx * eCushion;
          b.vy += b.omegaZ * R * 0.2;
        }
      }

      // Right cushion
      if (b.x + R >= L && b.vx > 0) {
        if (b.y >= cornerMouth && b.y <= W - cornerMouth) {
          b.x = L - R;
          b.vx = -b.vx * eCushion;
          b.vy -= b.omegaZ * R * 0.2;
        }
      }

      // Safety boundary clamp: prevent ball from ever escaping the table
      if (b.x < R * 0.3) {
        b.x = R;
        b.vx = Math.abs(b.vx) * eCushion;
      } else if (b.x > L - R * 0.3) {
        b.x = L - R;
        b.vx = -Math.abs(b.vx) * eCushion;
      }
      if (b.y < R * 0.3) {
        b.y = R;
        b.vy = Math.abs(b.vy) * eCushion;
      } else if (b.y > W - R * 0.3) {
        b.y = W - R;
        b.vy = -Math.abs(b.vy) * eCushion;
      }
    }

    simTime += dt;
  }

  // Final recorded frame
  frames.push({
    time: simTime,
    balls: balls.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      isPocketed: b.isPocketed,
    })),
  });

  const finalCue = balls.find((b) => b.id === 0) || cue;

  return {
    frames,
    objectBallPocketed,
    pocketedBallIds,
    cueBallPocketed,
    cueBallPocketId,
    objectBallPocketId,
    firstBallHitId,
    impactFrameIndex,
    targetBallId,
    finalCuePos: { x: finalCue.x, y: finalCue.y },
    separationAngleDeg,
    durationSeconds: simTime,
  };
}
