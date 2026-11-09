import React, { useState } from 'react';
import { Drill } from '../physics/types';
import drillsData from '../data/drills.json';
import { BookOpen, X, Play, Filter, Download, Upload, Check, Printer } from 'lucide-react';

interface DrillLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDrill: (drill: Drill) => void;
  onOpenPrintable: (drill: Drill) => void;
}

export const DrillLibraryModal: React.FC<DrillLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectDrill,
  onOpenPrintable,
}) => {
  const [selectedGame, setSelectedGame] = useState<'9-Ball' | '10-Ball'>('9-Ball');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const drills: Drill[] = drillsData as Drill[];

  const filteredDrills = drills.filter((d) => {
    if (d.game !== selectedGame) return false;
    if (selectedDifficulty !== 'ALL' && d.difficulty !== selectedDifficulty) return false;
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Pattern Puzzles Drill Library
              </h2>
              <p className="text-xs text-slate-400">
                Extracted directly from your 9-Ball & 10-Ball drill books (50 total racks)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-slate-800 bg-slate-900/40 text-xs">
          {/* Game Type Tabs */}
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            <button
              onClick={() => setSelectedGame('9-Ball')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                selectedGame === '9-Ball'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              9-Ball (25 Racks)
            </button>
            <button
              onClick={() => setSelectedGame('10-Ball')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                selectedGame === '10-Ball'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              10-Ball (25 Racks)
            </button>
          </div>

          {/* Difficulty Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-[11px]">Level:</span>
            {['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((diff) => (
              <button
                key={diff}
                onClick={() => setSelectedDifficulty(diff)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  selectedDifficulty === diff
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-800/40'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        {/* Drills Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredDrills.map((drill) => (
            <div
              key={drill.id}
              className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3.5 transition flex flex-col justify-between space-y-2.5 hover:shadow-lg group"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 text-slate-200">
                      R{drill.rack_num}
                    </span>
                    <h3 className="font-bold text-slate-100 text-sm">{drill.name}</h3>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                      drill.difficulty === 'BEGINNER'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : drill.difficulty === 'INTERMEDIATE'
                        ? 'bg-sky-950 text-sky-300 border border-sky-800'
                        : 'bg-purple-950 text-purple-300 border border-purple-800'
                    }`}
                  >
                    {drill.difficulty}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-tight mb-2">
                  {drill.goal}
                </p>

                {/* Drill Metadata Badges */}
                <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
                  {drill.ball_in_hand && (
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-amber-300">
                      BIH: Row {drill.ball_in_hand.row}, Col {drill.ball_in_hand.col}
                    </span>
                  )}
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {drill.balls.length} Balls
                  </span>
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                    {drill.pass_mark}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => {
                    onSelectDrill(drill);
                    onClose();
                  }}
                  className="flex-1 py-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Setup on Table</span>
                </button>

                <button
                  onClick={() => onOpenPrintable(drill)}
                  className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1 border border-slate-700 transition"
                  title="View real-table diamond setup coordinates"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Diamond Setup</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
