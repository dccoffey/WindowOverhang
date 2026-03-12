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
var crossSection = new App.CrossSection(document.getElementById('cross-section-svg'));
var metrics = new App.MetricsPanel();

var scene3d = null;
try {
  var container = document.getElementById('three-canvas-wrap');
  if (container && window.THREE) {
    scene3d = new App.Scene3D(container);
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

    var sunPathKey = lat + '-' + lng + '-' + date.getMonth() + '-' + date.getDate();
    if (sunPathKey !== lastSunPathKey) {
      scene3d.updateSunPaths(lat, lng, date);
      lastSunPathKey = sunPathKey;
    }

    if (!sunBelowHorizon && isSunOnWall) {
      scene3d.updateSunRay(sunPos.altitudeRad, sunAzDeg, wallAzimuth, windowHeight, sillHeight);
    } else {
      scene3d.updateSunRay(-1, 0, 0, 0, 0);
    }

    if (!sunBelowHorizon && isSunOnWall) {
      var patchVerts = computeSunlightPatch({
        sunAltDeg: sunAltDeg, sunCompassAzDeg: sunAzDeg, wallAzDeg: wallAzimuth,
        awningDepth: awningDepth, awningGap: awningGap,
        windowWidth: windowWidth, windowHeight: windowHeight, awningWidth: awningWidth,
        sillHeight: sillHeight, roomDepth: 14, roomWidth: 12
      });
      scene3d.updateSunlightPatch(patchVerts);
    } else {
      scene3d.updateSunlightPatch(null);
    }
  }

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
    html += '<p><strong>Optimal awning depth:</strong> ' + rec.recommendedDepth.toFixed(1) + ' ft for &ge;90% summer shade at noon.</p>';

    if (rec.maxBeforeWinterBlocking !== null) {
      html += '<p><strong>Max before winter blocking:</strong> ' + rec.maxBeforeWinterBlocking.toFixed(1) + ' ft (&le;30% winter shade).</p>';
    }

    if (rec.feasible) {
      html += '<p style="color:#16a34a;"><strong>&#10004; Feasible:</strong> A single fixed awning can achieve good summer shade while allowing winter sun.</p>';
    } else {
      html += '<p style="color:#d97706;"><strong>&#9888; Trade-off:</strong> ' + rec.message + '</p>';
    }

    var diff = currentDepth - rec.recommendedDepth;
    if (Math.abs(diff) < 0.1) {
      html += '<p>Your current depth (' + currentDepth.toFixed(1) + ' ft) is close to optimal.</p>';
    } else if (diff < 0) {
      html += '<p>Your current depth (' + currentDepth.toFixed(1) + ' ft) is <strong>' + Math.abs(diff).toFixed(1) + ' ft shorter</strong> than recommended for full summer shade.</p>';
    } else {
      html += '<p>Your current depth (' + currentDepth.toFixed(1) + ' ft) is <strong>' + diff.toFixed(1) + ' ft longer</strong> than needed &mdash; may block some winter sun.</p>';
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
    html += '<li><strong>Depth:</strong> ' + rec.depth.toFixed(2) + ' ft (for full summer shade' + peakLabel + ')</li>';

    if (rec.gap > 0) {
      html += '<li><strong>Gap:</strong> ' + rec.gap.toFixed(2) + ' ft (sized for 0% winter solstice shade) &mdash; for retrofit, use 0.25 ft minimum</li>';
    } else {
      html += '<li><strong>Gap:</strong> ' + rec.gap.toFixed(2) + ' ft (flush mount) &mdash; for retrofit, use 0.25 ft minimum</li>';
    }

    html += '<li><strong>Width+:</strong> ' + rec.widthExtra.toFixed(1) + ' ft (covers window at 10 AM/2 PM summer)</li>';
    html += '</ul>';

    if (rec.maxBeforeWinterBlocking !== null) {
      html += '<p><strong>Winter limit:</strong> ' + rec.maxBeforeWinterBlocking.toFixed(1) + ' ft max before blocking &gt;30% winter sun.</p>';
    }

    if (rec.feasible) {
      html += '<p style="color:#16a34a;"><strong>&#10004; Feasible:</strong> A single fixed awning can achieve good summer shade while allowing winter sun.</p>';
    } else {
      html += '<p style="color:#d97706;"><strong>&#9888; Trade-off:</strong> Summer shade depth exceeds winter limit. Retractable awning recommended.</p>';
    }

    html += '<p><strong>Recommended Type:</strong></p>';
    html += '<p><em>New construction:</em> ' + rec.type.newbuild + '</p>';
    html += '<p><em>Retrofit:</em> ' + rec.type.retrofit + '</p>';

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
    var rec = recommendOptimalAwning(
      state.lat, state.lng, state.wallAzimuth,
      state.windowHeight, state.windowWidth, state.glazingType
    );

    if (rec.depth === null) {
      // Can't optimize — just show the message
      pendingOptimizeResult = rec;
      // Force heatmap/recommendation refresh by invalidating cache key
      lastAnnualKey = '';
      updateAll();
      return;
    }

    // Clamp values (already done in solarEngine, but be safe)
    var newDepth = Math.min(6, Math.max(0, rec.depth));
    var newGap = Math.min(2, Math.max(0, rec.gap));
    var newWidth = Math.min(4, Math.max(0, rec.widthExtra));

    // Update UIControls state
    ui.state.awningDepth = newDepth;
    ui.state.awningGap = newGap;
    ui.state.awningWidthExtra = newWidth;

    // Update slider DOM
    document.getElementById('slider-ad').value = newDepth;
    document.getElementById('slider-ag').value = newGap;
    document.getElementById('slider-aw').value = newWidth;

    // Update display spans
    document.getElementById('val-ad').textContent = newDepth.toFixed(2);
    document.getElementById('val-ag').textContent = newGap.toFixed(2);
    document.getElementById('val-aw').textContent = newWidth.toFixed(1);

    // Set flag so recommendation display shows optimize result
    pendingOptimizeResult = rec;

    // Invalidate annual cache to force recommendation refresh
    lastAnnualKey = '';

    // Fire change to update all views
    ui._fireChange();
  });
}

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
