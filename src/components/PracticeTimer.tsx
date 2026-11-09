import React, { useState, useEffect } from 'react';
import { Timer, Play, Pause, RotateCcw, CheckCircle, Crosshair, AlertTriangle } from 'lucide-react';
import { soundFx } from '../utils/audio';
import confetti from 'canvas-confetti';

interface PracticeTimerProps {
  onSessionComplete?: () => void;
}

export const PracticeTimer: React.FC<PracticeTimerProps> = ({ onSessionComplete }) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(300); // 5 minutes
  const [isActive, setIsActive] = useState<boolean>(false);
  const [pocketedCount, setPocketedCount] = useState<number>(0);
  const [positionCount, setPositionCount] = useState<number>(0);
  const [scratchCount, setScratchCount] = useState<number>(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((s) => s - 1);
      }, 1000);
    } else if (secondsLeft === 0 && isActive) {
      setIsActive(false);
      soundFx.playCelebrationChime();
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      if (onSessionComplete) onSessionComplete();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, secondsLeft, onSessionComplete]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setSecondsLeft(300);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const progressPercent = ((300 - secondsLeft) / 300) * 100;

  return (
    <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 shadow select-none">
      {/* 5-Min Timer Pill */}
      <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
        <Timer className="w-4 h-4 text-emerald-400" />
        <div className="font-mono font-bold text-sm text-slate-100 min-w-[42px]">
          {timeFormatted}
        </div>
        <button
          onClick={toggleTimer}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          title={isActive ? 'Pause Session' : 'Start 5-Min Session'}
        >
          {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={resetTimer}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          title="Reset Timer"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* Quick Session Score Tally */}
      <div className="flex items-center gap-3 text-xs">
        {/* Pocketed */}
        <div
          className="flex items-center gap-1 cursor-pointer hover:opacity-80"
          onClick={() => setPocketedCount((c) => c + 1)}
          title="Click to add pocketed ball"
        >
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400 text-[11px]">Pot:</span>
          <span className="font-mono font-bold text-emerald-400">{pocketedCount}</span>
        </div>

        {/* Position */}
        <div
          className="flex items-center gap-1 cursor-pointer hover:opacity-80"
          onClick={() => setPositionCount((c) => c + 1)}
          title="Click to add position zone hit"
        >
          <Crosshair className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-slate-400 text-[11px]">Pos:</span>
          <span className="font-mono font-bold text-sky-400">{positionCount}</span>
        </div>

        {/* Scratch */}
        <div
          className="flex items-center gap-1 cursor-pointer hover:opacity-80"
          onClick={() => setScratchCount((c) => c + 1)}
          title="Click to add scratch"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-slate-400 text-[11px]">Scratch:</span>
          <span className="font-mono font-bold text-rose-400">{scratchCount}</span>
        </div>
      </div>
    </div>
  );
};
