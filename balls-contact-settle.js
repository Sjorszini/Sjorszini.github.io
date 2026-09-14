(function () {
  "use strict";

  var previousOnLoad = OnLoad;
  var settleStarted = false;
  var CONTACT_MARGIN = 0.22;
  var MAX_SETTLE_RELATIVE_SPEED = 1.15;
  var FLOOR_SETTLE_SPEED = 0.55;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
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

  function buildGrid(cellSize) {
    var grid = new Map();
    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];
      var cx = Math.floor(b.x / cellSize);
      var cy = Math.floor(b.y / cellSize);
      var k = key(cx, cy);
      var bucket = grid.get(k);
      if (bucket) bucket.push(i);
      else grid.set(k, [i]);
      b._settleContacts = 0;
    }
    return grid;
  }

  function dampContactPair(a, b, damping) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var contact = a.r + b.r + CONTACT_MARGIN;
    var d2 = dx * dx + dy * dy;
    if (d2 > contact * contact) return;

    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var relative2 = rvx * rvx + rvy * rvy;
    if (relative2 > MAX_SETTLE_RELATIVE_SPEED * MAX_SETTLE_RELATIVE_SPEED) return;

    a._settleContacts += 1;
    b._settleContacts += 1;

    var invA = a.m > 0 ? 1 / a.m : 0;
    var invB = b.m > 0 ? 1 / b.m : 0;
    var invSum = invA + invB;
    if (invSum <= 0) return;

    // Reduce the complete relative contact velocity while preserving pair
    // linear momentum exactly. This acts like small static/rolling friction in
    // a persistent contact network, without adding any global drag.
    var impulseX = -damping * rvx / invSum;
    var impulseY = -damping * rvy / invSum;

    a.vx -= impulseX * invA;
    a.vy -= impulseY * invA;
    b.vx += impulseX * invB;
    b.vy += impulseY * invB;
  }

  function settleWalls(damping) {
    if (!Boundaries) return;

    for (var i = 0; i < NumberOfBalls; i += 1) {
      var b = ball[i];

      if (VerticalGravity && gy > 0 && height - (b.y + b.r) <= CONTACT_MARGIN && Math.abs(b.vy) < FLOOR_SETTLE_SPEED) {
        b.y = Math.min(b.y, height - b.r);
        b.vy *= Math.max(0, 1 - damping * 2.5);
        b.vx *= Math.max(0, 1 - damping * 0.45);
        b._settleContacts += 1;
        if (Math.abs(b.vy) < 0.012) b.vy = 0;
        if (Math.abs(b.vx) < 0.004) b.vx = 0;
      }

      if (VerticalGravity && gy < 0 && b.y - b.r <= CONTACT_MARGIN && Math.abs(b.vy) < FLOOR_SETTLE_SPEED) {
        b.y = Math.max(b.y, b.r);
        b.vy *= Math.max(0, 1 - damping * 2.5);
        b.vx *= Math.max(0, 1 - damping * 0.45);
        b._settleContacts += 1;
        if (Math.abs(b.vy) < 0.012) b.vy = 0;
        if (Math.abs(b.vx) < 0.004) b.vx = 0;
      }
    }
  }

  function stabilizeContacts() {
    if (dt === 0 || !Collisions || EnergyDissipation <= 0 || NumberOfBalls < 1) return;

    // Keep this intentionally modest: 7% user dissipation gives about 4.5%
    // low-speed contact relaxation per rendered frame. It only operates while
    // bodies are already touching or nearly touching.
    var damping = clamp(0.012 + EnergyDissipation * 0.0048, 0.012, 0.34);
    var cellSize = Math.max(12, 2 * maximumRadius() + CONTACT_MARGIN);
    var grid = buildGrid(cellSize);

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
            dampContactPair(a, ball[j], damping);
          }
        }
      }
    }

    settleWalls(damping);

    // Remove only numerical residue from well-connected, already-slow bodies.
    // This is a tiny dead zone, not general drag, and prevents endless visible
    // twitching in a packed gravitating cluster.
    for (var k = 0; k < NumberOfBalls; k += 1) {
      var q = ball[k];
      if (q._settleContacts >= 2) {
        var speed2 = q.vx * q.vx + q.vy * q.vy;
        if (speed2 < 0.018 * 0.018) {
          q.vx = 0;
          q.vy = 0;
        }
      }
    }
  }

  function settleFrame() {
    stabilizeContacts();
    requestAnimationFrame(settleFrame);
  }

  OnLoad = function () {
    previousOnLoad();
    if (!settleStarted) {
      settleStarted = true;
      requestAnimationFrame(settleFrame);
    }
  };
})();