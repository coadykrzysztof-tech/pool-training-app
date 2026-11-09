import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Ball,
  Drill,
  GhostBallInfo,
  ShotSettings,
  TableConfig,
  TrajectoryFrame,
} from './physics/types';
import {
  TABLE_CONFIG_7FT,
  TABLE_CONFIG_8FT,
  TABLE_CONFIG_9FT,
  powerToSpeed,
} from './physics/constants';
import { calculateAimGeometry } from './physics/geometry';
import { simulateShot, SimulationResult } from './physics/simulator';
import { gridToMeters } from './utils/coordinates';
import { soundFx } from './utils/audio';

import { TableCanvas } from './components/TableCanvas';
import { ShotControls } from './components/ShotControls';
import { CueBallDiagram } from './components/CueBallDiagram';
import { GuideToggles } from './components/GuideToggles';
import { DrillLibraryModal } from './components/DrillLibraryModal';
import { PrintableLayoutModal } from './components/PrintableLayoutModal';
import { PhysicsReportModal } from './components/PhysicsReportModal';
import { PracticeTimer } from './components/PracticeTimer';

import drillsData from './data/drills.json';
import {
  BookOpen,
  ShieldCheck,
  Volume2,
  VolumeX,
  PlusCircle,
  Trash2,
  Sparkles,
  Bookmark,
  Share2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const App: React.FC = () => {
  // Table configuration (7ft, 8ft, 9ft)
  const [config, setConfig] = useState<TableConfig>(TABLE_CONFIG_9FT);

  // Active balls on the table
  const [balls, setBalls] = useState<Ball[]>([]);
  // Previous snapshot to allow instant Reset / Repeat
  const [savedSnapshotBalls, setSavedSnapshotBalls] = useState<Ball[]>([]);

  // Active drill (if loaded)
  const [activeDrill, setActiveDrill] = useState<Drill | null>(null);
  const [targetBallId, setTargetBallId] = useState<number | null>(1);

  // Shot settings
  const [shot, setShot] = useState<ShotSettings>({
    angleRad: 0,
    speedMs: powerToSpeed(5), // Power 5 default
    tipOffsetX: 0,
    tipOffsetY: 0,
    elevationDeg: 0,
  });

  // Visual guide overlays
  const [guides, setGuides] = useState({
    showGhostBall: true,
    showLineOfCenters: true,
    showTangentLine: true,
    showPredictedPath: true,
    showGrid: true,
    showDiamonds: true,
    showPocketTargets: true,
  });

  // Simulation playback state
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.5); // 0.5x slow-mo default for learning
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Modals state
  const [isDrillModalOpen, setIsDrillModalOpen] = useState<boolean>(false);
  const [isPrintableModalOpen, setIsPrintableModalOpen] = useState<boolean>(false);
  const [printableDrill, setPrintableDrill] = useState<Drill | null>(null);
  const [isPhysicsModalOpen, setIsPhysicsModalOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Status notification pill
  const [notification, setNotification] = useState<string | null>(
    'Welcome! Drag cue stick to aim, or click Drill Library to load a Pattern Puzzle.'
  );

  // Load Rack 1 on initial mount
  useEffect(() => {
    const drills = drillsData as Drill[];
    if (drills.length > 0) {
      loadDrill(drills[0]);
    }
  }, []);

  // Compute live aim geometry whenever cue ball, balls, or shot angle change
  const cueBall = balls.find((b) => b.id === 0);
  const aimInfo: GhostBallInfo = cueBall
    ? calculateAimGeometry(cueBall, balls, shot, config)
    : {
        hitTarget: false,
        targetBallId: null,
        targetBallPos: null,
        ghostBallPos: null,
        impactDistance: 0,
        cutAngleRad: 0,
        cutAngleDeg: 0,
        isCutToRight: false,
        lineOfCenters: { x: 0, y: 0 },
        tangentLine: { x: 0, y: 0 },
        objectBallVelocity: { x: 0, y: 0 },
        cueBallTangentVelocity: { x: 0, y: 0 },
        spinStateAtImpact: 'natural_roll',
        cueCurveDirection: 'forward',
        predictedRestPos: null,
      };

  // Synchronize targetBallId with aimInfo if aim locks onto a ball
  useEffect(() => {
    if (aimInfo.hitTarget && aimInfo.targetBallId !== null) {
      setTargetBallId(aimInfo.targetBallId);
    }
  }, [aimInfo.hitTarget, aimInfo.targetBallId]);

  // Load a drill into playable table layout
  const loadDrill = useCallback(
    (drill: Drill) => {
      setActiveDrill(drill);
      setTargetBallId(1);

      const R = config.ballRadiusM;
      const m = config.ballMassKg;

      const newBalls: Ball[] = [];

      // 1. Cue Ball in hand position
      let cbX = config.lengthM * 0.25;
      let cbY = config.widthM * 0.5;
      if (drill.ball_in_hand) {
        const pt = gridToMeters(drill.ball_in_hand.col, drill.ball_in_hand.row, config);
        cbX = pt.x;
        cbY = pt.y;
      }

      newBalls.push({
        id: 0,
        x: cbX,
        y: cbY,
        vx: 0,
        vy: 0,
        omegaX: 0,
        omegaY: 0,
        omegaZ: 0,
        radius: R,
        mass: m,
        isPocketed: false,
        state: 'at_rest',
      });

      // 2. Object balls from drill
      drill.balls.forEach((b) => {
        const pt = gridToMeters(b.col, b.row, config);
        newBalls.push({
          id: b.number,
          x: pt.x,
          y: pt.y,
          vx: 0,
          vy: 0,
          omegaX: 0,
          omegaY: 0,
          omegaZ: 0,
          radius: R,
          mass: m,
          isPocketed: false,
          state: 'at_rest',
        });
      });

      // Aim toward ball 1 automatically
      const ball1 = newBalls.find((b) => b.id === 1);
      if (ball1) {
        const angle = Math.atan2(ball1.y - cbY, ball1.x - cbX);
        setShot((prev) => ({
          ...prev,
          angleRad: angle,
          speedMs: drill.run && drill.run[0] ? powerToSpeed(drill.run[0].power) : powerToSpeed(5),
          tipOffsetX: 0,
          tipOffsetY: 0,
        }));
      }

      setBalls(newBalls);
      setSavedSnapshotBalls(newBalls.map((b) => ({ ...b })));
      setIsSimulating(false);
      setSimResult(null);

      showNotification(`Loaded ${drill.name} (${drill.difficulty}) · Target Ball 1`);
    },
    [config]
  );

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  // Ball position adjustment from drag
  const handleBallMove = (ballId: number, newX: number, newY: number) => {
    setBalls((prev) =>
      prev.map((b) => (b.id === ballId ? { ...b, x: newX, y: newY } : b))
    );
  };

  // Add ball
  const handleAddBall = (number: number) => {
    if (balls.some((b) => b.id === number)) {
      showNotification(`Ball ${number} is already on the table.`);
      return;
    }
    const R = config.ballRadiusM;
    const newBall: Ball = {
      id: number,
      x: config.lengthM * 0.5 + (Math.random() - 0.5) * 0.2,
      y: config.widthM * 0.5 + (Math.random() - 0.5) * 0.2,
      vx: 0,
      vy: 0,
      omegaX: 0,
      omegaY: 0,
      omegaZ: 0,
      radius: R,
      mass: config.ballMassKg,
      isPocketed: false,
      state: 'at_rest',
    };
    setBalls((prev) => [...prev, newBall]);
  };

  // Remove ball
  const handleRemoveBall = (ballId: number) => {
    if (ballId === 0) {
      showNotification('Cannot remove the cue ball.');
      return;
    }
    setBalls((prev) => prev.filter((b) => b.id !== ballId));
  };

  // Execute Simulation
  const handleExecuteShot = () => {
    if (isSimulating || !cueBall || cueBall.isPocketed) return;

    // Snapshot before shot for reset
    setSavedSnapshotBalls(balls.map((b) => ({ ...b })));

    soundFx.playBallHit(shot.speedMs / 5);

    const result = simulateShot(balls, shot, config, targetBallId);
    setSimResult(result);
    setIsSimulating(true);
    setCurrentFrameIndex(0);
    setIsPaused(false);
    lastTickTimeRef.current = performance.now();

    // Start 60 FPS animation loop
    const animate = (now: number) => {
      const elapsed = (now - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = now;

      setCurrentFrameIndex((prevIndex) => {
        if (!result.frames || result.frames.length === 0) return prevIndex;

        // Advance frames scaled by playbackSpeed
        const advance = Math.max(1, Math.round(playbackSpeed * elapsed * 60));
        const nextIndex = prevIndex + advance;

        if (nextIndex >= result.frames.length - 1) {
          // Simulation complete
          setIsSimulating(false);
          // Update live balls to resting end state
          const lastFrame = result.frames[result.frames.length - 1];
          setBalls((prevBalls) =>
            prevBalls.map((pb) => {
              const matched = lastFrame.balls.find((fb) => fb.id === pb.id);
              return matched ? { ...pb, x: matched.x, y: matched.y, isPocketed: matched.isPocketed } : pb;
            })
          );

          // Evaluation feedback
          if (result.cueBallPocketed) {
            soundFx.playPocketDrop();
            // Grant Ball in Hand: return cue ball to playable surface so player is never stuck
            setBalls((prevBalls) =>
              prevBalls.map((pb) => {
                if (pb.id === 0) {
                  const bih = activeDrill?.ball_in_hand;
                  const pt = bih
                    ? gridToMeters(bih.col, bih.row, config)
                    : { x: config.lengthM * 0.25, y: config.widthM * 0.5 };
                  return {
                    ...pb,
                    x: pt.x,
                    y: pt.y,
                    vx: 0,
                    vy: 0,
                    isPocketed: false,
                  };
                }
                return pb;
              })
            );
            showNotification('Scratch! Cue ball returned to table (Ball in Hand).');
          } else if (result.objectBallPocketed) {
            soundFx.playPocketDrop();
            confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } });
            showNotification(`Great shot! Object Ball ${result.targetBallId} pocketed.`);
          } else if (result.separationAngleDeg) {
            showNotification(
              `Stun test: Separation angle was ${result.separationAngleDeg.toFixed(1)}° (Tangent line: 90.0°)`
            );
          }
          return result.frames.length - 1;
        }

        return nextIndex;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  // Cancel animation on unmount or reset
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Reset shot
  const handleResetShot = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsSimulating(false);
    setSimResult(null);
    if (savedSnapshotBalls.length > 0) {
      setBalls(savedSnapshotBalls.map((b) => ({ ...b, isPocketed: b.id === 0 ? false : b.isPocketed })));
      soundFx.playCushionHit();
      showNotification('Shot reset to starting position.');
    }
  };

  // Repeat shot with adjustment
  const handleRepeatShot = () => {
    handleResetShot();
    setTimeout(() => {
      handleExecuteShot();
    }, 150);
  };

  // Keyboard Shortcuts (Space: shoot, R: reset, T: repeat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isSimulating) {
          setIsPaused((p) => !p);
        } else {
          handleExecuteShot();
        }
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleResetShot();
      } else if (e.code === 'KeyT') {
        e.preventDefault();
        handleRepeatShot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSimulating, shot, balls]);

  const currentFrame: TrajectoryFrame | null =
    isSimulating && simResult && simResult.frames[currentFrameIndex]
      ? simResult.frames[currentFrameIndex]
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-black text-white text-sm shadow-md shadow-sky-500/20">
            90°
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-2">
              CueCraft Pro
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800/80">
                Stage 1 Validated
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Tangent Line & Position Trainer</p>
          </div>
        </div>

        {/* 5-Minute Practice Session Timer (ADHD mode) */}
        <div className="hidden lg:flex items-center">
          <PracticeTimer
            onSessionComplete={() => {
              showNotification('5-minute practice session complete! Outstanding focus.');
            }}
          />
        </div>

        {/* Table Size & Drill Library Actions */}
        <div className="flex items-center gap-2">
          {/* Table Size Selector */}
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            {([7, 8, 9] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => {
                  const newCfg =
                    sz === 7 ? TABLE_CONFIG_7FT : sz === 8 ? TABLE_CONFIG_8FT : TABLE_CONFIG_9FT;
                  setConfig(newCfg);
                  showNotification(`Switched to ${newCfg.name}`);
                }}
                className={`px-2.5 py-1 rounded font-semibold transition ${
                  config.sizeFt === sz
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sz}ft
              </button>
            ))}
          </div>

          {/* Drill Library Modal Trigger */}
          <button
            onClick={() => setIsDrillModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition active:scale-95 shadow"
          >
            <BookOpen className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">Drills (50)</span>
          </button>

          {/* Printable Layout Trigger */}
          {activeDrill && (
            <button
              onClick={() => {
                setPrintableDrill(activeDrill);
                setIsPrintableModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition"
              title="Print real-table diamond setup"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Print Setup</span>
            </button>
          )}

          {/* Physics & Validation Report Trigger */}
          <button
            onClick={() => setIsPhysicsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/80 text-xs font-semibold transition"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Physics Verified</span>
          </button>

          {/* Mute Button */}
          <button
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              soundFx.setMuted(next);
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Floating Notification Pill */}
      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-sky-500/40 text-sky-200 px-4 py-2 rounded-full shadow-2xl text-xs font-medium flex items-center gap-2 animate-fadeIn backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main Table & Controls Layout */}
      <main className="flex-1 flex flex-col xl:flex-row gap-3 p-3 overflow-hidden">
        {/* Left Side: Tip Contact & Guides Panel */}
        <div className="w-full xl:w-72 flex flex-col gap-3 flex-shrink-0">
          <CueBallDiagram
            shot={shot}
            onShotChange={(updated) => setShot((prev) => ({ ...prev, ...updated }))}
            squirtFactor={config.squirtFactor}
          />

          <GuideToggles
            aimInfo={aimInfo}
            guides={guides}
            onToggleGuide={(k) => setGuides((prev) => ({ ...prev, [k]: !prev[k] }))}
          />
        </div>

        {/* Center: Interactive Table Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[460px] bg-slate-950/60 border border-slate-900 rounded-2xl p-2 relative shadow-inner">
          {/* Active Drill Title Bar */}
          {activeDrill && (
            <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-xs z-10 pointer-events-none">
              <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-sky-400">R{activeDrill.rack_num}</span>
                <span className="font-bold text-slate-200">{activeDrill.name}</span>
                <span className="text-[10px] text-slate-400">({activeDrill.difficulty})</span>
              </div>

              {activeDrill.run && activeDrill.run.length > 0 && (
                <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-800 text-[11px] text-amber-300 font-mono">
                  Recommended: {activeDrill.run[0].ball} → {activeDrill.run[0].pocket} (Pwr {activeDrill.run[0].power})
                </div>
              )}
            </div>
          )}

          <TableCanvas
            config={config}
            balls={balls}
            shot={shot}
            aimInfo={aimInfo}
            isSimulating={isSimulating}
            currentFrame={currentFrame}
            guides={guides}
            onAimAngleChange={(angle) => setShot((prev) => ({ ...prev, angleRad: angle }))}
            onBallMove={handleBallMove}
            onAddBall={(num, x, y) => handleAddBall(num)}
            onRemoveBall={handleRemoveBall}
            targetBallId={targetBallId}
            onSelectTargetBall={(id) => setTargetBallId(id)}
          />

          {/* Quick Ball Tool Shelf at bottom of canvas */}
          <div className="flex items-center gap-1.5 mt-2 bg-slate-900/70 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs">
            <button
              onClick={() => {
                const bih = activeDrill?.ball_in_hand;
                const pt = bih
                  ? gridToMeters(bih.col, bih.row, config)
                  : { x: config.lengthM * 0.25, y: config.widthM * 0.5 };
                setBalls((prev) =>
                  prev.map((b) => (b.id === 0 ? { ...b, x: pt.x, y: pt.y, isPocketed: false, vx: 0, vy: 0 } : b))
                );
                showNotification('Cue Ball placed in hand (drag to position).');
              }}
              className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition mr-2"
              title="Return Cue Ball to table with Ball in Hand"
            >
              ⚪ Ball in Hand
            </button>
            <span className="text-slate-400 text-[11px] mr-1">Balls on table:</span>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const isOnTable = balls.some((b) => b.id === n);
              return (
                <button
                  key={n}
                  onClick={() => (isOnTable ? handleRemoveBall(n) : handleAddBall(n))}
                  className={`w-6 h-6 rounded-full font-mono text-[11px] font-bold transition flex items-center justify-center ${
                    isOnTable
                      ? 'bg-sky-600 text-white shadow'
                      : 'bg-slate-800 text-slate-500 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                  title={isOnTable ? `Click to remove Ball ${n}` : `Click to add Ball ${n}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Stroke & Playback Controls Panel */}
        <div className="w-full xl:w-72 flex flex-col gap-3 flex-shrink-0">
          <ShotControls
            shot={shot}
            onShotChange={(updated) => setShot((prev) => ({ ...prev, ...updated }))}
            isSimulating={isSimulating}
            onExecuteShot={handleExecuteShot}
            onResetShot={handleResetShot}
            onRepeatShot={handleRepeatShot}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            isPaused={isPaused}
            onTogglePause={() => setIsPaused((p) => !p)}
            onStepForward={() => setCurrentFrameIndex((i) => i + 1)}
          />

          {/* ADHD Quick Rule Reminder Box */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow text-xs space-y-2">
            <h4 className="font-bold text-sky-400 text-xs flex items-center gap-1.5">
              <span>★</span> The 90° Rule Cheat Sheet
            </h4>
            <div className="space-y-1.5 text-[11px] text-slate-300 leading-tight">
              <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="font-bold text-cyan-300">Stun (90°):</span> No forward or backward roll at impact. Cue ball tracks pure tangent line!
              </div>
              <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="font-bold text-emerald-300">Natural Roll (~30°):</span> Struck center/top over distance. Curves forward off tangent line.
              </div>
              <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="font-bold text-amber-300">Draw:</span> Backspin bites into cloth. Pulls backward off tangent line.
              </div>
            </div>
            <p className="text-[10px] text-slate-500 italic">
              Shortcut: Space = Shoot/Pause · R = Reset · T = Repeat
            </p>
          </div>
        </div>
      </main>

      {/* Drill Library Modal */}
      <DrillLibraryModal
        isOpen={isDrillModalOpen}
        onClose={() => setIsDrillModalOpen(false)}
        onSelectDrill={loadDrill}
        onOpenPrintable={(d) => {
          setPrintableDrill(d);
          setIsPrintableModalOpen(true);
        }}
      />

      {/* Printable / Diamond Setup Modal */}
      <PrintableLayoutModal
        drill={printableDrill}
        config={config}
        isOpen={isPrintableModalOpen}
        onClose={() => setIsPrintableModalOpen(false)}
      />

      {/* Physics & Validation Modal */}
      <PhysicsReportModal
        isOpen={isPhysicsModalOpen}
        onClose={() => setIsPhysicsModalOpen(false)}
        config={config}
        onUpdateConfig={(upd) => setConfig((prev) => ({ ...prev, ...upd }))}
      />
    </div>
  );
};

export default App;
