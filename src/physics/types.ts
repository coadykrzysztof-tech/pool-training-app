export interface Vector2D {
  x: number; // meters
  y: number; // meters
}

export interface GridCoord {
  col: number;    // 1 to 50
  row: string;    // 'A' to 'Z'
  rowIdx: number; // 1 to 26
}

export interface Ball {
  id: number; // 0 = cue ball, 1-15 = object balls
  x: number;  // meters (origin at top-left playing surface cushion apex)
  y: number;  // meters
  vx: number; // m/s
  vy: number; // m/s
  omegaX: number; // rad/s (rotation around X axis, pitch / roll)
  omegaY: number; // rad/s (rotation around Y axis)
  omegaZ: number; // rad/s (rotation around Z axis, vertical sidespin)
  radius: number; // meters
  mass: number;   // kg
  isPocketed: boolean;
  state: 'sliding' | 'rolling' | 'at_rest';
}

export interface TableConfig {
  name: string;
  sizeFt: 7 | 8 | 9;
  lengthM: number;       // e.g. 2.54m for 9ft (100 in)
  widthM: number;        // e.g. 1.27m for 9ft (50 in)
  ballRadiusM: number;   // 0.028575m (2.25 in diameter)
  ballMassKg: number;    // 0.170 kg (6.0 oz)
  muSliding: number;     // ~0.20 cloth sliding friction
  muRolling: number;     // ~0.012 cloth rolling resistance
  muSpin: number;        // ~0.010 cloth spin decay
  cushionRestitution: number; // ~0.78
  cushionFriction: number;    // ~0.20
  squirtFactor: number;  // ~0.05 cue squirt deflection coefficient
}

export interface ShotSettings {
  angleRad: number;       // Aiming angle in radians (0 = right, pi/2 = down)
  speedMs: number;        // Cue ball initial speed in m/s (1.0 to 7.0 m/s)
  tipOffsetX: number;     // Tip contact horizontal offset (-1 to +1, fraction of ball radius)
  tipOffsetY: number;     // Tip contact vertical offset (-1 to +1, fraction of ball radius)
  elevationDeg: number;   // Cue stick elevation in degrees (0 to 45)
}

export interface GhostBallInfo {
  hitTarget: boolean;
  targetBallId: number | null;
  targetBallPos: Vector2D | null;
  ghostBallPos: Vector2D | null;
  impactDistance: number;
  cutAngleRad: number;
  cutAngleDeg: number;
  isCutToRight: boolean;
  lineOfCenters: Vector2D;     // Unit vector along ghost ball -> target ball
  tangentLine: Vector2D;       // Unit vector along perpendicular tangent line
  objectBallVelocity: Vector2D;// Predicted initial velocity of object ball
  cueBallTangentVelocity: Vector2D; // Pure stun post-collision velocity
  spinStateAtImpact: 'pure_stun' | 'sliding_draw' | 'sliding_follow' | 'natural_roll';
  cueCurveDirection: 'tangent' | 'forward' | 'backward';
  predictedRestPos: Vector2D | null;
}

export interface PocketDef {
  id: string; // 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'
  name: string;
  x: number;  // meters
  y: number;  // meters
  radius: number; // meters
  isCorner: boolean;
}

export interface DrillStep {
  ball: number;
  pocket: string;
  power: number;
  leave_row: string;
  leave_col: number | null;
  leave_norm_x?: number;
  leave_norm_y?: number;
}

export interface Drill {
  id: string;
  name: string;
  rack_num: number;
  game: string;
  difficulty: string;
  goal: string;
  pass_mark: string;
  ball_in_hand: {
    row: string;
    col: number;
    norm_x: number;
    norm_y: number;
  } | null;
  balls: {
    number: number;
    col: number;
    row: string;
    row_idx: number;
    norm_x: number;
    norm_y: number;
  }[];
  run: DrillStep[];
}

export interface TrajectoryFrame {
  time: number;
  balls: {
    id: number;
    x: number;
    y: number;
    isPocketed: boolean;
  }[];
  events?: ('ball_hit' | 'cushion_hit' | 'pocketed')[];
}
