(function () {
  "use strict";

  var simplifyCache = Object.create(null);
  var derivativeCache = Object.create(null);
  var cachedState = null;
  var busy = false;

  function resetCaches() {
    simplifyCache = Object.create(null);
    derivativeCache = Object.create(null);
  }

  function raw(expr) {
    return typeof expr === "string" ? expr : expr.toString();
  }

  function S(expr) {
    var text = raw(expr);
    if (simplifyCache[text] !== undefined) return simplifyCache[text];
    var value;
    try {
      value = math.simplify(text).toString({ parenthesis: "auto" });
    } catch (error) {
      value = text;
    }
    simplifyCache[text] = value;
    return value;
  }

  function D(expr, variable) {
    var text = raw(expr);
    var key = variable + "\u0000" + text;
    if (derivativeCache[key] !== undefined) return derivativeCache[key];
    var value = S(math.derivative(math.parse(text), variable));
    derivativeCache[key] = value;
    return value;
  }

  function add(a, b) {
    if (a === "0") return b;
    if (b === "0") return a;
    return "(" + a + ")+(" + b + ")";
  }

  function sub(a, b) {
    if (b === "0") return a;
    return "(" + a + ")-(" + b + ")";
  }

  function neg(a) {
    if (a === "0") return "0";
    return "-(" + a + ")";
  }

  function mul(a, b) {
    if (a === "0" || b === "0") return "0";
    if (a === "1") return b;
    if (b === "1") return a;
    if (a === "-1") return neg(b);
    if (b === "-1") return neg(a);
    return "(" + a + ")*(" + b + ")";
  }

  function div(a, b) {
    if (a === "0") return "0";
    if (b === "1") return a;
    return "(" + a + ")/(" + b + ")";
  }

  function sum(items) {
    var value = "0";
    for (var i = 0; i < items.length; i += 1) value = add(value, items[i]);
    return value;
  }

  function isZero(expr) {
    var value = S(expr).replace(/\s+/g, "");
    return value === "0" || value === "0.0" || value === "-0";
  }

  function unwrap(node) {
    while (node && node.isParenthesisNode) node = node.content;
    return node;
  }

  function sqrtArgument(node) {
    node = unwrap(node);
    if (!node || !node.isFunctionNode || !node.fn || node.fn.name !== "sqrt" || node.args.length !== 1) return null;
    return unwrap(node.args[0]);
  }

  function detectRanders(L, n) {
    if (n !== 2) return null;
    var root;
    try {
      root = unwrap(math.parse(L));
    } catch (error) {
      return null;
    }
    if (!root || !root.isOperatorNode || root.op !== "^" || root.args.length !== 2) return null;
    if (S(root.args[1].toString()) !== "2") return null;

    var base = unwrap(root.args[0]);
    if (!base || !base.isOperatorNode || (base.op !== "+" && base.op !== "-") || base.args.length !== 2) return null;

    var left = unwrap(base.args[0]);
    var right = unwrap(base.args[1]);
    var leftSqrt = sqrtArgument(left);
    var rightSqrt = sqrtArgument(right);
    var ANode;
    var BNode;
    var Bsign = 1;

    if (leftSqrt) {
      ANode = leftSqrt;
      BNode = right;
      if (base.op === "-") Bsign = -1;
    } else if (rightSqrt && base.op === "+") {
      ANode = rightSqrt;
      BNode = left;
    } else {
      return null;
    }

    var A = ANode.toString({ parenthesis: "auto" });
    var B = BNode.toString({ parenthesis: "auto" });
    if (Bsign < 0) B = neg(B);
    var y = ["y1", "y2"];
    var a = [["0", "0"], ["0", "0"]];
    var b = ["0", "0"];
    var i;
    var j;
    var k;

    for (i = 0; i < 2; i += 1) {
      for (j = 0; j < 2; j += 1) {
        a[i][j] = S(mul("0.5", D(D(A, y[i]), y[j])));
        for (k = 0; k < 2; k += 1) if (!isZero(D(a[i][j], y[k]))) return null;
      }
      b[i] = S(D(B, y[i]));
      for (k = 0; k < 2; k += 1) if (!isZero(D(b[i], y[k]))) return null;
    }

    var reconstructedA = S(sum([
      mul(a[0][0], mul("y1", "y1")),
      mul(a[0][1], mul("y1", "y2")),
      mul(a[1][0], mul("y2", "y1")),
      mul(a[1][1], mul("y2", "y2"))
    ]));
    if (!isZero(sub(A, reconstructedA))) return null;

    var reconstructedB = S(add(mul(b[0], "y1"), mul(b[1], "y2")));
    if (!isZero(sub(B, reconstructedB))) return null;

    return { A: A, B: B, a: a, b: b };
  }

  function tex(expr) {
    try {
      return math.parse(expr).toTex({ parenthesis: "keep" })
        .replace(/\bx(\d+)\b/g, "x_{$1}")
        .replace(/\by(\d+)\b/g, "y_{$1}");
    } catch (error) {
      return String(expr);
    }
  }

  function matrixTex(matrix) {
    var rows = [];
    for (var i = 0; i < matrix.length; i += 1) rows.push(matrix[i].map(tex).join(" & "));
    return "\\begin{pmatrix}" + rows.join(" \\\\ ") + "\\end{pmatrix}";
  }

  function block(mathText) {
    return '<div class="math-block">\\[' + mathText + '\\]</div>';
  }

  function card(title, meta, body, id) {
    return '<section class="result-card"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="result-card-header"><h2>' + title + '</h2><span class="result-meta">' + meta + '</span></div>' +
      body + '</section>';
  }

  function list(items) {
    if (!items.length) return '<p class="empty-result">All components simplify to zero.</p>';
    return '<div class="component-list">' + items.map(function (item) {
      return '<div class="component-row">\\[' + item + '\\]</div>';
    }).join("") + '</div>';
  }

  function setStatus(text, type) {
    var el = document.getElementById("status");
    if (!el) return;
    el.textContent = text;
    el.className = "calc-status" + (type ? " is-" + type : "");
  }

  function typeset() {
    var results = document.getElementById("results");
    if (window.MathJax && window.MathJax.typesetPromise && results) {
      if (window.MathJax.typesetClear) window.MathJax.typesetClear([results]);
      window.MathJax.typesetPromise([results]);
    }
  }

  function yieldFrame() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function signature() {
    var dim = document.getElementById("dimension");
    var lag = document.getElementById("lagrangian");
    return dim.value + "|" + lag.value.trim();
  }

  function horizontalDerivative(expr, i, x, y, N) {
    var terms = [D(expr, x[i])];
    for (var a = 0; a < 2; a += 1) terms.push(neg(mul(N[a][i], D(expr, y[a]))));
    return S(sum(terms));
  }

  function buildRandersMetric(parts) {
    var alpha = "sqrt(" + parts.A + ")";
    var F = add(alpha, parts.B);
    var y = ["y1", "y2"];
    var u = ["0", "0"];
    var q = ["0", "0"];
    var g = [["0", "0"], ["0", "0"]];
    var i;
    var j;

    for (i = 0; i < 2; i += 1) {
      u[i] = S(div(add(mul(parts.a[i][0], y[0]), mul(parts.a[i][1], y[1])), alpha));
      q[i] = S(add(u[i], parts.b[i]));
    }

    for (i = 0; i < 2; i += 1) {
      for (j = 0; j < 2; j += 1) {
        var angular = div(sub(parts.a[i][j], mul(u[i], u[j])), alpha);
        g[i][j] = S(add(mul(q[i], q[j]), mul(F, angular)));
      }
    }

    return { alpha: alpha, F: F, u: u, q: q, g: g };
  }

  function inverse2(g) {
    var det = S(sub(mul(g[0][0], g[1][1]), mul(g[0][1], g[1][0])));
    if (isZero(det)) throw new Error("The fundamental tensor is degenerate.");
    return {
      det: det,
      matrix: [
        [S(div(g[1][1], det)), S(div(neg(g[0][1]), det))],
        [S(div(neg(g[1][0]), det)), S(div(g[0][0], det))]
      ]
    };
  }

  function componentVector(symbol, vector) {
    var out = [];
    for (var i = 0; i < 2; i += 1) {
      var value = S(vector[i]);
      if (!isZero(value)) out.push(symbol.replace("I", String(i + 1)) + "=" + tex(value));
    }
    return out;
  }

  function componentMatrix(symbol, matrix) {
    var out = [];
    for (var i = 0; i < 2; i += 1) {
      for (var j = 0; j < 2; j += 1) {
        var value = S(matrix[i][j]);
        if (!isZero(value)) out.push(symbol.replace("I", String(i + 1)).replace("J", String(j + 1)) + "=" + tex(value));
      }
    }
    return out;
  }

  function componentGamma(symbol, tensor) {
    var out = [];
    for (var k = 0; k < 2; k += 1) {
      for (var i = 0; i < 2; i += 1) {
        for (var j = i; j < 2; j += 1) {
          var value = S(tensor[k][i][j]);
          if (!isZero(value)) out.push(symbol.replace("K", String(k + 1)).replace("I", String(i + 1)).replace("J", String(j + 1)) + "=" + tex(value));
        }
      }
    }
    return out;
  }

  function cartanComponents(C) {
    var out = [];
    for (var i = 0; i < 2; i += 1) {
      for (var j = i; j < 2; j += 1) {
        for (var k = j; k < 2; k += 1) {
          var value = S(C[i][j][k]);
          if (!isZero(value)) out.push("C_{" + (i + 1) + (j + 1) + (k + 1) + "}=" + tex(value));
        }
      }
    }
    return out;
  }

  async function computeBase(L, parts) {
    resetCaches();
    var start = performance.now();
    var x = ["x1", "x2"];
    var y = ["y1", "y2"];

    setStatus("Randers fast path: building the fundamental tensor…", "working");
    await yieldFrame();
    var metricData = buildRandersMetric(parts);
    var g = metricData.g;
    var invData = inverse2(g);
    var gInv = invData.matrix;

    var C = [];
    for (var i = 0; i < 2; i += 1) {
      C[i] = [];
      for (var j = 0; j < 2; j += 1) {
        C[i][j] = [];
        for (var k = 0; k < 2; k += 1) C[i][j][k] = S(mul("0.5", D(g[j][k], y[i])));
      }
    }

    setStatus("Randers fast path: computing spray and nonlinear connection…", "working");
    await yieldFrame();
    var dLy = [D(L, "y1"), D(L, "y2")];
    var dLx = [D(L, "x1"), D(L, "x2")];
    var G = ["0", "0"];
    var N = [["0", "0"], ["0", "0"]];

    for (var upper = 0; upper < 2; upper += 1) {
      var sprayTerms = [];
      for (k = 0; k < 2; k += 1) {
        var bracket = sub(add(mul("y1", D(dLy[k], "x1")), mul("y2", D(dLy[k], "x2"))), dLx[k]);
        sprayTerms.push(mul(gInv[upper][k], bracket));
      }
      G[upper] = S(mul("0.5", sum(sprayTerms)));
      for (i = 0; i < 2; i += 1) N[upper][i] = S(mul("0.5", D(G[upper], y[i])));
    }

    setStatus("Randers fast path: computing Berwald and Chern–Rund symbols…", "working");
    await yieldFrame();
    var B = [];
    var Ch = [];
    for (upper = 0; upper < 2; upper += 1) {
      B[upper] = [];
      Ch[upper] = [];
      for (i = 0; i < 2; i += 1) {
        B[upper][i] = [];
        Ch[upper][i] = [];
        for (j = 0; j < 2; j += 1) {
          B[upper][i][j] = S(mul("0.5", D(D(G[upper], y[i]), y[j])));
          var chTerms = [];
          for (var l = 0; l < 2; l += 1) {
            var metricBracket = add(
              add(horizontalDerivative(g[l][j], i, x, y, N), horizontalDerivative(g[i][l], j, x, y, N)),
              neg(horizontalDerivative(g[i][j], l, x, y, N))
            );
            chTerms.push(mul(gInv[upper][l], metricBracket));
          }
          Ch[upper][i][j] = S(mul("0.5", sum(chTerms)));
        }
      }
    }

    var berwald = true;
    outer:
    for (upper = 0; upper < 2; upper += 1) {
      for (i = 0; i < 2; i += 1) {
        for (j = 0; j < 2; j += 1) {
          for (k = 0; k < 2; k += 1) {
            if (!isZero(D(B[upper][i][j], y[k]))) {
              berwald = false;
              break outer;
            }
          }
        }
      }
    }

    return {
      signature: signature(), L: L, x: x, y: y, parts: parts,
      g: g, gInv: gInv, detg: invData.det, C: C,
      G: G, N: N, B: B, Ch: Ch, berwald: berwald,
      elapsedBase: performance.now() - start, curvature: null
    };
  }

  function renderBase(s) {
    var results = document.getElementById("results");
    var summary = '<div class="result-summary-grid">' +
      '<div class="summary-item"><span class="summary-label">2-homogeneity</span><span class="summary-value">Verified by Randers structure</span></div>' +
      '<div class="summary-item"><span class="summary-label">Geometry</span><span class="summary-value">2D Randers fast path</span></div>' +
      '<div class="summary-item"><span class="summary-label">Berwald test</span><span class="summary-value">' + (s.berwald ? 'Yes' : 'No') + '</span></div>' +
      '<div class="summary-item"><span class="summary-label">Time</span><span class="summary-value">' + s.elapsedBase.toFixed(0) + ' ms</span></div>' +
      '</div>';

    results.innerHTML =
      card('Geometry check', 'optimized Randers path', summary, 'geometry-summary') +
      card('Fundamental & Cartan tensors', 'g, g⁻¹, C', block('g_{ij}=' + matrixTex(s.g)) + block('g^{ij}=' + matrixTex(s.gInv)) + block('\\det(g)=' + tex(s.detg)) + '<h3>Cartan tensor</h3>' + list(cartanComponents(s.C)), 'metric-results') +
      card('Spray & nonlinear connection', 'G, N', '<h3>Geodesic spray</h3>' + list(componentVector('G^{I}', s.G)) + '<h3>Canonical nonlinear connection</h3>' + list(componentMatrix('N^{I}{}_{J}', s.N)), 'spray-results') +
      card('Christoffel symbols', 'Berwald and Chern–Rund', '<p class="result-note">Only nonzero components are shown; symmetry in the lower two indices is used.</p><h3>Berwald connection</h3>' + list(componentGamma('{}^{B}\\Gamma^{K}{}_{IJ}', s.B)) + '<h3>Chern–Rund connection</h3>' + list(componentGamma('{}^{C}\\Gamma^{K}{}_{IJ}', s.Ch)), 'connection-results');
    typeset();
    setStatus("Randers connection calculation complete.", "success");
  }

  async function computeCurvature(s) {
    var start = performance.now();
    setStatus("Randers fast path: computing the independent nonlinear curvature components…", "working");
    await yieldFrame();

    var R01 = ["0", "0"];
    for (var k = 0; k < 2; k += 1) {
      R01[k] = S(sub(
        horizontalDerivative(s.N[k][1], 0, s.x, s.y, s.N),
        horizontalDerivative(s.N[k][0], 1, s.x, s.y, s.N)
      ));
    }

    var R = [
      [["0", R01[0]], [neg(R01[0]), "0"]],
      [["0", R01[1]], [neg(R01[1]), "0"]]
    ];

    var deviation = [
      [S(mul(R01[0], "y2")), S(neg(mul(R01[0], "y1")))],
      [S(mul(R01[1], "y2")), S(neg(mul(R01[1], "y1")))]
    ];

    var Ric = S(sub(mul(R01[0], "y2"), mul(R01[1], "y1")));
    var Ricci = [
      [S(mul("0.5", D(D(Ric, "y1"), "y1"))), S(mul("0.5", D(D(Ric, "y1"), "y2")))],
      [S(mul("0.5", D(D(Ric, "y2"), "y1"))), S(mul("0.5", D(D(Ric, "y2"), "y2")))]
    ];

    s.curvature = { R: R, R01: R01, deviation: deviation, Ric: Ric, Ricci: Ricci };
    s.elapsedCurvature = performance.now() - start;
    return s;
  }

  function renderCurvature(s) {
    var c = s.curvature;
    var components = [];
    for (var k = 0; k < 2; k += 1) {
      var value = S(c.R01[k]);
      if (!isZero(value)) components.push('R^{' + (k + 1) + '}{}_{12}=' + tex(value));
    }
    var results = document.getElementById("results");
    var group = document.getElementById("curvature-group");
    if (group) group.remove();
    group = document.createElement("div");
    group.id = "curvature-group";
    group.className = "results-stack";
    group.innerHTML =
      card('Nonlinear curvature', 'independent components', '<p class="result-note">In two dimensions only the lower-index pair 12 is independent.</p>' + list(components), 'nonlinear-curvature-results') +
      card('Geodesic deviation', 'Rᵏᵢ', block('R^k{}_i=' + matrixTex(c.deviation)), 'deviation-results') +
      card('Finsler-Ricci quantities', 'Ric and Rᵢⱼ', block('\\mathrm{Ric}=' + tex(c.Ric)) + block('R_{ij}=' + matrixTex(c.Ricci)) + '<p class="result-note">Curvature stage: ' + s.elapsedCurvature.toFixed(0) + ' ms.</p>', 'ricci-results');
    results.appendChild(group);
    typeset();
    setStatus("Randers curvature calculation complete.", "success");
  }

  async function handle(mode) {
    if (busy) return;
    var dim = Number(document.getElementById("dimension").value);
    var L = document.getElementById("lagrangian").value.trim();
    resetCaches();
    var parts = detectRanders(L, dim);
    if (!parts) return false;

    busy = true;
    try {
      if (!cachedState || cachedState.signature !== signature()) {
        cachedState = await computeBase(L, parts);
        renderBase(cachedState);
      }
      if (mode === "curvature") {
        if (!cachedState.curvature) await computeCurvature(cachedState);
        renderCurvature(cachedState);
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    } finally {
      busy = false;
    }
    return true;
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || (target.id !== "computeConnection" && target.id !== "computeCurvature")) return;
    var dim = Number(document.getElementById("dimension").value);
    var L = document.getElementById("lagrangian").value.trim();
    resetCaches();
    if (!detectRanders(L, dim)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handle(target.id === "computeCurvature" ? "curvature" : "connection");
  }, true);

  document.addEventListener("input", function (event) {
    if (event.target && event.target.id === "lagrangian") cachedState = null;
  });
  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "dimension") cachedState = null;
  });
})();
