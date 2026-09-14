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

  getRandomBlueColor = function () {
    return darkerColors[Math.floor(Math.random() * darkerColors.length)];
  };

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function restitution() {
    return clamp(1 - EnergyDissipation / 100, 0, 1);
  }

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

  function resetForces() {
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      b.Fx = 0;
      b.Fy = VerticalGravity ? b.m * gy : 0;
    }
  }

  // Smooth softening prevents inverse-square gravity from becoming numerically
  // singular. If collisions are on, touching bodies stop attracting each other;
  // contact is handled by the collision solver instead.
  function pairGravity(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var r2 = dx * dx + dy * dy;
    if (r2 < 1e-10) return;

    var contact = a.r + b.r + 0.75;
    if (Collisions && r2 <= contact * contact) return;

    var softening = 18;
    var denom = Math.pow(r2 + softening * softening, 1.5);
    var scale = G * a.m * b.m / denom;
    var fx = scale * dx;
    var fy = scale * dy;

    a.Fx += fx;
    a.Fy += fy;
    b.Fx -= fx;
    b.Fy -= fy;
  }

  function buildGravityCells() {
    // Keep cells small enough that the exact near-field region contains the
    // important short-range interactions, while the far field remains cheap.
    var cellSize = Math.max(60, 3 * maximumRadius());
    var map = new Map();
    var cells = [];

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var cx = Math.floor(b.x / cellSize);
      var cy = Math.floor(b.y / cellSize);
      var k = key(cx, cy);
      var c = map.get(k);
      if (!c) {
        c = {
          cx: cx,
          cy: cy,
          mass: 0,
          x: 0,
          y: 0,
          ax: 0,
          ay: 0,
          indices: []
        };
        map.set(k, c);
        cells.push(c);
      }

      var oldMass = c.mass;
      c.mass += b.m;
      c.x = (c.x * oldMass + b.x * b.m) / c.mass;
      c.y = (c.y * oldMass + b.y * b.m) / c.mass;
      c.indices.push(i);
    }

    return cells;
  }

  function exactGravityWithinCell(cell) {
    for (var a = 0; a < cell.indices.length; a += 1) {
      for (var b = a + 1; b < cell.indices.length; b += 1) {
        pairGravity(ball[cell.indices[a]], ball[cell.indices[b]]);
      }
    }
  }

  function exactGravityBetweenCells(cellA, cellB) {
    for (var a = 0; a < cellA.indices.length; a += 1) {
      for (var b = 0; b < cellB.indices.length; b += 1) {
        pairGravity(ball[cellA.indices[a]], ball[cellB.indices[b]]);
      }
    }
  }

  function aggregateCellPairGravity(cellA, cellB) {
    var dx = cellB.x - cellA.x;
    var dy = cellB.y - cellA.y;
    var r2 = dx * dx + dy * dy;
    if (r2 < 1e-10 || cellA.mass <= 0 || cellB.mass <= 0) return;

    var softening = 24;
    var denom = Math.pow(r2 + softening * softening, 1.5);
    var scale = G * cellA.mass * cellB.mass / denom;
    var fx = scale * dx;
    var fy = scale * dy;

    // Equal-and-opposite cell forces preserve total linear momentum exactly.
    cellA.ax += fx / cellA.mass;
    cellA.ay += fy / cellA.mass;
    cellB.ax -= fx / cellB.mass;
    cellB.ay -= fy / cellB.mass;
  }

  function applyAggregateCellAcceleration(cells) {
    for (var c = 0; c < cells.length; c += 1) {
      var cell = cells[c];
      for (var n = 0; n < cell.indices.length; n += 1) {
        var b = ball[cell.indices[n]];
        b.Fx += b.m * cell.ax;
        b.Fy += b.m * cell.ay;
      }
    }
  }

  function calculateClusteredGravity() {
    gravityMode = "momentum-conserving clustered";
    var cells = buildGravityCells();

    // Resolve all gravity within each cell exactly.
    for (var c = 0; c < cells.length; c += 1) exactGravityWithinCell(cells[c]);

    // Resolve neighbouring cells exactly. Distant cell pairs interact through
    // their centres of mass, but always as one symmetric equal/opposite pair.
    for (var a = 0; a < cells.length; a += 1) {
      var cellA = cells[a];
      for (var b = a + 1; b < cells.length; b += 1) {
        var cellB = cells[b];
        var near = Math.abs(cellA.cx - cellB.cx) <= 1 && Math.abs(cellA.cy - cellB.cy) <= 1;
        if (near) exactGravityBetweenCells(cellA, cellB);
        else aggregateCellPairGravity(cellA, cellB);
      }
    }

    applyAggregateCellAcceleration(cells);
  }

  function calculateForces() {
    resetForces();

    if (!MutualGravity) {
      gravityMode = "off";
      return;
    }

    if (NumberOfBalls <= 180) {
      gravityMode = "exact";
      for (var a = 0; a < NumberOfBalls; a += 1) {
        for (var b = a + 1; b < NumberOfBalls; b += 1) {
          pairGravity(ball[a], ball[b]);
        }
      }
    } else {
      calculateClusteredGravity();
    }
  }

  function integrate(stepDt) {
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var invMass = b.m > 0 ? 1 / b.m : 0;
      b.ax = b.Fx * invMass;
      b.ay = b.Fy * invMass;
      b.vx += b.ax * stepDt;
      b.vy += b.ay * stepDt;
      b.dx = b.vx * stepDt;
      b.dy = b.vy * stepDt;
      b.x += b.dx;
      b.y += b.dy;
    }
  }

  function collisionGrid(cellSize) {
    var grid = new Map();
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var cx = Math.floor(b.x / cellSize);
      var cy = Math.floor(b.y / cellSize);
      var k = key(cx, cy);
      var bucket = grid.get(k);
      if (bucket) bucket.push(i);
      else grid.set(k, [i]);
    }
    return grid;
  }

  function resolvePair(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var minDistance = a.r + b.r;
    var distance2 = dx * dx + dy * dy;
    if (distance2 >= minDistance * minDistance) return;

    var distance = Math.sqrt(Math.max(distance2, 1e-12));
    var nx;
    var ny;
    if (distance > 1e-6) {
      nx = dx / distance;
      ny = dy / distance;
    } else {
      var rvx0 = b.vx - a.vx;
      var rvy0 = b.vy - a.vy;
      var rvLen = Math.sqrt(rvx0 * rvx0 + rvy0 * rvy0) || 1;
      nx = rvx0 / rvLen;
      ny = rvy0 / rvLen;
    }

    var invA = a.m > 0 ? 1 / a.m : 0;
    var invB = b.m > 0 ? 1 / b.m : 0;
    var invSum = invA + invB;
    if (invSum <= 0) return;

    // Correct overlap explicitly. This prevents gravity + discrete collision
    // handling from repeatedly pulling overlapping balls into one another.
    var penetration = minDistance - distance;
    var slop = 0.015;
    var percent = 0.94;
    var correction = Math.max(penetration - slop, 0) * percent / invSum;
    a.x -= nx * correction * invA;
    a.y -= ny * correction * invA;
    b.x += nx * correction * invB;
    b.y += ny * correction * invB;

    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    var tx = -ny;
    var ty = nx;
    var vt = rvx * tx + rvy * ty;
    var e = restitution();

    // Dissipation acts on all relative contact motion. Approaching bodies
    // bounce with restitution e; separating bodies that are still overlapping
    // also lose the requested fraction of relative speed. Tangential sliding is
    // damped too. Total pair momentum is preserved because all changes are
    // applied as equal/opposite impulses in the centre-of-mass frame.
    var desiredVn = vn < 0 ? -e * vn : e * vn;
    var desiredVt = e * vt;
    var impulseN = (desiredVn - vn) / invSum;
    var impulseT = (desiredVt - vt) / invSum;
    var impulseX = impulseN * nx + impulseT * tx;
    var impulseY = impulseN * ny + impulseT * ty;

    a.vx -= impulseX * invA;
    a.vy -= impulseY * invA;
    b.vx += impulseX * invB;
    b.vy += impulseY * invB;
  }

  function resolveCollisionsWithGrid() {
    if (!Collisions || NumberOfBalls < 2) return;
    var cellSize = Math.max(12, 2 * maximumRadius());
    var grid = collisionGrid(cellSize);

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var a = ball[i];
      var cx = Math.floor(a.x / cellSize);
      var cy = Math.floor(a.y / cellSize);

      for (var ox = -1; ox <= 1; ox += 1) {
        for (var oy = -1; oy <= 1; oy += 1) {
          var bucket = grid.get(key(cx + ox, cy + oy));
          if (!bucket) continue;
          for (var n = 0; n < bucket.length; n += 1) {
            var j = bucket[n];
            if (j <= i) continue;
            collisionChecks += 1;
            resolvePair(a, ball[j]);
          }
        }
      }
    }
  }

  function resolveWalls() {
    if (!Boundaries) return;
    var e = restitution();

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];

      if (b.x - b.r < 0) {
        b.x = b.r;
        if (b.vx < 0) b.vx = -b.vx * e;
        b.vy *= e;
      } else if (b.x + b.r > width) {
        b.x = width - b.r;
        if (b.vx > 0) b.vx = -b.vx * e;
        b.vy *= e;
      }

      if (b.y - b.r < 0) {
        b.y = b.r;
        if (b.vy < 0) b.vy = -b.vy * e;
        b.vx *= e;
      } else if (b.y + b.r > height) {
        b.y = height - b.r;
        if (b.vy > 0) b.vy = -b.vy * e;
        b.vx *= e;
      }
    }
  }

  function physicsStep(stepDt) {
    calculateForces();
    integrate(stepDt);

    var iterations = NumberOfBalls <= 160 ? 3 : (NumberOfBalls <= 500 ? 2 : 2);
    for (var i = 0; i < iterations; i += 1) resolveCollisionsWithGrid();
    resolveWalls();
  }

  function simulateFrame() {
    if (dt === 0 || NumberOfBalls === 0) return;

    var normalDt = Old_dt || 0.5;
    var substeps = NumberOfBalls <= 120 ? 6 : (NumberOfBalls <= 420 ? 3 : 1);
    var frameDt = normalDt * 3;
    var stepDt = frameDt / substeps;
    collisionChecks = 0;

    for (var s = 0; s < substeps; s += 1) physicsStep(stepDt);
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

  function motionStats() {
    var totalMass = 0;
    var px = 0;
    var py = 0;
    var kinetic = 0;

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      totalMass += b.m;
      px += b.m * b.vx;
      py += b.m * b.vy;
      kinetic += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    }

    var cvx = totalMass > 0 ? px / totalMass : 0;
    var cvy = totalMass > 0 ? py / totalMass : 0;
    var internalKinetic = 0;

    for (var j = 0; j < NumberOfBalls; j += 1) {
      var q = ball[j];
      var ux = q.vx - cvx;
      var uy = q.vy - cvy;
      internalKinetic += 0.5 * q.m * (ux * ux + uy * uy);
    }

    return {
      kinetic: kinetic,
      internalKinetic: internalKinetic,
      comSpeed: Math.sqrt(cvx * cvx + cvy * cvy)
    };
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
      var motion = motionStats();
      output.textContent = NumberOfBalls.toLocaleString() + " balls · " + fps + " fps · " +
        collisionChecks.toLocaleString() + " nearby collision checks/frame · gravity: " + gravityMode +
        " · internal KE: " + motion.internalKinetic.toFixed(1) +
        " · COM speed: " + motion.comSpeed.toFixed(3);
    }
  }

  function frame(now) {
    simulateFrame();
    drawFrame();
    updateStats(now);
    requestAnimationFrame(frame);
  }

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

  TimerTick = function () {
    simulateFrame();
    drawFrame();
  };
})();