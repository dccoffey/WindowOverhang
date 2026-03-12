// solarEngine.js — Core solar position and shadow geometry calculations
// Uses SunCalc.js (loaded globally as window.SunCalc)
// All angles in degrees unless suffixed with Rad. All dimensions in feet.

(function() {
'use strict';

window.App = window.App || {};

const SunCalcLib = window.SunCalc;

// ─── Constants ───────────────────────────────────────────────────────────────

const GLAZING_TYPES = {
  'Single Clear':   { SHGC: 0.86, Uvalue: 1.04 },
  'Double Clear':   { SHGC: 0.76, Uvalue: 0.47 },
  'Double Low-E':   { SHGC: 0.42, Uvalue: 0.29 },
  'Triple Low-E':   { SHGC: 0.27, Uvalue: 0.18 }
};

const PRESET_CITIES = [
  { name: 'Washington, DC',   lat: 38.9,   lng: -77.0 },
  { name: 'New York, NY',     lat: 40.7,   lng: -74.0 },
  { name: 'Los Angeles, CA',  lat: 34.1,   lng: -118.2 },
  { name: 'Chicago, IL',      lat: 41.9,   lng: -87.6 },
  { name: 'Houston, TX',      lat: 29.8,   lng: -95.4 },
  { name: 'Phoenix, AZ',      lat: 33.4,   lng: -112.1 },
  { name: 'Denver, CO',       lat: 39.7,   lng: -105.0 },
  { name: 'Miami, FL',        lat: 25.8,   lng: -80.2 },
  { name: 'Seattle, WA',      lat: 47.6,   lng: -122.3 },
  { name: 'Minneapolis, MN',  lat: 44.97,  lng: -93.27 },
  { name: 'London, UK',       lat: 51.5,   lng: -0.1 },
  { name: 'Sydney, AU',       lat: -33.9,  lng: 151.2 },
  { name: 'Tokyo, JP',        lat: 35.7,   lng: 139.7 },
];

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ─── Timezone from Longitude ─────────────────────────────────────────────────
// Approximate UTC offset from longitude: each 15° ≈ 1 hour.
// Accurate for all preset cities; avoids needing a timezone database.

function utcOffsetFromLng(lng) {
  return Math.round(lng / 15);
}

// Create a Date representing a desired local time at a given longitude.
// SunCalc uses the Date's UTC value, so we shift to match the target timezone.
function makeLocalDate(year, month0, day, hour, minute, lng) {
  var offset = utcOffsetFromLng(lng);
  return new Date(Date.UTC(year, month0, day, hour - offset, minute || 0));
}

// ─── Solar Position ──────────────────────────────────────────────────────────

function getSunPosition(date, lat, lng) {
  const pos = SunCalcLib.getPosition(date, lat, lng);
  const altitudeDeg = pos.altitude * RAD;
  // SunCalc azimuth: radians from south, clockwise. Convert to compass bearing.
  const compassAzimuthDeg = ((pos.azimuth * RAD) + 180) % 360;
  return {
    altitudeRad: pos.altitude,
    altitudeDeg,
    azimuthRad: pos.azimuth,
    compassAzimuthDeg
  };
}

function getSunTimes(date, lat, lng) {
  return SunCalcLib.getTimes(date, lat, lng);
}

// ─── Shadow Geometry ─────────────────────────────────────────────────────────

function computeHSA(sunCompassAzDeg, wallAzDeg) {
  let hsa = sunCompassAzDeg - wallAzDeg;
  if (hsa > 180) hsa -= 360;
  if (hsa < -180) hsa += 360;
  return hsa;
}

function sunHitsWall(hsaDeg) {
  return Math.abs(hsaDeg) < 90;
}

function computeVSA(altitudeDeg, hsaDeg) {
  if (altitudeDeg <= 0) return 0;
  if (Math.abs(hsaDeg) >= 90) return 0;
  const altRad = altitudeDeg * DEG;
  const hsaRad = hsaDeg * DEG;
  const vsaRad = Math.atan(Math.tan(altRad) / Math.cos(hsaRad));
  return vsaRad * RAD;
}

function computeWindowShading(vsaDeg, hsaDeg, awningDepth, awningGap, windowHeight, windowWidth, awningWidth) {
  if (vsaDeg <= 0 || Math.abs(hsaDeg) >= 90) {
    return {
      shadedHeight: 0,
      shadingFractionVertical: 0,
      lateralOffset: 0,
      shadedWidth: windowWidth,
      shadingFractionHorizontal: 1,
      windowShadingFraction: 0,
      sunHitsWall: Math.abs(hsaDeg) < 90
    };
  }

  const vsaRad = vsaDeg * DEG;
  const hsaRad = hsaDeg * DEG;

  const shadowFromAwning = awningDepth * Math.tan(vsaRad);
  const shadowOnWindow = shadowFromAwning - awningGap;
  const shadedHeight = Math.max(0, Math.min(shadowOnWindow, windowHeight));
  const shadingFractionVertical = shadedHeight / windowHeight;

  const lateralOffset = awningDepth * Math.tan(hsaRad);

  const shadowLeft = lateralOffset - awningWidth / 2;
  const shadowRight = lateralOffset + awningWidth / 2;
  const windowLeft = -windowWidth / 2;
  const windowRight = windowWidth / 2;

  const overlapLeft = Math.max(shadowLeft, windowLeft);
  const overlapRight = Math.min(shadowRight, windowRight);
  const shadedWidth = Math.max(0, overlapRight - overlapLeft);
  const shadingFractionHorizontal = shadedWidth / windowWidth;

  const windowShadingFraction = shadingFractionVertical * shadingFractionHorizontal;

  return {
    shadedHeight,
    shadingFractionVertical,
    lateralOffset,
    shadedWidth,
    shadingFractionHorizontal,
    windowShadingFraction,
    sunHitsWall: true
  };
}

function computeFloorPenetration(vsaDeg, sillHeight, shadedHeight, windowHeight) {
  if (vsaDeg <= 0) return { penetrationFromSill: 0, penetrationFromUnshadedTop: 0, maxPenetration: 0 };

  const vsaRad = vsaDeg * DEG;
  const tanVSA = Math.tan(vsaRad);

  if (tanVSA <= 0.001) return { penetrationFromSill: Infinity, penetrationFromUnshadedTop: Infinity, maxPenetration: Infinity };

  const unshadedWindowTop = sillHeight + windowHeight - shadedHeight;

  const penetrationFromSill = sillHeight / tanVSA;
  const penetrationFromUnshadedTop = unshadedWindowTop / tanVSA;
  const maxPenetration = Math.max(penetrationFromSill, penetrationFromUnshadedTop);

  return { penetrationFromSill, penetrationFromUnshadedTop, maxPenetration };
}

// ─── Polygon Clipping Helpers ────────────────────────────────────────────────

// Sutherland-Hodgman single-edge clip.
// keepBelow=true: keep points where p[axis] <= value
// keepBelow=false: keep points where p[axis] >= value
function clipPolygonToHalfPlane(poly, axis, value, keepBelow) {
  if (poly.length < 3) return poly;

  var result = [];
  for (var i = 0; i < poly.length; i++) {
    var curr = poly[i];
    var next = poly[(i + 1) % poly.length];
    var currIn = keepBelow ? (curr[axis] <= value) : (curr[axis] >= value);
    var nextIn = keepBelow ? (next[axis] <= value) : (next[axis] >= value);

    if (currIn) {
      result.push(curr);
      if (!nextIn) result.push(lerpClipPoint(curr, next, axis, value));
    } else if (nextIn) {
      result.push(lerpClipPoint(curr, next, axis, value));
    }
  }
  return result;
}

function lerpClipPoint(a, b, axis, value) {
  var t = (value - a[axis]) / (b[axis] - a[axis]);
  var out = {};
  var keys = Object.keys(a);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    out[k] = a[k] + t * (b[k] - a[k]);
  }
  return out;
}

// ─── Sunlight Patch (floor + wall polygons) ─────────────────────────────────

function computeSunlightPatch(params) {
  var sunAltDeg = params.sunAltDeg;
  var sunCompassAzDeg = params.sunCompassAzDeg;
  var wallAzDeg = params.wallAzDeg;
  var awningDepth = params.awningDepth;
  var awningGap = params.awningGap;
  var windowWidth = params.windowWidth;
  var windowHeight = params.windowHeight;
  var awningWidth = params.awningWidth;
  var sillHeight = params.sillHeight;
  var roomDepth = params.roomDepth;
  var roomWidth = params.roomWidth;

  var empty = { floor: [], wall: [], leftWall: [], rightWall: [] };

  var hsaDeg = computeHSA(sunCompassAzDeg, wallAzDeg);
  if (Math.abs(hsaDeg) >= 90 || sunAltDeg <= 0) return empty;

  var vsaDeg = computeVSA(sunAltDeg, hsaDeg);
  var shading = computeWindowShading(vsaDeg, hsaDeg, awningDepth, awningGap, windowHeight, windowWidth, awningWidth);
  if (shading.windowShadingFraction >= 0.999) return empty;

  var altRad = sunAltDeg * DEG;
  var hsaRad = hsaDeg * DEG;
  var sinAlt = Math.sin(altRad);
  var cosAlt = Math.cos(altRad);
  if (sinAlt <= 0.001) return empty;

  // Sun ray direction in room-local coords (+Z into room, -Y downward)
  var dirZ = cosAlt * Math.cos(hsaRad);
  var dirX = -cosAlt * Math.sin(hsaRad);
  var dirY = -sinAlt;

  if (dirY >= 0 || dirZ <= 0.001) return empty;

  // Unshaded window opening
  var unshadedBottom = sillHeight;
  var unshadedTop = sillHeight + windowHeight - shading.shadedHeight;
  if (unshadedTop <= unshadedBottom + 0.01) return empty;

  var halfWw = windowWidth / 2;
  // Window corners at z=0 (front wall), ordered: BL, BR, TR, TL
  var corners = [
    { x: -halfWw, y: unshadedBottom },
    { x:  halfWw, y: unshadedBottom },
    { x:  halfWw, y: unshadedTop },
    { x: -halfWw, y: unshadedTop }
  ];

  // --- Floor projection (y=0 plane) ---
  // Each ray: t_floor = -corner.y / dirY  →  floor point (cx + t*dirX, 0, t*dirZ)
  var floorPoly = [];
  for (var i = 0; i < corners.length; i++) {
    var c = corners[i];
    var t = -c.y / dirY;
    floorPoly.push({ x: c.x + t * dirX, z: t * dirZ });
  }
  // Clip to room bounds: z <= roomDepth, -roomWidth/2 <= x <= roomWidth/2
  floorPoly = clipPolygonToHalfPlane(floorPoly, 'z', roomDepth, true);
  floorPoly = clipPolygonToHalfPlane(floorPoly, 'x', roomWidth / 2, true);
  floorPoly = clipPolygonToHalfPlane(floorPoly, 'x', -roomWidth / 2, false);

  // --- Back wall projection (z=roomDepth plane) ---
  // Each ray: t_wall = roomDepth / dirZ  →  wall point (cx + t*dirX, cy + t*dirY, roomDepth)
  var tWall = roomDepth / dirZ;
  var wallPoly = [];
  for (var j = 0; j < corners.length; j++) {
    var c2 = corners[j];
    wallPoly.push({ x: c2.x + tWall * dirX, y: c2.y + tWall * dirY });
  }
  // Clip to room bounds: y >= 0, -roomWidth/2 <= x <= roomWidth/2
  wallPoly = clipPolygonToHalfPlane(wallPoly, 'y', 0, false);
  wallPoly = clipPolygonToHalfPlane(wallPoly, 'x', roomWidth / 2, true);
  wallPoly = clipPolygonToHalfPlane(wallPoly, 'x', -roomWidth / 2, false);

  // --- Left wall projection (x = -roomWidth/2 plane) ---
  var leftWallPoly = [];
  var halfRW = roomWidth / 2;
  if (dirX < -0.001) {
    for (var k = 0; k < corners.length; k++) {
      var c3 = corners[k];
      var tLeft = (-halfRW - c3.x) / dirX;
      leftWallPoly.push({ y: c3.y + tLeft * dirY, z: tLeft * dirZ });
    }
    leftWallPoly = clipPolygonToHalfPlane(leftWallPoly, 'y', 0, false);
    leftWallPoly = clipPolygonToHalfPlane(leftWallPoly, 'z', 0, false);
    leftWallPoly = clipPolygonToHalfPlane(leftWallPoly, 'z', roomDepth, true);
  }

  // --- Right wall projection (x = +roomWidth/2 plane) ---
  var rightWallPoly = [];
  if (dirX > 0.001) {
    for (var m = 0; m < corners.length; m++) {
      var c4 = corners[m];
      var tRight = (halfRW - c4.x) / dirX;
      rightWallPoly.push({ y: c4.y + tRight * dirY, z: tRight * dirZ });
    }
    rightWallPoly = clipPolygonToHalfPlane(rightWallPoly, 'y', 0, false);
    rightWallPoly = clipPolygonToHalfPlane(rightWallPoly, 'z', 0, false);
    rightWallPoly = clipPolygonToHalfPlane(rightWallPoly, 'z', roomDepth, true);
  }

  // Convert to 3D points
  var floorPoints = floorPoly.map(function(p) { return { x: p.x, y: 0, z: p.z }; });
  var wallPoints = wallPoly.map(function(p) { return { x: p.x, y: p.y, z: roomDepth }; });
  var leftWallPoints = leftWallPoly.map(function(p) { return { x: -halfRW, y: p.y, z: p.z }; });
  var rightWallPoints = rightWallPoly.map(function(p) { return { x: halfRW, y: p.y, z: p.z }; });

  return { floor: floorPoints, wall: wallPoints, leftWall: leftWallPoints, rightWall: rightWallPoints };
}

// ─── Energy Metrics ──────────────────────────────────────────────────────────

function getEffectiveSHGC(glassSHGC, shadingFraction) {
  return glassSHGC * (1 - shadingFraction);
}

function getProjectionFactor(awningDepth, gap, windowHeight) {
  const denominator = gap + windowHeight;
  if (denominator <= 0) return 0;
  return awningDepth / denominator;
}

function computeSolarHeatGain(sunAltDeg, hsaDeg, shadingFraction, windowWidth, windowHeight, glassSHGC) {
  if (sunAltDeg <= 0 || Math.abs(hsaDeg) >= 90) return 0;

  const altRad = sunAltDeg * DEG;
  const hsaRad = hsaDeg * DEG;

  const cosIncidence = Math.cos(altRad) * Math.cos(hsaRad);
  if (cosIncidence <= 0) return 0;

  const directIrradiance = 1000 * cosIncidence * (1 - shadingFraction);
  const windowAreaM2 = (windowWidth * 0.3048) * (windowHeight * 0.3048);

  return directIrradiance * windowAreaM2 * glassSHGC;
}

// ─── Annual Performance ──────────────────────────────────────────────────────

function computeAnnualShading(lat, lng, wallAzDeg, awningDepth, awningGap, windowWidth, windowHeight, awningWidth) {
  const results = [];

  for (let month = 0; month < 12; month++) {
    for (let hour = 5; hour <= 20; hour++) {
      const d = makeLocalDate(2024, month, 21, hour, 30, lng);
      const pos = getSunPosition(d, lat, lng);

      if (pos.altitudeDeg <= 0) {
        results.push({ month, hour, shadingPercent: null, sunAltDeg: pos.altitudeDeg, sunBelowHorizon: true });
        continue;
      }

      const hsaDeg = computeHSA(pos.compassAzimuthDeg, wallAzDeg);
      const vsaDeg = computeVSA(pos.altitudeDeg, hsaDeg);
      const shading = computeWindowShading(vsaDeg, hsaDeg, awningDepth, awningGap, windowHeight, windowWidth, awningWidth);

      const shadingPercent = !shading.sunHitsWall ? null : shading.windowShadingFraction * 100;

      results.push({
        month, hour,
        shadingPercent,
        sunAltDeg: pos.altitudeDeg,
        sunAzDeg: pos.compassAzimuthDeg,
        sunBelowHorizon: false,
        sunBehindWall: !shading.sunHitsWall
      });
    }
  }

  return results;
}

// ─── Recommendation Engine ───────────────────────────────────────────────────

function computeVSAForDateNoon(lat, lng, wallAzDeg, month, day) {
  const date = makeLocalDate(2024, month, day, 12, 0, lng);
  const pos = getSunPosition(date, lat, lng);
  if (pos.altitudeDeg <= 0) return null;
  const hsaDeg = computeHSA(pos.compassAzimuthDeg, wallAzDeg);
  if (Math.abs(hsaDeg) >= 90) return null;
  return {
    vsaDeg: computeVSA(pos.altitudeDeg, hsaDeg),
    hsaDeg,
    altDeg: pos.altitudeDeg
  };
}

function recommendAwningDepth(lat, lng, wallAzDeg, windowHeight, gap, awningWidth, windowWidth) {
  const isNorth = lat >= 0;
  const summerMonth = isNorth ? 5 : 11;
  const winterMonth = isNorth ? 11 : 5;

  const summer = computeVSAForDateNoon(lat, lng, wallAzDeg, summerMonth, 21);
  const winter = computeVSAForDateNoon(lat, lng, wallAzDeg, winterMonth, 21);

  if (!summer || summer.vsaDeg <= 0) {
    return {
      recommendedDepth: null,
      maxBeforeWinterBlocking: null,
      feasible: false,
      message: 'Sun does not directly hit this wall orientation at summer solstice noon.'
    };
  }

  const summerVSARad = summer.vsaDeg * DEG;
  const tanSummerVSA = Math.tan(summerVSARad);
  const minDepthForSummerShade = (windowHeight + gap) / tanSummerVSA;

  let maxDepthForWinterSun = null;
  if (winter && winter.vsaDeg > 0) {
    const winterVSARad = winter.vsaDeg * DEG;
    const tanWinterVSA = Math.tan(winterVSARad);
    maxDepthForWinterSun = (0.3 * windowHeight + gap) / tanWinterVSA;
  }

  const feasible = maxDepthForWinterSun === null || minDepthForSummerShade <= maxDepthForWinterSun;

  return {
    recommendedDepth: Math.round(minDepthForSummerShade * 100) / 100,
    maxBeforeWinterBlocking: maxDepthForWinterSun ? Math.round(maxDepthForWinterSun * 100) / 100 : null,
    feasible,
    summerVSA: summer.vsaDeg,
    winterVSA: winter ? winter.vsaDeg : null,
    message: feasible
      ? `Recommended depth: ${minDepthForSummerShade.toFixed(1)} ft for ≥90% summer shade.`
      : `Trade-off required: ${minDepthForSummerShade.toFixed(1)} ft for summer shade exceeds ${maxDepthForWinterSun.toFixed(1)} ft winter limit.`
  };
}

// ─── Optimal Awning Recommendation ──────────────────────────────────────────
// Methodology adapted from SusDesign / NREL overhang recommendations:
// - Gap is sized so winter solstice noon shadow clears the window top (0% winter shade)
// - Depth is sized for full shading from a climate-dependent "design start date"
// - Climate zone estimated from latitude (Warm / Mixed / Cool)
// - For east/west walls, gap=0 with peak-hour scanning (low-angle sun makes
//   the gap optimization less effective; retractable awning recommended instead)

function getClimateZone(lat) {
  var absLat = Math.abs(lat);
  if (absLat < 28) return 'Warm';
  if (absLat <= 44) return 'Mixed';
  return 'Cool';
}

function getDesignDate(lat, isNorth) {
  // Days before summer solstice when full shading should begin.
  // Lower latitude → warmer → shading needed earlier in spring.
  // Calibrated against SusDesign lookup tables (NREL Solar Radiation Data Manual).
  var absLat = Math.abs(lat);
  var daysBefore;
  if (absLat <= 25) daysBefore = 80;       // ~April 1
  else if (absLat >= 50) daysBefore = 20;  // ~June 1
  else daysBefore = 80 - (absLat - 25) * (60 / 25); // linear interpolation

  // Summer solstice: June 21 (NH) or Dec 21 (SH)
  var solstice = isNorth ? new Date(2024, 5, 21) : new Date(2024, 11, 21);
  var designDate = new Date(solstice.getTime() - daysBefore * 86400000);
  return { date: designDate, daysBefore: Math.round(daysBefore) };
}

function recommendOptimalAwning(lat, lng, wallAzDeg, windowHeight, windowWidth, glazingType) {
  const isNorth = lat >= 0;
  const summerMonth = isNorth ? 5 : 11;
  const winterMonth = isNorth ? 11 : 5;

  // ── Climate zone and design date ───────────────────────────────────────
  var climateZone = getClimateZone(lat);
  var designInfo = getDesignDate(lat, isNorth);
  var designMonth = designInfo.date.getMonth();
  var designDay = designInfo.date.getDate();

  // ── Orientation classification ──────────────────────────────────────────
  const equatorFacing = isNorth ? 180 : 0;
  var deviation = Math.abs(wallAzDeg - equatorFacing);
  if (deviation > 180) deviation = 360 - deviation;

  var orientationCategory;
  if (deviation <= 30) orientationCategory = 'equator-facing';
  else if (deviation <= 60) orientationCategory = 'near-equator';
  else if (deviation <= 120) orientationCategory = 'east-west';
  else orientationCategory = 'pole-facing';

  // ── Pole-facing: no awning needed ──────────────────────────────────────
  if (orientationCategory === 'pole-facing') {
    return {
      depth: null, gap: null, widthExtra: null,
      type: {
        newbuild: 'No exterior awning needed',
        retrofit: 'No exterior awning needed',
        reasons: [
          'This wall faces away from the equator and receives minimal direct sunlight.',
          'Consider upgrading to Low-E glazing for diffuse heat and UV reduction.'
        ]
      },
      feasible: false, summerVSA: null, winterVSA: null,
      maxBeforeWinterBlocking: null,
      depthExceedsSlider: false, widthExceedsSlider: false,
      orientationCategory: orientationCategory,
      climateZone: climateZone,
      message: 'This wall faces away from the equator — direct sun exposure is minimal. No awning needed.'
    };
  }

  // ── Find peak sun exposure time on summer solstice ─────────────────────
  var bestSummer = null;
  var bestAbsHSA = 999;
  var peakHour = 12;
  for (var h = 6; h <= 18; h++) {
    var testDate = makeLocalDate(2024, summerMonth, 21, h, 0, lng);
    var testPos = getSunPosition(testDate, lat, lng);
    if (testPos.altitudeDeg <= 0) continue;
    var testHSA = computeHSA(testPos.compassAzimuthDeg, wallAzDeg);
    if (Math.abs(testHSA) >= 90) continue;
    if (Math.abs(testHSA) < bestAbsHSA) {
      bestAbsHSA = Math.abs(testHSA);
      bestSummer = {
        vsaDeg: computeVSA(testPos.altitudeDeg, testHSA),
        hsaDeg: testHSA,
        altDeg: testPos.altitudeDeg
      };
      peakHour = h;
    }
  }

  // Winter solstice noon VSA (for passive solar heating access)
  var winter = computeVSAForDateNoon(lat, lng, wallAzDeg, winterMonth, 21);

  if (!bestSummer || bestSummer.vsaDeg <= 0) {
    return {
      depth: null, gap: null, widthExtra: null,
      type: {
        newbuild: 'No exterior awning needed for this orientation',
        retrofit: 'No exterior awning needed for this orientation',
        reasons: ['Sun does not directly hit this wall on the summer solstice.']
      },
      feasible: false, summerVSA: null, winterVSA: null,
      maxBeforeWinterBlocking: null,
      depthExceedsSlider: false, widthExceedsSlider: false,
      orientationCategory: orientationCategory,
      climateZone: climateZone,
      message: 'Sun does not directly hit this wall on the summer solstice.'
    };
  }

  // ── Gap and Depth recommendation ───────────────────────────────────────
  var gap, idealDepth, depthExceedsSlider, depth;
  var gapExceedsSlider = false;
  var usedDesignDate = false;

  var isEquatorish = (orientationCategory === 'equator-facing' || orientationCategory === 'near-equator');

  if (isEquatorish && winter && winter.vsaDeg > 0) {
    // SusDesign-style: compute gap+depth pair using design date and winter angles.
    // Gap sized so winter solstice noon shadow just reaches window top (0% winter shade).
    // Depth sized for full shade at noon on the design start date.
    var designVSA = computeVSAForDateNoon(lat, lng, wallAzDeg, designMonth, designDay);

    if (designVSA && designVSA.vsaDeg > 0) {
      var tanDesign = Math.tan(designVSA.vsaDeg * DEG);
      var tanWinter = Math.tan(winter.vsaDeg * DEG);

      if (tanDesign > tanWinter) {
        usedDesignDate = true;
        idealDepth = windowHeight / (tanDesign - tanWinter);
        var idealGap = idealDepth * tanWinter;

        // Clamp gap to slider max (2 ft)
        gapExceedsSlider = idealGap > 2;
        gap = Math.round(Math.min(idealGap, 2) * 4) / 4; // snap to 0.25

        // Recalculate depth with clamped gap
        idealDepth = (windowHeight + gap) / tanDesign;
        depthExceedsSlider = idealDepth > 6;
        depth = Math.round(Math.min(idealDepth, 6) * 4) / 4; // snap to 0.25, clamp to 6
      }
    }
  }

  // Fallback: flush mount with peak-hour VSA (for E/W walls or when design date calc fails)
  if (!usedDesignDate) {
    gap = 0;
    var summerVSARad = bestSummer.vsaDeg * DEG;
    idealDepth = windowHeight / Math.tan(summerVSARad);
    depthExceedsSlider = idealDepth > 6;
    depth = Math.round(Math.min(idealDepth, 6) * 4) / 4;
  }

  // ── Winter feasibility check ───────────────────────────────────────────
  var maxBeforeWinterBlocking = null;
  if (winter && winter.vsaDeg > 0) {
    var winterVSARad = winter.vsaDeg * DEG;
    // Max depth before >30% winter shade (accounting for gap)
    maxBeforeWinterBlocking = (0.3 * windowHeight + gap) / Math.tan(winterVSARad);
    maxBeforeWinterBlocking = Math.round(maxBeforeWinterBlocking * 100) / 100;
  }
  var feasible = maxBeforeWinterBlocking === null || idealDepth <= maxBeforeWinterBlocking;

  // ── Width extension recommendation ─────────────────────────────────────
  var maxAbsOffset = 0;
  var summerHSAam = null;
  var summerHSApm = null;
  var MAX_HSA_FOR_WIDTH = 45;

  var dateAM = makeLocalDate(2024, summerMonth, 21, 10, 0, lng);
  var posAM = getSunPosition(dateAM, lat, lng);
  if (posAM.altitudeDeg > 0) {
    var hsaAM = computeHSA(posAM.compassAzimuthDeg, wallAzDeg);
    if (Math.abs(hsaAM) < 90) {
      summerHSAam = hsaAM;
      var effectiveHSA_AM = Math.min(Math.abs(hsaAM), MAX_HSA_FOR_WIDTH);
      maxAbsOffset = Math.max(maxAbsOffset, depth * Math.tan(effectiveHSA_AM * DEG));
    }
  }

  var datePM = makeLocalDate(2024, summerMonth, 21, 14, 0, lng);
  var posPM = getSunPosition(datePM, lat, lng);
  if (posPM.altitudeDeg > 0) {
    var hsaPM = computeHSA(posPM.compassAzimuthDeg, wallAzDeg);
    if (Math.abs(hsaPM) < 90) {
      summerHSApm = hsaPM;
      var effectiveHSA_PM = Math.min(Math.abs(hsaPM), MAX_HSA_FOR_WIDTH);
      maxAbsOffset = Math.max(maxAbsOffset, depth * Math.tan(effectiveHSA_PM * DEG));
    }
  }

  var idealWidthExtra = 2 * maxAbsOffset;
  var widthExceedsSlider = idealWidthExtra > 4;
  var widthExtra = Math.round(Math.min(idealWidthExtra, 4) * 2) / 2;

  // ── Type recommendation ────────────────────────────────────────────────
  var reasons = [];
  var newbuildType, retrofitType;

  var glassSHGC = (GLAZING_TYPES[glazingType] && GLAZING_TYPES[glazingType].SHGC) || 0.76;
  var isLowE = glassSHGC <= 0.45;

  if (isEquatorish) {
    if (feasible) {
      newbuildType = 'Integrated fixed roof overhang';
      retrofitType = 'Fixed metal awning';
      reasons.push('Wall faces toward the equator with a large summer/winter sun angle difference — ideal for fixed shading.');
      reasons.push('Recommended depth (' + depth.toFixed(1) + ' ft) fits within the winter sun limit' + (maxBeforeWinterBlocking ? ' (' + maxBeforeWinterBlocking.toFixed(1) + ' ft).' : '.'));
    } else {
      newbuildType = 'Integrated overhang with retractable extension';
      retrofitType = 'Retractable fabric awning';
      reasons.push('Summer shade depth (' + idealDepth.toFixed(1) + ' ft) exceeds winter sun limit (' + (maxBeforeWinterBlocking ? maxBeforeWinterBlocking.toFixed(1) : '?') + ' ft) — a fixed awning would block too much winter sun.');
      reasons.push('A retractable awning can extend fully in summer and retract in winter to allow passive solar heating.');
    }
  } else {
    // east-west
    newbuildType = 'Retractable awning or integrated overhang with vertical fins';
    retrofitType = 'Retractable fabric awning';
    reasons.push('East/west-facing walls receive low-angle sun that requires deep shading — a retractable awning avoids blocking useful light year-round.');
    if (!feasible) {
      reasons.push('The summer shade depth exceeds the winter limit, reinforcing the need for seasonal adjustment.');
    }
  }

  if (isLowE) {
    reasons.push('Your ' + glazingType + ' glazing (SHGC ' + glassSHGC.toFixed(2) + ') already reduces solar heat gain significantly. An awning still helps with glare and direct beam radiation.');
  }

  if (depthExceedsSlider) {
    reasons.push('Note: The ideal depth (' + idealDepth.toFixed(1) + ' ft) exceeds the 6 ft slider maximum. The slider has been set to 6 ft.');
  }
  if (gapExceedsSlider) {
    reasons.push('Note: The ideal gap (' + (idealDepth * Math.tan(winter.vsaDeg * DEG)).toFixed(1) + ' ft) exceeds the 2 ft slider maximum. The slider has been set to 2 ft.');
  }
  if (widthExceedsSlider) {
    reasons.push('Note: The ideal width extension (' + idealWidthExtra.toFixed(1) + ' ft) exceeds the 4 ft slider maximum. The slider has been set to 4 ft.');
  }

  // Format design date for display
  var designDateLabel = '';
  if (usedDesignDate) {
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    designDateLabel = monthNames[designMonth] + ' ' + designDay;
  }

  return {
    depth: depth,
    gap: gap,
    widthExtra: widthExtra,
    type: { newbuild: newbuildType, retrofit: retrofitType, reasons: reasons },
    feasible: feasible,
    summerVSA: bestSummer.vsaDeg,
    peakHour: peakHour,
    winterVSA: winter ? winter.vsaDeg : null,
    maxBeforeWinterBlocking: maxBeforeWinterBlocking,
    depthExceedsSlider: depthExceedsSlider,
    gapExceedsSlider: gapExceedsSlider,
    widthExceedsSlider: widthExceedsSlider,
    orientationCategory: orientationCategory,
    climateZone: climateZone,
    designDateLabel: designDateLabel,
    summerHSAam: summerHSAam,
    summerHSApm: summerHSApm,
    message: feasible
      ? 'Optimized: ' + depth.toFixed(2) + ' ft depth, ' + gap.toFixed(2) + ' ft gap, ' + widthExtra.toFixed(1) + ' ft width extension.'
      : 'Trade-off: ideal depth ' + idealDepth.toFixed(1) + ' ft exceeds winter limit ' + (maxBeforeWinterBlocking ? maxBeforeWinterBlocking.toFixed(1) : '?') + ' ft. Retractable awning recommended.'
  };
}

// ─── Export to global namespace ──────────────────────────────────────────────

window.App.GLAZING_TYPES = GLAZING_TYPES;
window.App.PRESET_CITIES = PRESET_CITIES;
window.App.getSunPosition = getSunPosition;
window.App.getSunTimes = getSunTimes;
window.App.computeHSA = computeHSA;
window.App.sunHitsWall = sunHitsWall;
window.App.computeVSA = computeVSA;
window.App.computeWindowShading = computeWindowShading;
window.App.computeFloorPenetration = computeFloorPenetration;
window.App.computeSunlightPatch = computeSunlightPatch;
window.App.getEffectiveSHGC = getEffectiveSHGC;
window.App.getProjectionFactor = getProjectionFactor;
window.App.computeSolarHeatGain = computeSolarHeatGain;
window.App.computeAnnualShading = computeAnnualShading;
window.App.recommendAwningDepth = recommendAwningDepth;
window.App.recommendOptimalAwning = recommendOptimalAwning;
window.App.makeLocalDate = makeLocalDate;

})();
