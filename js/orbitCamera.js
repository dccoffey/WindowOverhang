// orbitCamera.js — Manual orbit camera controller for Three.js r128
// Replaces OrbitControls (not available as importable module in r128)

(function() {
'use strict';

window.App = window.App || {};

const THREE = window.THREE;

class OrbitCamera {
  constructor(camera, domElement, options) {
    options = options || {};
    this.camera = camera;
    this.domElement = domElement;

    this.target = options.target || new THREE.Vector3(0, 3, 0);
    this._baseTarget = this.target.clone();
    this.minRadius = options.minRadius || 15;
    this.maxRadius = options.maxRadius || 300;
    this.minPhi = options.minPhi || 0.05;
    this.maxPhi = options.maxPhi || Math.PI / 2 - 0.05;

    this.theta = options.theta || Math.PI / 4;
    this.phi = options.phi || Math.PI / 5;
    this.radius = options.radius || 35;

    this._isDragging = false;
    this._prevMouse = { x: 0, y: 0 };
    this._pinchDist = 0;

    this._bindEvents();
    this.updatePosition();
  }

  _bindEvents() {
    var self = this;
    var el = this.domElement;

    this._onMouseDown = function(e) {
      self._isDragging = true;
      self._prevMouse = { x: e.clientX, y: e.clientY };
    };
    this._onMouseMove = function(e) {
      if (!self._isDragging) return;
      var dx = e.clientX - self._prevMouse.x;
      var dy = e.clientY - self._prevMouse.y;
      self.theta -= dx * 0.005;
      self.phi = Math.max(self.minPhi, Math.min(self.maxPhi, self.phi + dy * 0.005));
      self._prevMouse = { x: e.clientX, y: e.clientY };
      self.updatePosition();
    };
    this._onMouseUp = function() { self._isDragging = false; };

    this._onWheel = function(e) {
      e.preventDefault();
      self.radius = Math.max(self.minRadius, Math.min(self.maxRadius, self.radius + e.deltaY * 0.05));
      self.updatePosition();
    };

    el.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });

    this._onTouchStart = function(e) {
      if (e.touches.length === 1) {
        self._isDragging = true;
        self._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        self._isDragging = false;
        self._pinchDist = self._getTouchDist(e.touches);
      }
      e.preventDefault();
    };
    this._onTouchMove = function(e) {
      if (e.touches.length === 1 && self._isDragging) {
        var dx = e.touches[0].clientX - self._prevMouse.x;
        var dy = e.touches[0].clientY - self._prevMouse.y;
        self.theta -= dx * 0.005;
        self.phi = Math.max(self.minPhi, Math.min(self.maxPhi, self.phi + dy * 0.005));
        self._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        self.updatePosition();
      } else if (e.touches.length === 2) {
        var dist = self._getTouchDist(e.touches);
        var delta = self._pinchDist - dist;
        self.radius = Math.max(self.minRadius, Math.min(self.maxRadius, self.radius + delta * 0.1));
        self._pinchDist = dist;
        self.updatePosition();
      }
      e.preventDefault();
    };
    this._onTouchEnd = function() { self._isDragging = false; };

    el.addEventListener('touchstart', this._onTouchStart, { passive: false });
    el.addEventListener('touchmove', this._onTouchMove, { passive: false });
    el.addEventListener('touchend', this._onTouchEnd);
  }

  _getTouchDist(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  updatePosition() {
    // Progressively raise the look-at target as we zoom out,
    // so distant views look down at the scene instead of half-empty ground
    var zoomFrac = Math.max(0, (this.radius - this.minRadius) / (this.maxRadius - this.minRadius));
    var targetLift = zoomFrac * zoomFrac * 40; // quadratic: gentle near, strong far (up to 40 units at max zoom)
    this.target.y = this._baseTarget.y + targetLift;

    this.camera.position.set(
      this.target.x + this.radius * Math.cos(this.phi) * Math.sin(this.theta),
      this.target.y + this.radius * Math.sin(this.phi),
      this.target.z + this.radius * Math.cos(this.phi) * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  }

  setTarget(vec3) {
    this.target.copy(vec3);
    this.updatePosition();
  }

  reset() {
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 5;
    this.radius = 35;
    this.updatePosition();
  }

  dispose() {
    var el = this.domElement;
    el.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    el.removeEventListener('wheel', this._onWheel);
    el.removeEventListener('touchstart', this._onTouchStart);
    el.removeEventListener('touchmove', this._onTouchMove);
    el.removeEventListener('touchend', this._onTouchEnd);
  }
}

window.App.OrbitCamera = OrbitCamera;

})();
