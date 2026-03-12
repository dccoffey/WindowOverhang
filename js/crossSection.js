// crossSection.js — SVG 2D side-profile diagram showing wall, window, awning, sun rays

(function() {
'use strict';

window.App = window.App || {};

class CrossSection {
  constructor(svgElement) {
    this.svg = svgElement;
    this.wallX = 150;
    this.floorY = 310;
    this.scale = 30;
  }

  update(params) {
    const {
      windowHeight, sillHeight, awningDepth, awningGap,
      vsaDeg, sunAltDeg, shadedHeight, floorPenetration,
      shadingFraction, sunHitsWall
    } = params;

    const s = this.scale;
    const wallX = this.wallX;
    const floorY = this.floorY;

    const windowBottomY = floorY - sillHeight * s;
    const windowTopY = windowBottomY - windowHeight * s;
    const awningY = windowTopY - awningGap * s;
    const awningEndX = wallX - awningDepth * s;
    const roomRightX = 480;
    const outsideLeftX = 20;

    let svg = '';

    // ─── Arrow marker definitions ────────────────────────────────
    svg += '<defs>';
    svg += '<marker id="arrowL" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">';
    svg += '<path d="M 6 0 L 0 3 L 6 6" fill="none" stroke="#999" stroke-width="1"/>';
    svg += '</marker>';
    svg += '<marker id="arrowR" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">';
    svg += '<path d="M 0 0 L 6 3 L 0 6" fill="none" stroke="#999" stroke-width="1"/>';
    svg += '</marker>';
    svg += '</defs>';

    // ─── Background ──────────────────────────────────────────────
    svg += '<rect x="' + outsideLeftX + '" y="20" width="' + (wallX - outsideLeftX) + '" height="' + (floorY - 20) + '" fill="#e0f2fe" opacity="0.3"/>';
    svg += '<rect x="' + wallX + '" y="20" width="' + (roomRightX - wallX) + '" height="' + (floorY - 20) + '" fill="#fef9ef" opacity="0.3"/>';

    // ─── Floor ───────────────────────────────────────────────────
    svg += '<line x1="' + outsideLeftX + '" y1="' + floorY + '" x2="' + roomRightX + '" y2="' + floorY + '" stroke="#8b7355" stroke-width="3"/>';
    svg += '<text x="' + (roomRightX - 5) + '" y="' + (floorY + 15) + '" text-anchor="end" font-size="10" fill="#8b7355">Floor</text>';

    // ─── Wall ────────────────────────────────────────────────────
    svg += '<line x1="' + wallX + '" y1="30" x2="' + wallX + '" y2="' + floorY + '" stroke="#64748b" stroke-width="4"/>';

    // ─── Window opening ──────────────────────────────────────────
    svg += '<rect x="' + (wallX - 3) + '" y="' + windowTopY + '" width="6" height="' + (windowHeight * s) + '" fill="#87CEEB" stroke="#1e88e5" stroke-width="1.5" rx="1"/>';

    // ─── Awning ──────────────────────────────────────────────────
    if (awningDepth > 0) {
      svg += '<line x1="' + wallX + '" y1="' + awningY + '" x2="' + awningEndX + '" y2="' + awningY + '" stroke="#444" stroke-width="4" stroke-linecap="round"/>';
      if (awningDepth * s > 20) {
        var awningMidX = (wallX + awningEndX) / 2;
        svg += '<text x="' + awningMidX + '" y="' + (awningY - 8) + '" text-anchor="middle" font-size="10" fill="#444">' + awningDepth.toFixed(1) + ' ft</text>';
        svg += '<line x1="' + awningEndX + '" y1="' + (awningY - 3) + '" x2="' + wallX + '" y2="' + (awningY - 3) + '" stroke="#999" stroke-width="0.5" marker-start="url(#arrowL)" marker-end="url(#arrowR)"/>';
      }
    }

    // ─── Gap dimension ───────────────────────────────────────────
    if (awningGap > 0 && awningDepth > 0) {
      var gapLabelX = wallX + 15;
      svg += '<line x1="' + gapLabelX + '" y1="' + awningY + '" x2="' + gapLabelX + '" y2="' + windowTopY + '" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2"/>';
      svg += '<text x="' + (gapLabelX + 5) + '" y="' + ((awningY + windowTopY) / 2 + 3) + '" font-size="9" fill="#999">' + awningGap.toFixed(1) + ' ft gap</text>';
    }

    // ─── Window height dimension ─────────────────────────────────
    var dimX = wallX + 30;
    svg += '<line x1="' + dimX + '" y1="' + windowTopY + '" x2="' + dimX + '" y2="' + windowBottomY + '" stroke="#1e88e5" stroke-width="0.5"/>';
    svg += '<text x="' + (dimX + 5) + '" y="' + ((windowTopY + windowBottomY) / 2 + 3) + '" font-size="9" fill="#1e88e5">' + windowHeight.toFixed(1) + ' ft</text>';

    // ─── Sill height dimension ───────────────────────────────────
    var sillDimX = wallX + 50;
    svg += '<line x1="' + sillDimX + '" y1="' + windowBottomY + '" x2="' + sillDimX + '" y2="' + floorY + '" stroke="#8b7355" stroke-width="0.5"/>';
    svg += '<text x="' + (sillDimX + 5) + '" y="' + ((windowBottomY + floorY) / 2 + 3) + '" font-size="9" fill="#8b7355">' + sillHeight.toFixed(1) + ' ft sill</text>';

    // ─── Sun rays and shading ────────────────────────────────────
    if (sunHitsWall && sunAltDeg > 0 && vsaDeg > 0) {
      var vsaRad = vsaDeg * Math.PI / 180;
      var tanVSA = Math.tan(vsaRad);

      if (shadedHeight > 0) {
        var shadedPixels = shadedHeight * s;
        svg += '<rect x="' + (wallX - 3) + '" y="' + windowTopY + '" width="6" height="' + shadedPixels + '" fill="rgba(0,0,50,0.35)" rx="1"/>';
        if (shadedPixels > 15) {
          svg += '<text x="' + (wallX - 10) + '" y="' + (windowTopY + shadedPixels / 2 + 3) + '" text-anchor="end" font-size="9" fill="#1e3a5f">' + shadedHeight.toFixed(1) + ' ft shaded</text>';
        }
      }

      if (awningDepth > 0) {
        var shadowLineY = windowTopY + shadedHeight * s;
        svg += '<line x1="' + awningEndX + '" y1="' + awningY + '" x2="' + wallX + '" y2="' + Math.min(shadowLineY, windowBottomY) + '" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.8"/>';
      }

      var unshadedWindowHeight = windowHeight - shadedHeight;
      if (unshadedWindowHeight > 0.01 && floorPenetration > 0) {
        var penetrationPixels = Math.min(floorPenetration, 10) * s;
        svg += '<rect x="' + wallX + '" y="' + (floorY - 4) + '" width="' + Math.min(penetrationPixels, roomRightX - wallX) + '" height="4" fill="#fbbf24" opacity="0.5" rx="1"/>';

        var rayEndX = Math.min(wallX + sillHeight / tanVSA * s, roomRightX);
        svg += '<line x1="' + wallX + '" y1="' + windowBottomY + '" x2="' + rayEndX + '" y2="' + floorY + '" stroke="#f59e0b" stroke-width="1.5" opacity="0.6"/>';

        var unshadedTopY = windowTopY + shadedHeight * s;
        var topRayEndX = Math.min(wallX + (sillHeight + unshadedWindowHeight) / tanVSA * s, roomRightX);
        svg += '<line x1="' + wallX + '" y1="' + unshadedTopY + '" x2="' + topRayEndX + '" y2="' + floorY + '" stroke="#f59e0b" stroke-width="1" opacity="0.4"/>';

        if (floorPenetration < 50) {
          var labelX = Math.min(wallX + penetrationPixels / 2, roomRightX - 30);
          svg += '<text x="' + labelX + '" y="' + (floorY + 15) + '" text-anchor="middle" font-size="10" fill="#d97706">' + floorPenetration.toFixed(1) + ' ft penetration</text>';
        }
      }

      // VSA angle arc
      var arcR = 35;
      var vEndX = wallX - arcR;
      var vEndY = awningY;
      var vArcX = wallX - arcR * Math.cos(vsaRad);
      var vArcY = awningY - arcR * Math.sin(vsaRad);

      svg += '<path d="M ' + vEndX + ' ' + vEndY + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + vArcX + ' ' + vArcY + '" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.7"/>';
      var labelR = arcR + 12;
      var midAngle = vsaRad / 2;
      var labelVX = wallX - labelR * Math.cos(midAngle);
      var labelVY = awningY - labelR * Math.sin(midAngle);
      svg += '<text x="' + labelVX + '" y="' + labelVY + '" text-anchor="middle" font-size="9" fill="#f59e0b">VSA ' + vsaDeg.toFixed(1) + '\u00B0</text>';

      // Incoming sun rays
      var altRad = sunAltDeg * Math.PI / 180;
      for (var i = 0; i < 3; i++) {
        var startY = awningY - 20 - i * 25;
        var startX = outsideLeftX + i * 10;
        var rayLen = 100;
        var endXRay = startX + rayLen * Math.cos(altRad);
        var endYRay = startY + rayLen * Math.sin(altRad);
        svg += '<line x1="' + startX + '" y1="' + startY + '" x2="' + endXRay + '" y2="' + endYRay + '" stroke="#fbbf24" stroke-width="1" opacity="0.3"/>';
      }

    } else if (!sunHitsWall) {
      svg += '<text x="' + ((outsideLeftX + wallX) / 2) + '" y="50" text-anchor="middle" font-size="11" fill="#94a3b8">Sun behind wall</text>';
    } else if (sunAltDeg <= 0) {
      svg += '<text x="' + ((outsideLeftX + wallX) / 2) + '" y="50" text-anchor="middle" font-size="11" fill="#94a3b8">Sun below horizon</text>';
    }

    // ─── Labels ──────────────────────────────────────────────────
    svg += '<text x="' + ((outsideLeftX + wallX) / 2) + '" y="' + (floorY + 30) + '" text-anchor="middle" font-size="10" fill="#94a3b8">Outside</text>';
    svg += '<text x="' + ((wallX + roomRightX) / 2) + '" y="' + (floorY + 30) + '" text-anchor="middle" font-size="10" fill="#94a3b8">Inside Room</text>';

    // Shading fraction
    var shadePct = (shadingFraction * 100).toFixed(0);
    var shadeColor = shadingFraction > 0.7 ? '#16a34a' : shadingFraction > 0.3 ? '#d97706' : '#dc2626';
    svg += '<text x="' + (roomRightX - 10) + '" y="35" text-anchor="end" font-size="12" font-weight="bold" fill="' + shadeColor + '">' + shadePct + '% shaded</text>';

    this.svg.innerHTML = svg;
  }
}

window.App.CrossSection = CrossSection;

})();
