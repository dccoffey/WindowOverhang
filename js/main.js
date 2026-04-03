// main.js — Application entry point: state management, wiring, tab switching, animation

(function() {
'use strict';

var App = window.App;

var getSunPosition = App.getSunPosition;
var computeHSA = App.computeHSA;
var computeVSA = App.computeVSA;
var sunHitsWall = App.sunHitsWall;
var computeWindowShading = App.computeWindowShading;
var computeFloorPenetration = App.computeFloorPenetration;
var computeSunlightPatch = App.computeSunlightPatch;
var getEffectiveSHGC = App.getEffectiveSHGC;
var getProjectionFactor = App.getProjectionFactor;
var computeSolarHeatGain = App.computeSolarHeatGain;
var computeAnnualShading = App.computeAnnualShading;
var recommendAwningDepth = App.recommendAwningDepth;
var recommendOptimalAwning = App.recommendOptimalAwning;
var GLAZING_TYPES = App.GLAZING_TYPES;

// ─── Initialize modules ─────────────────────────────────────────

var ui = new App.UIControls();
App._controls = ui;
var crossSection = new App.CrossSection(document.getElementById('cross-section-svg'));
var metrics = new App.MetricsPanel();

var scene3d = null;
try {
  var container = document.getElementById('three-canvas-wrap');
  if (container && window.THREE) {
    scene3d = new App.Scene3D(container);
    App._scene3d = scene3d; // expose for UI toggle buttons
  }
} catch (e) {
  console.warn('3D scene initialization failed:', e);
}

var heatmap = new App.Heatmap(
  document.getElementById('heatmap-svg'),
  document.getElementById('heatmap-tooltip')
);

// ─── State tracking for expensive computations ──────────────────

var lastAnnualKey = '';
var lastSunPathKey = '';

// ─── Tab switching ───────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
    btn.classList.add('active');
    var tabId = btn.dataset.tab + '-tab';
    document.getElementById(tabId).classList.add('active');

    if (btn.dataset.tab === 'simulator' && scene3d) {
      setTimeout(function() { scene3d.handleResize(); }, 50);
    }
  });
});

// ─── Core update function ────────────────────────────────────────

