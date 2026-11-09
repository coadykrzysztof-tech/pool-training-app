import React from 'react';
import { Target, ArrowRight, X, RotateCcw, Lightbulb, Compass, Award } from 'lucide-react';
import { ShotSettings } from '../physics/types';
import { getTipName } from '../physics/coach';

export interface CoachingAdvice {
  shotOutcome: 'pocketed_good_leave' | 'pocketed_bad_leave' | 'missed_object_ball' | 'scratch' | 'wrong_ball';
  targetBall: number;
  targetPocket: string;
  userAimDeg: number;
  idealAimDeg: number;
  aimDiffDeg: number; // positive = aimed too far right/thin, negative = too far left/thick
  aimAdvice: string;
  tipAdvice: string;
  powerUsed: number;
  recommendedPower: number;
  powerAdvice: string;
  leaveRow: string;
  leaveCol: number | null;
  actualLeaveRow: string;
  actualLeaveCol: number;
  leaveAdvice: string;
  recommendedShot: ShotSettings;
}

interface CoachFeedbackProps {
  advice: CoachingAdvice | null;
  onApplyRecommended: (shot: ShotSettings) => void;
  onDismiss: () => void;
  onRetry: () => void;
}

export const CoachFeedback: React.FC<CoachFeedbackProps> = ({
  advice,
  onApplyRecommended,
  onDismiss,
  onRetry,
}) => {
  if (!advice) return null;

  const isScratch = advice.shotOutcome === 'scratch';
  const isMiss = advice.shotOutcome === 'missed_object_ball';
  const isBadLeave = advice.shotOutcome === 'pocketed_bad_leave';

  const userTipName = getTipName(
    advice.recommendedShot ? advice.recommendedShot.tipOffsetX : 0,
    advice.recommendedShot ? advice.recommendedShot.tipOffsetY : 0
  );

  return (
    <div className="bg-slate-900/95 border border-sky-500/50 rounded-2xl p-4 shadow-2xl max-w-md w-full select-none animate-fadeIn backdrop-blur-md space-y-3 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border ${
              isScratch
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : isMiss
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
            }`}
          >
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <span>Shot Coach Analysis</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 border border-slate-700">
                Ball {advice.targetBall} → {advice.targetPocket}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isScratch
                ? 'Scratch detected — tangent line deflection avoided'
                : isBadLeave
                ? 'Ball made, but position lost for the next shot'
                : 'Shot missed the intended pocket line'}
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
          title="Close feedback"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Advice Blocks */}
      <div className="space-y-2 text-xs">
        {/* Aim & Cut Angle Analysis */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
          <div className="flex items-center justify-between font-semibold">
            <span className="text-slate-200 flex items-center gap-1.5 text-[11px]">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              Aim & Cut Line
            </span>
            <span
              className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                Math.abs(advice.aimDiffDeg) <= 0.6
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {Math.abs(advice.aimDiffDeg) <= 0.6
                ? 'On Target'
                : `${Math.abs(advice.aimDiffDeg).toFixed(1)}° ${
                    advice.aimDiffDeg > 0 ? 'too thin / right' : 'too thick / left'
                  }`}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{advice.aimAdvice}</p>
        </div>

        {/* Tip Contact & Spin Analysis */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
          <div className="flex items-center justify-between font-semibold">
            <span className="text-slate-200 flex items-center gap-1.5 text-[11px]">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              Tip Contact & Spin English
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
              Rec: {getTipName(advice.recommendedShot.tipOffsetX, advice.recommendedShot.tipOffsetY)}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{advice.tipAdvice}</p>
        </div>

        {/* Speed & Position Leave */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
          <div className="flex items-center justify-between font-semibold">
            <span className="text-slate-200 text-[11px]">Stroke Power & Leave</span>
            <span className="font-mono text-[11px] text-slate-300">
              Used: <span className="text-amber-400">{advice.powerUsed}/10</span> · Rec:{' '}
              <span className="text-emerald-400">{advice.recommendedPower}/10</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {advice.powerAdvice} {advice.leaveAdvice}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onApplyRecommended(advice.recommendedShot)}
          className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-600/25 transition flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <ArrowRight className="w-4 h-4" />
          <span>Apply Recommended Aim & Stroke</span>
        </button>

        <button
          onClick={onRetry}
          className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5 active:scale-[0.98]"
          title="Reset to snapshot and try this shot again"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
};
