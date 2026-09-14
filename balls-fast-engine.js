(function () {
  "use strict";

  // Stop the legacy 5 ms timer. The optimized engine below runs with the
  // browser's animation clock, so hidden tabs also stop consuming CPU.
  if (typeof TimerStatus !== "undefined") clearInterval(TimerStatus);

  var started = false;
  var perfFrames = 0;
  var perfStarted = performance.now();
  var collisionChecks = 0;
  var gravityMode = "exact";

  var darkerColors = [
    "#174d7a", "#23679c", "#327eb1", "#438fc0",
    "#579dca", "#2a5f8b", "#3a75a4", "#668fb5"
  ];

  // Also make manually added balls easier to see against the white canvas.
  getRandomBlueColor = function () {
    return darkerColors[Math.floor(Math.random() * darkerColors.length)];
  };

  function maximumRadius() {
    var result = 1;
    for (var i = 0; i < NumberOfBalls; i += 1) {
      if (ball[i].r > result) result = ball[i].r;
    }
    return result;
  }

  function key(cx, cy) {
    return cx + "," + cy;
  }

  function collisionGrid(cellSize) {
    var grid = new Map();
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var px = b.x + b.dx;
      var py = b.y + b.dy;
      var cx = Math.floor(px / cellSize);
      var cy = Math.floor(py / cellSize);
      var k = key(cx, cy);
      var bucket = grid.get(k);
      if (bucket) bucket.push(i);
      else grid.set(k, [i]);
    }
    return grid;
  }

  function resolveCollisionsWithGrid() {
    if (!Collisions || NumberOfBalls < 2) return;
    var cellSize = Math.max(12, 2 * maximumRadius());
    var grid = collisionGrid(cellSize);

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var a = ball[i];
      var cx = Math.floor((a.x + a.dx) / cellSize);
      var cy = Math.floor((a.y + a.dy) / cellSize);

      for (var ox = -1; ox <= 1; ox += 1) {
        for (var oy = -1; oy <= 1; oy += 1) {
          var bucket = grid.get(key(cx + ox, cy + oy));
          if (!bucket) continue;
          for (var n = 0; n < bucket.length; n += 1) {
            var j = bucket[n];
            if (j <= i) continue;
            collisionChecks += 1;
            if (Check_Collision_Ball(a, ball[j])) Collision_Ball(a, ball[j]);
          }
        }
      }
    }
  }

  function buildGravityCells() {
    // For large systems we approximate distant groups by their centre of mass.
    // A 150 px cell produces only ~20–30 aggregate interactions per particle
    // on this 800×600 canvas instead of N interactions per particle.
    var cellSize = 150;
    var map = new Map();
    var cells = [];

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var cx = Math.floor(b.x / cellSize);
      var cy = Math.floor(b.y / cellSize);
      var k = key(cx, cy);
      var c = map.get(k);
      if (!c) {
        c = { cx: cx, cy: cy, mass: 0, x: 0, y: 0 };
        map.set(k, c);
        cells.push(c);
      }
      var oldMass = c.mass;
      c.mass += b.m;
      c.x = (c.x * oldMass + b.x * b.m) / c.mass;
      c.y = (c.y * oldMass + b.y * b.m) / c.mass;
    }

    return { size: cellSize, cells: cells };
  }

  function calculateApproximateGravity() {
    gravityMode = "spatial approximation";
    var grid = buildGravityCells();

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var target = ball[i];
      var tcx = Math.floor(target.x / grid.size);
      var tcy = Math.floor(target.y / grid.size);

      for (var c = 0; c < grid.cells.length; c += 1) {
        var cell = grid.cells[c];
        var mass = cell.mass;
        var comX = cell.x;
        var comY = cell.y;

        if (cell.cx === tcx && cell.cy === tcy) {
          mass -= target.m;
          if (mass <= 0) continue;
          comX = (cell.x * cell.mass - target.x * target.m) / mass;
          comY = (cell.y * cell.mass - target.y * target.m) / mass;
        }

        var dx = comX - target.x;
        var dy = comY - target.y;
        var r2 = dx * dx + dy * dy;
        if (r2 < 1e-9) continue;
        var r = Math.sqrt(r2);
        var softened = Math.max(r, 30);
        var forceScale = G * target.m * mass / (softened * softened * r);
        target.Fx += forceScale * dx;
        target.Fy += forceScale * dy;
      }
    }
  }

  function calculateForces() {
    for (var i = 0; i < NumberOfBalls; i += 1) Calculate_Vertical_Gravity(ball[i]);

    if (!MutualGravity) {
      gravityMode = "off";
      return;
    }

    if (NumberOfBalls <= 180) {
      gravityMode = "exact";
      for (var a = 0; a < NumberOfBalls; a += 1) {
        for (var b = a + 1; b < NumberOfBalls; b += 1) {
          Calculate_Mutual_Gravity(ball[a], ball[b]);
        }
      }
    } else {
      calculateApproximateGravity();
    }
  }

  function wallCollisions() {
    if (!Boundaries) return;
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      if (Check_Collision_Right_Wall(b)) Collision_Right_Wall(b);
      if (Check_Collision_Left_Wall(b)) Collision_Left_Wall(b);
      if (Check_Collision_Upper_Wall(b)) Collision_Upper_Wall(b);
      if (Check_Collision_Lower_Wall(b)) Collision_Lower_Wall(b);
    }
  }

  function physicsStep() {
    calculateForces();
    for (var i = 0; i < NumberOfBalls; i += 1) Prepare_Collision_Check(ball[i]);

    resolveCollisionsWithGrid();
    if (NumberOfBalls < 260) {
      for (var p = 0; p < NumberOfBalls; p += 1) Prepare_Collision_Check(ball[p]);
      resolveCollisionsWithGrid();
    }
    wallCollisions();

    for (var j = 0; j < NumberOfBalls; j += 1) {
      var b = ball[j];
      b.vx += b.dvx;
      b.vy += b.dvy;
      b.dx = b.vx * dt;
      b.dy = b.vy * dt;
      b.x += b.dx;
      b.y += b.dy;
    }
  }

  function simulateFrame() {
    if (dt === 0 || NumberOfBalls === 0) return;

    var normalDt = Old_dt || 0.5;
    var substeps = NumberOfBalls <= 120 ? 3 : (NumberOfBalls <= 420 ? 2 : 1);
    var stepDt = normalDt * 3 / substeps;
    collisionChecks = 0;

    for (var s = 0; s < substeps; s += 1) {
      dt = stepDt;
      physicsStep();
    }
    dt = normalDt;
  }

  function drawBatched() {
    var factor = CoordsCSS2HTMLfactor();
    var groups = Object.create(null);

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var color = b.color || "#327eb1";
      if (!groups[color]) groups[color] = [];
      groups[color].push(b);
    }

    Object.keys(groups).forEach(function (color) {
      var group = groups[color];
      ctx.beginPath();
      for (var n = 0; n < group.length; n += 1) {
        var b = group[n];
        var x = factor * b.x;
        var y = factor * b.y;
        var r = factor * b.r;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.closePath();
    });
  }

  function drawFrame() {
    var factor = CoordsCSS2HTMLfactor();
    if (!DrawingMode) ctx.clearRect(0, 0, factor * width, factor * height);
    drawBatched();

    if (CursorInCanvas && !DrawingMode) {
      ctx.beginPath();
      ctx.arc(mousePosX, mousePosY, factor * SizeNewBall, 0, Math.PI * 2);
      ctx.fillStyle = ColorNewBall;
      ctx.fill();
      ctx.closePath();
    }
  }

  function updateStats(now) {
    perfFrames += 1;
    var elapsed = now - perfStarted;
    if (elapsed < 650) return;
    var fps = Math.round(perfFrames * 1000 / elapsed);
    perfFrames = 0;
    perfStarted = now;

    var output = document.getElementById("performance-status");
    if (output) {
      output.textContent = NumberOfBalls.toLocaleString() + " balls · " + fps + " fps · " +
        collisionChecks.toLocaleString() + " nearby collision checks/frame · gravity: " + gravityMode;
    }
  }

  function frame(now) {
    simulateFrame();
    drawFrame();
    updateStats(now);
    requestAnimationFrame(frame);
  }

  // Replace the legacy startup so the canvas uses 2× rather than 3× backing
  // resolution. It remains sharp but reduces the pixels cleared and painted by
  // more than half.
  OnLoad = function () {
    if (screen.width < 700) {
      document.getElementById("Balls_mobile_text").textContent = "Tip: a larger screen gives you more room to experiment.";
    }

    ColorNewBall = getRandomBlueColor();
    ResTemp = canvas.width;
    changeResolution(canvas, 2);
    SetupCanvasSize();
    SetupScenario1();
    document.getElementById("chbPauseResume").checked = true;

    if (!started) {
      started = true;
      requestAnimationFrame(frame);
    }
  };

  // Preserve a callable TimerTick for old controls/debugging, but route it
  // through the optimized engine.
  TimerTick = function () {
    simulateFrame();
    drawFrame();
  };
})();
