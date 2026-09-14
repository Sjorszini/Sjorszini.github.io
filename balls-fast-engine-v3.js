(function () {
  "use strict";

  if (typeof TimerStatus !== "undefined") clearInterval(TimerStatus);

  var started = false;
  var perfFrames = 0;
  var perfStarted = performance.now();
  var collisionChecks = 0;
  var gravityMode = "exact";

  var GRAVITY_CONTACT_MARGIN = 0.18;
  var COLLISION_CONTACT_MARGIN = 0.035;
  var RESTITUTION_SPEED_THRESHOLD = 0.45;
  var REST_SPEED = 0.16;
  var FLOOR_REST_SPEED = 0.28;

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

  function pairGravity(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var r2 = dx * dx + dy * dy;
    if (r2 < 1e-12) return;

    var contact = a.r + b.r + GRAVITY_CONTACT_MARGIN;
    if (Collisions && r2 <= contact * contact) return;

    var softened2 = r2 + 18 * 18;
    var invR = 1 / Math.sqrt(softened2);
    var scale = G * a.m * b.m * invR * invR * invR;
    var fx = scale * dx;
    var fy = scale * dy;

    a.Fx += fx;
    a.Fy += fy;
    b.Fx -= fx;
    b.Fy -= fy;
  }

  function exactGravity() {
    gravityMode = "exact";
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var a = ball[i];
      for (var j = i + 1; j < NumberOfBalls; j += 1) {
        pairGravity(a, ball[j]);
      }
    }
  }

  function buildGravityCells() {
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
        c = { cx: cx, cy: cy, mass: 0, x: 0, y: 0, ax: 0, ay: 0, indices: [] };
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
    for (var i = 0; i < cell.indices.length; i += 1) {
      var a = ball[cell.indices[i]];
      for (var j = i + 1; j < cell.indices.length; j += 1) {
        pairGravity(a, ball[cell.indices[j]]);
      }
    }
  }

  function exactGravityBetweenCells(cellA, cellB) {
    for (var i = 0; i < cellA.indices.length; i += 1) {
      var a = ball[cellA.indices[i]];
      for (var j = 0; j < cellB.indices.length; j += 1) {
        pairGravity(a, ball[cellB.indices[j]]);
      }
    }
  }

  function aggregateCellPairGravity(cellA, cellB) {
    var dx = cellB.x - cellA.x;
    var dy = cellB.y - cellA.y;
    var r2 = dx * dx + dy * dy;
    if (r2 < 1e-12 || cellA.mass <= 0 || cellB.mass <= 0) return;

    var softened2 = r2 + 24 * 24;
    var invR = 1 / Math.sqrt(softened2);
    var scale = G * cellA.mass * cellB.mass * invR * invR * invR;
    var fx = scale * dx;
    var fy = scale * dy;

    cellA.ax += fx / cellA.mass;
    cellA.ay += fy / cellA.mass;
    cellB.ax -= fx / cellB.mass;
    cellB.ay -= fy / cellB.mass;
  }

  function clusteredGravity() {
    gravityMode = "clustered (> 1,100 balls)";
    var cells = buildGravityCells();

    for (var c = 0; c < cells.length; c += 1) exactGravityWithinCell(cells[c]);

    for (var a = 0; a < cells.length; a += 1) {
      var cellA = cells[a];
      for (var b = a + 1; b < cells.length; b += 1) {
        var cellB = cells[b];
        var near = Math.abs(cellA.cx - cellB.cx) <= 1 && Math.abs(cellA.cy - cellB.cy) <= 1;
        if (near) exactGravityBetweenCells(cellA, cellB);
        else aggregateCellPairGravity(cellA, cellB);
      }
    }

    for (var n = 0; n < cells.length; n += 1) {
      var cell = cells[n];
      for (var q = 0; q < cell.indices.length; q += 1) {
        var body = ball[cell.indices[q]];
        body.Fx += body.m * cell.ax;
        body.Fy += body.m * cell.ay;
      }
    }
  }

  function calculateForces() {
    resetForces();

    if (!MutualGravity) {
      gravityMode = "off";
      return;
    }

    if (NumberOfBalls <= 1100) exactGravity();
    else clusteredGravity();
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

  function pairGeometry(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var minDistance = a.r + b.r;
    var distance2 = dx * dx + dy * dy;
    var contactDistance = minDistance + COLLISION_CONTACT_MARGIN;

    if (distance2 > contactDistance * contactDistance) return null;

    var distance = Math.sqrt(Math.max(distance2, 1e-12));
    var nx;
    var ny;

    if (distance > 1e-6) {
      nx = dx / distance;
      ny = dy / distance;
    } else {
      var rvx = b.vx - a.vx;
      var rvy = b.vy - a.vy;
      var rvLength = Math.sqrt(rvx * rvx + rvy * rvy);
      if (rvLength > 1e-8) {
        nx = rvx / rvLength;
        ny = rvy / rvLength;
      } else {
        nx = 1;
        ny = 0;
      }
    }

    return {
      nx: nx,
      ny: ny,
      distance: distance,
      penetration: minDistance - distance
    };
  }

  function resetContactState() {
    for (var i = 0; i < NumberOfBalls; i += 1) {
      ball[i]._contactCount = 0;
      ball[i]._floorContact = false;
      ball[i]._ceilingContact = false;
      ball[i]._leftContact = false;
      ball[i]._rightContact = false;
    }
  }

  function solvePairVelocity(a, b, firstPass) {
    var g = pairGeometry(a, b);
    if (!g) return;

    a._contactCount += 1;
    b._contactCount += 1;

    var invA = a.m > 0 ? 1 / a.m : 0;
    var invB = b.m > 0 ? 1 / b.m : 0;
    var invSum = invA + invB;
    if (invSum <= 0) return;

    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var vn = rvx * g.nx + rvy * g.ny;

    if (vn < 0) {
      var e = 0;
      if (firstPass && -vn >= RESTITUTION_SPEED_THRESHOLD) e = restitution();

      var impulseN = -(1 + e) * vn / invSum;
      var ix = impulseN * g.nx;
      var iy = impulseN * g.ny;

      a.vx -= ix * invA;
      a.vy -= iy * invA;
      b.vx += ix * invB;
      b.vy += iy * invB;
    }

    if (firstPass && EnergyDissipation > 0) {
      rvx = b.vx - a.vx;
      rvy = b.vy - a.vy;
      var tx = -g.ny;
      var ty = g.nx;
      var vt = rvx * tx + rvy * ty;
      var desiredVt = restitution() * vt;
      var impulseT = (desiredVt - vt) / invSum;
      var tix = impulseT * tx;
      var tiy = impulseT * ty;

      a.vx -= tix * invA;
      a.vy -= tiy * invA;
      b.vx += tix * invB;
      b.vy += tiy * invB;
    }
  }

  function projectPair(a, b) {
    var g = pairGeometry(a, b);
    if (!g || g.penetration <= 0) return;

    a._contactCount += 1;
    b._contactCount += 1;

    var invA = a.m > 0 ? 1 / a.m : 0;
    var invB = b.m > 0 ? 1 / b.m : 0;
    var invSum = invA + invB;
    if (invSum <= 0) return;

    var slop = 0.0015;
    var correction = Math.max(g.penetration - slop, 0) * 0.92 / invSum;

    a.x -= g.nx * correction * invA;
    a.y -= g.ny * correction * invA;
    b.x += g.nx * correction * invB;
    b.y += g.ny * correction * invB;
  }

  function forEachNearbyPair(callback) {
    if (!Collisions || NumberOfBalls < 2) return;

    var cellSize = Math.max(12, 2 * maximumRadius() + COLLISION_CONTACT_MARGIN);
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
            callback(a, ball[j], i, j);
          }
        }
      }
    }
  }

  function solveVelocityContacts(firstPass) {
    forEachNearbyPair(function (a, b) {
      solvePairVelocity(a, b, firstPass);
    });
  }

  function projectContacts() {
    forEachNearbyPair(function (a, b) {
      projectPair(a, b);
    });
  }

  function solveWallVelocities(firstPass) {
    if (!Boundaries) return;

    var e = restitution();
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];

      if (b.x - b.r <= COLLISION_CONTACT_MARGIN) {
        b._leftContact = true;
        b._contactCount += 1;
        if (b.vx < 0) {
          b.vx = (-b.vx >= RESTITUTION_SPEED_THRESHOLD && firstPass) ? -b.vx * e : 0;
        }
      }

      if (width - (b.x + b.r) <= COLLISION_CONTACT_MARGIN) {
        b._rightContact = true;
        b._contactCount += 1;
        if (b.vx > 0) {
          b.vx = (b.vx >= RESTITUTION_SPEED_THRESHOLD && firstPass) ? -b.vx * e : 0;
        }
      }

      if (b.y - b.r <= COLLISION_CONTACT_MARGIN) {
        b._ceilingContact = true;
        b._contactCount += 1;
        if (b.vy < 0) {
          b.vy = (-b.vy >= RESTITUTION_SPEED_THRESHOLD && firstPass) ? -b.vy * e : 0;
        }
      }

      if (height - (b.y + b.r) <= COLLISION_CONTACT_MARGIN) {
        b._floorContact = true;
        b._contactCount += 1;
        if (b.vy > 0) {
          b.vy = (b.vy >= RESTITUTION_SPEED_THRESHOLD && firstPass) ? -b.vy * e : 0;
        }
      }
    }
  }

  function projectWalls() {
    if (!Boundaries) return;

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];

      if (b.x < b.r) {
        b.x = b.r;
        b._leftContact = true;
        b._contactCount += 1;
      } else if (b.x > width - b.r) {
        b.x = width - b.r;
        b._rightContact = true;
        b._contactCount += 1;
      }

      if (b.y < b.r) {
        b.y = b.r;
        b._ceilingContact = true;
        b._contactCount += 1;
      } else if (b.y > height - b.r) {
        b.y = height - b.r;
        b._floorContact = true;
        b._contactCount += 1;
      }
    }
  }

  function stabilizeRestingContacts() {
    if (!Collisions || EnergyDissipation <= 0) return;

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];

      if (VerticalGravity && Boundaries) {
        if (gy > 0 && b._floorContact && Math.abs(b.vy) < FLOOR_REST_SPEED) {
          b.y = height - b.r;
          b.vy = 0;
        } else if (gy < 0 && b._ceilingContact && Math.abs(b.vy) < FLOOR_REST_SPEED) {
          b.y = b.r;
          b.vy = 0;
        }
      }

      if (b._contactCount > 0) {
        var speed2 = b.vx * b.vx + b.vy * b.vy;
        if (speed2 < REST_SPEED * REST_SPEED) {
          b._restCounter = (b._restCounter || 0) + 1;
          if (b._restCounter >= 6) {
            b.vx = 0;
            b.vy = 0;
          }
        } else {
          b._restCounter = 0;
        }
      } else {
        b._restCounter = 0;
      }

      if (Math.abs(b.vx) < 1e-7) b.vx = 0;
      if (Math.abs(b.vy) < 1e-7) b.vy = 0;
    }
  }

  function physicsStep(stepDt) {
    calculateForces();
    integrate(stepDt);
    resetContactState();

    var velocityIterations = NumberOfBalls <= 180 ? 4 : 2;
    for (var v = 0; v < velocityIterations; v += 1) {
      solveVelocityContacts(v === 0);
      solveWallVelocities(v === 0);
    }

    var positionIterations;
    if (NumberOfBalls <= 180) positionIterations = 7;
    else if (NumberOfBalls <= 1100) positionIterations = 5;
    else positionIterations = 3;

    for (var p = 0; p < positionIterations; p += 1) {
      projectContacts();
      projectWalls();
    }

    stabilizeRestingContacts();
  }

  function simulateFrame() {
    if (dt === 0 || NumberOfBalls === 0) return;

    var normalDt = Old_dt || 0.5;
    var frameDt = normalDt * 3;
    var substeps;

    if (NumberOfBalls <= 120) substeps = 6;
    else if (NumberOfBalls <= 1100) substeps = 3;
    else if (NumberOfBalls <= 2500) substeps = 2;
    else substeps = 1;

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

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      totalMass += b.m;
      px += b.m * b.vx;
      py += b.m * b.vy;
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
      internalKinetic: internalKinetic,
      comSpeed: Math.sqrt(cvx * cvx + cvy * cvy)
    };
  }

  function maximumOverlap() {
    if (!Collisions || NumberOfBalls < 2) return 0;

    var cellSize = Math.max(12, 2 * maximumRadius() + COLLISION_CONTACT_MARGIN);
    var grid = collisionGrid(cellSize);
    var maxOverlap = 0;

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
            var b = ball[j];
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var overlap = a.r + b.r - Math.sqrt(dx * dx + dy * dy);
            if (overlap > maxOverlap) maxOverlap = overlap;
          }
        }
      }
    }

    return Math.max(0, maxOverlap);
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
        " · COM speed: " + motion.comSpeed.toFixed(3) +
        " · max overlap: " + maximumOverlap().toFixed(3) + " px";
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
      document.getElementById("Balls_mobile_text").textContent =
        "Tip: a larger screen gives you more room to experiment.";
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
