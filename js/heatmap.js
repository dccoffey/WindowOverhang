// heatmap.js — SVG annual heatmap: 12 months x hours, color-coded shading percentages

(function() {
'use strict';

window.App = window.App || {};

class Heatmap {
  constructor(svgElement, tooltipElement) {
    this.svg = svgElement;
    this.tooltip = tooltipElement;
    this.cellWidth = 32;
    this.cellHeight = 22;
    this.marginLeft = 40;
    this.marginTop = 25;
    this.hours = [];
    for (var h = 5; h <= 20; h++) this.hours.push(h);
    this.months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  }

  update(annualData) {
    var cw = this.cellWidth;
    var ch = this.cellHeight;
    var ml = this.marginLeft;
    var mt = this.marginTop;
    var totalW = ml + this.hours.length * cw + 10;
    var totalH = mt + 12 * ch + 10;

    this.svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
    this.svg.style.minHeight = totalH + 'px';

    var html = '';
    var self = this;

    // Hour labels (top)
    this.hours.forEach(function(h, i) {
      var x = ml + i * cw + cw / 2;
      html += '<text x="' + x + '" y="' + (mt - 8) + '" text-anchor="middle" font-size="9" fill="#64748b">' + h + '</text>';
    });

    // Month labels (left)
    this.months.forEach(function(m, i) {
      var y = mt + i * ch + ch / 2 + 3;
      html += '<text x="' + (ml - 5) + '" y="' + y + '" text-anchor="end" font-size="9" fill="#64748b">' + m + '</text>';
    });

    // Build lookup map
    var dataMap = {};
    annualData.forEach(function(d) {
      dataMap[d.month + '-' + d.hour] = d;
    });

    // Cells
    this.months.forEach(function(m, mi) {
      self.hours.forEach(function(h, hi) {
        var x = ml + hi * cw;
        var y = mt + mi * ch;
        var key = mi + '-' + h;
        var d = dataMap[key];

        var color, displayText, tooltipText;

        if (!d || d.sunBelowHorizon) {
          color = '#1e293b';
          displayText = '';
          tooltipText = self.months[mi] + ' ' + h + ':00 \u2014 Night';
        } else if (d.sunBehindWall) {
          color = '#334155';
          displayText = '';
          tooltipText = self.months[mi] + ' ' + h + ':00 \u2014 Sun behind wall';
        } else if (d.shadingPercent !== null) {
          color = self._shadingColor(d.shadingPercent);
          displayText = Math.round(d.shadingPercent);
          tooltipText = self.months[mi] + ' ' + h + ':00 \u2014 ' + d.shadingPercent.toFixed(0) + '% shaded (Alt: ' + d.sunAltDeg.toFixed(1) + '\u00B0)';
        } else {
          color = '#334155';
          displayText = '';
          tooltipText = self.months[mi] + ' ' + h + ':00 \u2014 No data';
        }

        html += '<rect x="' + x + '" y="' + y + '" width="' + (cw - 1) + '" height="' + (ch - 1) + '" fill="' + color + '" rx="2" data-tip="' + tooltipText + '" class="hm-cell"/>';

        if (displayText !== '' && cw >= 24) {
          var textColor = d.shadingPercent > 60 ? '#fff' : d.shadingPercent < 20 ? '#fff' : '#1e293b';
          html += '<text x="' + (x + cw / 2 - 0.5) + '" y="' + (y + ch / 2 + 3) + '" text-anchor="middle" font-size="8" fill="' + textColor + '" pointer-events="none">' + displayText + '</text>';
        }
      });
    });

    // Title
    html += '<text x="' + (ml + (this.hours.length * cw) / 2) + '" y="12" text-anchor="middle" font-size="10" fill="#64748b" font-weight="600">Window Shading % by Month and Hour</text>';

    // Color legend
    var legendY = mt + 12 * ch + 8;
    var legendX = ml;
    var legendW = this.hours.length * cw;
    var swatchW = legendW / 5;

    var legendStops = [
      { pct: 0, label: '0%' },
      { pct: 25, label: '25%' },
      { pct: 50, label: '50%' },
      { pct: 75, label: '75%' },
      { pct: 100, label: '100%' },
    ];
    legendStops.forEach(function(s, i) {
      var x = legendX + i * swatchW;
      html += '<rect x="' + x + '" y="' + legendY + '" width="' + (swatchW - 1) + '" height="10" fill="' + self._shadingColor(s.pct) + '" rx="1"/>';
      html += '<text x="' + (x + swatchW / 2) + '" y="' + (legendY + 20) + '" text-anchor="middle" font-size="8" fill="#64748b">' + s.label + '</text>';
    });
    html += '<text x="' + (legendX - 5) + '" y="' + (legendY + 7) + '" text-anchor="end" font-size="8" fill="#94a3b8">Shaded:</text>';

    // Night / behind-wall key
    var keyY = legendY + 28;
    html += '<rect x="' + legendX + '" y="' + keyY + '" width="12" height="10" fill="#1e293b" rx="1"/>';
    html += '<text x="' + (legendX + 16) + '" y="' + (keyY + 8) + '" font-size="8" fill="#64748b">Night</text>';
    html += '<rect x="' + (legendX + 55) + '" y="' + keyY + '" width="12" height="10" fill="#334155" rx="1"/>';
    html += '<text x="' + (legendX + 71) + '" y="' + (keyY + 8) + '" font-size="8" fill="#64748b">Sun behind wall</text>';

    // Increase viewBox height to fit legend
    var totalHWithLegend = keyY + 18;
    this.svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalHWithLegend);
    this.svg.style.minHeight = totalHWithLegend + 'px';

    this.svg.innerHTML = html;

    // Tooltip events
    var tooltip = this.tooltip;
    this.svg.querySelectorAll('.hm-cell').forEach(function(cell) {
      cell.addEventListener('mouseenter', function(e) {
        var tip = cell.getAttribute('data-tip');
        if (!tip) return;
        tooltip.textContent = tip;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
      });
      cell.addEventListener('mousemove', function(e) {
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
      });
      cell.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
      });
    });
  }

  _shadingColor(percent) {
    if (percent >= 50) {
      var t = (percent - 50) / 50;
      var r = Math.round(255 * (1 - t));
      var g = Math.round(255 * (1 - t * 0.5));
      var b = 255;
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else {
      var t2 = percent / 50;
      var r2 = 255;
      var g2 = Math.round(140 + 115 * t2);
      var b2 = Math.round(0 + 255 * t2);
      return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
    }
  }
}

window.App.Heatmap = Heatmap;

})();
