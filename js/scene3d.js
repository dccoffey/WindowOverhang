// scene3d.js — Three.js r128 3D scene: celestial hemisphere, sun paths, room, sunlight patch

(function() {
'use strict';

window.App = window.App || {};

var THREE = window.THREE;
var DEG = Math.PI / 180;
var RAD = 180 / Math.PI;

var DOME_RADIUS = 120;
var ROOM_WIDTH = 12;
var ROOM_DEPTH = 14;
var ROOM_HEIGHT = 9;
var INNER_COMPASS_R = 20;
var RIDGE_HEIGHT = ROOM_HEIGHT + 3;

var getSunPosition = window.App.getSunPosition;
var getSunTimes = window.App.getSunTimes;
var OrbitCamera = window.App.OrbitCamera;

function compassToScene(altRad, azCompassDeg, radius) {
  var azRad = azCompassDeg * DEG;
  return new THREE.Vector3(
    radius * Math.cos(altRad) * Math.sin(azRad),
    radius * Math.sin(altRad),
    -radius * Math.cos(altRad) * Math.cos(azRad)
  );
}

class Scene3D {
  constructor(container) {
    this.container = container;
    this.sunPathArcs = [];
    this._sunlightMeshes = [];
    this.sunRayLine = null;
    this._arcLabels = [];

    this._initRenderer();
    this._initCamera();
    this._initLights();
    this._createCompassRose();
    this._createInnerCompass();
    this._createDomeGrid();
    this._createRoom();
    this._createRoof();
    this._createSunSphere();
    this._animate();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1a2e);
    this.scene = new THREE.Scene();

    this._resize();
    this.container.appendChild(this.renderer.domElement);

    var self = this;
    window.addEventListener('resize', function() { self._resize(); });
  }

  _resize() {
    var w = this.container.clientWidth || 600;
    var h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _initCamera() {
    var w = this.container.clientWidth || 600;
    var h = this.container.clientHeight || 400;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    this.orbitCamera = new OrbitCamera(this.camera, this.renderer.domElement, {
      target: new THREE.Vector3(0, 3, 0),
      theta: 0.960,
      phi: 0.454,
      radius: 35
    });
  }

  _initLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x444444, 0.3));
    this.sunLight = new THREE.DirectionalLight(0xffffcc, 0.8);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  // ─── Compass Rose ──────────────────────────────────────────────

  _createCompassRose() {
    var group = new THREE.Group();

    // Ground disc — green opaque grass
    var discGeom = new THREE.CircleGeometry(DOME_RADIUS + 1, 64);
    discGeom.rotateX(-Math.PI / 2);
    var discMat = new THREE.MeshLambertMaterial({
      color: 0x4a7c3f, side: THREE.DoubleSide
    });
    group.add(new THREE.Mesh(discGeom, discMat));

    // Cardinal + intercardinal direction labels
    var dirs = [
      { label: 'N', az: 0,   color: '#FF4444', size: 48 },
      { label: 'E', az: 90,  color: '#CCCCCC', size: 48 },
      { label: 'S', az: 180, color: '#CCCCCC', size: 48 },
      { label: 'W', az: 270, color: '#CCCCCC', size: 48 },
      { label: 'NE', az: 45,  color: '#999999', size: 30 },
      { label: 'SE', az: 135, color: '#999999', size: 30 },
      { label: 'SW', az: 225, color: '#999999', size: 30 },
      { label: 'NW', az: 315, color: '#999999', size: 30 },
    ];
    dirs.forEach(function(d) {
      var canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = d.color;
      ctx.font = 'bold ' + d.size + 'px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.label, 32, 32);

      var texture = new THREE.CanvasTexture(canvas);
      var spriteMat = new THREE.SpriteMaterial({ map: texture });
      var sprite = new THREE.Sprite(spriteMat);

      var r = DOME_RADIUS + 2.5;
      var azRad = d.az * DEG;
      var scale = d.size < 48 ? 1.5 : 2;
      sprite.position.set(r * Math.sin(azRad), 0.5, -r * Math.cos(azRad));
      sprite.scale.set(scale, scale, 1);
      group.add(sprite);
    });

    // Tick marks every 30 degrees
    var tickMat = new THREE.LineBasicMaterial({ color: 0x555577, transparent: true, opacity: 0.5 });
    for (var az = 0; az < 360; az += 30) {
      var azRad = az * DEG;
      var inner = DOME_RADIUS - 0.5;
      var outer = DOME_RADIUS + 0.5;
      var pts = [
        new THREE.Vector3(inner * Math.sin(azRad), 0.01, -inner * Math.cos(azRad)),
        new THREE.Vector3(outer * Math.sin(azRad), 0.01, -outer * Math.cos(azRad))
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), tickMat));
    }

    this.scene.add(group);
  }

  // ─── Inner Compass Rose (near house) ─────────────────────────

  _createInnerCompass() {
    var group = new THREE.Group();
    var r = INNER_COMPASS_R;
    var yPos = 0.04;

    // Alternating black/white dashed ring using cylinder segments
    var segCount = 48; // 48 segments = alternating every 7.5 degrees
    var tubeRadius = 0.12;
    var blackMat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.45 });
    var whiteMat = new THREE.MeshBasicMaterial({ color: 0xDDDDDD, transparent: true, opacity: 0.45 });
    var yAxisRef = new THREE.Vector3(0, 1, 0);

    for (var i = 0; i < segCount; i++) {
      var a1 = (i / segCount) * Math.PI * 2;
      var a2 = ((i + 1) / segCount) * Math.PI * 2;
      var mid = (a1 + a2) / 2;
      var p1 = new THREE.Vector3(r * Math.cos(a1), yPos, r * Math.sin(a1));
      var p2 = new THREE.Vector3(r * Math.cos(a2), yPos, r * Math.sin(a2));
      var segDir = new THREE.Vector3().subVectors(p2, p1);
      var segLen = segDir.length();
      var segN = segDir.clone().normalize();

      var cyl = new THREE.CylinderGeometry(tubeRadius, tubeRadius, segLen, 4);
      var mesh = new THREE.Mesh(cyl, (i % 2 === 0) ? blackMat : whiteMat);
      mesh.position.copy(p1.clone().add(p2).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(yAxisRef, segN);
      group.add(mesh);
    }

    // Tick marks every 15 degrees (24 ticks), longer at cardinals
    var tickMatBlack = new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.5 });
    for (var az = 0; az < 360; az += 15) {
      var azRad = az * DEG;
      var isCardinal = (az % 90 === 0);
      var isIntercardinal = (az % 45 === 0) && !isCardinal;
      var tickLen = isCardinal ? 1.8 : (isIntercardinal ? 1.2 : 0.7);
      var tickR = 0.08;
      var inner = r - tickLen / 2;
      var outer = r + tickLen / 2;

      var tp1 = new THREE.Vector3(inner * Math.sin(azRad), yPos, -inner * Math.cos(azRad));
      var tp2 = new THREE.Vector3(outer * Math.sin(azRad), yPos, -outer * Math.cos(azRad));
      var tDir = new THREE.Vector3().subVectors(tp2, tp1);
      var tLen = tDir.length();
      var tN = tDir.clone().normalize();

      var tCyl = new THREE.CylinderGeometry(tickR, tickR, tLen, 4);
      var tMesh = new THREE.Mesh(tCyl, tickMatBlack);
      tMesh.position.copy(tp1.clone().add(tp2).multiplyScalar(0.5));
      tMesh.quaternion.setFromUnitVectors(yAxisRef, tN);
      group.add(tMesh);
    }

    // Cardinal labels — N=red, S/E/W=black
    var dirs = [
      { label: 'N', az: 0,   color: '#FF4444' },
      { label: 'E', az: 90,  color: '#999999' },
      { label: 'S', az: 180, color: '#999999' },
      { label: 'W', az: 270, color: '#999999' },
    ];
    dirs.forEach(function(d) {
      var canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = d.color;
      ctx.font = 'bold 44px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.label, 32, 32);

      var texture = new THREE.CanvasTexture(canvas);
      var spriteMat = new THREE.SpriteMaterial({ map: texture });
      var sprite = new THREE.Sprite(spriteMat);

      var lr = r + 2.5;
      var azRad = d.az * DEG;
      sprite.position.set(lr * Math.sin(azRad), 0.5, -lr * Math.cos(azRad));
      sprite.scale.set(2, 2, 1);
      group.add(sprite);
    });

    this.scene.add(group);
  }

  // ─── Dome Wireframe ────────────────────────────────────────────

  _createDomeGrid() {
    var skyGeom = new THREE.SphereGeometry(DOME_RADIUS - 0.2, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    var skyMat = new THREE.MeshBasicMaterial({
      color: 0x87CEEB, side: THREE.BackSide, transparent: true, opacity: 0.45
    });
    this.scene.add(new THREE.Mesh(skyGeom, skyMat));

    var gridMat = new THREE.LineBasicMaterial({ color: 0x555577, transparent: true, opacity: 0.15 });

    for (var altDeg = 15; altDeg <= 75; altDeg += 15) {
      var altRad = altDeg * DEG;
      var ringR = DOME_RADIUS * Math.cos(altRad);
      var ringY = DOME_RADIUS * Math.sin(altRad);
      var pts = [];
      for (var i = 0; i <= 64; i++) {
        var a = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(ringR * Math.cos(a), ringY, ringR * Math.sin(a)));
      }
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    for (var azDeg = 0; azDeg < 360; azDeg += 30) {
      var azRad2 = azDeg * DEG;
      var pts2 = [];
      for (var j = 0; j <= 32; j++) {
        var altRad2 = (j / 32) * Math.PI / 2;
        pts2.push(new THREE.Vector3(
          DOME_RADIUS * Math.cos(altRad2) * Math.sin(azRad2),
          DOME_RADIUS * Math.sin(altRad2),
          -DOME_RADIUS * Math.cos(altRad2) * Math.cos(azRad2)
        ));
      }
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), gridMat));
    }

    var horizonMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
    var hPts = [];
    for (var k = 0; k <= 64; k++) {
      var ha = (k / 64) * Math.PI * 2;
      hPts.push(new THREE.Vector3(DOME_RADIUS * Math.cos(ha), 0.02, DOME_RADIUS * Math.sin(ha)));
    }
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPts), horizonMat));
  }

  // ─── Room Model ────────────────────────────────────────────────

  _createBrickTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#8a7a6a';
    ctx.fillRect(0, 0, 256, 256);

    var brickColors = ['#8B4513', '#A0522D', '#7B3F00', '#6B3410', '#954B2A', '#804020'];
    var brickH = 24;
    var brickW = 60;
    var mortarW = 3;

    for (var row = 0; row < Math.ceil(256 / (brickH + mortarW)); row++) {
      var y = row * (brickH + mortarW);
      var offset = (row % 2) * (brickW / 2 + mortarW / 2);
      for (var col = -1; col < Math.ceil(256 / (brickW + mortarW)) + 1; col++) {
        var x = col * (brickW + mortarW) + offset;
        var color = brickColors[Math.floor(Math.random() * brickColors.length)];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, brickW, brickH);
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(x, y + brickH * 0.7, brickW, brickH * 0.3);
      }
    }

    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1.5);
    return texture;
  }

  _createRoom() {
    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);

    var W = ROOM_WIDTH, D = ROOM_DEPTH, H = ROOM_HEIGHT;
    // Side/back walls: visible but translucent, depthWrite off so sunlight patch shows through
    var wallMat = new THREE.MeshLambertMaterial({ color: 0xE8E0D0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    // Dark floor so sunlight patch stands out
    var floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

    var floorGeom = new THREE.PlaneGeometry(W, D);
    floorGeom.rotateX(-Math.PI / 2);
    // Raise floor above the grass disc to prevent z-fighting
    floorGeom.translate(0, 0.08, D / 2);
    this.roomGroup.add(new THREE.Mesh(floorGeom, floorMat));

    var backGeom = new THREE.PlaneGeometry(W, H);
    backGeom.translate(0, H / 2, D);
    this.roomGroup.add(new THREE.Mesh(backGeom, wallMat));

    var leftGeom = new THREE.PlaneGeometry(D, H);
    leftGeom.rotateY(Math.PI / 2);
    leftGeom.translate(-W / 2, H / 2, D / 2);
    this.roomGroup.add(new THREE.Mesh(leftGeom, wallMat));

    var rightGeom = new THREE.PlaneGeometry(D, H);
    rightGeom.rotateY(-Math.PI / 2);
    rightGeom.translate(W / 2, H / 2, D / 2);
    this.roomGroup.add(new THREE.Mesh(rightGeom, wallMat));

    this._createFrontWall(W, H);
    this._windowPane = null;
    this._awningMesh = null;
    this._updateWindowAndAwning(4, 5, 3, 2, 0.5, 5);
  }

  _createFrontWall(W, H) {
    this._frontWallW = W;
    this._frontWallH = H;
  }

  _updateWindowAndAwning(windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth) {
    var W = this._frontWallW || ROOM_WIDTH;
    var H = this._frontWallH || ROOM_HEIGHT;

    if (this._frontWallMesh) this.roomGroup.remove(this._frontWallMesh);
    if (this._windowPane) this.roomGroup.remove(this._windowPane);
    if (this._awningMesh) this.roomGroup.remove(this._awningMesh);

    var wallShape = new THREE.Shape();
    wallShape.moveTo(-W / 2, 0);
    wallShape.lineTo(W / 2, 0);
    wallShape.lineTo(W / 2, H);
    wallShape.lineTo(-W / 2, H);
    wallShape.lineTo(-W / 2, 0);

    var winLeft = -windowWidth / 2;
    var winRight = windowWidth / 2;
    var winBottom = sillHeight;
    // Clamp window top so it never exceeds wall height
    var winTop = Math.min(sillHeight + windowHeight, H - 0.05);

    var holePath = new THREE.Path();
    holePath.moveTo(winLeft, winBottom);
    holePath.lineTo(winRight, winBottom);
    holePath.lineTo(winRight, winTop);
    holePath.lineTo(winLeft, winTop);
    holePath.lineTo(winLeft, winBottom);
    wallShape.holes.push(holePath);

    var wallGeom = new THREE.ShapeGeometry(wallShape);
    var brickTexture = this._createBrickTexture();
    var frontWallMat = new THREE.MeshLambertMaterial({
      map: brickTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false
    });
    this._frontWallMesh = new THREE.Mesh(wallGeom, frontWallMat);
    this.roomGroup.add(this._frontWallMesh);

    var clampedWinH = winTop - winBottom;
    var paneGeom = new THREE.PlaneGeometry(windowWidth, clampedWinH);
    paneGeom.translate(0, winBottom + clampedWinH / 2, 0);
    var paneMat = new THREE.MeshLambertMaterial({
      color: 0x3377BB, transparent: true, opacity: 0.42, side: THREE.DoubleSide
    });
    this._windowPane = new THREE.Mesh(paneGeom, paneMat);
    this.roomGroup.add(this._windowPane);

    if (awningDepth > 0) {
      var awningGeom = new THREE.PlaneGeometry(awningWidth, awningDepth);
      awningGeom.rotateX(-Math.PI / 2);
      awningGeom.translate(0, winTop + awningGap, -awningDepth / 2);
      var awningMat = new THREE.MeshLambertMaterial({
        color: 0x000000, side: THREE.DoubleSide, emissive: 0x111111
      });
      this._awningMesh = new THREE.Mesh(awningGeom, awningMat);
      this.roomGroup.add(this._awningMesh);
    }

    this._windowParams = { windowWidth: windowWidth, windowHeight: windowHeight, sillHeight: sillHeight, awningDepth: awningDepth, awningGap: awningGap, awningWidth: awningWidth };
  }

  // ─── Gable Roof ──────────────────────────────────────────────

  _createRoof() {
    var W = ROOM_WIDTH, D = ROOM_DEPTH, H = ROOM_HEIGHT;
    var RH = RIDGE_HEIGHT;
    var roofMat = new THREE.MeshLambertMaterial({
      color: 0x6B7B8D, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false
    });

    // Left roof slope
    var leftPos = new Float32Array([
      -W/2, H, 0,    -W/2, H, D,    0, RH, D,    0, RH, 0
    ]);
    var leftGeom = new THREE.BufferGeometry();
    leftGeom.setAttribute('position', new THREE.BufferAttribute(leftPos, 3));
    leftGeom.setIndex([0, 1, 2, 0, 2, 3]);
    leftGeom.computeVertexNormals();
    this.roomGroup.add(new THREE.Mesh(leftGeom, roofMat));

    // Right roof slope
    var rightPos = new Float32Array([
      W/2, H, 0,    0, RH, 0,    0, RH, D,    W/2, H, D
    ]);
    var rightGeom = new THREE.BufferGeometry();
    rightGeom.setAttribute('position', new THREE.BufferAttribute(rightPos, 3));
    rightGeom.setIndex([0, 1, 2, 0, 2, 3]);
    rightGeom.computeVertexNormals();
    this.roomGroup.add(new THREE.Mesh(rightGeom, roofMat));

    // Front gable triangle
    var frontPos = new Float32Array([
      -W/2, H, 0,    W/2, H, 0,    0, RH, 0
    ]);
    var frontGeom = new THREE.BufferGeometry();
    frontGeom.setAttribute('position', new THREE.BufferAttribute(frontPos, 3));
    frontGeom.setIndex([0, 1, 2]);
    frontGeom.computeVertexNormals();
    this.roomGroup.add(new THREE.Mesh(frontGeom, roofMat));

    // Back gable triangle
    var backPos = new Float32Array([
      -W/2, H, D,    0, RH, D,    W/2, H, D
    ]);
    var backGeom = new THREE.BufferGeometry();
    backGeom.setAttribute('position', new THREE.BufferAttribute(backPos, 3));
    backGeom.setIndex([0, 1, 2]);
    backGeom.computeVertexNormals();
    this.roomGroup.add(new THREE.Mesh(backGeom, roofMat));

    // Ridge line (visible edge)
    var ridgePts = [new THREE.Vector3(0, RH, 0), new THREE.Vector3(0, RH, D)];
    var ridgeMat = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4 });
    this.roomGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ridgePts), ridgeMat));
  }

  // ─── Sun Sphere ────────────────────────────────────────────────

  _createSunSphere() {
    this.sunSphere = new THREE.Group();

    // Core bright sphere (scaled for DOME_RADIUS=120)
    var core = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xFFEE33 })
    );
    this.sunSphere.add(core);

    // Inner glow
    var glow1 = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xFFFF88, transparent: true, opacity: 0.35 })
    );
    this.sunSphere.add(glow1);

    // Outer corona
    var glow2 = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xFFCC00, transparent: true, opacity: 0.12 })
    );
    this.sunSphere.add(glow2);

    // Ray spikes using a sprite with a starburst texture
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);  // ensure transparent background
    var cx = 64, cy = 64;

    // Draw radial rays
    var numRays = 12;
    for (var i = 0; i < numRays; i++) {
      var angle = (i / numRays) * Math.PI * 2;
      var innerR = 18;
      var outerR = 56 + (i % 2 === 0 ? 8 : 0);
      var grad = ctx.createLinearGradient(
        cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR,
        cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR
      );
      grad.addColorStop(0, 'rgba(255, 240, 100, 0.9)');
      grad.addColorStop(1, 'rgba(255, 200, 50, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    // Central glow
    var radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    radGrad.addColorStop(0, 'rgba(255, 255, 200, 0.7)');
    radGrad.addColorStop(1, 'rgba(255, 220, 50, 0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();

    var texture = new THREE.CanvasTexture(canvas);
    var spriteMat = new THREE.SpriteMaterial({
      map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var raySprite = new THREE.Sprite(spriteMat);
    raySprite.scale.set(20, 20, 1);
    this.sunSphere.add(raySprite);

    this.scene.add(this.sunSphere);
  }

  // ─── Sun Path Arcs ─────────────────────────────────────────────

  updateSunPaths(lat, lng, currentDate) {
    var self = this;
    this.sunPathArcs.forEach(function(arc) { self.scene.remove(arc); });
    this.sunPathArcs = [];
    if (this._arcLabels) {
      this._arcLabels.forEach(function(lbl) { self.scene.remove(lbl); });
    }
    this._arcLabels = [];

    var year = currentDate.getFullYear();

    var todayArc = this._createSunPathArc(currentDate, lat, lng, 0xFFAA00);
    if (todayArc) {
      this.sunPathArcs.push(todayArc);
      this._addArcLabels("Today's solar path", 0xFFAA00, todayArc);
    }

    var summerDate = App.makeLocalDate(year, 5, 21, 12, 0, lng);
    var summerArc = this._createSunPathArc(summerDate, lat, lng, 0xFF6644);
    if (summerArc) {
      this.sunPathArcs.push(summerArc);
      this._addArcLabels('Summer solstice solar path', 0xFF6644, summerArc);
    }

    var winterDate = App.makeLocalDate(year, 11, 21, 12, 0, lng);
    var winterArc = this._createSunPathArc(winterDate, lat, lng, 0x4488FF);
    if (winterArc) {
      this.sunPathArcs.push(winterArc);
      this._addArcLabels('Winter solstice solar path', 0x4488FF, winterArc);
    }

    this.sunPathArcs.forEach(function(arc) { self.scene.add(arc); });
  }

  _addArcLabels(text, color, arcMesh) {
    // arcMesh is a TubeGeometry mesh — extract the path points from the curve
    var tubeGeom = arcMesh.geometry;
    if (!tubeGeom || !tubeGeom.parameters || !tubeGeom.parameters.path) return;
    var curve = tubeGeom.parameters.path;
    var totalPts = curve.getPoints(100);
    if (totalPts.length < 3) return;

    // Place labels near start and end of arc
    var endpoints = [
      { t: 0.03, nearIdx: 0 },  // near start
      { t: 0.97, nearIdx: totalPts.length - 1 } // near end
    ];

    var self = this;
    endpoints.forEach(function(ep) {
      var pos = curve.getPointAt(ep.t);
      var tangent = curve.getTangentAt(ep.t);

      // Create text canvas
      var canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 64;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 64);
      var hexStr = '#' + new THREE.Color(color).getHexString();
      ctx.fillStyle = hexStr;
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 32);

      var texture = new THREE.CanvasTexture(canvas);
      texture.premultiplyAlpha = true;

      var planeMat = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide
      });
      var planeGeom = new THREE.PlaneGeometry(22, 3);
      var mesh = new THREE.Mesh(planeGeom, planeMat);

      // Position above the arc point
      mesh.position.set(pos.x, pos.y + 4, pos.z);

      // Orient: make the label lie along the arc tangent direction
      // Tangent gives us the "right" direction for the text
      // We want the plane's normal facing upward-ish so text is readable from above
      var right = tangent.clone().normalize();
      // Flip if tangent points "backward" (negative x at start) so text reads left-to-right
      if (ep.nearIdx === 0 && right.x < 0) right.negate();
      if (ep.nearIdx > 0 && right.x > 0) right.negate();

      // Up direction: roughly world up, but tilted to match arc slope
      var up = new THREE.Vector3(0, 1, 0);
      var forward = new THREE.Vector3().crossVectors(right, up).normalize();
      up.crossVectors(forward, right).normalize();

      // Build rotation matrix from basis vectors
      var m = new THREE.Matrix4();
      m.makeBasis(right, up, forward);
      mesh.quaternion.setFromRotationMatrix(m);

      self.scene.add(mesh);
      self._arcLabels.push(mesh);
    });
  }

  _createSunPathArc(date, lat, lng, color) {
    var times = getSunTimes(date, lat, lng);
    if (!times.sunrise || !times.sunset) return null;

    var start = times.sunrise.getTime();
    var end = times.sunset.getTime();
    var points = [];

    for (var t = start; t <= end; t += 10 * 60 * 1000) {
      var pos = getSunPosition(new Date(t), lat, lng);
      if (pos.altitudeDeg < 0) continue;
      points.push(compassToScene(pos.altitudeRad, pos.compassAzimuthDeg, DOME_RADIUS));
    }

    if (points.length < 2) return null;

    // Use TubeGeometry for visible thickness (linewidth > 1 doesn't work on Windows/ANGLE)
    var curve = new THREE.CatmullRomCurve3(points);
    var tubeGeom = new THREE.TubeGeometry(curve, points.length * 2, 0.7, 6, false);
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85 });
    return new THREE.Mesh(tubeGeom, mat);
  }

  // ─── Updates ───────────────────────────────────────────────────

  updateSunPosition(altRad, compassAzDeg) {
    if (altRad < 0) {
      this.sunSphere.visible = false;
      this.sunLight.intensity = 0.1;
      return;
    }
    this.sunSphere.visible = true;
    var pos = compassToScene(altRad, compassAzDeg, DOME_RADIUS);
    this.sunSphere.position.copy(pos);
    this.sunLight.position.copy(pos);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.intensity = 0.8;
  }

  updateRoomRotation(wallAzDeg) {
    this.roomGroup.rotation.y = -wallAzDeg * DEG;
  }

  updateWindowAndAwning(windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth) {
    this._updateWindowAndAwning(windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth);
  }

  updateSunRay(sunAltRad, sunCompassAzDeg, wallAzDeg, windowHeight, sillHeight) {
    if (this.sunRayLine) {
      this.roomGroup.remove(this.sunRayLine);
      this.sunRayLine = null;
    }
    this._sunRaySegments = null;

    if (sunAltRad <= 0) return;

    var sunWorld = compassToScene(sunAltRad, sunCompassAzDeg, DOME_RADIUS);
    var windowCenterY = sillHeight + windowHeight / 2;
    var windowCenterLocal = new THREE.Vector3(0, windowCenterY, 0);

    var roomRotY = -wallAzDeg * DEG;
    var invRot = -roomRotY;
    var sunLocal = sunWorld.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), invRot);

    // Compute ray direction from window center into the room
    var windowCenterWorld = windowCenterLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), roomRotY);
    var sunDir = new THREE.Vector3().subVectors(windowCenterWorld, sunWorld).normalize();
    if (sunDir.y >= 0) return;

    // Transform direction into room-local space
    var dirLocal = sunDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), invRot);

    // Find first hit point on room surfaces (floor, back wall, left wall, right wall)
    var hitPoint = null;
    var bestT = Infinity;
    var halfW = ROOM_WIDTH / 2;

    // Floor (y=0): t = -windowCenterY / dirLocal.y
    if (dirLocal.y < -0.001) {
      var tFloor = -windowCenterY / dirLocal.y;
      if (tFloor > 0 && tFloor < bestT) {
        var fp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tFloor));
        if (fp.z >= 0 && fp.z <= ROOM_DEPTH && fp.x >= -halfW && fp.x <= halfW) {
          bestT = tFloor;
          hitPoint = fp;
        }
      }
    }

    // Back wall (z=ROOM_DEPTH): t = (ROOM_DEPTH - 0) / dirLocal.z
    if (dirLocal.z > 0.001) {
      var tBack = (ROOM_DEPTH) / dirLocal.z;
      if (tBack > 0 && tBack < bestT) {
        var bp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tBack));
        if (bp.y >= 0 && bp.y <= ROOM_HEIGHT && bp.x >= -halfW && bp.x <= halfW) {
          bestT = tBack;
          hitPoint = bp;
        }
      }
    }

    // Left wall (x=-halfW): t = (-halfW - 0) / dirLocal.x
    if (dirLocal.x < -0.001) {
      var tLeft = (-halfW) / dirLocal.x;
      if (tLeft > 0 && tLeft < bestT) {
        var lp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tLeft));
        if (lp.y >= 0 && lp.y <= ROOM_HEIGHT && lp.z >= 0 && lp.z <= ROOM_DEPTH) {
          bestT = tLeft;
          hitPoint = lp;
        }
      }
    }

    // Right wall (x=+halfW): t = (halfW - 0) / dirLocal.x
    if (dirLocal.x > 0.001) {
      var tRight = (halfW) / dirLocal.x;
      if (tRight > 0 && tRight < bestT) {
        var rp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tRight));
        if (rp.y >= 0 && rp.y <= ROOM_HEIGHT && rp.z >= 0 && rp.z <= ROOM_DEPTH) {
          bestT = tRight;
          hitPoint = rp;
        }
      }
    }

    // Fallback to floor hit if no surface found
    if (!hitPoint) {
      var tFallback = -windowCenterWorld.y / sunDir.y;
      var floorHitWorld = windowCenterWorld.clone().add(sunDir.clone().multiplyScalar(tFallback));
      hitPoint = floorHitWorld.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), invRot);
    }

    // Store segments for animated rendering
    // Outer segment: from sun all the way to window
    this._sunRaySegments = [
      { from: sunLocal.clone(), to: windowCenterLocal.clone() },
      { from: windowCenterLocal.clone(), to: hitPoint.clone() }
    ];

    // Build initial sun ray group
    this._buildSunRayMeshes();
  }

  _buildSunRayMeshes() {
    // Dispose old sun ray meshes to prevent memory leaks
    if (this.sunRayLine) {
      this.sunRayLine.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
      });
      this.roomGroup.remove(this.sunRayLine);
    }
    if (!this._sunRaySegments) return;

    var group = new THREE.Group();
    var dashSize = 2, gapSize = 1, tubeRadius = 0.15;
    // Cache the shared material
    if (!this._sunRayDashMat) {
      this._sunRayDashMat = new THREE.MeshBasicMaterial({ color: 0xFFDD00, transparent: true, opacity: 0.7 });
    }
    var dashMat = this._sunRayDashMat;
    var yAxisRef = new THREE.Vector3(0, 1, 0);
    var offset = this._sunRayAnimOffset || 0;

    this._sunRaySegments.forEach(function(seg) {
      var dir = new THREE.Vector3().subVectors(seg.to, seg.from);
      var len = dir.length();
      var dirN = dir.clone().normalize();
      // Animate dashes flowing from sun toward house
      var cycle = dashSize + gapSize;
      var pos = (offset % cycle) - cycle;

      while (pos < len) {
        var dStart = Math.max(pos, 0);
        var dEnd = Math.min(pos + dashSize, len);
        if (dEnd > 0 && dStart < len && dEnd > dStart) {
          var p1 = seg.from.clone().add(dirN.clone().multiplyScalar(dStart));
          var p2 = seg.from.clone().add(dirN.clone().multiplyScalar(dEnd));
          var dLen = dEnd - dStart;
          if (dLen > 0.05) {
            var cyl = new THREE.CylinderGeometry(tubeRadius, tubeRadius, dLen, 6);
            var mesh = new THREE.Mesh(cyl, dashMat);
            mesh.position.copy(p1.clone().add(p2).multiplyScalar(0.5));
            mesh.quaternion.setFromUnitVectors(yAxisRef, dirN);
            group.add(mesh);
          }
        }
        pos += dashSize + gapSize;
      }
    });

    this.sunRayLine = group;
    this.roomGroup.add(this.sunRayLine);
  }

  updateSunlightPatch(patches) {
    var self = this;
    this._sunlightMeshes.forEach(function(m) { self.roomGroup.remove(m); });
    this._sunlightMeshes = [];

    if (!patches) return;

    var floorMat = new THREE.MeshBasicMaterial({
      color: 0xFFEE44, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      depthWrite: false
    });

    // Slightly darker golden tint for wall patch, higher opacity to punch through translucent walls
    var wallMat = new THREE.MeshBasicMaterial({
      color: 0xEECC22, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      depthWrite: false
    });

    // Floor patch (offset y slightly above floor to prevent z-fighting)
    if (patches.floor && patches.floor.length >= 3) {
      var floorMesh = this._createPatchMesh(patches.floor, { y: 0.1 }, floorMat);
      if (floorMesh) {
        floorMesh.renderOrder = 10;
        this.roomGroup.add(floorMesh);
        this._sunlightMeshes.push(floorMesh);
      }
    }

    // Back wall patch (offset z slightly forward to prevent z-fighting, high renderOrder to draw over translucent walls)
    if (patches.wall && patches.wall.length >= 3) {
      var wallMesh = this._createPatchMesh(patches.wall, { z: -0.1 }, wallMat);
      if (wallMesh) {
        wallMesh.renderOrder = 20;
        this.roomGroup.add(wallMesh);
        this._sunlightMeshes.push(wallMesh);
      }
    }

    // Left wall patch (offset x slightly inward)
    if (patches.leftWall && patches.leftWall.length >= 3) {
      var leftMesh = this._createPatchMesh(patches.leftWall, { x: 0.1 }, wallMat);
      if (leftMesh) {
        leftMesh.renderOrder = 20;
        this.roomGroup.add(leftMesh);
        this._sunlightMeshes.push(leftMesh);
      }
    }

    // Right wall patch (offset x slightly inward)
    if (patches.rightWall && patches.rightWall.length >= 3) {
      var rightMesh = this._createPatchMesh(patches.rightWall, { x: -0.1 }, wallMat);
      if (rightMesh) {
        rightMesh.renderOrder = 20;
        this.roomGroup.add(rightMesh);
        this._sunlightMeshes.push(rightMesh);
      }
    }
  }

  _createPatchMesh(verts, offset, material) {
    var ox = (offset && offset.x) || 0;
    var oy = (offset && offset.y) || 0;
    var oz = (offset && offset.z) || 0;

    var positions = new Float32Array(verts.length * 3);
    for (var i = 0; i < verts.length; i++) {
      positions[i * 3]     = verts[i].x + ox;
      positions[i * 3 + 1] = verts[i].y + oy;
      positions[i * 3 + 2] = verts[i].z + oz;
    }

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Triangle fan from vertex 0 (valid for convex polygons)
    var indices = [];
    for (var j = 1; j < verts.length - 1; j++) {
      indices.push(0, j, j + 1);
    }
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return new THREE.Mesh(geom, material);
  }

  handleResize() {
    this._resize();
  }

  _animate() {
    var self = this;
    var now = performance.now();
    if (!this._lastAnimTime) this._lastAnimTime = now;
    var dt = (now - this._lastAnimTime) / 1000; // seconds
    this._lastAnimTime = now;

    // Animate sun ray dashes flowing from sun toward house
    if (this._sunRaySegments) {
      if (!this._sunRayAnimOffset) this._sunRayAnimOffset = 0;
      this._sunRayAnimOffset += dt * 4; // speed: 4 units per second
      this._buildSunRayMeshes();
    }

    requestAnimationFrame(function() { self._animate(); });
    this.renderer.render(this.scene, this.camera);
  }
}

window.App.Scene3D = Scene3D;

})();