function updateAll(state) {
  if (!state) state = ui.getState();

  var lat = state.lat;
  var lng = state.lng;
  var wallAzimuth = state.wallAzimuth;
  var windowWidth = state.windowWidth;
  var windowHeight = state.windowHeight;
  var sillHeight = state.sillHeight;
  var awningDepth = state.awningDepth;
  var awningGap = state.awningGap;
  var awningWidth = state.awningWidth;
  var glazingType = state.glazingType;
  var date = state.date;

  // ── Solar position ─────────────────────────────────────────────
  var sunPos = getSunPosition(date, lat, lng);
  var sunAltDeg = sunPos.altitudeDeg;
  var sunAzDeg = sunPos.compassAzimuthDeg;
  var sunBelowHorizon = sunAltDeg <= 0;

  // ── Shadow geometry ────────────────────────────────────────────
  var hsaDeg = computeHSA(sunAzDeg, wallAzimuth);
  var isSunOnWall = sunHitsWall(hsaDeg);
  var vsaDeg = computeVSA(sunAltDeg, hsaDeg);

  var shading = computeWindowShading(
    vsaDeg, hsaDeg, awningDepth, awningGap,
    windowHeight, windowWidth, awningWidth
  );

  var floorPen = computeFloorPenetration(
    vsaDeg, sillHeight, shading.shadedHeight, windowHeight
  );

  // ── Energy metrics ─────────────────────────────────────────────
  var glassSHGC = (GLAZING_TYPES[glazingType] && GLAZING_TYPES[glazingType].SHGC) || 0.76;
  var effectiveSHGC = getEffectiveSHGC(glassSHGC, shading.windowShadingFraction);
  var projectionFactor = getProjectionFactor(awningDepth, awningGap, windowHeight);
  var solarHeatGain = computeSolarHeatGain(
    sunAltDeg, hsaDeg, shading.windowShadingFraction,
    windowWidth, windowHeight, glassSHGC
  );

  // ── Update 2D cross-section ────────────────────────────────────
  crossSection.update({
    windowHeight: windowHeight, sillHeight: sillHeight, awningDepth: awningDepth, awningGap: awningGap,
    vsaDeg: vsaDeg, sunAltDeg: sunAltDeg,
    shadedHeight: shading.shadedHeight,
    floorPenetration: floorPen.maxPenetration,
    shadingFraction: shading.windowShadingFraction,
    sunHitsWall: isSunOnWall && !sunBelowHorizon
  });

  // ── Update metrics panel ───────────────────────────────────────
  metrics.update({
    sunAltDeg: sunAltDeg, sunAzDeg: sunAzDeg, hsaDeg: hsaDeg, vsaDeg: vsaDeg,
    windowShadingFraction: shading.windowShadingFraction,
    floorPenetration: floorPen.maxPenetration,
    effectiveSHGC: effectiveSHGC, projectionFactor: projectionFactor, solarHeatGain: solarHeatGain,
    sunBelowHorizon: sunBelowHorizon,
    sunBehindWall: !isSunOnWall
  });

  // ── Update 3D scene ────────────────────────────────────────────
  if (scene3d) {
    scene3d.updateSunPosition(sunPos.altitudeRad, sunAzDeg);
    scene3d.updateRoomRotation(wallAzimuth);
    scene3d.updateWindowAndAwning(windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth);

    var sunPathKey = lat + '-' + lng + '-' + date.getMonth() + '-' + date.getDate() + '-' + Math.floor(date.getHours());
    if (sunPathKey !== lastSunPathKey) {
      scene3d.updateSunPaths(lat, lng, date);
      scene3d.updateStarField(lat, lng, date);
      lastSunPathKey = sunPathKey;
    }

    if (!sunBelowHorizon) {
      scene3d.updateSunRay(sunPos.altitudeRad, sunAzDeg, wallAzimuth, windowHeight, sillHeight, isSunOnWall);
    } else {
      scene3d.updateSunRay(-1, 0, 0, 0, 0, false);
    }

    // Light beam volume parameters
    if (!sunBelowHorizon) {
      scene3d.updateLightBeamParams(
        sunPos.altitudeRad, sunAzDeg, wallAzimuth,
        windowWidth, windowHeight, sillHeight,
        awningDepth, awningGap, awningWidth
      );
    } else {
      scene3d.updateLightBeamParams(-1, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    // Window pane glow
    scene3d.updateWindowGlow(shading.windowShadingFraction, isSunOnWall, sunBelowHorizon);

    if (!sunBelowHorizon && isSunOnWall) {
      var patchVerts = computeSunlightPatch({
        sunAltDeg: sunAltDeg, sunCompassAzDeg: sunAzDeg, wallAzDeg: wallAzimuth,
        awningDepth: awningDepth, awningGap: awningGap,
        windowWidth: windowWidth, windowHeight: windowHeight, awningWidth: awningWidth,
        sillHeight: sillHeight, roomDepth: 14, roomWidth: 12
      });
      scene3d.updateSunlightPatch(patchVerts, sunAltDeg, hsaDeg, shading.shadedHeight);
    } else {
      scene3d.updateSunlightPatch(null, 0, 0, 0);
    }
  }

  // ── Footnote and asterisk for non-equator-facing walls ────────
  updateFootnoteAndAsterisk(state);

  // ── Annual heatmap ─────────────────────────────────────────────
  var annualKey = lat + '-' + lng + '-' + wallAzimuth + '-' + awningDepth + '-' + awningGap + '-' + windowWidth + '-' + windowHeight + '-' + awningWidth;
  if (annualKey !== lastAnnualKey) {
    lastAnnualKey = annualKey;
    setTimeout(function() {
      var annualData = computeAnnualShading(
        lat, lng, wallAzimuth, awningDepth, awningGap,
        windowWidth, windowHeight, awningWidth
      );
      heatmap.update(annualData);

      var rec = recommendAwningDepth(lat, lng, wallAzimuth, windowHeight, awningGap, awningWidth, windowWidth);
      updateRecommendation(rec, awningDepth);
    }, 10);
  }
}

// ─── Recommendation display ──────────────────────────────────────

// Format a length value respecting metric toggle
function fmtLen(ftVal, decimals) {
  var metric = App._controls && App._controls._metricMode;
  if (metric) return (ftVal * 0.3048).toFixed(decimals || 2) + ' m';
  return ftVal.toFixed(decimals || 1) + ' ft';
}

var pendingOptimizeResult = null;

function updateRecommendation(rec, currentDepth) {
  var el = document.getElementById('recommendation-text');
  if (!el) return;

  // If an optimization result is pending, display it instead
  if (pendingOptimizeResult) {
    displayOptimizeResult(pendingOptimizeResult);
    pendingOptimizeResult = null;
    return;
  }

  var html = '';

  if (rec.recommendedDepth === null) {
    html = '<p>' + rec.message + '</p>';
  } else {
    html += '<p><strong>Optimal awning depth:</strong> ' + fmtLen(rec.recommendedDepth) + ' for &ge;90% summer shade at noon.</p>';

    if (rec.maxBeforeWinterBlocking !== null) {
      html += '<p><strong>Max before winter blocking:</strong> ' + fmtLen(rec.maxBeforeWinterBlocking) + ' (&le;30% winter shade).</p>';
    }

    if (rec.feasible) {
      html += '<p style="color:#16a34a;"><strong>&#10004; Feasible:</strong> A single fixed awning can achieve good summer shade while allowing winter sun.</p>';
    } else {
      html += '<p style="color:#d97706;"><strong>&#9888; Trade-off:</strong> ' + rec.message + '</p>';
    }

    var diff = currentDepth - rec.recommendedDepth;
    if (Math.abs(diff) < 0.1) {
      html += '<p>Your current depth (' + fmtLen(currentDepth) + ') is close to optimal.</p>';
    } else if (diff < 0) {
      html += '<p>Your current depth (' + fmtLen(currentDepth) + ') is <strong>' + fmtLen(Math.abs(diff)) + ' shorter</strong> than recommended for full summer shade.</p>';
    } else {
      html += '<p>Your current depth (' + fmtLen(currentDepth) + ') is <strong>' + fmtLen(diff) + ' longer</strong> than needed &mdash; may block some winter sun.</p>';
    }
  }

  el.innerHTML = html;

  // Style the recommendation box based on feasibility
  el.classList.remove('rec-feasible', 'rec-tradeoff');
  if (rec.recommendedDepth !== null) {
    el.classList.add(rec.feasible ? 'rec-feasible' : 'rec-tradeoff');
  }
}

function displayOptimizeResult(rec) {
  var el = document.getElementById('recommendation-text');
  if (!el) return;

  var html = '';

  if (rec.depth === null) {
    html = '<p>' + rec.message + '</p>';
    if (rec.type && rec.type.reasons) {
      html += '<ul>';
      rec.type.reasons.forEach(function(r) { html += '<li>' + r + '</li>'; });
      html += '</ul>';
    }
  } else {
    // Climate zone and design date header
    if (rec.climateZone || rec.designDateLabel) {
      html += '<p style="color:var(--text-muted);font-size:0.85em;">';
      if (rec.climateZone) html += '<strong>Climate zone:</strong> ' + rec.climateZone;
      if (rec.designDateLabel) html += ' &mdash; full shade designed from <strong>' + rec.designDateLabel + '</strong>';
      html += '</p>';
    }

    html += '<p><strong>Optimized Awning Dimensions:</strong></p>';
    html += '<ul>';
    var peakLabel = (rec.peakHour && rec.peakHour !== 12) ? ' at ' + rec.peakHour + ':00 peak sun' : ' at noon';
    html += '<li><strong>Depth:</strong> ' + fmtLen(rec.depth, 2) + ' (for full summer shade' + peakLabel + ')</li>';

    if (rec.gap > 0) {
      html += '<li><strong>Gap:</strong> ' + fmtLen(rec.gap, 2) + ' (sized for 0% winter solstice shade) &mdash; for retrofit, use ' + fmtLen(0.25, 2) + ' minimum</li>';
    } else {
      html += '<li><strong>Gap:</strong> ' + fmtLen(rec.gap, 2) + ' (flush mount) &mdash; for retrofit, use ' + fmtLen(0.25, 2) + ' minimum</li>';
    }

    html += '<li><strong>Width+:</strong> ' + fmtLen(rec.widthExtra) + ' (covers window at 10 AM/2 PM summer)</li>';
    html += '</ul>';

    if (rec.maxBeforeWinterBlocking !== null) {
      html += '<p><strong>Winter limit:</strong> ' + fmtLen(rec.maxBeforeWinterBlocking) + ' max before blocking &gt;30% winter sun.</p>';
    }

    if (rec.feasible) {
      html += '<p style="color:#16a34a;"><strong>&#10004; Feasible:</strong> A single fixed awning can achieve good summer shade while allowing winter sun.</p>';
    } else {
      html += '<p style="color:#d97706;"><strong>&#9888; Trade-off:</strong> Summer shade depth exceeds winter limit. Retractable awning recommended.</p>';
    }

    if (rec.type.reasons.length > 0) {
      html += '<ul>';
      rec.type.reasons.forEach(function(r) { html += '<li>' + r + '</li>'; });
      html += '</ul>';
    }
  }

  el.innerHTML = html;

  el.classList.remove('rec-feasible', 'rec-tradeoff');
  if (rec.depth !== null) {
    el.classList.add(rec.feasible ? 'rec-feasible' : 'rec-tradeoff');
  }
}

// ─── Event listener ──────────────────────────────────────────────

document.addEventListener('controls-changed', function(e) {
  updateAll(e.detail);
});

// ─── Optimize Awning button ─────────────────────────────────────

var optimizeBtn = document.getElementById('btn-optimize-awning');
if (optimizeBtn) {
  optimizeBtn.addEventListener('click', function() {
    var state = ui.getState();

    // Read lock states
    var lockDepth = document.getElementById('lock-depth') && document.getElementById('lock-depth').checked;
    var lockGap = document.getElementById('lock-gap') && document.getElementById('lock-gap').checked;
    var lockWidth = document.getElementById('lock-width') && document.getElementById('lock-width').checked;

    // Build locks object with current values for locked parameters
    var locks = {};
    if (lockDepth) locks.depth = state.awningDepth;
    if (lockGap) locks.gap = state.awningGap;
    if (lockWidth) locks.widthExtra = state.awningWidthExtra;

    // Read selected optimization method from radio buttons
    var methodEl = document.querySelector('input[name="opt-method"]:checked');
    var method = methodEl ? methodEl.value : 'nrel';

    var rec = recommendOptimalAwning(
      state.lat, state.lng, state.wallAzimuth,
      state.windowHeight, state.windowWidth, state.glazingType, locks, method
    );

    if (rec.depth === null) {
      // Can't optimize — reset sliders to zero/minimum and show message
      if (!lockDepth) {
        ui.state.awningDepth = 0;
        document.getElementById('slider-ad').value = 0;
      }
      if (!lockGap) {
        ui.state.awningGap = 0;
        document.getElementById('slider-ag').value = 0;
      }
      if (!lockWidth) {
        ui.state.awningWidthExtra = 0;
        document.getElementById('slider-aw').value = 0;
      }
      // Refresh displayed values respecting metric/imperial mode
      ui._refreshAllDisplayValues();
      pendingOptimizeResult = rec;
      lastAnnualKey = '';
      ui._fireChange();
      return;
    }

    // Apply unlocked values only
    var widthMax = state.windowWidth + 5;
    if (!lockDepth) {
      var newDepth = Math.min(6, Math.max(0, rec.depth));
      ui.state.awningDepth = newDepth;
      document.getElementById('slider-ad').value = newDepth;
    }
    if (!lockGap) {
      var newGap = Math.min(2, Math.max(0, rec.gap));
      ui.state.awningGap = newGap;
      document.getElementById('slider-ag').value = newGap;
    }
    if (!lockWidth) {
      var newWidth = Math.min(widthMax, Math.max(0, rec.widthExtra));
      ui.state.awningWidthExtra = newWidth;
      document.getElementById('slider-aw').value = newWidth;
    }
    // Refresh displayed values respecting metric/imperial mode
    ui._refreshAllDisplayValues();

    // Set flag so recommendation display shows optimize result
    pendingOptimizeResult = rec;

    // Invalidate annual cache to force recommendation refresh
    lastAnnualKey = '';

    // Fire change to update all views
    ui._fireChange();
  });
}

// ─── Footnote & asterisk logic for non-equator-facing walls ─────

function getOrientationCategory(wallAzDeg, lat) {
  var isNorth = lat >= 0;
  var equatorFacing = isNorth ? 180 : 0;
  var deviation = Math.abs(wallAzDeg - equatorFacing);
  if (deviation > 180) deviation = 360 - deviation;
  if (deviation <= 30) return 'equator-facing';
  if (deviation <= 60) return 'near-equator';
  if (deviation <= 120) return 'east-west';
  return 'pole-facing';
}

function updateFootnoteAndAsterisk(state) {
  var footnoteEl = document.getElementById('awning-footnote');
  var footnoteText = document.getElementById('awning-footnote-text');
  var asteriskEl = document.getElementById('opt-asterisk');
  if (!footnoteEl || !footnoteText || !asteriskEl) return;

  var cat = getOrientationCategory(state.wallAzimuth, state.lat);
  var isEquatorish = (cat === 'equator-facing' || cat === 'near-equator');

  if (isEquatorish || cat === 'pole-facing') {
    // No footnote needed for equator-facing or pole-facing walls
    footnoteEl.classList.add('section-hidden');
    asteriskEl.classList.remove('visible');
  } else {
    // E/W walls: show asterisk and footnote
    asteriskEl.classList.add('visible');
    footnoteEl.classList.remove('section-hidden');

    var methodEl = document.querySelector('input[name="opt-method"]:checked');
    var method = methodEl ? methodEl.value : 'nrel';

    var text = '';
    if (method === 'nrel') {
      text = '* <strong>NREL/ASHRAE geometric method:</strong> This equation computes the horizontal overhang depth needed to fully shade the window based on the Vertical Shadow Angle (VSA). '
        + 'While the formula applies to any vertical surface, the <em>NREL Solar Radiation Data Manual</em> notes that horizontal overhangs are "not particularly effective" for east- and west-facing windows because the sun strikes at low altitude angles, '
        + 'requiring impractically deep overhangs. For E/W walls, consider supplementing with <strong>vertical fins</strong> (brise-soleil), exterior solar screens, or operable shading. '
        + 'Vertical fins sized as <em>Fin Depth = Fin Spacing × tan(HSA cutoff)</em> are more effective at blocking low-angle E/W sun. '
        + 'For SE/SW walls, an egg-crate design (combined horizontal + vertical elements) provides the best coverage.';
    } else if (method === 'ba') {
      text = '* <strong>Building America method:</strong> This approach applies a south-facing-sized overhang to E/W walls for partial coverage, supplemented with operable shading strategies. '
        + 'PNNL/DOE Building America guidance acknowledges that E/W walls cannot be fully shaded by horizontal overhangs alone and recommends combining fixed overhangs with blinds, retractable screens, or solar films.';
    } else if (method === 'susdesign') {
      text = '* <strong>SusDesign method:</strong> This methodology only provides recommendations for equator-facing windows (within ±60° of true south in the Northern Hemisphere). '
        + 'No horizontal overhang recommendation is available for this wall orientation. Switch to NREL/ASHRAE or Building America for a computed depth estimate.';
    }
    footnoteText.innerHTML = text;
  }
}

// Update footnote when method radio buttons change
document.querySelectorAll('input[name="opt-method"]').forEach(function(radio) {
  radio.addEventListener('change', function() {
    var state = ui.getState();
    updateFootnoteAndAsterisk(state);
  });
});

// ─── Loading overlay dismiss ─────────────────────────────────────

var loadingOverlay = document.getElementById('loading-overlay');
if (loadingOverlay) {
  // Hide after first animation frame (3D scene is ready)
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      loadingOverlay.classList.add('hidden');
    });
  });
}

// ─── Initial render ──────────────────────────────────────────────

updateAll();

})();
