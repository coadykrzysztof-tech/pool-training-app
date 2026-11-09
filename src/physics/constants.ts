import { TableConfig } from './types';

// Standard 9-foot regulation table (100 in x 50 in)
export const TABLE_CONFIG_9FT: TableConfig = {
  name: '9-Foot Tournament Table (100" x 50")',
  sizeFt: 9,
  lengthM: 2.5400, // 100 inches = 2.5400 meters
  widthM: 1.2700,  // 50 inches = 1.2700 meters
  ballRadiusM: 0.028575, // 2.25 inches diameter -> 1.125 inches radius = 0.028575 m
  ballMassKg: 0.170, // 6 oz regulation phenolic ball
  muSliding: 0.20,   // Tournament Simonis 860 cloth sliding friction
  muRolling: 0.012,  // Low rolling resistance
  muSpin: 0.010,     // Vertical spin decay rate
  cushionRestitution: 0.78, // High grade Artemis/K-55 rubber
  cushionFriction: 0.18,
  squirtFactor: 0.045, // Cue stick squirt deflection (~2.5 deg per max offset)
};

// Standard 8-foot home table (88 in x 44 in)
export const TABLE_CONFIG_8FT: TableConfig = {
  name: '8-Foot Standard Table (88" x 44")',
  sizeFt: 8,
  lengthM: 2.2352, // 88 inches = 2.2352 meters
  widthM: 1.1176,  // 44 inches = 1.1176 meters
  ballRadiusM: 0.028575,
  ballMassKg: 0.170,
  muSliding: 0.21,
  muRolling: 0.014,
  muSpin: 0.011,
  cushionRestitution: 0.76,
  cushionFriction: 0.20,
  squirtFactor: 0.045,
};

// Standard 7-foot bar/league table (78 in x 39 in)
export const TABLE_CONFIG_7FT: TableConfig = {
  name: '7-Foot League Table (78" x 39")',
  sizeFt: 7,
  lengthM: 1.9812, // 78 inches = 1.9812 meters
  widthM: 0.9906,  // 39 inches = 0.9906 meters
  ballRadiusM: 0.028575,
  ballMassKg: 0.170,
  muSliding: 0.22,
  muRolling: 0.016,
  muSpin: 0.012,
  cushionRestitution: 0.74,
  cushionFriction: 0.22,
  squirtFactor: 0.045,
};

export const GRAVITY = 9.80665; // m/s^2

// Standard pool ball color palette
export const BALL_COLORS: Record<number, { primary: string; secondary?: string; isStripe: boolean; text: string }> = {
  0: { primary: '#f8fafc', isStripe: false, text: '#0f172a' }, // Cue ball (white)
  1: { primary: '#facc15', isStripe: false, text: '#78350f' }, // 1 Solid Yellow
  2: { primary: '#2563eb', isStripe: false, text: '#ffffff' }, // 2 Solid Blue
  3: { primary: '#dc2626', isStripe: false, text: '#ffffff' }, // 3 Solid Red
  4: { primary: '#7c3aed', isStripe: false, text: '#ffffff' }, // 4 Solid Purple
  5: { primary: '#ea580c', isStripe: false, text: '#ffffff' }, // 5 Solid Orange
  6: { primary: '#16a34a', isStripe: false, text: '#ffffff' }, // 6 Solid Green
  7: { primary: '#854d0e', isStripe: false, text: '#ffffff' }, // 7 Solid Maroon/Brown
  8: { primary: '#09090b', isStripe: false, text: '#ffffff' }, // 8 Solid Black
  9: { primary: '#facc15', isStripe: true, text: '#78350f' },  // 9 Stripe Yellow
  10: { primary: '#2563eb', isStripe: true, text: '#1e3a8a' }, // 10 Stripe Blue
  11: { primary: '#dc2626', isStripe: true, text: '#7f1d1d' }, // 11 Stripe Red
  12: { primary: '#7c3aed', isStripe: true, text: '#4c1d95' }, // 12 Stripe Purple
  13: { primary: '#ea580c', isStripe: true, text: '#7c2d12' }, // 13 Stripe Orange
  14: { primary: '#16a34a', isStripe: true, text: '#14532d' }, // 14 Stripe Green
  15: { primary: '#854d0e', isStripe: true, text: '#451a03' }, // 15 Stripe Maroon
};

// Power 1 to 10 mapped to speed in m/s
// Power 1 ~ 0.8 m/s (soft lag)
// Power 5 ~ 2.5 m/s (medium smooth stroke)
// Power 10 ~ 5.5 m/s (firm break/power stroke)
export function powerToSpeed(power: number): number {
  const p = Math.max(1, Math.min(10, power));
  return 0.5 + p * 0.45;
}

export function speedToPower(speedMs: number): number {
  return Math.max(1, Math.min(10, Math.round((speedMs - 0.5) / 0.45)));
}
