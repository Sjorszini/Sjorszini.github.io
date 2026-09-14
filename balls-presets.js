(function () {
  "use strict";

  var palettes = {
    orbit: ["#327eb1", "#438fc0", "#245f99", "#579dca", "#3a75a4"],
    billiards: ["#2f6fa5", "#4d8fbe", "#245a86", "#5f98c4", "#397bad"],
    rain: ["#438fc0", "#2f6fa5", "#5c9ac7", "#245a86", "#4b83b0"],
    cloud: ["#1c527f", "#286a9d", "#367faf", "#468fbc", "#5a9ec8", "#346f9d"],
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

  function removeCenterOfMassDrift() {
    var totalMass = 0;
    var px = 0;
    var py = 0;
    for (var i = 0; i < NumberOfBalls; i += 1) {
      totalMass += ball[i].m;
      px += ball[i].m * ball[i].vx;
      py += ball[i].m * ball[i].vy;
    }
    if (totalMass <= 0) return;
    var cvx = px / totalMass;
    var cvy = py / totalMass;
    for (var j = 0; j < NumberOfBalls; j += 1) {
      ball[j].vx -= cvx;
      ball[j].vy -= cvy;
    }
  }

  function gridCloud(columns, rows, radius, minSpeed, maxSpeed, palette) {
    var marginX = Math.max(14, radius * 3);
    var marginY = Math.max(14, radius * 3);
    var usableWidth = width - marginX * 2;
    var usableHeight = height - marginY * 2;
    var index = 0;

    for (var row = 0; row < rows; row += 1) {
      for (var col = 0; col < columns; col += 1) {
        var x = marginX + (col + 0.5) * usableWidth / columns;
        var y = marginY + (row + 0.5) * usableHeight / rows;
        var angle = Math.random() * Math.PI * 2;
        var speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
        addBall(x, y, radius, 1, Math.cos(angle) * speed, Math.sin(angle) * speed, colorFrom(palette, index++));
      }
    }
    removeCenterOfMassDrift();
  }

  function threeHundredBallCloud() {
    resetWorld({ verticalGravity: false, mutualGravity: true, collisions: true, drawingMode: false, boundaries: true, energyDissipation: 7, G: 10 });
    gridCloud(20, 15, 5.2, 0.7, 2.8, palettes.cloud);
    announce("300-ball gravity cloud", "exact mutual gravity, collisions and 7% dissipation are enabled");
  }

  function thousandBallGravityCloud() {
    resetWorld({ verticalGravity: false, mutualGravity: true, collisions: true, drawingMode: false, boundaries: true, energyDissipation: 7, G: 10 });
    gridCloud(40, 25, 3.6, 1.5, 4.7, palettes.swarm);
    announce("1,000-ball gravity cloud", "mutual gravity and 7% dissipation are enabled; initial centre-of-mass drift is removed");
  }

  window.loadBallsPreset = function (name) {
    var presets = {
      solar: solarSystem,
      billiards: billiardBreak,
      rain: gravityRain,
      cloud300: threeHundredBallCloud,
      swarm: thousandBallGravityCloud
    };
    if (presets[name]) presets[name]();
  };
})();