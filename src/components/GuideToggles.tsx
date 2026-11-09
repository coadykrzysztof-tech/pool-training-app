import React from 'react';
import { GhostBallInfo } from '../physics/types';
import { Eye, HelpCircle, Compass, Target, Info } from 'lucide-react';

interface GuideTogglesProps {
  aimInfo: GhostBallInfo;
  guides: {
    showGhostBall: boolean;
    showLineOfCenters: boolean;
    showTangentLine: boolean;
    showPredictedPath: boolean;
    showGrid: boolean;
    showDiamonds: boolean;
    showPocketTargets: boolean;
  };
  onToggleGuide: (key: keyof GuideTogglesProps['guides']) => void;
}

export const GuideToggles: React.FC<GuideTogglesProps> = ({
  aimInfo,
  guides,
  onToggleGuide,
}) => {
  return (
    <div className="flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg select-none space-y-3">
      {/* Live Shot Geometry HUD */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            Contact Geometry
          </span>
          {aimInfo.hitTarget ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
              Ball {aimInfo.targetBallId} In Sights
            </span>
          ) : (
            <span className="text-[11px] text-slate-500 font-mono">No ball in path</span>
          )}
        </div>

        {aimInfo.hitTarget ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Cut Angle</div>
                <div className="font-bold font-mono text-amber-300">
                  {aimInfo.cutAngleDeg.toFixed(1)}° {aimInfo.isCutToRight ? 'Right' : 'Left'}
                </div>
              </div>

              <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Tangent Rule</div>
                <div className="font-bold font-mono text-cyan-300">
                  90.0° Stun Line
                </div>
              </div>
            </div>

            {/* Dynamic Spin Evolution Status Banner */}
            <div
              className={`p-2 rounded-lg border text-xs ${
                aimInfo.spinStateAtImpact === 'pure_stun'
                  ? 'bg-cyan-950/70 border-cyan-700/80 text-cyan-200'
                  : aimInfo.spinStateAtImpact === 'natural_roll'
                  ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-200'
                  : aimInfo.spinStateAtImpact === 'sliding_draw'
                  ? 'bg-amber-950/70 border-amber-700/80 text-amber-200'
                  : 'bg-sky-950/70 border-sky-700/80 text-sky-200'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-0.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {aimInfo.spinStateAtImpact === 'pure_stun' && 'Impact State: True Stun (Sliding)'}
                  {aimInfo.spinStateAtImpact === 'natural_roll' && 'Impact State: Natural Rolling'}
                  {aimInfo.spinStateAtImpact === 'sliding_draw' && 'Impact State: Draw (Backspin)'}
                  {aimInfo.spinStateAtImpact === 'sliding_follow' && 'Impact State: Follow (Topspin)'}
                </span>
              </div>
              <p className="text-[11px] leading-tight opacity-90">
                {aimInfo.spinStateAtImpact === 'pure_stun' &&
                  'Cue ball arrives with zero vertical spin -> leaves exactly along the 90° tangent line!'}
                {aimInfo.spinStateAtImpact === 'natural_roll' &&
                  'Cloth friction transitioned sliding to forward roll -> curves forward off tangent line (~30° rule).'}
                {aimInfo.spinStateAtImpact === 'sliding_draw' &&
                  'Backspin bites into cloth -> cue ball draws backward off the tangent line!'}
                {aimInfo.spinStateAtImpact === 'sliding_follow' &&
                  'Topspin accelerates forward -> cue ball follows through forward off tangent line!'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Rotate the cue stick or click near any object ball to aim and inspect tangent line.
          </p>
        )}
      </div>

      {/* Guide Toggles */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider px-1">
          Visual Overlays
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button
            onClick={() => onToggleGuide('showGhostBall')}
            className={`flex items-center justify-between p-2 rounded-lg border font-medium transition ${
              guides.showGhostBall
                ? 'bg-sky-950/80 border-sky-600 text-sky-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Ghost Ball</span>
            <span className={`w-2 h-2 rounded-full ${guides.showGhostBall ? 'bg-sky-400' : 'bg-slate-600'}`} />
          </button>

          <button
            onClick={() => onToggleGuide('showLineOfCenters')}
            className={`flex items-center justify-between p-2 rounded-lg border font-medium transition ${
              guides.showLineOfCenters
                ? 'bg-amber-950/80 border-amber-600 text-amber-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Target Line</span>
            <span className={`w-2 h-2 rounded-full ${guides.showLineOfCenters ? 'bg-amber-400' : 'bg-slate-600'}`} />
          </button>

          <button
            onClick={() => onToggleGuide('showTangentLine')}
            className={`flex items-center justify-between p-2 rounded-lg border font-medium transition ${
              guides.showTangentLine
                ? 'bg-cyan-950/80 border-cyan-600 text-cyan-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>90° Tangent</span>
            <span className={`w-2 h-2 rounded-full ${guides.showTangentLine ? 'bg-cyan-400' : 'bg-slate-600'}`} />
          </button>

          <button
            onClick={() => onToggleGuide('showPredictedPath')}
            className={`flex items-center justify-between p-2 rounded-lg border font-medium transition ${
              guides.showPredictedPath
                ? 'bg-purple-950/80 border-purple-600 text-purple-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Actual Curve</span>
            <span className={`w-2 h-2 rounded-full ${guides.showPredictedPath ? 'bg-purple-400' : 'bg-slate-600'}`} />
          </button>

          <button
            onClick={() => onToggleGuide('showGrid')}
            className={`flex items-center justify-between p-2 rounded-lg border font-medium transition ${
              guides.showGrid
                ? 'bg-blue-950/80 border-blue-600 text-blue-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>A-Z Grid (1-50)</span>
            <span className={`w-2 h-2 rounded-full ${guides.showGrid ? 'bg-blue-400' : 'bg-slate-600'}`} />
          </button>

          <button
            onClick={() => onToggleGuide('showDiamonds')}
            className={`flex items-center justify-between p-2 rounded-lg border font-medium transition ${
              guides.showDiamonds
                ? 'bg-slate-800 border-slate-600 text-slate-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Diamonds</span>
            <span className={`w-2 h-2 rounded-full ${guides.showDiamonds ? 'bg-slate-300' : 'bg-slate-600'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
