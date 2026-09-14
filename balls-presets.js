(function () {
  "use strict";

  var palettes = {
    orbit: ["#327eb1", "#438fc0", "#245f99", "#579dca", "#3a75a4"],
    billiards: ["#2f6fa5", "#4d8fbe", "#245a86", "#5f98c4", "#397bad"],
    rain: ["#438fc0", "#2f6fa5", "#5c9ac7", "#245a86", "#4b83b0"],
    storm: ["#4a8bbb", "#3278aa", "#245f99", "#619bc4", "#3f7fae"],
    trails: ["#5f98c4", "#438fc0", "#3278aa", "#245f99", "#4c88b6"],
    swarm: ["#174d7a", "#23679c", "#327eb1", "#438fc0", "#579dca", "#3a75a4"]
  };

  function colorFrom(palette, index) {
    return palette[index % palette.length];
  }

  function addBall(x, y, radius, mass, vx, vy, color) {
    ColorNewBall = color;
    CreateBall(x, y, radius, mass, vx, vy);
    NumberOfBalls += 1;
  }

  function resetWorld(options) {
    NumberOfBalls = 0;
    if (window.ball) window.ball.length = 0;
    ctx.clearRect(0, 0, width, height);

    VerticalGravity = Boolean(options.verticalGravity);
    MutualGravity = Boolean(options.mutualGravity);
    Collisions = Boolean(options.collisions);
    DrawingMode = Boolean(options.drawingMode);
    Boundaries = Boolean(options.boundaries);
    EnergyDissipation = options.energyDissipation;

    if (typeof options.G === "number") G = options.G;
    if (typeof options.gy === "number") gy = options.gy;

    dt = 0.5;
    Old_dt = 0.5;
    document.getElementById("chbPauseResume").checked = true;
    UpdateElements();
  }

  function announce(name, detail) {
    var status = document.getElementById("preset-status");
    if (status) status.textContent = name + " loaded — " + detail;
  }

  function solarSystem() {
    resetWorld({ verticalGravity: false, mutualGravity: true, collisions: false, drawingMode: false, boundaries: false, energyDissipation: 0, G: 10 });
    var cx = width / 2;
    var cy = height / 2;
    var starMass = 900;
    addBall(cx, cy, 25, starMass, 0, 0, "#3d78a8");
    [
      { r: 105, radius: 8, mass: 3, angle: 0.2 },
      { r: 165, radius: 10, mass: 6, angle: 2.2 },
      { r: 235, radius: 12, mass: 10, angle: 4.1 }
    ].forEach(function (planet, index) {
      var x = cx + Math.cos(planet.angle) * planet.r;
      var y = cy + Math.sin(planet.angle) * planet.r;
      var speed = Math.sqrt(G * starMass / planet.r);
      addBall(x, y, planet.radius, planet.mass, -Math.sin(planet.angle) * speed, Math.cos(planet.angle) * speed, colorFrom(palettes.orbit, index));
    });
    announce("Mini solar system", "three bodies orbit a heavy central mass");
  }

  function billiardBreak() {
    resetWorld({ verticalGravity: false, mutualGravity: false, collisions: true, drawingMode: false, boundaries: true, energyDissipation: 2, G: 10 });
    var radius = 13;
    var spacingX = 25;
    var spacingY = 29;
    var startX = 515;
    var centerY = height / 2;
    var index = 0;
    for (var row = 0; row < 5; row += 1) {
      for (var col = 0; col <= row; col += 1) {
        addBall(startX + row * spacingX, centerY + (col - row / 2) * spacingY, radius, 1, 0, 0, colorFrom(palettes.billiards, index++));
      }
    }
    addBall(175, centerY, 14, 1.2, 15, 0.25, "#4d8fbe");
    announce("Billiard break", "a fast cue ball hits a fifteen-ball rack");
  }

  function gravityRain() {
    resetWorld({ verticalGravity: true, mutualGravity: false, collisions: true, drawingMode: false, boundaries: true, energyDissipation: 12, G: 10, gy: 0.22 });
    var index = 0;
    for (var row = 0; row < 4; row += 1) {
      for (var col = 0; col < 8; col += 1) {
        var radius = 8 + ((row + col) % 3) * 3;
        addBall(75 + col * 92 + (row % 2) * 18, 55 + row * 62, radius, radius * 0.7, (Math.random() - 0.5) * 2.2, Math.random() * 1.5, colorFrom(palettes.rain, index++));
      }
    }
    announce("Gravity rain", "thirty-two balls fall, collide and settle");
  }

  function particleStorm() {
    resetWorld({ verticalGravity: false, mutualGravity: false, collisions: true, drawingMode: false, boundaries: true, energyDissipation: 0, G: 10 });
    var index = 0;
    for (var row = 0; row < 5; row += 1) {
      for (var col = 0; col < 7; col += 1) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 5 + Math.random() * 7;
        addBall(85 + col * 105, 75 + row * 105, 8 + (index % 4), 1 + (index % 3) * 0.5, Math.cos(angle) * speed, Math.sin(angle) * speed, colorFrom(palettes.storm, index++));
      }
    }
    announce("Particle storm", "thirty-five elastic particles ricochet around the box");
  }

  function orbitTrails() {
    resetWorld({ verticalGravity: false, mutualGravity: true, collisions: false, drawingMode: true, boundaries: false, energyDissipation: 0, G: 14 });
    var cx = width / 2;
    var cy = height / 2;
    var coreMass = 700;
    addBall(cx, cy, 18, coreMass, 0, 0, "#3d78a8");
    for (var i = 0; i < 9; i += 1) {
      var radius = 75 + i * 24;
      var angle = (Math.PI * 2 * i) / 9 + (i % 2) * 0.17;
      var speed = Math.sqrt(G * coreMass / radius) * (0.88 + (i % 3) * 0.07);
      addBall(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 4 + (i % 3), 1.5 + (i % 2), -Math.sin(angle) * speed, Math.cos(angle) * speed, colorFrom(palettes.trails, i));
    }
    announce("Orbit trails", "drawing mode leaves persistent paths behind the orbiters");
  }

  function thousandBallSwarm() {
    resetWorld({ verticalGravity: false, mutualGravity: true, collisions: true, drawingMode: false, boundaries: true, energyDissipation: 7, G: 10 });
    var columns = 40;
    var rows = 25;
    var marginX = 22;
    var marginY = 22;
    var usableWidth = width - marginX * 2;
    var usableHeight = height - marginY * 2;
    var index = 0;
    for (var row = 0; row < rows; row += 1) {
      for (var col = 0; col < columns; col += 1) {
        var x = marginX + (col + 0.5) * usableWidth / columns;
        var y = marginY + (row + 0.5) * usableHeight / rows;
        var angle = Math.random() * Math.PI * 2;
        var speed = 1.5 + Math.random() * 3.2;
        addBall(x, y, 3.6, 1, Math.cos(angle) * speed, Math.sin(angle) * speed, colorFrom(palettes.swarm, index++));
      }
    }
    announce("1,000-ball swarm", "mutual gravity and 7% dissipation are enabled for a self-gravitating stress test");
  }

  window.loadBallsPreset = function (name) {
    var presets = { solar: solarSystem, billiards: billiardBreak, rain: gravityRain, storm: particleStorm, trails: orbitTrails, swarm: thousandBallSwarm };
    if (presets[name]) presets[name]();
  };
})();