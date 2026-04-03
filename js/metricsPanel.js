// metricsPanel.js — Real-time metrics display

(function() {
'use strict';

window.App = window.App || {};

class MetricsPanel {
  constructor() {
    this.elements = {
      alt: document.getElementById('m-alt'),
      az: document.getElementById('m-az'),
      hsa: document.getElementById('m-hsa'),
      vsa: document.getElementById('m-vsa'),
      shade: document.getElementById('m-shade'),
      floor: document.getElementById('m-floor'),
      shgc: document.getElementById('m-shgc'),
      pf: document.getElementById('m-pf'),
      heat: document.getElementById('m-heat'),
    };
  }

  update(metrics) {
    var sunAltDeg = metrics.sunAltDeg;
    var sunAzDeg = metrics.sunAzDeg;
    var hsaDeg = metrics.hsaDeg;
    var vsaDeg = metrics.vsaDeg;
    var windowShadingFraction = metrics.windowShadingFraction;
    var floorPenetration = metrics.floorPenetration;
    var effectiveSHGC = metrics.effectiveSHGC;
    var projectionFactor = metrics.projectionFactor;
    var solarHeatGain = metrics.solarHeatGain;
    var sunBelowHorizon = metrics.sunBelowHorizon;
    var sunBehindWall = metrics.sunBehindWall;

    if (sunBelowHorizon) {
      this._set('alt', sunAltDeg.toFixed(1) + '\u00B0', 'muted');
      this._set('az', '\u2014', 'muted');
      this._set('hsa', '\u2014', 'muted');
      this._set('vsa', '\u2014', 'muted');
      this._set('shade', 'Night', 'muted');
      this._set('floor', '\u2014', 'muted');
      this._set('shgc', effectiveSHGC.toFixed(2));
      this._set('pf', projectionFactor.toFixed(2));
      this._set('heat', '0 W');
      return;
    }

    this._set('alt', sunAltDeg.toFixed(1) + '\u00B0');
    this._set('az', sunAzDeg.toFixed(1) + '\u00B0');
    this._set('hsa', hsaDeg.toFixed(1) + '\u00B0');

    if (sunBehindWall) {
      this._set('vsa', 'Behind wall', 'muted');
      this._set('shade', 'No direct sun', 'muted');
      this._set('floor', '0 ft');
      this._set('heat', '0 W');
    } else {
      this._set('vsa', vsaDeg.toFixed(1) + '\u00B0');

      var shadePct = (windowShadingFraction * 100).toFixed(0);
      var shadeColor = windowShadingFraction > 0.7 ? 'good' : windowShadingFraction > 0.3 ? 'warn' : 'bad';
      this._set('shade', shadePct + '%', shadeColor);

      var metricMode = window.App._controls && window.App._controls._metricMode;
      if (floorPenetration > 50) {
        this._set('floor', metricMode ? '> 15 m' : '> 50 ft');
      } else {
        if (metricMode) {
          this._set('floor', (floorPenetration * 0.3048).toFixed(2) + ' m');
        } else {
          this._set('floor', floorPenetration.toFixed(1) + ' ft');
        }
      }

      this._set('heat', solarHeatGain.toFixed(0) + ' W');
    }

    this._set('shgc', effectiveSHGC.toFixed(3));
    this._set('pf', projectionFactor.toFixed(2));
  }

  _set(key, value, status) {
    var el = this.elements[key];
    if (!el) return;
    el.textContent = value;
    el.className = 'metric-value';
    if (status === 'good') el.style.color = '#16a34a';
    else if (status === 'warn') el.style.color = '#d97706';
    else if (status === 'bad') el.style.color = '#dc2626';
    else if (status === 'muted') el.style.color = '#94a3b8';
    else el.style.color = '';

    // Set data-status on the parent .metric card for CSS styling
    var card = el.closest('.metric');
    if (card) {
      card.setAttribute('data-status', status || 'neutral');
    }
  }
}

window.App.MetricsPanel = MetricsPanel;

})();
