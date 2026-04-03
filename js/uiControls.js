// uiControls.js — Interactive controls: sliders, compass dial, presets, animation buttons
// Dispatches 'controls-changed' custom events on the document.

(function() {
'use strict';

window.App = window.App || {};

var PRESET_CITIES = window.App.PRESET_CITIES;
var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

class UIControls {
  constructor() {
    this.state = {
      lat: 39.7,
      lng: -105.0,
      windowWidth: 4,
      windowHeight: 5,
      sillHeight: 3,
      wallAzimuth: 180,
      awningDepth: 2,
      awningGap: 0.5,
      awningWidthExtra: 2,
      month: 2,
      day: 20,
      hour: 13,
      glazingType: 'Double Clear'
    };

    this._animDayInterval = null;
    this._animYearInterval = null;
    this._metricMode = false;

    this._initCityPresets();
    this._initSliders();
    this._initSnapButtons();
    this._initQuickButtons();
    this._initAnimButtons();
    this._initGlazing();
    this._initLocationInputs();
    this._initDoorPresets();
    this._initUnitToggle();
    this._initTypedInputs();
    this._updateGmtDisplay();
  }

  getState() {
    var s = this.state;
    return {
      lat: s.lat,
      lng: s.lng,
      windowWidth: s.windowWidth,
      windowHeight: s.windowHeight,
      sillHeight: s.sillHeight,
      wallAzimuth: s.wallAzimuth,
      awningDepth: s.awningDepth,
      awningGap: s.awningGap,
      awningWidthExtra: s.awningWidthExtra,
      glazingType: s.glazingType,
      month: s.month,
      day: s.day,
      hour: s.hour,
      awningWidth: s.windowWidth + s.awningWidthExtra,
      date: App.makeLocalDate(2024, s.month - 1, s.day, Math.floor(s.hour), (s.hour % 1) * 60, s.lng)
    };
  }

  _fireChange() {
    this._updateGmtDisplay();
    document.dispatchEvent(new CustomEvent('controls-changed', { detail: this.getState() }));
  }

  _updateGmtDisplay() {
    var el = document.getElementById('val-hour-gmt');
    if (!el) return;
    var offset = Math.round(this.state.lng / 15);
    var gmtHour = this.state.hour - offset;
    // Wrap to 0-24 range
    gmtHour = ((gmtHour % 24) + 24) % 24;
    var h = Math.floor(gmtHour);
    var m = Math.round((gmtHour % 1) * 60);
    el.textContent = '(GMT ' + h + ':' + m.toString().padStart(2, '0') + ')';
  }

  // ─── Location ────────────────────────────────────────────────────

  _initLocationInputs() {
    var self = this;
    var latInput = document.getElementById('input-lat');
    var lngInput = document.getElementById('input-lng');

    latInput.addEventListener('change', function() {
      var newLat = parseFloat(latInput.value) || 0;
      var oldLat = self.state.lat;
      self.state.lat = newLat;
      document.getElementById('select-city').value = '';
      // Auto-flip wall orientation when hemisphere changes
      if ((newLat < 0) !== (oldLat < 0)) {
        var newAz = newLat < 0 ? 0 : 180;
        self.state.wallAzimuth = newAz;
        document.getElementById('input-orientation').value = newAz;
      }
      self._fireChange();
    });
    lngInput.addEventListener('change', function() {
      self.state.lng = parseFloat(lngInput.value) || 0;
      document.getElementById('select-city').value = '';
      self._fireChange();
    });
  }

  _initCityPresets() {
    var self = this;
    var sel = document.getElementById('select-city');
    PRESET_CITIES.forEach(function(city) {
      var opt = document.createElement('option');
      opt.value = JSON.stringify({ lat: city.lat, lng: city.lng });
      opt.textContent = city.name;
      sel.appendChild(opt);
    });
    // Select Denver by default
    sel.value = JSON.stringify({ lat: 39.7, lng: -105.0 });
    sel.addEventListener('change', function() {
      if (!sel.value) return;
      var coords = JSON.parse(sel.value);
      self.state.lat = coords.lat;
      self.state.lng = coords.lng;
      document.getElementById('input-lat').value = coords.lat;
      document.getElementById('input-lng').value = coords.lng;
      // Auto-flip wall orientation for hemisphere:
      // Southern hemisphere → north-facing (0°), Northern → south-facing (180°)
      var newAz = coords.lat < 0 ? 0 : 180;
      self.state.wallAzimuth = newAz;
      document.getElementById('input-orientation').value = newAz;
      self._fireChange();
    });
  }

  // ─── Sliders ─────────────────────────────────────────────────────

  _initSliders() {
    var self = this;
    var sliders = [
      { id: 'slider-ww',   val: 'val-ww',   key: 'windowWidth',      dim: true, fmt: function(v) { return v.toFixed(1); } },
      { id: 'slider-wh',   val: 'val-wh',   key: 'windowHeight',     dim: true, fmt: function(v) { return v.toFixed(1); } },
      { id: 'slider-sill', val: 'val-sill',  key: 'sillHeight',      dim: true, fmt: function(v) { return v.toFixed(1); } },
      { id: 'slider-ad',   val: 'val-ad',   key: 'awningDepth',      dim: true, fmt: function(v) { return v.toFixed(2); } },
      { id: 'slider-ag',   val: 'val-ag',   key: 'awningGap',        dim: true, fmt: function(v) { return v.toFixed(2); } },
      { id: 'slider-aw',   val: 'val-aw',   key: 'awningWidthExtra', dim: true, fmt: function(v) { return v.toFixed(1); } },
      { id: 'slider-month',val: 'val-month', key: 'month',           fmt: function(v) { return MONTHS[v - 1]; } },
      { id: 'slider-day',  val: 'val-day',  key: 'day',              fmt: function(v) { return String(Math.round(v)); } },
      { id: 'slider-hour', val: 'val-hour', key: 'hour',             fmt: function(v) {
        var h = Math.floor(v);
        var m = Math.round((v % 1) * 60);
        return h + ':' + m.toString().padStart(2, '0');
      }},
    ];

    sliders.forEach(function(s) {
      var slider = document.getElementById(s.id);
      var valEl = document.getElementById(s.val);
      if (!slider) return;

      slider.addEventListener('input', function() {
        var v = parseFloat(slider.value);
        self.state[s.key] = v;
        if (valEl) {
          // For dimension sliders, use centralized format (respects metric mode)
          if (s.dim) {
            valEl.textContent = self._fmtVal(s.key);
          } else {
            valEl.textContent = s.fmt(v);
          }
        }
        // Update awning width+ slider max when window width changes
        if (s.key === 'windowWidth') {
          self._updateAwningWidthMax();
          self._updateTotalWidthDisplay();
        }
        if (s.key === 'awningWidthExtra') {
          self._updateTotalWidthDisplay();
        }
        self._fireChange();
      });

      // Set initial display
      if (valEl) valEl.textContent = s.fmt(self.state[s.key]);
    });

    // Set initial awning width max and total display
    this._updateAwningWidthMax();
    this._updateTotalWidthDisplay();
  }

  _updateTotalWidthDisplay() {
    var el = document.getElementById('val-aw-total');
    if (!el) return;
    var total = this.state.windowWidth + this.state.awningWidthExtra;
    var unit = this._metricMode ? 'm' : 'ft';
    var val = this._metricMode ? (total * 0.3048).toFixed(2) : total.toFixed(1);
    el.textContent = unit + ' (' + val + ' total)';
  }

  _updateAwningWidthMax() {
    var awSlider = document.getElementById('slider-aw');
    if (!awSlider) return;
    var newMax = this.state.windowWidth + 5;
    awSlider.max = newMax;
    // Clamp current value if it exceeds new max
    if (this.state.awningWidthExtra > newMax) {
      this.state.awningWidthExtra = newMax;
      awSlider.value = newMax;
      var valEl = document.getElementById('val-aw');
      if (valEl) valEl.textContent = newMax.toFixed(1);
    }
  }

  // ─── Snap Buttons ────────────────────────────────────────────────

  _initSnapButtons() {
    var self = this;
    document.querySelectorAll('.snap-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var angle = parseInt(btn.dataset.angle);
        self.state.wallAzimuth = angle;
        document.getElementById('input-orientation').value = angle;
        self._fireChange();
      });
    });

    var orientInput = document.getElementById('input-orientation');
    if (orientInput) {
      orientInput.addEventListener('change', function() {
        var v = parseInt(orientInput.value) || 0;
        v = ((v % 360) + 360) % 360;
        orientInput.value = v;
        self.state.wallAzimuth = v;
        self._fireChange();
      });
    }
  }

  // ─── Quick Buttons (Solstice/Equinox) ────────────────────────────

  _initQuickButtons() {
    var self = this;
    document.querySelectorAll('.quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var month = parseInt(btn.dataset.month);
        var day = parseInt(btn.dataset.day);
        var hour = parseFloat(btn.dataset.hour);

        self.state.month = month;
        self.state.day = day;
        self.state.hour = hour;

        document.getElementById('slider-month').value = month;
        document.getElementById('slider-day').value = day;
        document.getElementById('slider-hour').value = hour;

        document.getElementById('val-month').textContent = MONTHS[month - 1];
        document.getElementById('val-day').textContent = day;
        document.getElementById('val-hour').textContent = Math.floor(hour) + ':' + ((hour % 1) * 60).toString().padStart(2, '0');

        self._fireChange();
      });
    });
  }

  // ─── Animation Buttons ───────────────────────────────────────────

  _initAnimButtons() {
    var self = this;
    var dayBtn = document.getElementById('btn-animate-day');
    var yearBtn = document.getElementById('btn-animate-year');

    dayBtn.addEventListener('click', function() {
      if (self._animDayInterval) {
        self.stopAnimations();
        return;
      }
      self._stopYearAnim();
      dayBtn.classList.add('active');
      dayBtn.textContent = '\u25A0 Stop';

      var hourSlider = document.getElementById('slider-hour');
      var step = 1 / 6; // 10-minute increments
      self.state.hour = 8;
      hourSlider.value = 8;
      var h0 = Math.floor(self.state.hour);
      var m0 = Math.round((self.state.hour % 1) * 60);
      document.getElementById('val-hour').textContent = h0 + ':' + m0.toString().padStart(2, '0');
      self._fireChange();

      self._animDayInterval = setInterval(function() {
        self.state.hour += step;
        if (self.state.hour > 20) {
          self.stopAnimations();
          return;
        }
        hourSlider.value = self.state.hour;
        var h = Math.floor(self.state.hour);
        var m = Math.round((self.state.hour % 1) * 60);
        document.getElementById('val-hour').textContent = h + ':' + m.toString().padStart(2, '0');
        self._fireChange();
      }, 333);
    });

    yearBtn.addEventListener('click', function() {
      if (self._animYearInterval) {
        self.stopAnimations();
        return;
      }
      self._stopDayAnim();
      yearBtn.classList.add('active');
      yearBtn.textContent = '\u25A0 Stop';

      var daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      var dayOfYear = 1; // start Jan 1

      function doyToMonthDay(doy) {
        var m = 0;
        var d = doy;
        while (m < 12 && d > daysInMonth[m]) {
          d -= daysInMonth[m];
          m++;
        }
        return { month: m + 1, day: d };
      }

      var md = doyToMonthDay(dayOfYear);
      self.state.month = md.month;
      self.state.day = md.day;
      self.state.hour = 12;
      document.getElementById('slider-month').value = md.month;
      document.getElementById('slider-day').value = md.day;
      document.getElementById('slider-hour').value = 12;
      document.getElementById('val-month').textContent = MONTHS[md.month - 1];
      document.getElementById('val-day').textContent = md.day;
      self._fireChange();

      self._animYearInterval = setInterval(function() {
        dayOfYear += 7;
        if (dayOfYear > 365) {
          self.stopAnimations();
          return;
        }
        var md = doyToMonthDay(dayOfYear);
        self.state.month = md.month;
        self.state.day = md.day;
        document.getElementById('slider-month').value = md.month;
        document.getElementById('slider-day').value = md.day;
        document.getElementById('val-month').textContent = MONTHS[md.month - 1];
        document.getElementById('val-day').textContent = md.day;
        self._fireChange();
      }, 500);
    });
  }

  _stopDayAnim() {
    if (this._animDayInterval) {
      clearInterval(this._animDayInterval);
      this._animDayInterval = null;
      var btn = document.getElementById('btn-animate-day');
      btn.classList.remove('active');
      btn.textContent = '\u25B6 Animate Day';
    }
  }

  _stopYearAnim() {
    if (this._animYearInterval) {
      clearInterval(this._animYearInterval);
      this._animYearInterval = null;
      var btn = document.getElementById('btn-animate-year');
      btn.classList.remove('active');
      btn.textContent = '\u25B6 Animate Year';
    }
  }

  stopAnimations() {
    this._stopDayAnim();
    this._stopYearAnim();
  }

  // ─── Door Presets ───────────────────────────────────────────────

  _initDoorPresets() {
    var self = this;
    document.querySelectorAll('.door-preset-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var preset = btn.dataset.preset;
        var w, h, sill;
        if (preset === 'glass-door') {
          w = 3; h = 6.5; sill = 0;
        } else if (preset === 'sliding-door') {
          w = 6; h = 6.5; sill = 0;
        } else {
          return;
        }
        self.state.windowWidth = w;
        self.state.windowHeight = h;
        self.state.sillHeight = sill;

        document.getElementById('slider-ww').value = w;
        document.getElementById('slider-wh').value = h;
        document.getElementById('slider-sill').value = sill;
        document.getElementById('val-ww').textContent = self._fmtVal('windowWidth');
        document.getElementById('val-wh').textContent = self._fmtVal('windowHeight');
        document.getElementById('val-sill').textContent = self._fmtVal('sillHeight');

        self._updateAwningWidthMax();
        self._updateTotalWidthDisplay();
        self._fireChange();
      });
    });
  }

  // ─── Glazing ─────────────────────────────────────────────────────

  _initGlazing() {
    var self = this;
    var sel = document.getElementById('select-glazing');
    sel.addEventListener('change', function() {
      self.state.glazingType = sel.value;
      self._fireChange();
    });
  }

  // ─── Unit Toggle (ft ⇄ m) ───────────────────────────────────────

  _initUnitToggle() {
    var self = this;
    var btn = document.getElementById('unit-toggle');
    if (!btn) return;

    this._unitSliders = [
      { key: 'windowWidth',      valId: 'val-ww',   fmt: 1 },
      { key: 'windowHeight',     valId: 'val-wh',   fmt: 1 },
      { key: 'sillHeight',       valId: 'val-sill',  fmt: 1 },
      { key: 'awningDepth',      valId: 'val-ad',   fmt: 2 },
      { key: 'awningGap',        valId: 'val-ag',   fmt: 2 },
      { key: 'awningWidthExtra', valId: 'val-aw',   fmt: 1 }
    ];

    btn.addEventListener('click', function() {
      self._metricMode = !self._metricMode;
      btn.textContent = self._metricMode ? 'm ⇄ ft' : 'ft ⇄ m';
      btn.classList.toggle('metric', self._metricMode);

      // Update all unit labels
      document.querySelectorAll('.unit-label').forEach(function(el) {
        el.textContent = self._metricMode ? 'm' : 'ft';
      });

      // Update all displayed values
      self._refreshAllDisplayValues();

      // Update total width display
      self._updateTotalWidthDisplay();

      // Trigger scene refresh (updates floor penetration display etc.)
      self._fireChange();
    });
  }

  // Refresh all value displays to current unit system
  _refreshAllDisplayValues() {
    var self = this;
    if (!this._unitSliders) return;
    this._unitSliders.forEach(function(s) {
      var valEl = document.getElementById(s.valId);
      if (!valEl || valEl._isEditing) return;
      var ftVal = self.state[s.key];
      valEl.textContent = self._metricMode
        ? (ftVal * 0.3048).toFixed(s.fmt)
        : ftVal.toFixed(s.fmt);
    });
  }

  // Format a value for display in current unit mode
  _fmtVal(key) {
    var ftVal = this.state[key];
    var cfg = this._unitSliders && this._unitSliders.find(function(s) { return s.key === key; });
    var fmt = cfg ? cfg.fmt : 1;
    return this._metricMode ? (ftVal * 0.3048).toFixed(fmt) : ftVal.toFixed(fmt);
  }

  // ─── Click-to-Edit Values ──────────────────────────────────────

  _initTypedInputs() {
    var self = this;
    // Attach click-to-edit behavior to all .editable-val spans
    document.querySelectorAll('.editable-val').forEach(function(span) {
      var sliderId = span.dataset.slider;
      var key = span.dataset.key;
      if (!sliderId || !key) return;

      span.addEventListener('click', function(e) {
        if (span._isEditing) return;
        e.stopPropagation();
        self._startEditing(span, sliderId, key);
      });
    });
  }

  _startEditing(span, sliderId, key) {
    var self = this;
    var slider = document.getElementById(sliderId);
    if (!slider) return;

    span._isEditing = true;
    var currentText = span.textContent;

    // Replace span content with an input
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'editable-val-input';
    input.value = currentText;
    input.title = self._metricMode ? 'Enter value in meters' : "Enter value (e.g. 3.5 or 3'6\")";

    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      if (!span._isEditing) return;
      span._isEditing = false;
      var raw = input.value.trim();

      if (raw && raw !== currentText) {
        var ftVal = self._parseLength(raw);
        if (!isNaN(ftVal) && ftVal >= 0) {
          var min = parseFloat(slider.min);
          var max = parseFloat(slider.max);
          ftVal = Math.max(min, Math.min(max, ftVal));

          self.state[key] = ftVal;
          slider.value = ftVal;

          if (key === 'windowWidth') {
            self._updateAwningWidthMax();
            self._updateTotalWidthDisplay();
          }
          if (key === 'awningWidthExtra') {
            self._updateTotalWidthDisplay();
          }
          self._fireChange();
        }
      }
      // Restore span text
      span.textContent = self._fmtVal(key);
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { span._isEditing = false; span.textContent = currentText; }
    });
    input.addEventListener('blur', function() { commit(); });
  }

  // Parse a length string. Supports:
  //   "3.5"      → 3.5 (feet in imperial, meters in metric)
  //   "3'6"      → 3.5 feet (feet+inches, imperial only)
  //   "3'6\""    → 3.5 feet
  //   "42\""     → 3.5 feet (inches only)
  _parseLength(raw) {
    raw = raw.trim();

    // Feet+inches: 3'6, 3' 6", 3'6"
    var feetInchMatch = raw.match(/^(\d+(?:\.\d+)?)\s*['′]\s*(\d+(?:\.\d+)?)\s*[""″]?\s*$/);
    if (feetInchMatch) {
      return parseFloat(feetInchMatch[1]) + parseFloat(feetInchMatch[2]) / 12;
    }

    // Inches only: 42", 42″
    var inchMatch = raw.match(/^(\d+(?:\.\d+)?)\s*[""″]\s*$/);
    if (inchMatch) {
      return parseFloat(inchMatch[1]) / 12;
    }

    // Plain number — interpreted as current unit system
    var val = parseFloat(raw);
    if (isNaN(val)) return NaN;
    return this._metricMode ? val / 0.3048 : val;
  }

  // ─── Programmatic update ─────────────────────────────────────────

  setHour(h) {
    this.state.hour = h;
    document.getElementById('slider-hour').value = h;
    var hr = Math.floor(h);
    var mn = Math.round((h % 1) * 60);
    document.getElementById('val-hour').textContent = hr + ':' + mn.toString().padStart(2, '0');
  }

  setMonth(m) {
    this.state.month = m;
    document.getElementById('slider-month').value = m;
    document.getElementById('val-month').textContent = MONTHS[m - 1];
  }
}

window.App.UIControls = UIControls;

})();
