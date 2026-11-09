import React, { useRef, useCallback } from 'react';
import { ShotSettings } from '../physics/types';

interface CueBallDiagramProps {
  shot: ShotSettings;
  onShotChange: (updated: Partial<ShotSettings>) => void;
  squirtFactor: number;
}

export const CueBallDiagram: React.FC<CueBallDiagramProps> = ({
  shot,
  onShotChange,
  squirtFactor,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Radius of cue ball in SVG coordinate space
  const svgRadius = 55;
  const center = 65;
  const miscueRadius = svgRadius * 0.65; // ~0.65R miscue boundary

  // Current tip contact in SVG coordinates
  const tipX = center + (shot.tipOffsetX || 0) * svgRadius;
  const tipY = center - (shot.tipOffsetY || 0) * svgRadius; // Inverted Y for intuitive high/low

  // Squirt deflection angle in degrees
  const squirtDeg = ((-squirtFactor * (shot.tipOffsetX || 0) * 180) / Math.PI).toFixed(1);

  // Label text for vertical spin
  const verticalText =
    Math.abs(shot.tipOffsetY) < 0.08
      ? 'Center Ball (Stun)'
      : shot.tipOffsetY > 0
      ? `+${(shot.tipOffsetY).toFixed(2)}R High (Follow)`
      : `${(shot.tipOffsetY).toFixed(2)}R Low (Draw)`;

  // Label text for horizontal spin
  const horizontalText =
    Math.abs(shot.tipOffsetX) < 0.08
      ? 'No Sidespin'
      : shot.tipOffsetX > 0
      ? `+${(shot.tipOffsetX).toFixed(2)}R Right English`
      : `${(shot.tipOffsetX).toFixed(2)}R Left English`;

  const handlePointerInteraction = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const clickX = e.clientX - rect.left - (rect.width / 2);
      const clickY = e.clientY - rect.top - (rect.height / 2);

      // Convert from screen px to normalized fraction of radius [-1, 1]
      const scaleFactor = (svgRadius * (rect.width / 130));
      let normX = clickX / scaleFactor;
      let normY = -clickY / scaleFactor; // invert Y so up is positive

      // Clamp within miscue boundary
      const dist = Math.hypot(normX, normY);
      const maxR = 0.65;
      if (dist > maxR) {
        normX = (normX / dist) * maxR;
        normY = (normY / dist) * maxR;
      }

      onShotChange({
        tipOffsetX: Math.round(normX * 100) / 100,
        tipOffsetY: Math.round(normY * 100) / 100,
      });
    },
    [onShotChange, svgRadius]
  );

  return (
    <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg select-none">
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">
          Tip Contact & Spin
        </span>
        <button
          onClick={() => onShotChange({ tipOffsetX: 0, tipOffsetY: 0 })}
          className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 px-2 py-0.5 rounded border border-sky-800/60 transition"
        >
          Reset to Center
        </button>
      </div>

      <div className="relative my-2 cursor-pointer touch-none">
        <svg
          ref={svgRef}
          width="130"
          height="130"
          viewBox="0 0 130 130"
          className="drop-shadow-md"
          onPointerDown={handlePointerInteraction}
          onPointerMove={(e) => {
            if (e.buttons === 1) handlePointerInteraction(e);
          }}
        >
          {/* Cue Ball Body Gradient */}
          <defs>
            <radialGradient id="cueBallGrad" cx="38%" cy="38%" r="62%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>
          </defs>

          {/* Cue Ball Circle */}
          <circle
            cx={center}
            cy={center}
            r={svgRadius}
            fill="url(#cueBallGrad)"
            stroke="#64748b"
            strokeWidth="2"
          />

          {/* Miscue boundary warning line */}
          <circle
            cx={center}
            cy={center}
            r={miscueRadius}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            opacity="0.5"
          />

          {/* Crosshair guidelines */}
          <line
            x1={center}
            y1={center - svgRadius}
            x2={center}
            y2={center + svgRadius}
            stroke="#94a3b8"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
          <line
            x1={center - svgRadius}
            y1={center}
            x2={center + svgRadius}
            y2={center}
            stroke="#94a3b8"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />

          {/* Tip Contact Indicator (Blue Chalk Dot) */}
          <circle
            cx={tipX}
            cy={tipY}
            r="7"
            fill="#0284c7"
            stroke="#ffffff"
            strokeWidth="2"
            className="filter drop-shadow"
          />
          {/* Inner chalk target */}
          <circle cx={tipX} cy={tipY} r="2" fill="#ffffff" />
        </svg>
      </div>

      {/* Tip Offsets Readout */}
      <div className="w-full bg-slate-950/80 rounded-lg p-2 text-center border border-slate-800/80 space-y-0.5 mb-2">
        <div className="text-[11px] font-bold text-sky-300 font-mono">
          {verticalText}
        </div>
        <div className="text-[10px] font-medium text-slate-400 font-mono">
          {horizontalText}
        </div>
        {Math.abs(shot.tipOffsetX) > 0.05 && (
          <div className="text-[10px] text-amber-400 font-mono">
            Squirt: {squirtDeg}° {shot.tipOffsetX > 0 ? 'Left Deflection' : 'Right Deflection'}
          </div>
        )}
      </div>

      {/* Quick Spin Presets */}
      <div className="grid grid-cols-3 gap-1.5 w-full">
        <button
          onClick={() => onShotChange({ tipOffsetX: 0, tipOffsetY: 0.45 })}
          className={`px-1.5 py-1 text-[11px] font-semibold rounded border transition ${
            shot.tipOffsetY > 0.2 && Math.abs(shot.tipOffsetX) < 0.1
              ? 'bg-sky-600 text-white border-sky-400'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
        >
          Follow (+0.45R)
        </button>
        <button
          onClick={() => onShotChange({ tipOffsetX: 0, tipOffsetY: 0 })}
          className={`px-1.5 py-1 text-[11px] font-semibold rounded border transition ${
            Math.abs(shot.tipOffsetY) < 0.1 && Math.abs(shot.tipOffsetX) < 0.1
              ? 'bg-cyan-600 text-white border-cyan-400'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
        >
          Stun (Center)
        </button>
        <button
          onClick={() => onShotChange({ tipOffsetX: 0, tipOffsetY: -0.45 })}
          className={`px-1.5 py-1 text-[11px] font-semibold rounded border transition ${
            shot.tipOffsetY < -0.2 && Math.abs(shot.tipOffsetX) < 0.1
              ? 'bg-amber-600 text-white border-amber-400'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
        >
          Draw (-0.45R)
        </button>
        <button
          onClick={() => onShotChange({ tipOffsetX: -0.35, tipOffsetY: 0 })}
          className={`px-1.5 py-1 text-[11px] font-semibold rounded border transition ${
            shot.tipOffsetX < -0.2
              ? 'bg-indigo-600 text-white border-indigo-400'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
        >
          Left English
        </button>
        <button
          onClick={() => onShotChange({ tipOffsetX: 0.35, tipOffsetY: 0 })}
          className={`px-1.5 py-1 text-[11px] font-semibold rounded border transition ${
            shot.tipOffsetX > 0.2
              ? 'bg-indigo-600 text-white border-indigo-400'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
        >
          Right English
        </button>
        <button
          onClick={() => onShotChange({ tipOffsetX: 0, tipOffsetY: -0.15 })}
          className={`px-1.5 py-1 text-[11px] font-semibold rounded border transition ${
            shot.tipOffsetY >= -0.25 && shot.tipOffsetY <= -0.1
              ? 'bg-emerald-600 text-white border-emerald-400'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
          title="Stun-draw: slides to stun at medium distance"
        >
          Stun-Draw
        </button>
      </div>

      {/* Advanced Cue Elevation Accordion */}
      <div className="w-full mt-2 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>Cue Elevation</span>
          <span className="font-mono text-slate-200">{shot.elevationDeg}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="45"
          step="1"
          value={shot.elevationDeg}
          onChange={(e) => onShotChange({ elevationDeg: parseFloat(e.target.value) })}
          className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />
      </div>
    </div>
  );
};
