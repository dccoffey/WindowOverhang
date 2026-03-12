# Awning Solar Shading Simulator

A browser-based tool that helps homeowners and building professionals visualize and quantify how an awning or overhang above a window shades a room throughout the year.

## Features

- **3D Celestial Hemisphere + Room View** - Interactive Three.js visualization showing sun path arcs, a glowing sun sphere, compass rose, and a room with an analytically computed sunlight patch on the floor
- **2D Cross-Section Diagram** - SVG side-profile showing the wall, window, awning, sun ray angles, shadow zones, and dimension annotations
- **Interactive Controls** - Sliders for all dimensions, a draggable SVG compass dial for wall orientation (0-360 continuous), city presets, date/time controls, and glazing type selector
- **Real-Time Metrics** - Sun altitude/azimuth, HSA, VSA (profile angle), window shading percentage, floor penetration depth, effective SHGC, projection factor, and solar heat gain
- **Annual Performance Heatmap** - 12-month x 16-hour SVG grid showing shading percentages with color-coded cells and hover tooltips
- **Awning Sizing Recommendations** - Computes optimal awning depth for summer shade while preserving winter sun access
- **Methods & Sources Tab** - Full documentation of calculations, formulas, references, and assumptions for professional credibility

## How It Works

The simulator uses [SunCalc.js](https://github.com/mourner/suncalc) to compute the sun's position for any location, date, and time. It then applies standard building science geometry (Horizontal Shadow Angle, Vertical Shadow Angle / Profile Angle) to calculate how much of the window is shaded by the awning and how deep sunlight penetrates into the room.

The 3D visualization uses a celestial hemisphere model where the room sits at the center of a compass-aligned dome. Sun path arcs show the daily trajectory for the current date plus summer and winter solstice reference lines. The room rotates within the fixed dome when you change wall orientation.

## Technology Stack

| Component | Technology |
|-----------|------------|
| 3D Engine | Three.js r128 (CDN) |
| Solar Position | SunCalc.js 1.9.0 (CDN) |
| UI | Vanilla JavaScript (ES Modules) |
| 2D Diagrams | Inline SVG |
| Styling | Custom CSS |

## Quick Start

1. Clone or download this repository
2. Serve the files with any static HTTP server:
   ```bash
   python -m http.server 8080
   ```
3. Open `http://localhost:8080` in your browser

Or deploy directly to GitHub Pages - no build step required.

## File Structure

```
├── index.html              # Main page with HTML structure and Methods tab
├── css/
│   └── styles.css          # All application styles
├── js/
│   ├── main.js             # App entry point: state management, wiring
│   ├── solarEngine.js      # Solar math (HSA, VSA, shading, annual grid)
│   ├── scene3d.js          # Three.js 3D scene
│   ├── orbitCamera.js      # Manual orbit camera controller
│   ├── crossSection.js     # SVG 2D side-profile diagram
│   ├── uiControls.js       # Interactive controls and compass dial
│   ├── heatmap.js          # SVG annual heatmap
│   └── metricsPanel.js     # Real-time metrics display
├── README.md
└── LICENSE                 # MIT
```

## Validation

The simulator has been validated against known solar geometry values:

| Test Case | Expected | Actual |
|-----------|----------|--------|
| South-facing, 39N, Summer Solstice ~solar noon | Alt ~74.5, 100% shaded (2ft awning) | Alt 74.4, 100% shaded |
| South-facing, 39N, Winter Solstice noon | Alt ~27.5, ~11% shaded | Alt 27.6, 11% shaded |

## Limitations

- Direct beam radiation only (diffuse/reflected not modeled)
- Clear-sky assumption (~1000 W/m2)
- Horizontal overhangs only (no tilted, curved, or louvered)
- No terrain or building obstructions
- Simplified SHGC (not a substitute for full energy simulation)

See the Methods & Sources tab in the application for full details.

## Credits

- [SunCalc.js](https://github.com/mourner/suncalc) by Vladimir Agafonkin (BSD-2-Clause)
- [Three.js](https://threejs.org/) (MIT License)
- Solar geometry formulas based on ASHRAE Handbook of Fundamentals

## License

MIT License - see [LICENSE](LICENSE) for details.
