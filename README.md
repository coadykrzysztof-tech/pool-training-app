# CueCraft Pro — Tangent Line & Position Trainer

An interactive billiards training application designed for Mac mini M4, tailored for recreational league players to understand tangent lines, cue-ball paths, and position play.

## Quick Launch Instructions

From this project directory (`/Users/coady/code/Pool Training App`):

```bash
# Start the local development server:
npm run dev
```

Then open your browser to **`http://localhost:3000`** (or click the link displayed in your terminal).

To run a production preview:
```bash
npm run preview
```

---

## Stage 1 Features Implemented

### 1. Interactive Table & Layouts
- **Accurate 2:1 Proportions**: Supports regulation 9ft (100" × 50"), 8ft (88" × 44"), and 7ft league tables (78" × 39") with balls scaled accurately to table dimensions.
- **Draggable Balls with Anti-Collision**: Drag any ball anywhere within the playing surface; balls automatically prevent overlapping on placement.
- **Pattern Puzzles Coordinate Grid**: Full 1–50 column × A–Z row diamond coordinate system matching the *9-Ball* and *10-Ball Pattern Puzzles* drill books.
- **Ball Management Shelf**: 1-click addition, numbering (1–10), and removal of balls.
- **Shot Reset & Repeat**: Instant snapshot restore to test subtle variable changes.

### 2. Shot Controls & Cue Tip Diagram
- **Aiming**: Rotate cue stick by clicking/dragging on the table, using the fine degree slider, or using quick step buttons (`-2°`, `-0.2°`, `+0.2°`, `+2°`).
- **Stroke Power**: 1 to 10 power scale matching the drill books (Power 2 Soft, Power 4 Medium, Power 6 Firm, Power 8 Strong, Power 10 Break), with dual m/s and mph readouts.
- **2D Cue Tip Contact Diagram**: Drag or click the chalk contact point to select High/Follow, Low/Draw, Left English, Right English, or Center/Stun.
- **Miscue Boundary Warning**: Visual chalk safety limit at 0.65R prevents illegal miscue selections.
- **Squirt Angle Modeling**: Displays cue squirt deflection angle (e.g. `Squirt: -1.2° Left Deflection`).
- **Cue Elevation**: Advanced 0° to 45° slider for massé and swerve mechanics.
- **Slow-Motion & Playback Scrubber**: 0.2x, 0.5x, and 1.0x real-time playback with pause and frame step.

### 3. Tangent-Line Instruction & Dynamic Spin Tracking
- **The 90° Stun Tangent Line**: Displays the perpendicular tangent line at ball impact with 90° symbol and direction arrows.
- **Line of Centers**: Target line from ghost ball through object ball into pocket with cut angle readout.
- **Ghost Ball Overlay**: Translucent ghost ball at point of contact.
- **Dynamic Slide-to-Roll Tracking**: Explains why a center-ball hit is only a stun shot at short range; as it travels across the table, cloth friction ($\mu_s = 0.20$) transforms sliding into forward roll ($d_{roll} = \frac{12 v_0^2}{49 \mu_s g}$)!
- **Impact State Detector**: Live banner categorizes contact as:
  - `TRUE STUN (SLIDING)`: Cue ball tracks 90° tangent line.
  - `NATURAL ROLL`: Curves forward off tangent line (~30° rule).
  - `DRAW (BACKSPIN)`: Bites cloth and draws backward off tangent line.
  - `FOLLOW (TOPSPIN)`: Drives forward off tangent line.

### 4. Pattern Puzzles Drill Library (50 Racks Preloaded)
- **All 25 9-Ball Racks & All 25 10-Ball Racks**: Extracted directly from your PDF drill books with 100% coordinate accuracy.
- **Metadata**: Difficulty (Beginner, Intermediate, Advanced), Goal, Pass Mark, Ball-in-Hand starting location, and official author run sequence.
- **Printable Real-Table Diamond Sheet**: 1-click conversion to physical diamond numbers (0–8 long rail, 0–4 short rail) and inches from cushions for setting up on your physical table.
- **Real-Table Attempt Logging**: Log balls run, pass/fail, and shot notes.

### 5. ADHD-Friendly Design
- **Colorful but Uncluttered**: High-contrast slate and electric tournament blue felt.
- **5-Minute Practice Session Timer**: Focused practice timer with quick pot, position zone, and scratch tally counters.
- **Instant Audio Feedback**: Synthesized pool ball clicks, cushion thuds, pocket drops, and celebration chime (Web Audio API, zero audio asset downloads needed).

### 6. Automated Physics Validation Suite
- Verified Stop Shot (0° cut, pure stun).
- Verified 90.0° Separation Angle (tangent line rule).
- Verified Cloth Sliding-to-Rolling analytical transition distance.
- Disclosures of 2D cushion approximations vs 3D physical table factors.

---

## Keyboard Shortcuts
- **Space**: Shoot / Play / Pause
- **R**: Reset shot to pre-stroke positions
- **T**: Repeat identical shot
