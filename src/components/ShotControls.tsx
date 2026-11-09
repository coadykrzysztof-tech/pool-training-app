import React from 'react';
import { ShotSettings } from '../physics/types';
import { powerToSpeed, speedToPower } from '../physics/constants';
import { Play, Pause, RotateCcw, FastForward, Rewind, Repeat } from 'lucide-react';

interface ShotControlsProps {
  shot: ShotSettings;
  onShotChange: (updated: Partial<ShotSettings>) => void;
  isSimulating: boolean;
  onExecuteShot: () => void;
  onResetShot: () => void;
  onRepeatShot: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onStepForward: () => void;
}

export const ShotControls: React.FC<ShotControlsProps> = ({
  shot,
  onShotChange,
  isSimulating,
  onExecuteShot,
  onResetShot,
  onRepeatShot,
  playbackSpeed,
  onPlaybackSpeedChange,
  isPaused,
  onTogglePause,
  onStepForward,
}) => {
  // Convert angle in radians to degrees for human-friendly display
  const angleDeg = ((shot.angleRad * 180) / Math.PI + 360) % 360;
  const currentPower = speedToPower(shot.speedMs);
  const mph = (shot.speedMs * 2.23694).toFixed(1);

  const handleAngleStep = (deltaDeg: number) => {
    const newDeg = (angleDeg + deltaDeg + 360) % 360;
    onShotChange({ angleRad: (newDeg * Math.PI) / 180 });
  };

  const handlePowerChange = (power: number) => {
    onShotChange({ speedMs: powerToSpeed(power) });
  };

  return (
    <div className="flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg select-none space-y-3">
      {/* Primary Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onExecuteShot}
          disabled={isSimulating}
          className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm tracking-wide shadow-lg transition flex items-center justify-center gap-2 ${
            isSimulating
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/20 active:scale-[0.98]'
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{isSimulating ? 'Simulating...' : 'Shoot / Simulate'}</span>
        </button>

        <button
          onClick={onResetShot}
          className="py-2.5 px-3.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 active:scale-[0.98]"
          title="Reset balls to position before shot"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Reset</span>
        </button>

        <button
          onClick={onRepeatShot}
          className="py-2.5 px-3.5 bg-indigo-950/70 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-700/60 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 active:scale-[0.98]"
          title="Repeat identical shot with tweaked settings"
        >
          <Repeat className="w-3.5 h-3.5 text-indigo-400" />
          <span>Repeat</span>
        </button>
      </div>

      {/* Shot Power & Speed Slider */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Stroke Power</span>
          <div className="flex items-center gap-2 font-mono">
            <span className="text-amber-400 font-bold">Power {currentPower}/10</span>
            <span className="text-slate-400 text-[11px]">
              ({shot.speedMs.toFixed(1)} m/s · {mph} mph)
            </span>
          </div>
        </div>

        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={currentPower}
          onChange={(e) => handlePowerChange(parseInt(e.target.value, 10))}
          className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
        />

        {/* Quick Power Presets matching drill book */}
        <div className="flex justify-between text-[10px] text-slate-400 font-mono px-0.5">
          <span className="cursor-pointer hover:text-amber-400" onClick={() => handlePowerChange(2)}>Soft (2)</span>
          <span className="cursor-pointer hover:text-amber-400" onClick={() => handlePowerChange(4)}>Medium (4)</span>
          <span className="cursor-pointer hover:text-amber-400" onClick={() => handlePowerChange(6)}>Firm (6)</span>
          <span className="cursor-pointer hover:text-amber-400" onClick={() => handlePowerChange(8)}>Strong (8)</span>
          <span className="cursor-pointer hover:text-amber-400" onClick={() => handlePowerChange(10)}>Break (10)</span>
        </div>
      </div>

      {/* Fine Aiming Direction Controls */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Aim Direction</span>
          <span className="font-mono text-sky-400 font-bold">{angleDeg.toFixed(1)}°</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleAngleStep(-2.0)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold rounded border border-slate-700"
          >
            -2°
          </button>
          <button
            onClick={() => handleAngleStep(-0.2)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold rounded border border-slate-700"
          >
            -0.2°
          </button>

          <input
            type="range"
            min="0"
            max="360"
            step="0.1"
            value={angleDeg}
            onChange={(e) => onShotChange({ angleRad: (parseFloat(e.target.value) * Math.PI) / 180 })}
            className="flex-1 accent-sky-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />

          <button
            onClick={() => handleAngleStep(0.2)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold rounded border border-slate-700"
          >
            +0.2°
          </button>
          <button
            onClick={() => handleAngleStep(2.0)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold rounded border border-slate-700"
          >
            +2°
          </button>
        </div>
      </div>

      {/* Slow-Motion & Step Playback Controls */}
      {isSimulating && (
        <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2 animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onTogglePause}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onStepForward}
              disabled={!isPaused}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded disabled:opacity-40"
              title="Step forward 1 frame"
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {[0.2, 0.5, 1.0].map((s) => (
              <button
                key={s}
                onClick={() => onPlaybackSpeedChange(s)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded font-semibold transition ${
                  playbackSpeed === s
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
