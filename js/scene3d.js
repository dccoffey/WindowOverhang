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

    this._showLightBeam = false; // toggled by UI
    this._lightBeamPhase = 0;   // 0→1 over 2 seconds, then repeats
    this._starField = null;
    this._starFieldData = null;

    this._initRenderer();
    this._initCamera();
    this._initLights();
    this._createCompassRose();
    this._createInnerCompass();
    this._createDomeGrid();
    this._createRoom();
    this._createRoof();
    this._createSunSphere();
    this._createStarField();
    this._animate();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1a2e);
    // Enable shadow mapping for house/awning shadows on ground
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      target: new THREE.Vector3(0, 6, 0),
      theta: 0.960,
      phi: 0.52,
      radius: 35
    });
  }

  _initLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x444444, 0.3));
    this.sunLight = new THREE.DirectionalLight(0xffffcc, 1.0);
    // Configure shadow mapping for the directional (sun) light
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    // Shadow camera frustum — large enough to cover house + surrounding ground
    var shadowSize = 40;
    this.sunLight.shadow.camera.left = -shadowSize;
    this.sunLight.shadow.camera.right = shadowSize;
    this.sunLight.shadow.camera.top = shadowSize;
    this.sunLight.shadow.camera.bottom = -shadowSize;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  // ─── Compass Rose ──────────────────────────────────────────────

  _createCompassRose() {
    var group = new THREE.Group();

    // Ground disc — green opaque grass, receives shadows
    var discGeom = new THREE.CircleGeometry(DOME_RADIUS + 1, 64);
    discGeom.rotateX(-Math.PI / 2);
    var discMat = new THREE.MeshStandardMaterial({
      color: 0x4a7c3f, side: THREE.DoubleSide, roughness: 0.9, metalness: 0.0
    });
    var disc = new THREE.Mesh(discGeom, discMat);
    disc.receiveShadow = true;
    group.add(disc);

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
    this._skyDomeMat = new THREE.MeshBasicMaterial({
      color: 0x87CEEB, side: THREE.BackSide, transparent: true, opacity: 0.45
    });
    this.scene.add(new THREE.Mesh(skyGeom, this._skyDomeMat));

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

    ctx.fillStyle = '#c4b5a0';
    ctx.fillRect(0, 0, 256, 256);

    var brickColors = ['#C8B89A', '#BDA88C', '#D4C4A8', '#B09878', '#C0A888', '#D0C0A0'];
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
    // Side/back walls: MeshBasicMaterial so the directional sunlight doesn't create
    // a grey "ghost" illumination separate from the computed yellow sunlight patches.
    // Sun-responsive brightness is handled in _updateWallRoofLighting via color.
    var wallMat = new THREE.MeshBasicMaterial({ color: 0xE8E0D0, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    this._wallMat = wallMat;
    this._wallBaseColor = new THREE.Color(0xE8E0D0);
    // Opaque depth material so transparent walls cast proper shadows in shadow map
    var opaqueDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    // Dark floor — MeshBasicMaterial so directional light doesn't create grey halo
    var floorMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });

    var floorGeom = new THREE.PlaneGeometry(W, D);
    floorGeom.rotateX(-Math.PI / 2);
    // Raise floor above the grass disc to prevent z-fighting
    floorGeom.translate(0, 0.08, D / 2);
    var floorMesh = new THREE.Mesh(floorGeom, floorMat);
    this.roomGroup.add(floorMesh);

    var backGeom = new THREE.PlaneGeometry(W, H);
    backGeom.translate(0, H / 2, D);
    var backMesh = new THREE.Mesh(backGeom, wallMat);
    backMesh.castShadow = true;
    backMesh.customDepthMaterial = opaqueDepthMat;
    this.roomGroup.add(backMesh);
    this._backWallMesh = backMesh;

    var leftGeom = new THREE.PlaneGeometry(D, H);
    leftGeom.rotateY(Math.PI / 2);
    leftGeom.translate(-W / 2, H / 2, D / 2);
    var leftMesh = new THREE.Mesh(leftGeom, wallMat);
    leftMesh.castShadow = true;
    leftMesh.customDepthMaterial = opaqueDepthMat;
    this.roomGroup.add(leftMesh);
    this._leftWallMesh = leftMesh;

    var rightGeom = new THREE.PlaneGeometry(D, H);
    rightGeom.rotateY(-Math.PI / 2);
    rightGeom.translate(W / 2, H / 2, D / 2);
    var rightMesh = new THREE.Mesh(rightGeom, wallMat);
    rightMesh.castShadow = true;
    rightMesh.customDepthMaterial = opaqueDepthMat;
    this.roomGroup.add(rightMesh);
    this._rightWallMesh = rightMesh;

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

    // Dispose old geometry/materials to prevent memory leaks
    if (this._frontWallMesh) {
      this.roomGroup.remove(this._frontWallMesh);
      if (this._frontWallMesh.geometry) this._frontWallMesh.geometry.dispose();
      if (this._frontWallMesh.material && this._frontWallMesh.material.map) this._frontWallMesh.material.map.dispose();
      if (this._frontWallMesh.material) this._frontWallMesh.material.dispose();
    }
    if (this._windowPane) {
      this.roomGroup.remove(this._windowPane);
      if (this._windowPane.geometry) this._windowPane.geometry.dispose();
    }
    if (this._awningMesh) {
      this.roomGroup.remove(this._awningMesh);
      if (this._awningMesh.geometry) this._awningMesh.geometry.dispose();
    }
    if (this._awniShadowPane) {
      this.roomGroup.remove(this._awniShadowPane);
      if (this._awniShadowPane.geometry) this._awniShadowPane.geometry.dispose();
      this._awniShadowPane = null;
    }
    // Dispose frame group children
    if (this._frameGroup) {
      this._frameGroup.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
      });
      this.roomGroup.remove(this._frameGroup);
    }

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
    var frontWallMat = new THREE.MeshStandardMaterial({
      map: brickTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, roughness: 0.85, metalness: 0.0
    });
    this._frontWallMesh = new THREE.Mesh(wallGeom, frontWallMat);
    this._frontWallMesh.castShadow = true;
    this._frontWallMesh.receiveShadow = true;
    this.roomGroup.add(this._frontWallMesh);

    var clampedWinH = winTop - winBottom;
    var paneGeom = new THREE.PlaneGeometry(windowWidth, clampedWinH);
    paneGeom.translate(0, winBottom + clampedWinH / 2, 0);
    var paneMat = new THREE.MeshStandardMaterial({
      color: 0x3377BB, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
      roughness: 0.2, metalness: 0.1, emissive: 0x000000
    });
    this._windowPane = new THREE.Mesh(paneGeom, paneMat);
    this._windowPaneMat = paneMat;
    this.roomGroup.add(this._windowPane);

    // ── Window frame and mullion grid (4 panes) ──
    if (this._windowFrameGroup) this.roomGroup.remove(this._windowFrameGroup);
    this._windowFrameGroup = new THREE.Group();
    var frameMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide });
    var frameW = 0.15; // frame/mullion width in feet
    var frameZ = -0.03; // slightly in front of window pane
    var winCenterY = winBottom + clampedWinH / 2;

    // Outer frame: 4 bars around the perimeter
    // Top
    var ftGeom = new THREE.PlaneGeometry(windowWidth + frameW, frameW);
    ftGeom.translate(0, winTop, frameZ);
    this._windowFrameGroup.add(new THREE.Mesh(ftGeom, frameMat));
    // Bottom
    var fbGeom = new THREE.PlaneGeometry(windowWidth + frameW, frameW);
    fbGeom.translate(0, winBottom, frameZ);
    this._windowFrameGroup.add(new THREE.Mesh(fbGeom, frameMat));
    // Left
    var flGeom = new THREE.PlaneGeometry(frameW, clampedWinH + frameW);
    flGeom.translate(-windowWidth / 2, winCenterY, frameZ);
    this._windowFrameGroup.add(new THREE.Mesh(flGeom, frameMat));
    // Right
    var frGeom = new THREE.PlaneGeometry(frameW, clampedWinH + frameW);
    frGeom.translate(windowWidth / 2, winCenterY, frameZ);
    this._windowFrameGroup.add(new THREE.Mesh(frGeom, frameMat));

    // Center horizontal mullion
    var mhGeom = new THREE.PlaneGeometry(windowWidth, frameW * 0.8);
    mhGeom.translate(0, winCenterY, frameZ);
    this._windowFrameGroup.add(new THREE.Mesh(mhGeom, frameMat));
    // Center vertical mullion
    var mvGeom = new THREE.PlaneGeometry(frameW * 0.8, clampedWinH);
    mvGeom.translate(0, winCenterY, frameZ);
    this._windowFrameGroup.add(new THREE.Mesh(mvGeom, frameMat));

    this.roomGroup.add(this._windowFrameGroup);

    if (awningDepth > 0) {
      var awningGeom = new THREE.PlaneGeometry(awningWidth, awningDepth);
      awningGeom.rotateX(-Math.PI / 2);
      awningGeom.translate(0, winTop + awningGap, -awningDepth / 2);
      var awningMat = new THREE.MeshStandardMaterial({
        color: 0xB5451B, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.2
      });
      this._awningMesh = new THREE.Mesh(awningGeom, awningMat);
      this._awningMesh.castShadow = true;
      this._awningMesh.receiveShadow = true;
      this.roomGroup.add(this._awningMesh);
    }

    this._windowParams = { windowWidth: windowWidth, windowHeight: windowHeight, sillHeight: sillHeight, awningDepth: awningDepth, awningGap: awningGap, awningWidth: awningWidth };
  }

  // ─── Gable Roof ──────────────────────────────────────────────

  _createRoof() {
    var W = ROOM_WIDTH, D = ROOM_DEPTH, H = ROOM_HEIGHT;
    var RH = RIDGE_HEIGHT;
    var roofMat = new THREE.MeshBasicMaterial({
      color: 0x6B7B8D, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false
    });
    this._roofMat = roofMat;
    this._roofBaseColor = new THREE.Color(0x6B7B8D);

    // Left roof slope
    var leftPos = new Float32Array([
      -W/2, H, 0,    -W/2, H, D,    0, RH, D,    0, RH, 0
    ]);
    var leftGeom = new THREE.BufferGeometry();
    leftGeom.setAttribute('position', new THREE.BufferAttribute(leftPos, 3));
    leftGeom.setIndex([0, 1, 2, 0, 2, 3]);
    leftGeom.computeVertexNormals();
    var leftRoofMesh = new THREE.Mesh(leftGeom, roofMat);
    leftRoofMesh.castShadow = true;
    this.roomGroup.add(leftRoofMesh);

    // Right roof slope
    var rightPos = new Float32Array([
      W/2, H, 0,    0, RH, 0,    0, RH, D,    W/2, H, D
    ]);
    var rightGeom = new THREE.BufferGeometry();
    rightGeom.setAttribute('position', new THREE.BufferAttribute(rightPos, 3));
    rightGeom.setIndex([0, 1, 2, 0, 2, 3]);
    rightGeom.computeVertexNormals();
    var rightRoofMesh = new THREE.Mesh(rightGeom, roofMat);
    rightRoofMesh.castShadow = true;
    this.roomGroup.add(rightRoofMesh);

    // Front gable triangle
    var frontPos = new Float32Array([
      -W/2, H, 0,    W/2, H, 0,    0, RH, 0
    ]);
    var frontGeom = new THREE.BufferGeometry();
    frontGeom.setAttribute('position', new THREE.BufferAttribute(frontPos, 3));
    frontGeom.setIndex([0, 1, 2]);
    frontGeom.computeVertexNormals();
    var frontGableMesh = new THREE.Mesh(frontGeom, roofMat);
    frontGableMesh.castShadow = true;
    this.roomGroup.add(frontGableMesh);

    // Back gable triangle
    var backPos = new Float32Array([
      -W/2, H, D,    0, RH, D,    W/2, H, D
    ]);
    var backGeom = new THREE.BufferGeometry();
    backGeom.setAttribute('position', new THREE.BufferAttribute(backPos, 3));
    backGeom.setIndex([0, 1, 2]);
    backGeom.computeVertexNormals();
    var backGableMesh = new THREE.Mesh(backGeom, roofMat);
    backGableMesh.castShadow = true;
    this.roomGroup.add(backGableMesh);

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

  // ─── Star Field ──────────────────────────────────────────────

  _createStarField() {
    this._starField = new THREE.Group();
    this._starField.visible = false;
    this.scene.add(this._starField);
  }

  _starToAltAz(ra, dec, LST, sinLat, cosLat) {
    var HA = ((LST - ra * 15) % 360 + 360) % 360;
    var haRad = HA * DEG;
    var decRad = dec * DEG;
    var sinAlt = sinLat * Math.sin(decRad) + cosLat * Math.cos(decRad) * Math.cos(haRad);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var cosAlt = Math.cos(alt);
    if (cosAlt < 0.0001) return { alt: alt, az: 0, above: alt > 0 };
    var sinAz = -Math.cos(decRad) * Math.sin(haRad) / cosAlt;
    var cosAz = (Math.sin(decRad) - sinLat * sinAlt) / (cosLat * cosAlt + 0.0001);
    sinAz = Math.max(-1, Math.min(1, sinAz));
    cosAz = Math.max(-1, Math.min(1, cosAz));
    var az = Math.atan2(sinAz, cosAz);
    return { alt: alt, az: az, above: alt > 0 };
  }

  _altAzToPos(alt, az, R) {
    return new THREE.Vector3(
      R * Math.cos(alt) * Math.sin(az),
      R * Math.sin(alt),
      -R * Math.cos(alt) * Math.cos(az)
    );
  }

  updateStarField(lat, lng, date) {
    if (!this._starField) return;
    var STARS = App.STAR_CATALOG;
    var CONSTELL = App.CONSTELLATION_LINES;
    if (!STARS) return;

    // Remove old children
    while (this._starField.children.length > 0) {
      var child = this._starField.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this._starField.remove(child);
    }

    // Compute Local Sidereal Time
    var JD = date.getTime() / 86400000 + 2440587.5;
    var T = (JD - 2451545.0) / 36525.0;
    var GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0)
      + 0.000387933 * T * T - T * T * T / 38710000.0;
    GMST = ((GMST % 360) + 360) % 360;
    var LST = ((GMST + lng) % 360 + 360) % 360;

    var latRad = lat * DEG;
    var cosLat = Math.cos(latRad);
    var sinLat = Math.sin(latRad);
    var R = DOME_RADIUS - 1;
    var self = this;

    // Compute positions for all stars and store them by index
    var starPositions = {}; // idx -> {pos, above, mag}
    var baseGeom = new THREE.SphereGeometry(1, 8, 8);

    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      var idx = s[0], ra = s[2], dec = s[3], mag = s[4];
      var aa = this._starToAltAz(ra, dec, LST, sinLat, cosLat);
      var pos = this._altAzToPos(aa.alt, aa.az, R);
      starPositions[idx] = { pos: pos, above: aa.above, mag: mag };

      if (!aa.above) continue;

      // Scale by magnitude: Sirius (-1.46) → big, mag 4 → tiny
      // Apparent size: base 0.3, brighter = bigger
      var magScale = Math.max(0.25, 1.6 - mag * 0.35);
      var brightness = Math.min(1.0, Math.max(0.4, 1.2 - mag * 0.2));

      // Star color — approximate spectral color by magnitude (bright=white-blue, dim=warm)
      var starColor;
      if (mag < 0.5) starColor = 0xCCDDFF;      // bright blue-white
      else if (mag < 1.5) starColor = 0xFFFFEE;   // white
      else if (mag < 2.5) starColor = 0xFFEECC;   // warm white
      else starColor = 0xFFDDAA;                   // dim warm

      var starMat = new THREE.MeshBasicMaterial({
        color: starColor, transparent: true, opacity: brightness
      });
      var star = new THREE.Mesh(baseGeom, starMat);
      star.position.copy(pos);
      star.scale.setScalar(magScale);
      this._starField.add(star);
    }

    // Draw constellation stick figures
    if (CONSTELL) {
      var lineMat = new THREE.LineBasicMaterial({
        color: 0x4466AA, transparent: true, opacity: 0.35
      });

      for (var c = 0; c < CONSTELL.length; c++) {
        var lines = CONSTELL[c][1];
        for (var l = 0; l < lines.length; l++) {
          var idxA = lines[l][0], idxB = lines[l][1];
          if (idxA === idxB) continue; // skip single-star "constellations"
          var starA = starPositions[idxA], starB = starPositions[idxB];
          if (!starA || !starB) continue;
          if (!starA.above || !starB.above) continue;

          var pts = [starA.pos.clone(), starB.pos.clone()];
          var lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
          var line = new THREE.Line(lineGeom, lineMat);
          this._starField.add(line);
        }
      }
    }

    // Add ~400 dim random background stars for the Milky Way feel
    var dimGeom = new THREE.SphereGeometry(1, 3, 3);
    var dimMat = new THREE.MeshBasicMaterial({ color: 0xBBBBCC, transparent: true, opacity: 0.25 });
    var seed = 42;
    function rng() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    for (var j = 0; j < 400; j++) {
      var rndRA = rng() * 24, rndDec = Math.asin(2 * rng() - 1) * RAD;
      var aa2 = this._starToAltAz(rndRA, rndDec, LST, sinLat, cosLat);
      if (!aa2.above || aa2.alt < 0.05) continue;
      var pos2 = this._altAzToPos(aa2.alt, aa2.az, R);
      var dimStar = new THREE.Mesh(dimGeom, dimMat);
      dimStar.position.copy(pos2);
      dimStar.scale.setScalar(0.15 + rng() * 0.3);
      this._starField.add(dimStar);
    }
  }

  // ─── Sun Path Arcs ─────────────────────────────────────────────

  updateSunPaths(lat, lng, currentDate) {
    var self = this;
    this.sunPathArcs.forEach(function(arc) {
      self.scene.remove(arc);
      if (arc.geometry) arc.geometry.dispose();
      if (arc.material) arc.material.dispose();
    });
    this.sunPathArcs = [];
    if (this._arcLabels) {
      this._arcLabels.forEach(function(lbl) {
        self.scene.remove(lbl);
        if (lbl.geometry) lbl.geometry.dispose();
        if (lbl.material) {
          if (lbl.material.map) lbl.material.map.dispose();
          lbl.material.dispose();
        }
      });
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
    var isNight = altRad < 0;
    this._currentSunAlt = altRad;
    this._currentSunAz = compassAzDeg;
    if (isNight) {
      this.sunSphere.visible = false;
      this.sunLight.intensity = 0.05;
      // Show stars, darken sky dome
      if (this._starField) this._starField.visible = true;
      if (this._skyDomeMat) { this._skyDomeMat.color.setHex(0x0a0a2a); this._skyDomeMat.opacity = 0.7; }
      this.renderer.setClearColor(0x050510);
      // Dim walls/roof at night
      this._updateWallRoofLighting(0);
      return;
    }
    this.sunSphere.visible = true;
    var pos = compassToScene(altRad, compassAzDeg, DOME_RADIUS);
    this.sunSphere.position.copy(pos);
    this.sunLight.position.copy(pos);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.intensity = 1.0;
    // Hide stars during day, restore sky color
    if (this._starField) this._starField.visible = false;
    if (this._skyDomeMat) { this._skyDomeMat.color.setHex(0x87CEEB); this._skyDomeMat.opacity = 0.45; }
    this.renderer.setClearColor(0x1a1a2e);
    // Update wall/roof brightness based on sun elevation
    this._updateWallRoofLighting(altRad);
  }

  _updateWallRoofLighting(sunAltRad) {
    // Sun elevation factor: 0 at horizon/night, 1 at zenith
    var sunFactor = Math.max(0, Math.sin(Math.max(0, sunAltRad)));
    // Walls get brighter color when sun is high (MeshBasicMaterial — no emissive)
    if (this._wallMat && this._wallBaseColor) {
      var b = sunFactor * 0.15;
      this._wallMat.color.copy(this._wallBaseColor);
      this._wallMat.color.r += b;
      this._wallMat.color.g += b * 0.95;
      this._wallMat.color.b += b * 0.8;
      this._wallMat.opacity = 0.35 + sunFactor * 0.12; // 0.35 at night → 0.47 in bright sun
    }
    if (this._roofMat && this._roofBaseColor) {
      var b = sunFactor * 0.12;
      this._roofMat.color.copy(this._roofBaseColor);
      this._roofMat.color.r += b * 0.8;
      this._roofMat.color.g += b * 0.85;
      this._roofMat.color.b += b;
      this._roofMat.opacity = 0.40 + sunFactor * 0.12; // 0.40 at night → 0.52 in bright sun
    }
  }

  updateRoomRotation(wallAzDeg) {
    this.roomGroup.rotation.y = -wallAzDeg * DEG;
  }

  updateWindowAndAwning(windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth) {
    this._updateWindowAndAwning(windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth);
  }

  updateSunRay(sunAltRad, sunCompassAzDeg, wallAzDeg, windowHeight, sillHeight, isSunOnWall) {
    if (this.sunRayLine) {
      this.roomGroup.remove(this.sunRayLine);
      this.sunRayLine = null;
    }
    this._sunRaySegments = null;
    // Remove old termination dot
    if (this._sunRayDot) { this.roomGroup.remove(this._sunRayDot); this._sunRayDot = null; }

    if (sunAltRad <= 0) return;

    var W = ROOM_WIDTH, H = ROOM_HEIGHT, D = ROOM_DEPTH, RH = RIDGE_HEIGHT;
    var halfW = W / 2;
    var sunWorld = compassToScene(sunAltRad, sunCompassAzDeg, DOME_RADIUS);
    var roomRotY = -wallAzDeg * DEG;
    var invRot = -roomRotY;
    var sunLocal = sunWorld.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), invRot);

    // Target: house center at mid-height
    var houseCenterLocal = new THREE.Vector3(0, H / 2, D / 2);
    var sunDirLocal = houseCenterLocal.clone().sub(sunLocal).normalize();

    if (isSunOnWall) {
      // ── Sun hits the front wall — trace through window center into room ──
      var windowCenterY = sillHeight + windowHeight / 2;
      var windowCenterLocal = new THREE.Vector3(0, windowCenterY, 0);

      // Compute direction from sun to window center
      var dirLocal = windowCenterLocal.clone().sub(sunLocal).normalize();

      // Find interior hit point
      var hitPoint = null;
      var bestT = Infinity;

      // Floor
      if (dirLocal.y < -0.001) {
        var tFloor = -windowCenterY / dirLocal.y;
        if (tFloor > 0 && tFloor < bestT) {
          var fp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tFloor));
          if (fp.z >= 0 && fp.z <= D && fp.x >= -halfW && fp.x <= halfW) { bestT = tFloor; hitPoint = fp; }
        }
      }
      // Back wall
      if (dirLocal.z > 0.001) {
        var tBack = D / dirLocal.z;
        if (tBack > 0 && tBack < bestT) {
          var bp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tBack));
          if (bp.y >= 0 && bp.y <= H && bp.x >= -halfW && bp.x <= halfW) { bestT = tBack; hitPoint = bp; }
        }
      }
      // Left wall
      if (dirLocal.x < -0.001) {
        var tLeft = (-halfW) / dirLocal.x;
        if (tLeft > 0 && tLeft < bestT) {
          var lp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tLeft));
          if (lp.y >= 0 && lp.y <= H && lp.z >= 0 && lp.z <= D) { bestT = tLeft; hitPoint = lp; }
        }
      }
      // Right wall
      if (dirLocal.x > 0.001) {
        var tRight = (halfW) / dirLocal.x;
        if (tRight > 0 && tRight < bestT) {
          var rp = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(tRight));
          if (rp.y >= 0 && rp.y <= H && rp.z >= 0 && rp.z <= D) { bestT = tRight; hitPoint = rp; }
        }
      }

      if (!hitPoint) {
        hitPoint = windowCenterLocal.clone().add(dirLocal.clone().multiplyScalar(5));
      }

      this._sunRaySegments = [
        { from: sunLocal.clone(), to: windowCenterLocal.clone() },
        { from: windowCenterLocal.clone(), to: hitPoint.clone() }
      ];
    } else {
      // ── Sun does NOT hit the front wall — trace to nearest exterior surface ──
      var exteriorHit = null;
      var bestTE = Infinity;

      // Test each exterior surface the sun could hit:
      // Left wall (x = -halfW, facing -x, z from 0 to D)
      if (sunDirLocal.x < -0.001) {
        var tL = (-halfW - sunLocal.x) / sunDirLocal.x;
        if (tL > 0 && tL < bestTE) {
          var lpt = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tL));
          if (lpt.y >= 0 && lpt.y <= H && lpt.z >= 0 && lpt.z <= D) { bestTE = tL; exteriorHit = lpt; }
        }
      }
      // Right wall (x = +halfW, facing +x)
      if (sunDirLocal.x > 0.001) {
        var tR = (halfW - sunLocal.x) / sunDirLocal.x;
        if (tR > 0 && tR < bestTE) {
          var rpt = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tR));
          if (rpt.y >= 0 && rpt.y <= H && rpt.z >= 0 && rpt.z <= D) { bestTE = tR; exteriorHit = rpt; }
        }
      }
      // Back wall (z = D) — hittable from front (z>0) or behind (z<0)
      if (Math.abs(sunDirLocal.z) > 0.001) {
        var tB = (D - sunLocal.z) / sunDirLocal.z;
        if (tB > 0 && tB < bestTE) {
          var bpt = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tB));
          if (bpt.y >= 0 && bpt.y <= H && bpt.x >= -halfW && bpt.x <= halfW) { bestTE = tB; exteriorHit = bpt; }
        }
      }
      // Front wall solid area (z = 0, only if sun is behind → sunDirLocal.z < 0)
      if (sunDirLocal.z < -0.001) {
        var tF = (0 - sunLocal.z) / sunDirLocal.z;
        if (tF > 0 && tF < bestTE) {
          var fpt = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tF));
          if (fpt.y >= 0 && fpt.y <= H && fpt.x >= -halfW && fpt.x <= halfW) { bestTE = tF; exteriorHit = fpt; }
        }
      }
      // Left roof slope: plane from (-W/2, H, 0) to (0, RH, 0) — normal points left-up
      var roofNormL = new THREE.Vector3(-(RH - H), W / 2, 0).normalize();
      var roofDotL = sunDirLocal.dot(roofNormL);
      if (Math.abs(roofDotL) > 0.001) {
        var roofPtL = new THREE.Vector3(-halfW, H, 0);
        var tRL = roofPtL.clone().sub(sunLocal).dot(roofNormL) / roofDotL;
        if (tRL > 0 && tRL < bestTE) {
          var rlp = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tRL));
          // Check if within roof bounds
          var roofFracL = (rlp.x - (-halfW)) / (0 - (-halfW)); // 0 at left edge, 1 at ridge
          var expectedY = H + roofFracL * (RH - H);
          if (Math.abs(rlp.y - expectedY) < 0.5 && rlp.z >= 0 && rlp.z <= D && rlp.x >= -halfW && rlp.x <= 0) {
            bestTE = tRL; exteriorHit = rlp;
          }
        }
      }
      // Right roof slope
      var roofNormR = new THREE.Vector3((RH - H), W / 2, 0).normalize();
      var roofDotR = sunDirLocal.dot(roofNormR);
      if (Math.abs(roofDotR) > 0.001) {
        var roofPtR = new THREE.Vector3(halfW, H, 0);
        var tRR = roofPtR.clone().sub(sunLocal).dot(roofNormR) / roofDotR;
        if (tRR > 0 && tRR < bestTE) {
          var rrp = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tRR));
          var roofFracR = (halfW - rrp.x) / (halfW - 0); // 0 at right edge, 1 at ridge
          var expectedYR = H + roofFracR * (RH - H);
          if (Math.abs(rrp.y - expectedYR) < 0.5 && rrp.z >= 0 && rrp.z <= D && rrp.x >= 0 && rrp.x <= halfW) {
            bestTE = tRR; exteriorHit = rrp;
          }
        }
      }
      // Ground (y = 0)
      if (sunDirLocal.y < -0.001) {
        var tG = -sunLocal.y / sunDirLocal.y;
        if (tG > 0 && tG < bestTE) {
          var gpt = sunLocal.clone().add(sunDirLocal.clone().multiplyScalar(tG));
          if (gpt.x >= -halfW - 2 && gpt.x <= halfW + 2 && gpt.z >= -2 && gpt.z <= D + 2) {
            bestTE = tG; exteriorHit = gpt;
          }
        }
      }

      if (exteriorHit) {
        this._sunRaySegments = [
          { from: sunLocal.clone(), to: exteriorHit.clone() }
        ];
        // Add a yellow termination dot
        var dotGeom = new THREE.SphereGeometry(0.3, 12, 12);
        var dotMat = new THREE.MeshBasicMaterial({ color: 0xFFDD00 });
        this._sunRayDot = new THREE.Mesh(dotGeom, dotMat);
        this._sunRayDot.position.copy(exteriorHit);
        this.roomGroup.add(this._sunRayDot);
      }
    }

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

  updateSunlightPatch(patches, sunAltDeg, hsaDeg, shadedHeight) {
    var self = this;
    this._sunlightMeshes.forEach(function(m) {
      self.roomGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
    });
    this._sunlightMeshes = [];

    if (!patches) return;

    // Reuse cached materials to avoid memory leaks
    if (!this._floorPatchMat) {
      this._floorPatchMat = new THREE.MeshBasicMaterial({
        color: 0xFFEE44, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
        depthWrite: false
      });
    }
    if (!this._wallPatchMat) {
      this._wallPatchMat = new THREE.MeshBasicMaterial({
        color: 0xEECC22, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false
      });
    }
    var floorMat = this._floorPatchMat;
    var wallMat = this._wallPatchMat;

    // Each patch surface is now an array of polygons (bands) to support
    // awning-width horizontal clipping at oblique sun angles.
    function addPatchMeshes(polyArray, offset, material, renderOrder) {
      if (!polyArray) return;
      for (var i = 0; i < polyArray.length; i++) {
        if (polyArray[i].length >= 3) {
          var mesh = self._createPatchMesh(polyArray[i], offset, material);
          if (mesh) {
            mesh.renderOrder = renderOrder;
            self.roomGroup.add(mesh);
            self._sunlightMeshes.push(mesh);
          }
        }
      }
    }

    // Floor patches (offset y slightly above floor to prevent z-fighting)
    addPatchMeshes(patches.floor, { y: 0.1 }, floorMat, 10);

    // Back wall patches (offset z slightly forward, high renderOrder to draw over translucent walls)
    addPatchMeshes(patches.wall, { z: -0.1 }, wallMat, 20);

    // Left wall patches (offset x slightly inward)
    addPatchMeshes(patches.leftWall, { x: 0.1 }, wallMat, 20);

    // Right wall patches (offset x slightly inward)
    addPatchMeshes(patches.rightWall, { x: -0.1 }, wallMat, 20);

    // ── Store patch polygons in 2D for mullion shadow clipping ──
    // Each surface stores an array of 2D clip polygons (one per band)
    this._patchClip = {
      floor: (patches.floor || []).map(function(poly) { return poly.map(function(p) { return { x: p.x, z: p.z }; }); }),
      wall: (patches.wall || []).map(function(poly) { return poly.map(function(p) { return { x: p.x, y: p.y }; }); }),
      leftWall: (patches.leftWall || []).map(function(poly) { return poly.map(function(p) { return { y: p.y, z: p.z }; }); }),
      rightWall: (patches.rightWall || []).map(function(poly) { return poly.map(function(p) { return { y: p.y, z: p.z }; }); })
    };

    // ── Mullion shadow lines on sunlight patches ──
    this._addMullionShadows(sunAltDeg, hsaDeg);
  }

  // Sutherland-Hodgman polygon clipping to axis-aligned half-plane
  _clipPoly(poly, axis, value, keepBelow) {
    if (poly.length < 3) return poly;
    var result = [];
    for (var i = 0; i < poly.length; i++) {
      var curr = poly[i];
      var next = poly[(i + 1) % poly.length];
      var currIn = keepBelow ? (curr[axis] <= value) : (curr[axis] >= value);
      var nextIn = keepBelow ? (next[axis] <= value) : (next[axis] >= value);
      if (currIn) {
        result.push(curr);
        if (!nextIn) result.push(this._lerpClip(curr, next, axis, value));
      } else if (nextIn) {
        result.push(this._lerpClip(curr, next, axis, value));
      }
    }
    return result;
  }

  _lerpClip(a, b, axis, value) {
    var t = (value - a[axis]) / (b[axis] - a[axis]);
    var out = {};
    var keys = Object.keys(a);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      out[k] = a[k] + t * (b[k] - a[k]);
    }
    return out;
  }

  // Clip subject polygon to lie within a convex clip polygon (Sutherland-Hodgman)
  // Both polygons must share the same 2D property keys (e.g. {x,z} for floor)
  _clipPolyToPoly(subject, clipPoly) {
    if (!clipPoly || clipPoly.length < 3 || !subject || subject.length < 3) return subject || [];

    var keys = Object.keys(clipPoly[0]);
    if (keys.length < 2) return subject;
    var ax1 = keys[0], ax2 = keys[1];

    // Centroid of clip polygon — defines "inside"
    var cx = 0, cy = 0;
    for (var i = 0; i < clipPoly.length; i++) {
      cx += clipPoly[i][ax1]; cy += clipPoly[i][ax2];
    }
    cx /= clipPoly.length; cy /= clipPoly.length;

    var result = subject.slice();

    // Clip against each edge of the clip polygon
    for (var i = 0; i < clipPoly.length && result.length >= 3; i++) {
      var ea = clipPoly[i];
      var eb = clipPoly[(i + 1) % clipPoly.length];
      var edx = eb[ax1] - ea[ax1];
      var edy = eb[ax2] - ea[ax2];

      // Determine which side the centroid is on (that's "inside")
      var cSide = edx * (cy - ea[ax2]) - edy * (cx - ea[ax1]);
      var sign = cSide >= 0 ? 1 : -1;

      var clipped = [];
      for (var j = 0; j < result.length; j++) {
        var curr = result[j];
        var next = result[(j + 1) % result.length];
        var currS = sign * (edx * (curr[ax2] - ea[ax2]) - edy * (curr[ax1] - ea[ax1]));
        var nextS = sign * (edx * (next[ax2] - ea[ax2]) - edy * (next[ax1] - ea[ax1]));

        if (currS >= -0.001) {
          clipped.push(curr);
          if (nextS < -0.001) clipped.push(this._lineIntersect(curr, next, ea, eb));
        } else if (nextS >= -0.001) {
          clipped.push(this._lineIntersect(curr, next, ea, eb));
        }
      }
      result = clipped;
    }
    return result;
  }

  // Intersect line segment p1→p2 with line through a→b, interpolating all properties
  _lineIntersect(p1, p2, a, b) {
    var keys = Object.keys(p1);
    var ax1 = keys[0], ax2 = keys[1];
    var d1x = p2[ax1] - p1[ax1], d1y = p2[ax2] - p1[ax2];
    var d2x = b[ax1] - a[ax1], d2y = b[ax2] - a[ax2];
    var denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return p1;
    var t = ((a[ax1] - p1[ax1]) * d2y - (a[ax2] - p1[ax2]) * d2x) / denom;
    t = Math.max(0, Math.min(1, t));
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = p1[keys[i]] + t * (p2[keys[i]] - p1[keys[i]]);
    }
    return out;
  }

  _addMullionShadows(sunAltDeg, hsaDeg) {
    if (!sunAltDeg || !this._windowParams) return;
    var wp = this._windowParams;
    var altRad = sunAltDeg * DEG;
    var hsaRad = (hsaDeg || 0) * DEG;
    var sinAlt = Math.sin(altRad);
    var cosAlt = Math.cos(altRad);
    if (sinAlt <= 0.001) return;

    var dirZ = cosAlt * Math.cos(hsaRad);
    var dirX = -cosAlt * Math.sin(hsaRad);
    var dirY = -sinAlt;
    if (dirY >= 0 || dirZ <= 0.001) return;

    // Show FULL window frame projection regardless of awning shading.
    // This lets the user see the "no awning" footprint vs the actual sunlight patch.
    var winBottom = wp.sillHeight;
    var winTop = wp.sillHeight + wp.windowHeight;
    winTop = Math.min(winTop, (this._frontWallH || ROOM_HEIGHT) - 0.05);
    if (winTop <= winBottom + 0.01) return;

    var winH = winTop - winBottom;
    var winCenterY = winBottom + winH / 2;
    var halfWw = wp.windowWidth / 2;
    var halfRW = ROOM_WIDTH / 2;
    var frameW = 0.12;

    // Semi-transparent frame shadow — NOT clipped to sunlight patch
    var shadowMat = new THREE.MeshBasicMaterial({
      color: 0x222222, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false
    });

    var self = this;

    function addMesh(pts3d, renderOrder) {
      if (pts3d.length < 3) return;
      var mesh = self._createPatchMesh(pts3d, { y: 0, x: 0, z: 0 }, shadowMat);
      if (mesh) { mesh.renderOrder = renderOrder; self.roomGroup.add(mesh); self._sunlightMeshes.push(mesh); }
    }

    // Project a strip from the window (z=0) onto room surfaces,
    // clipped to room bounds only (NOT to sunlight patch)
    function projectStrip(x1, y1, x2, y2, stripHalfW, isVertical) {
      var pts;
      if (isVertical) {
        pts = [
          { x: x1 - stripHalfW, y: y1 },
          { x: x1 + stripHalfW, y: y1 },
          { x: x2 + stripHalfW, y: y2 },
          { x: x2 - stripHalfW, y: y2 }
        ];
      } else {
        pts = [
          { x: x1, y: y1 - stripHalfW },
          { x: x2, y: y1 - stripHalfW },
          { x: x2, y: y1 + stripHalfW },
          { x: x1, y: y1 + stripHalfW }
        ];
      }

      // --- Floor projection (y=0 plane) ---
      var baseFloorPoly = [];
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].y <= 0.001) {
          baseFloorPoly.push({ x: pts[i].x, z: 0 });
        } else {
          var t = -pts[i].y / dirY;
          baseFloorPoly.push({ x: pts[i].x + t * dirX, z: t * dirZ });
        }
      }
      baseFloorPoly = self._clipPoly(baseFloorPoly, 'z', ROOM_DEPTH, true);
      baseFloorPoly = self._clipPoly(baseFloorPoly, 'z', 0, false);
      baseFloorPoly = self._clipPoly(baseFloorPoly, 'x', halfRW, true);
      baseFloorPoly = self._clipPoly(baseFloorPoly, 'x', -halfRW, false);
      if (baseFloorPoly.length >= 3) {
        addMesh(baseFloorPoly.map(function(p) { return { x: p.x, y: 0.12, z: p.z }; }), 12);
      }

      // --- Back wall projection (z=ROOM_DEPTH plane) ---
      if (dirZ > 0.001) {
        var tWall = ROOM_DEPTH / dirZ;
        var baseWallPoly = [];
        for (var j = 0; j < pts.length; j++) {
          baseWallPoly.push({ x: pts[j].x + tWall * dirX, y: pts[j].y + tWall * dirY });
        }
        baseWallPoly = self._clipPoly(baseWallPoly, 'y', 0, false);
        baseWallPoly = self._clipPoly(baseWallPoly, 'y', ROOM_HEIGHT, true);
        baseWallPoly = self._clipPoly(baseWallPoly, 'x', halfRW, true);
        baseWallPoly = self._clipPoly(baseWallPoly, 'x', -halfRW, false);
        if (baseWallPoly.length >= 3) {
          addMesh(baseWallPoly.map(function(p) { return { x: p.x, y: p.y, z: ROOM_DEPTH - 0.08 }; }), 22);
        }
      }

      // --- Left wall projection (x = -halfRW plane) ---
      if (dirX < -0.001) {
        var baseLeftPoly = [];
        for (var k = 0; k < pts.length; k++) {
          var tl = (-halfRW - pts[k].x) / dirX;
          if (tl < 0) tl = 0;
          baseLeftPoly.push({ y: pts[k].y + tl * dirY, z: tl * dirZ });
        }
        baseLeftPoly = self._clipPoly(baseLeftPoly, 'y', 0, false);
        baseLeftPoly = self._clipPoly(baseLeftPoly, 'y', ROOM_HEIGHT, true);
        baseLeftPoly = self._clipPoly(baseLeftPoly, 'z', 0, false);
        baseLeftPoly = self._clipPoly(baseLeftPoly, 'z', ROOM_DEPTH, true);
        if (baseLeftPoly.length >= 3) {
          addMesh(baseLeftPoly.map(function(p) { return { x: -halfRW + 0.08, y: p.y, z: p.z }; }), 22);
        }
      }

      // --- Right wall projection (x = +halfRW plane) ---
      if (dirX > 0.001) {
        var baseRightPoly = [];
        for (var m = 0; m < pts.length; m++) {
          var tr = (halfRW - pts[m].x) / dirX;
          if (tr < 0) tr = 0;
          baseRightPoly.push({ y: pts[m].y + tr * dirY, z: tr * dirZ });
        }
        baseRightPoly = self._clipPoly(baseRightPoly, 'y', 0, false);
        baseRightPoly = self._clipPoly(baseRightPoly, 'y', ROOM_HEIGHT, true);
        baseRightPoly = self._clipPoly(baseRightPoly, 'z', 0, false);
        baseRightPoly = self._clipPoly(baseRightPoly, 'z', ROOM_DEPTH, true);
        if (baseRightPoly.length >= 3) {
          addMesh(baseRightPoly.map(function(p) { return { x: halfRW - 0.08, y: p.y, z: p.z }; }), 22);
        }
      }
    }

    // Full window frame shadow
    projectStrip(0, winBottom, 0, winTop, frameW / 2, true);
    projectStrip(-halfWw, winCenterY, halfWw, winCenterY, frameW / 2, false);
    projectStrip(-halfWw, winTop, halfWw, winTop, frameW / 2, false);
    projectStrip(-halfWw, winBottom, halfWw, winBottom, frameW / 2, false);
    projectStrip(-halfWw, winBottom, -halfWw, winTop, frameW / 2, true);
    projectStrip(halfWw, winBottom, halfWw, winTop, frameW / 2, true);
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

  // ─── Window Pane Glow ──────────────────────────────────────────

  updateWindowGlow(shadingFraction, sunHitsWall, sunBelowHorizon) {
    if (!this._windowPaneMat) return;
    if (sunBelowHorizon || !sunHitsWall) {
      // Night or sun behind wall — dim blue, no glow
      this._windowPaneMat.color.setHex(0x2255AA);
      this._windowPaneMat.emissive.setHex(0x000000);
      this._windowPaneMat.opacity = 0.5;
    } else {
      // Interpolate from golden glow (no shade) to dim blue (fully shaded)
      var sunFraction = 1.0 - Math.min(1, Math.max(0, shadingFraction));
      var r = 0.2 + sunFraction * 0.8;  // 0.2 (shaded) to 1.0 (sunlit)
      var g = 0.33 + sunFraction * 0.47; // 0.33 to 0.8
      var b = 0.73 - sunFraction * 0.43; // 0.73 (blue) to 0.3 (gold)
      this._windowPaneMat.color.setRGB(r, g, b);
      // Emissive glow for sunlit portions
      var glowIntensity = sunFraction * 0.4;
      this._windowPaneMat.emissive.setRGB(glowIntensity * 1.0, glowIntensity * 0.85, glowIntensity * 0.2);
      this._windowPaneMat.opacity = 0.35 + sunFraction * 0.2;
    }
    // Update awning shadow overlay on window pane
    this._updateAwningWindowShadow(shadingFraction, sunHitsWall, sunBelowHorizon);
  }

  _updateAwningWindowShadow(shadingFraction, sunHitsWall, sunBelowHorizon) {
    // Remove old shadow overlay
    if (this._awniShadowPane) {
      this.roomGroup.remove(this._awniShadowPane);
      if (this._awniShadowPane.geometry) this._awniShadowPane.geometry.dispose();
      this._awniShadowPane = null;
    }

    var wp = this._windowParams;
    if (!wp || sunBelowHorizon || !sunHitsWall || shadingFraction <= 0.01) return;

    var shadedFrac = Math.min(1, Math.max(0, shadingFraction));
    var winH = Math.min(wp.sillHeight + wp.windowHeight, (this._frontWallH || ROOM_HEIGHT) - 0.05) - wp.sillHeight;
    var shadedH = winH * shadedFrac;
    if (shadedH < 0.05) return;

    var winTop = Math.min(wp.sillHeight + wp.windowHeight, (this._frontWallH || ROOM_HEIGHT) - 0.05);
    var shadowBottom = winTop - shadedH;

    // Create a plane covering the shaded portion of the window, slightly in front
    var shadowGeom = new THREE.PlaneGeometry(wp.windowWidth, shadedH);
    shadowGeom.translate(0, shadowBottom + shadedH / 2, -0.05);
    var shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1a1a3a, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
      depthWrite: false
    });
    this._awniShadowPane = new THREE.Mesh(shadowGeom, shadowMat);
    this._awniShadowPane.renderOrder = 5;
    this.roomGroup.add(this._awniShadowPane);
  }

  // ─── Animated Light Beam Volume ────────────────────────────────

  updateLightBeamParams(sunAltRad, sunCompassAzDeg, wallAzDeg, windowWidth, windowHeight, sillHeight, awningDepth, awningGap, awningWidth) {
    this._lightBeamParams = (sunAltRad > 0) ? {
      sunAltRad: sunAltRad, sunCompassAzDeg: sunCompassAzDeg, wallAzDeg: wallAzDeg,
      windowWidth: windowWidth, windowHeight: windowHeight, sillHeight: sillHeight,
      awningDepth: awningDepth, awningGap: awningGap, awningWidth: awningWidth
    } : null;
    if (this._showLightBeam) this._buildLightBeam();
  }

  _buildLightBeam() {
    // Dispose old beam (geometries AND materials)
    if (this._lightBeamGroup) {
      this._lightBeamGroup.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
      });
      this.roomGroup.remove(this._lightBeamGroup);
      this._lightBeamGroup = null;
    }

    if (!this._showLightBeam || !this._lightBeamParams) return;
    var p = this._lightBeamParams;
    if (p.sunAltRad <= 0) return;

    var sunWorld = compassToScene(p.sunAltRad, p.sunCompassAzDeg, DOME_RADIUS);
    var roomRotY = -p.wallAzDeg * DEG;
    var invRot = -roomRotY;
    var sunLocal = sunWorld.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), invRot);
    var sunDirLocal = sunLocal.clone().normalize().negate();

    // Only show beam when sun faces the front of the house (sunDir.z > 0 means sun hits front wall)
    if (sunDirLocal.z <= 0.01) return;

    var W = ROOM_WIDTH, H = ROOM_HEIGHT, D = ROOM_DEPTH;
    var halfW = W / 2;
    var winTop = Math.min(p.sillHeight + p.windowHeight, H - 0.05);
    var winBottom = p.sillHeight;
    var halfWinW = p.windowWidth / 2;
    var halfAwningW = p.awningWidth / 2;
    var phase = this._lightBeamPhase || 0; // 0→1 controls fade-in from sun to impact

    var group = new THREE.Group();

    // ── Window corners on the front wall ──
    var frontCorners = [
      new THREE.Vector3(-halfWinW, winBottom, 0),
      new THREE.Vector3( halfWinW, winBottom, 0),
      new THREE.Vector3( halfWinW, winTop, 0),
      new THREE.Vector3(-halfWinW, winTop, 0)
    ];

    // Full start points 25 units back toward the sun
    var fullStartDist = 25;
    var beamStartFull = frontCorners.map(function(c) {
      return c.clone().add(sunDirLocal.clone().multiplyScalar(-fullStartDist));
    });

    // Interior hit points (where light hits floor/wall inside)
    var self = this;
    var interiorCorners = frontCorners.map(function(c) {
      var hit = self._traceInteriorRay(c, sunDirLocal, halfW, H, D);
      return hit || c.clone().add(sunDirLocal.clone().multiplyScalar(5));
    });

    // Cache beam materials to avoid creating new ones every frame
    if (!this._beamOuterMat) {
      this._beamOuterMat = new THREE.MeshBasicMaterial({
        color: 0xFFDD44, transparent: true, opacity: 0.10, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
    }
    if (!this._beamInnerMat) {
      this._beamInnerMat = new THREE.MeshBasicMaterial({
        color: 0xFFCC22, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
    }

    // ── Phase 0→0.5: outer beam sweeps FROM sun TOWARD window ──
    var outerPhase = Math.min(1, phase / 0.5); // 0→1 during first half
    if (outerPhase > 0.01) {
      var outerLeading = beamStartFull.map(function(start, i) {
        return start.clone().lerp(frontCorners[i], outerPhase);
      });
      var outerBeam = this._createBeamVolume(beamStartFull, outerLeading, this._beamOuterMat);
      if (outerBeam) group.add(outerBeam);
    }

    // ── Phase 0.5→1.0: inner beam sweeps FROM window TOWARD floor/wall ──
    var innerPhase = Math.max(0, (phase - 0.5) / 0.5); // 0→1 during second half
    if (innerPhase > 0.01) {
      var fullOuter = this._createBeamVolume(beamStartFull, frontCorners, this._beamOuterMat);
      if (fullOuter) group.add(fullOuter);

      var innerLeading = frontCorners.map(function(c, i) {
        return c.clone().lerp(interiorCorners[i], innerPhase);
      });
      var innerBeam = this._createBeamVolume(frontCorners, innerLeading, this._beamInnerMat);
      if (innerBeam) group.add(innerBeam);
    }

    this._lightBeamGroup = group;
    this.roomGroup.add(group);
  }

  _createBeamVolume(startCorners, endCorners, material) {
    // Create a 3D volume connecting two rectangles (8 vertices, 12 triangles)
    if (startCorners.length !== 4 || endCorners.length !== 4) return null;

    var positions = new Float32Array(24); // 8 vertices × 3
    for (var i = 0; i < 4; i++) {
      positions[i * 3]     = startCorners[i].x;
      positions[i * 3 + 1] = startCorners[i].y;
      positions[i * 3 + 2] = startCorners[i].z;
      positions[(i + 4) * 3]     = endCorners[i].x;
      positions[(i + 4) * 3 + 1] = endCorners[i].y;
      positions[(i + 4) * 3 + 2] = endCorners[i].z;
    }

    // Indices for 6 faces (2 triangles each)
    // Start face: 0,1,2,3  End face: 4,5,6,7
    var indices = [
      // Start face
      0, 1, 2,  0, 2, 3,
      // End face
      4, 6, 5,  4, 7, 6,
      // Side faces
      0, 4, 5,  0, 5, 1,  // bottom
      1, 5, 6,  1, 6, 2,  // right
      2, 6, 7,  2, 7, 3,  // top
      3, 7, 4,  3, 4, 0   // left
    ];

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    var mesh = new THREE.Mesh(geom, material);
    mesh.renderOrder = 15;
    return mesh;
  }

  setLightBeamVisible(visible) {
    this._showLightBeam = visible;
    this._lightBeamPhase = 0;
    if (!visible && this._lightBeamGroup) {
      this._lightBeamGroup.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
      });
      this.roomGroup.remove(this._lightBeamGroup);
      this._lightBeamGroup = null;
    } else if (visible) {
      this._buildLightBeam();
    }
  }

  _traceInteriorRay(origin, dir, halfW, H, D) {
    var bestT = Infinity;
    var hitPoint = null;

    if (dir.y < -0.001) {
      var tFloor = -origin.y / dir.y;
      if (tFloor > 0 && tFloor < bestT) {
        var fp = origin.clone().add(dir.clone().multiplyScalar(tFloor));
        if (fp.z >= 0 && fp.z <= D && fp.x >= -halfW && fp.x <= halfW) {
          bestT = tFloor; hitPoint = fp;
        }
      }
    }
    if (dir.z > 0.001) {
      var tBack = (D - origin.z) / dir.z;
      if (tBack > 0 && tBack < bestT) {
        var bp = origin.clone().add(dir.clone().multiplyScalar(tBack));
        if (bp.y >= 0 && bp.y <= H && bp.x >= -halfW && bp.x <= halfW) {
          bestT = tBack; hitPoint = bp;
        }
      }
    }
    if (dir.x < -0.001) {
      var tLeft = (-halfW - origin.x) / dir.x;
      if (tLeft > 0 && tLeft < bestT) {
        var lp = origin.clone().add(dir.clone().multiplyScalar(tLeft));
        if (lp.y >= 0 && lp.y <= H && lp.z >= 0 && lp.z <= D) {
          bestT = tLeft; hitPoint = lp;
        }
      }
    }
    if (dir.x > 0.001) {
      var tRight = (halfW - origin.x) / dir.x;
      if (tRight > 0 && tRight < bestT) {
        var rp = origin.clone().add(dir.clone().multiplyScalar(tRight));
        if (rp.y >= 0 && rp.y <= H && rp.z >= 0 && rp.z <= D) {
          bestT = tRight; hitPoint = rp;
        }
      }
    }

    return hitPoint;
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

    // Animate light beam volume (fade in over 2 seconds, repeat)
    if (this._showLightBeam && this._lightBeamParams) {
      this._lightBeamPhase = (this._lightBeamPhase || 0) + dt / 2.0; // 2 second cycle
      if (this._lightBeamPhase > 1.0) this._lightBeamPhase = 0; // reset to repeat
      if (!this._lightBeamLastBuild) this._lightBeamLastBuild = 0;
      if (now - this._lightBeamLastBuild > 50) { // ~20 fps for smooth animation
        this._lightBeamLastBuild = now;
        this._buildLightBeam();
      }
    }

    requestAnimationFrame(function() { self._animate(); });
    this.renderer.render(this.scene, this.camera);
  }
}

window.App.Scene3D = Scene3D;

})();
