(function () {
  "use strict";

  var palettes = {
    orbit: ["#9dd6ff", "#5ea5e8", "#2f6fab", "#d7ecff", "#77bce8"],
    billiards: ["#4d8bc9", "#7fb3df", "#2e638f", "#bdd9ee", "#5b9fcf"],
    rain: ["#79b9eb", "#3f7eb5", "#a9d5f3", "#245b91", "#6ca7d3"],
    storm: ["#9acdf1", "#4b8fc4", "#245f99", "#c4e2f6", "#70add7"],
    trails: ["#d8efff", "#86c6ef", "#4a91ca", "#276696", "#b3dcf6"]
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
    resetWorld({
      verticalGravity: false,
      mutualGravity: true,
      collisions: false,
      drawingMode: false,
      boundaries: false,
      energyDissipation: 0,
      G: 10
    });

    var cx = width / 2;
    var cy = height / 2;
    var starMass = 900;
    addBall(cx, cy, 25, starMass, 0, 0, "#d7ecff");

    [
      { r: 105, radius: 8, mass: 3, angle: 0.2 },
      { r: 165, radius: 10, mass: 6, angle: 2.2 },
      { r: 235, radius: 12, mass: 10, angle: 4.1 }
    ].forEach(function (planet, index) {
      var x = cx + Math.cos(planet.angle) * planet.r;
      var y = cy + Math.sin(planet.angle) * planet.r;
      var speed = Math.sqrt(G * starMass / planet.r);
      var vx = -Math.sin(planet.angle) * speed;
      var vy = Math.cos(planet.angle) * speed;
      addBall(x, y, planet.radius, planet.mass, vx, vy, colorFrom(palettes.orbit, index));
    });

    announce("Mini solar system", "three bodies orbit a heavy central mass");
  }

  function billiardBreak() {
    resetWorld({
      verticalGravity: false,
      mutualGravity: false,
      collisions: true,
      drawingMode: false,
      boundaries: true,
      energyDissipation: 2,
      G: 10
    });

    var radius = 13;
    var spacingX = 25;
    var spacingY = 29;
    var startX = 515;
    var centerY = height / 2;
    var index = 0;

    for (var row = 0; row < 5; row += 1) {
      for (var col = 0; col <= row; col += 1) {
        addBall(
          startX + row * spacingX,
          centerY + (col - row / 2) * spacingY,
          radius,
          1,
          0,
          0,
          colorFrom(palettes.billiards, index++)
        );
      }
    }

    addBall(175, centerY, 14, 1.2, 15, 0.25, "#d8efff");
    announce("Billiard break", "a fast cue ball hits a fifteen-ball rack");
  }

  function gravityRain() {
    resetWorld({
      verticalGravity: true,
      mutualGravity: false,
      collisions: true,
      drawingMode: false,
      boundaries: true,
      energyDissipation: 12,
      G: 10,
      gy: 0.22
    });

    var index = 0;
    for (var row = 0; row < 4; row += 1) {
      for (var col = 0; col < 8; col += 1) {
        var radius = 8 + ((row + col) % 3) * 3;
        addBall(
          75 + col * 92 + (row % 2) * 18,
          55 + row * 62,
          radius,
          radius * 0.7,
          (Math.random() - 0.5) * 2.2,
          Math.random() * 1.5,
          colorFrom(palettes.rain, index++)
        );
      }
    }

    announce("Gravity rain", "thirty-two balls fall, collide and settle");
  }

  function particleStorm() {
    resetWorld({
      verticalGravity: false,
      mutualGravity: false,
      collisions: true,
      drawingMode: false,
      boundaries: true,
      energyDissipation: 0,
      G: 10
    });

    var index = 0;
    for (var row = 0; row < 5; row += 1) {
      for (var col = 0; col < 7; col += 1) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 5 + Math.random() * 7;
        addBall(
          85 + col * 105,
          75 + row * 105,
          8 + (index % 4),
          1 + (index % 3) * 0.5,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          colorFrom(palettes.storm, index++)
        );
      }
    }

    announce("Particle storm", "thirty-five elastic particles ricochet around the box");
  }

  function orbitTrails() {
    resetWorld({
      verticalGravity: false,
      mutualGravity: true,
      collisions: false,
      drawingMode: true,
      boundaries: false,
      energyDissipation: 0,
      G: 14
    });

    var cx = width / 2;
    var cy = height / 2;
    var coreMass = 700;
    addBall(cx, cy, 18, coreMass, 0, 0, "#d8efff");

    for (var i = 0; i < 9; i += 1) {
      var radius = 75 + i * 24;
      var angle = (Math.PI * 2 * i) / 9 + (i % 2) * 0.17;
      var speed = Math.sqrt(G * coreMass / radius) * (0.88 + (i % 3) * 0.07);
      addBall(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        4 + (i % 3),
        1.5 + (i % 2),
        -Math.sin(angle) * speed,
        Math.cos(angle) * speed,
        colorFrom(palettes.trails, i)
      );
    }

    announce("Orbit trails", "drawing mode leaves luminous-looking paths behind the orbiters");
  }

  window.loadBallsPreset = function (name) {
    var presets = {
      solar: solarSystem,
      billiards: billiardBreak,
      rain: gravityRain,
      storm: particleStorm,
      trails: orbitTrails
    };

    if (presets[name]) presets[name]();
  };
})();
