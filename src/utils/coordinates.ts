import { TableConfig, GridCoord } from '../physics/types';

/**
 * Coordinate conversions between:
 * 1. Physical meters on playing surface (0,0 is top-left playing surface apex)
 * 2. Pattern Puzzles Grid:
 *    - Columns: 1.0 to 50.0 (left cushion to right cushion)
 *    - Rows: 'A' to 'Z' (row 1.0 to 26.0, top cushion to bottom cushion)
 * 3. Standard Diamonds:
 *    - Long rail: 0 to 8 diamonds (0 = left corner, 4 = center side pocket, 8 = right corner)
 *    - Short rail: 0 to 4 diamonds (0 = corner, 2 = center spot, 4 = corner)
 */

export function metersToGrid(xM: number, yM: number, config: TableConfig): GridCoord {
  const R = config.ballRadiusM;
  const playableL = Math.max(0.1, config.lengthM - 2 * R);
  const playableW = Math.max(0.1, config.widthM - 2 * R);

  const normX = Math.max(0, Math.min(1, (xM - R) / playableL));
  const normY = Math.max(0, Math.min(1, (yM - R) / playableW));

  const col = Math.round((1 + normX * 49) * 10) / 10;
  const rowIdx = Math.max(1, Math.min(26, Math.round(1 + normY * 25)));
  const row = String.fromCharCode(65 + rowIdx - 1);

  return { col, row, rowIdx };
}

export function gridToMeters(col: number, row: string | number, config: TableConfig): { x: number; y: number } {
  let rowIdx: number;
  if (typeof row === 'string') {
    rowIdx = row.toUpperCase().charCodeAt(0) - 65 + 1;
  } else {
    rowIdx = row;
  }
  rowIdx = Math.max(1, Math.min(26, rowIdx));

  const R = config.ballRadiusM;
  const playableL = Math.max(0.1, config.lengthM - 2 * R);
  const playableW = Math.max(0.1, config.widthM - 2 * R);

  const normX = Math.max(0, Math.min(1, (col - 1) / 49));
  const normY = Math.max(0, Math.min(1, (rowIdx - 1) / 25));

  return {
    x: R + normX * playableL,
    y: R + normY * playableW,
  };
}

export function metersToDiamonds(xM: number, yM: number, config: TableConfig) {
  const normX = xM / config.lengthM;
  const normY = yM / config.widthM;

  return {
    longRailDiamond: Math.round(normX * 8 * 10) / 10,  // 0 to 8
    shortRailDiamond: Math.round(normY * 4 * 10) / 10, // 0 to 4
  };
}

export function formatGridCoord(col: number, row: string): string {
  return `${row}-${col % 1 === 0 ? col.toString() : col.toFixed(1)}`;
}
