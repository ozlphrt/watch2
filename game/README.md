# Watch Matching Game V0.1

A 3D matching game featuring Greek letters on colored cubes falling onto a watch face.

## Features

- **Greek Letters**: 10 different Greek letters (α, β, γ, δ, ε, ζ, η, θ, ι, κ)
- **Color Matching**: Three colors (red, blue, yellow)
- **Physics Simulation**: Realistic physics using Rapier.js
- **Rounded Cubes**: Smooth, rounded edges and corners
- **Highlighting**: Selected cubes glow with colored light
- **Pair Matching**: Match pairs of same letter and color
- **Animated Watch**: Real-time watch arms showing current time
- **Debug Panel**: Press 'H' to toggle debug controls

## Setup

```bash
npm install
npm run dev:game
```

The game will be available at `http://localhost:3001/`

## How to Play

1. Click on cubes to select them (up to 2 at a time)
2. Match pairs with the same Greek letter and color
3. When matched, cubes will attract to each other and disappear
4. Score points by matching pairs

## Controls

- **Mouse Click**: Select/deselect cubes
- **Orbit Controls**: 
  - Left drag: Rotate camera
  - Right drag: Pan
  - Scroll: Zoom
- **H Key**: Toggle debug panel

## Technical Details

- **Framework**: Three.js for 3D rendering
- **Physics**: Rapier.js for physics simulation
- **Build Tool**: Vite
- **UI**: lil-gui for debug panel

## Version History

### V0.1 (2024-12-19)
- Initial release
- Greek letter matching game
- Physics-based cube interactions
- Highlighting and selection system
- Watch face with animated arms

