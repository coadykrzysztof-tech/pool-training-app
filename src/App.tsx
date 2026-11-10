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
import { analyzeShotAndCoach } from './physics/coach';
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
import { CoachFeedback, CoachingAdvice } from './components/CoachFeedback';

import drillsData from './data/drills.json';
import {
  BookOpen,
  ShieldCheck,
  Volume2,
  VolumeX,
  Sparkles,
  Bookmark,
  Lightbulb,
  RotateCw,
  Play,
  RotateCcw,
  Repeat,
  Compass,
} from 'lucide-react';

export const App: React.FC = () => {
  // Table configuration: defaults to 7ft league table
  const [config, setConfig] = useState<TableConfig>(() => {
    const saved = localStorage.getItem('cuecraft_table_size');
    if (saved === '9') return TABLE_CONFIG_9FT;
    if (saved === '8') return TABLE_CONFIG_8FT;
    return TABLE_CONFIG_7FT;
  });

  // Active balls on the table
  const [balls, setBalls] = useState<Ball[]>([]);
  // Previous snapshot to allow instant Reset / Repeat
  const [savedSnapshotBalls, setSavedSnapshotBalls] = useState<Ball[]>([]);

  // Active drill (if loaded)
  const [activeDrill, setActiveDrill] = useState<Drill | null>(null);
  const [targetBallId, setTargetBallId] = useState<number | null>(1);
  const [selectedPocketId, setSelectedPocketId] = useState<string | null>(null);

  // Table View Rotation (0, 90, 180, 270) & Auto "Shoot Away" orientation
  const [tableRotationDeg, setTableRotationDeg] = useState<number>(() => {
    const saved = localStorage.getItem('cuecraft_rotation');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [autoShootAway, setAutoShootAway] = useState<boolean>(true);

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
  const isPausedRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(0.5);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Coach Feedback state
  const [coachingAdvice, setCoachingAdvice] = useState<CoachingAdvice | null>(null);

  // Modals state
  const [isDrillModalOpen, setIsDrillModalOpen] = useState<boolean>(false);
  const [isPrintableModalOpen, setIsPrintableModalOpen] = useState<boolean>(false);
  const [printableDrill, setPrintableDrill] = useState<Drill | null>(null);
  const [isPhysicsModalOpen, setIsPhysicsModalOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Status notification pill
  const [notification, setNotification] = useState<string | null>(
    'Welcome! 7-Foot League Table active · Shoot Away auto-orientation enabled.'
  );

  // Auto-Orient to always shoot away from player (upwards into table)
  useEffect(() => {
    if (!autoShootAway) return;
    const sinAngle = Math.sin(shot.angleRad);
    if (sinAngle > 0.08 && tableRotationDeg !== 180) {
      setTableRotationDeg(180);
    } else if (sinAngle < -0.08 && tableRotationDeg !== 0) {
      setTableRotationDeg(0);
    }
  }, [shot.angleRad, autoShootAway, tableRotationDeg]);

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
        aimedPocketId: null,
        aimedPocketAngleErrDeg: null,
      };

  // Synchronize targetBallId with aimInfo if aim locks onto a ball
  useEffect(() => {
    if (aimInfo.hitTarget && aimInfo.targetBallId !== null) {
      setTargetBallId(aimInfo.targetBallId);
    }
  }, [aimInfo.hitTarget, aimInfo.targetBallId]);

  // Drill author's step for the active target ball
  const activeRunStep = activeDrill?.run?.find((s) => s.ball === targetBallId) || null;
  const bookPocketId = activeRunStep?.pocket || null;

  // Dynamically determine effective target pocket:
  // Priority: 1. User manual selection -> 2. Raycast cut aim direction -> 3. Drill book default -> 4. 'P5'
  const effectivePocketId = selectedPocketId || aimInfo.aimedPocketId || bookPocketId || 'P5';

  // Table Size Switching with proportional ball repositioning
  const handleTableSizeChange = (newSize: 7 | 8 | 9) => {
    const newCfg = newSize === 7 ? TABLE_CONFIG_7FT : newSize === 8 ? TABLE_CONFIG_8FT : TABLE_CONFIG_9FT;
    const ratioX = newCfg.lengthM / config.lengthM;
    const ratioY = newCfg.widthM / config.widthM;

    setConfig(newCfg);
    localStorage.setItem('cuecraft_table_size', newSize.toString());

    setBalls((prev) =>
      prev.map((b) => ({
        ...b,
        x: b.x * ratioX,
        y: b.y * ratioY,
        radius: newCfg.ballRadiusM,
        mass: newCfg.ballMassKg,
      }))
    );
    showNotification(`Switched to ${newCfg.name}`);
  };

  // Load a drill into playable table layout
  const loadDrill = useCallback(
    (drill: Drill) => {
      setActiveDrill(drill);
      setTargetBallId(1);
      setSelectedPocketId(null);
      setCoachingAdvice(null);

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

  // Request Coaching Analysis on Demand
  const handleAskCoach = () => {
    if (!cueBall || targetBallId === null) return;
    const targetB = balls.find((b) => b.id === targetBallId) || null;
    if (!targetB) return;
    const simulated = simulateShot(balls, shot, config, targetBallId);
    const advice = analyzeShotAndCoach(
      cueBall,
      targetB,
      shot,
      simulated,
      activeDrill,
      config,
      balls,
      effectivePocketId
    );
    setCoachingAdvice(advice);
  };

  // Execute Simulation
  const handleExecuteShot = () => {
    if (isSimulating || !cueBall || cueBall.isPocketed) return;

    // Snapshot before shot for reset
    setSavedSnapshotBalls(balls.map((b) => ({ ...b })));
    setCoachingAdvice(null);

    soundFx.playBallHit(shot.speedMs / 5);

    const result = simulateShot(balls, shot, config, targetBallId);
    setSimResult(result);
    setIsSimulating(true);
    setCurrentFrameIndex(0);
    setIsPaused(false);
    lastTickTimeRef.current = performance.now();

    const totalFrames = result.frames.length;
    let frameIdx = 0;

    // Start 60 FPS animation loop
    const animate = (now: number) => {
      if (isPausedRef.current) {
        lastTickTimeRef.current = now;
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const elapsed = (now - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = now;

      // Advance frames scaled by playbackSpeed
      const advance = Math.max(1, Math.round(playbackSpeedRef.current * elapsed * 60));
      frameIdx += advance;

      if (frameIdx >= totalFrames - 1) {
        // Simulation complete - STOP ANIMATION LOOP IMMEDIATELY
        frameIdx = totalFrames - 1;
        setCurrentFrameIndex(frameIdx);
        setIsSimulating(false);
        animFrameRef.current = null; // Do NOT request another frame!

        // Update live balls to resting end state
        const lastFrame = result.frames[totalFrames - 1];
        setBalls((prevBalls) =>
          prevBalls.map((pb) => {
            const matched = lastFrame.balls.find((fb) => fb.id === pb.id);
            return matched ? { ...pb, x: matched.x, y: matched.y, isPocketed: matched.isPocketed } : pb;
          })
        );

        // Evaluation & Coaching logic
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

          // Trigger Coach advice for scratch
          const targetB = balls.find((b) => b.id === targetBallId) || null;
          const advice = analyzeShotAndCoach(
            cueBall,
            targetB,
            shot,
            result,
            activeDrill,
            config,
            balls,
            effectivePocketId
          );
          setCoachingAdvice(advice);
        } else if (result.objectBallPocketed) {
          soundFx.playPocketDrop();
          showNotification(`Ball ${result.targetBallId} pocketed in ${effectivePocketId}!`);

          // Evaluate position leave
          const targetB = balls.find((b) => b.id === targetBallId) || null;
          const advice = analyzeShotAndCoach(
            cueBall,
            targetB,
            shot,
            result,
            activeDrill,
            config,
            balls,
            effectivePocketId
          );
          if (advice && advice.shotOutcome === 'pocketed_bad_leave') {
            setCoachingAdvice(advice);
          }

          // Advance to the NEXT ball on the table automatically
          const remaining = balls
            .filter((b) => b.id > 0 && !b.isPocketed && b.id !== result.targetBallId)
            .sort((a, b) => a.id - b.id);

          if (remaining.length > 0) {
            const nextBall = remaining[0];
            setTargetBallId(nextBall.id);
            setSelectedPocketId(null); // allow auto-detection for next shot

            // Aim cue stick toward the next ball from cue ball's new position
            const finalCue = result.finalCuePos;
            const nextAngle = Math.atan2(nextBall.y - finalCue.y, nextBall.x - finalCue.x);
            setShot((prev) => ({
              ...prev,
              angleRad: nextAngle,
              tipOffsetX: 0,
              tipOffsetY: 0,
            }));
          }
        } else {
          // Missed shot! Provide Coach guidance on aim, tip, and power
          const targetB = balls.find((b) => b.id === targetBallId) || null;
          const advice = analyzeShotAndCoach(
            cueBall,
            targetB,
            shot,
            result,
            activeDrill,
            config,
            balls,
            effectivePocketId
          );
          setCoachingAdvice(advice);
          showNotification(`Shot missed ${effectivePocketId}. See Shot Coach analysis.`);
        }

        return; // Complete exit from animation loop
      }

      setCurrentFrameIndex(frameIdx);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  // Cancel animation on unmount or reset
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  // Reset shot
  const handleResetShot = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsSimulating(false);
    setIsPaused(false);
    setSimResult(null);
    setCurrentFrameIndex(0);
    setCoachingAdvice(null);
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

  // Keyboard Shortcuts (Space: shoot, R: reset, T: repeat, F: flip 180)
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
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        setTableRotationDeg((curr) => (curr === 180 ? 0 : 180));
        setAutoShootAway(false);
        showNotification('Table rotated 180° (F)');
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none max-w-[100vw] overflow-x-hidden">
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
                7ft League Ready
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
                onClick={() => handleTableSizeChange(sz)}
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

          {/* Ask Coach Button */}
          <button
            onClick={handleAskCoach}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/80 text-xs font-semibold transition"
            title={`Get coach advice for Ball ${targetBallId} into ${effectivePocketId}`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Coach Advice</span>
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
            <span className="hidden md:inline">Physics</span>
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
            targetDistance={aimInfo.impactDistance}
            targetBallNum={targetBallId}
            spinStateAtImpact={aimInfo.spinStateAtImpact}
          />

          <GuideToggles
            aimInfo={aimInfo}
            guides={guides}
            onToggleGuide={(k) => setGuides((prev) => ({ ...prev, [k]: !prev[k] }))}
          />
        </div>

        {/* Center: Interactive Table Canvas & Pinned Action Bar */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[460px] bg-slate-950/60 border border-slate-900 rounded-2xl p-2 relative shadow-inner">
          {/* Pinned Top Table Toolbar: Target, Quick Shoot, Reset, Rotation & Pockets */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 shadow mb-1.5 z-10">
            {/* Left: Active Target Information */}
            <div className="flex items-center gap-2 text-xs">
              {activeDrill && (
                <>
                  <span className="font-mono font-bold text-sky-400">R{activeDrill.rack_num}</span>
                  <span className="font-bold text-slate-200 hidden sm:inline">{activeDrill.name}</span>
                  <span className="text-slate-600">·</span>
                </>
              )}
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                Target: <span className="font-bold text-amber-300">Ball {targetBallId || 1}</span> →{' '}
                <span className="font-mono font-bold text-cyan-400">{effectivePocketId}</span>
              </span>
              {bookPocketId && effectivePocketId !== bookPocketId && (
                <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                  Book: {bookPocketId}
                </span>
              )}
            </div>

            {/* Center: Pinned Quick Shot Actions (Shoot, Reset, Repeat, Ball in Hand) */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExecuteShot}
                disabled={isSimulating}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs shadow-md transition active:scale-95 ${
                  isSimulating
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-700/30'
                }`}
                title="Shoot / Simulate (Shortcut: Space)"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Shoot</span>
              </button>

              <button
                onClick={handleResetShot}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition active:scale-95"
                title="Reset Shot (Shortcut: R)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              <button
                onClick={handleRepeatShot}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition active:scale-95"
                title="Repeat identical shot (Shortcut: T)"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Repeat</span>
              </button>
            </div>

            {/* Right: Table Rotation & Pockets */}
            <div className="flex items-center gap-1.5">
              {/* Shoot Away Auto-Orient Toggle */}
              <button
                onClick={() => setAutoShootAway((curr) => !curr)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${
                  autoShootAway
                    ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50 shadow-sm'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
                title="Automatically rotate table so you are always shooting away from yourself"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Shoot Away:</span>
                <span>{autoShootAway ? 'ON ⬆' : 'OFF'}</span>
              </button>

              {/* Flip 180° Button */}
              <button
                onClick={() => {
                  setTableRotationDeg((r) => (r === 180 ? 0 : 180));
                  setAutoShootAway(false);
                  showNotification('Table flipped 180°');
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${
                  tableRotationDeg === 180
                    ? 'bg-sky-600 text-white border-sky-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                }`}
                title="Flip table 180° (Shortcut: F)"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>180°</span>
              </button>

              {/* Portrait / Landscape 90° Button */}
              <button
                onClick={() => {
                  setTableRotationDeg((r) => (r === 90 ? 0 : 90));
                  setAutoShootAway(false);
                }}
                className={`px-1.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition ${
                  tableRotationDeg === 90
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title="Toggle Portrait / Landscape View"
              >
                90°
              </button>

              {/* Pocket Selectors (P1..P6) */}
              <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
                {(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const).map((pid) => (
                  <button
                    key={pid}
                    onClick={() => setSelectedPocketId(pid)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                      effectivePocketId === pid
                        ? 'bg-cyan-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={`Target Pocket ${pid}`}
                  >
                    {pid}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Coach Advice Floating Card */}
          {coachingAdvice && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-md w-full px-4 drop-shadow-2xl">
              <CoachFeedback
                advice={coachingAdvice}
                onApplyRecommended={(recShot) => {
                  setShot(recShot);
                  setCoachingAdvice(null);
                  showNotification(`Applied recommended aim & stroke for ${effectivePocketId}!`);
                }}
                onDismiss={() => setCoachingAdvice(null)}
                onRetry={() => {
                  handleResetShot();
                  setCoachingAdvice(null);
                }}
              />
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
            onAddBall={(num) => handleAddBall(num)}
            onRemoveBall={handleRemoveBall}
            targetBallId={targetBallId}
            onSelectTargetBall={(id) => setTargetBallId(id)}
            activeTargetPocketId={effectivePocketId}
            onSelectPocket={(pId) => {
              setSelectedPocketId(pId);
              showNotification(`Target pocket locked: ${pId}`);
            }}
            tableRotationDeg={tableRotationDeg}
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
                <span className="font-bold text-cyan-300">Stop / Stun (90°):</span> No forward or backward roll at impact. Cue ball tracks pure tangent line!
              </div>
              <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="font-bold text-emerald-300">Natural Roll (~30°):</span> Struck center/top over distance. Curves forward off tangent line.
              </div>
              <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="font-bold text-amber-300">Draw:</span> Backspin bites into cloth. Pulls backward off tangent line.
              </div>
            </div>
            <p className="text-[10px] text-slate-500 italic">
              Shortcut: Space = Shoot/Pause · R = Reset · T = Repeat · F = Flip 180°
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
