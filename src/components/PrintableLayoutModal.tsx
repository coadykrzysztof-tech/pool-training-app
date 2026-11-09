import React, { useState } from 'react';
import { Drill, TableConfig } from '../physics/types';
import { X, Printer, CheckCircle, Save } from 'lucide-react';

interface PrintableLayoutModalProps {
  drill: Drill | null;
  config: TableConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaveRealTableAttempt?: (record: {
    drillId: string;
    date: string;
    ballsRun: number;
    passed: boolean;
    notes: string;
  }) => void;
}

export const PrintableLayoutModal: React.FC<PrintableLayoutModalProps> = ({
  drill,
  config,
  isOpen,
  onClose,
  onSaveRealTableAttempt,
}) => {
  const [ballsRun, setBallsRun] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!isOpen || !drill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleSaveLog = () => {
    if (onSaveRealTableAttempt) {
      onSaveRealTableAttempt({
        drillId: drill.id,
        date: new Date().toLocaleDateString(),
        ballsRun,
        passed: ballsRun === drill.balls.length,
        notes,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none print:max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/80 print:bg-white print:border-black">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 print:bg-gray-200 print:text-black">
                R{drill.rack_num}
              </span>
              <h2 className="text-base font-bold text-slate-100 print:text-black">
                {drill.name} — Real Table Setup & Diamond Sheet
              </h2>
            </div>
            <p className="text-xs text-slate-400 print:text-gray-700">
              Table size: {config.name} ({config.lengthM * 39.37}” × {config.widthM * 39.37}”)
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="py-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 print:p-0">
          {/* Instructions Box */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1 print:bg-gray-50 print:border-gray-300 print:text-black">
            <div className="font-bold text-slate-100 print:text-black">Physical Table Setup:</div>
            <p>
              1. Use diamonds on rails to align string/cue stick or eye across opposite diamonds.
            </p>
            <p>
              2. Grid coordinate: Letter = Row (A to Z from top rail to bottom rail), Number = Column (1 to 50 from left rail to right rail).
            </p>
            {drill.ball_in_hand && (
              <p className="font-semibold text-amber-300 print:text-black">
                ★ Cue Ball-in-Hand Starting Location: Row {drill.ball_in_hand.row}, Column {drill.ball_in_hand.col}
              </p>
            )}
          </div>

          {/* Coordinate Setup Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden print:border-black">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 print:bg-gray-100 print:text-black font-semibold border-b border-slate-800 print:border-black">
                <tr>
                  <th className="py-2.5 px-3">Ball</th>
                  <th className="py-2.5 px-3">Book Grid</th>
                  <th className="py-2.5 px-3">Long Rail (0-8)</th>
                  <th className="py-2.5 px-3">Short Rail (0-4)</th>
                  <th className="py-2.5 px-3">Inches from Rails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-300">
                {drill.balls.map((b) => {
                  const xInches = ((b.col - 1) / 49) * (config.lengthM * 39.37);
                  const yInches = ((b.row_idx - 1) / 25) * (config.widthM * 39.37);
                  const longDiamond = (((b.col - 1) / 49) * 8).toFixed(1);
                  const shortDiamond = (((b.row_idx - 1) / 25) * 4).toFixed(1);

                  return (
                    <tr key={b.number} className="hover:bg-slate-800/40 print:hover:bg-transparent">
                      <td className="py-2 px-3 font-bold font-mono text-slate-200 print:text-black">
                        Ball {b.number}
                      </td>
                      <td className="py-2 px-3 font-mono text-amber-300 print:text-black">
                        Row {b.row}, Col {b.col}
                      </td>
                      <td className="py-2 px-3 font-mono text-sky-400 print:text-black">
                        Diamond {longDiamond}
                      </td>
                      <td className="py-2 px-3 font-mono text-sky-400 print:text-black">
                        Diamond {shortDiamond}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-400 print:text-black">
                        {xInches.toFixed(1)}” from left / {yInches.toFixed(1)}” from top
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quick Real-Table Logging Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 print:hidden">
            <h3 className="font-bold text-slate-200 text-xs">
              Quick Real-Table Attempt Logging
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Balls Run</label>
                <input
                  type="number"
                  min="0"
                  max={drill.balls.length}
                  value={ballsRun}
                  onChange={(e) => setBallsRun(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Notes / Cue Feel</label>
                <input
                  type="text"
                  placeholder="e.g. overhit follow on 3, table fast"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs"
                />
              </div>
            </div>

            <button
              onClick={handleSaveLog}
              className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedSuccess ? 'Saved Attempt!' : 'Save Real-Table Result'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
