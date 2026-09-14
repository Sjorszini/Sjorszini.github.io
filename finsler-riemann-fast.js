(function () {
  "use strict";

  var cache = Object.create(null);
  var dcache = Object.create(null);

  function S(expr) {
    var text = typeof expr === "string" ? expr : expr.toString();
    if (cache[text] !== undefined) return cache[text];
    var out;
    try {
      out = math.simplify(text).toString({ parenthesis: "auto" });
    } catch (error) {
      out = text;
    }
    cache[text] = out;
    return out;
  }

  function D(expr, variable) {
    var key = variable + "\u0000" + expr;
    if (dcache[key] !== undefined) return dcache[key];
    var out = S(math.derivative(math.parse(expr), variable));
    dcache[key] = out;
    return out;
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

  function mul(a, b) {
    if (a === "0" || b === "0") return "0";
    if (a === "1") return b;
    if (b === "1") return a;
    return "(" + a + ")*(" + b + ")";
  }

  function div(a, b) {
    if (a === "0") return "0";
    if (b === "1") return a;
    return "(" + a + ")/(" + b + ")";
  }

  function sum(items) {
    var out = "0";
    for (var i = 0; i < items.length; i += 1) out = add(out, items[i]);
    return out;
  }

  function isZero(expr) {
    var value = S(expr).replace(/\s+/g, "");
    return value === "0" || value === "0.0" || value === "-0";
  }

  function vars(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i += 1) out.push(prefix + i);
    return out;
  }

  function minor(matrix, row, col) {
    var out = [];
    for (var i = 0; i < matrix.length; i += 1) {
      if (i === row) continue;
      var line = [];
      for (var j = 0; j < matrix.length; j += 1) {
        if (j !== col) line.push(matrix[i][j]);
      }
      out.push(line);
    }
    return out;
  }

  function detRaw(matrix) {
    var n = matrix.length;
    if (n === 1) return matrix[0][0];
    if (n === 2) return sub(mul(matrix[0][0], matrix[1][1]), mul(matrix[0][1], matrix[1][0]));
    var terms = [];
    for (var col = 0; col < n; col += 1) {
      var term = mul(matrix[0][col], detRaw(minor(matrix, 0, col)));
      if (col % 2) term = mul("-1", term);
      terms.push(term);
    }
    return sum(terms);
  }

  function inverse(matrix) {
    var n = matrix.length;
    var det = S(detRaw(matrix));
    if (isZero(det)) throw new Error("The fundamental tensor is degenerate.");
    var inv = [];
    for (var i = 0; i < n; i += 1) {
      inv[i] = [];
      for (var j = 0; j < n; j += 1) {
        var cof = detRaw(minor(matrix, j, i));
        if ((i + j) % 2) cof = mul("-1", cof);
        inv[i][j] = S(div(cof, det));
      }
    }
    return { matrix: inv, det: det };
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

  function card(title, meta, body, id) {
    return '<section class="result-card"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="result-card-header"><h2>' + title + '</h2><span class="result-meta">' + meta + '</span></div>' +
      body + '</section>';
  }

  function block(mathText) {
    return '<div class="math-block">\\[' + mathText + '\\]</div>';
  }

  function list(items) {
    if (!items.length) return '<p class="empty-result">All components simplify to zero.</p>';
    return '<div class="component-list">' + items.map(function (item) {
      return '<div class="component-row">\\[' + item + '\\]</div>';
    }).join("") + '</div>';
  }

  function typeset(results) {
    if (window.MathJax && window.MathJax.typesetPromise) {
      if (window.MathJax.typesetClear) window.MathJax.typesetClear([results]);
      window.MathJax.typesetPromise([results]);
    }
  }

  function setStatus(text, type) {
    var el = document.getElementById("status");
    el.textContent = text;
    el.className = "calc-status" + (type ? " is-" + type : "");
  }

  function buildMetric(L, y) {
    var n = y.length;
    var g = [];
    for (var i = 0; i < n; i += 1) {
      g[i] = [];
      for (var j = 0; j < n; j += 1) g[i][j] = S(mul("0.5", D(D(L, y[i]), y[j])));
    }
    return g;
  }

  function isQuadraticMetric(g, y) {
    for (var i = 0; i < g.length; i += 1) {
      for (var j = 0; j < g.length; j += 1) {
        for (var a = 0; a < y.length; a += 1) {
          if (!isZero(D(g[i][j], y[a]))) return false;
        }
      }
    }
    return true;
  }

  function gammaComponents(Gamma) {
    var out = [];
    var n = Gamma.length;
    for (var k = 0; k < n; k += 1) {
      for (var i = 0; i < n; i += 1) {
        for (var j = i; j < n; j += 1) {
          var value = S(Gamma[k][i][j]);
          if (!isZero(value)) out.push("\\Gamma^{" + (k + 1) + "}{}_{" + (i + 1) + (j + 1) + "}=" + tex(value));
        }
      }
    }
    return out;
  }

  function vectorComponents(symbol, values) {
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = S(values[i]);
      if (!isZero(value)) out.push(symbol.replace("I", String(i + 1)) + "=" + tex(value));
    }
    return out;
  }

  function matrixComponents(symbol, matrix) {
    var out = [];
    for (var i = 0; i < matrix.length; i += 1) {
      for (var j = 0; j < matrix.length; j += 1) {
        var value = S(matrix[i][j]);
        if (!isZero(value)) out.push(symbol.replace("I", String(i + 1)).replace("J", String(j + 1)) + "=" + tex(value));
      }
    }
    return out;
  }

  function affineComponents(R) {
    var out = [];
    var n = R.length;
    for (var k = 0; k < n; k += 1) {
      for (var l = 0; l < n; l += 1) {
        for (var i = 0; i < n; i += 1) {
          for (var j = i + 1; j < n; j += 1) {
            var value = S(R[k][l][i][j]);
            if (!isZero(value)) out.push("\\bar R^{" + (k + 1) + "}{}_{" + (l + 1) + (i + 1) + (j + 1) + "}=" + tex(value));
          }
        }
      }
    }
    return out;
  }

  function nonlinearComponents(R) {
    var out = [];
    var n = R.length;
    for (var k = 0; k < n; k += 1) {
      for (var i = 0; i < n; i += 1) {
        for (var j = i + 1; j < n; j += 1) {
          var value = S(R[k][i][j]);
          if (!isZero(value)) out.push("R^{" + (k + 1) + "}{}_{" + (i + 1) + (j + 1) + "}=" + tex(value));
        }
      }
    }
    return out;
  }

  function computeFastBase(L, n) {
    cache = Object.create(null);
    dcache = Object.create(null);
    var x = vars("x", n);
    var y = vars("y", n);
    var g = buildMetric(L, y);
    if (!isQuadraticMetric(g, y)) return null;

    var invData = inverse(g);
    var gInv = invData.matrix;
    var Gamma = [];
    var k;
    var i;
    var j;
    var l;

    for (k = 0; k < n; k += 1) {
      Gamma[k] = [];
      for (i = 0; i < n; i += 1) {
        Gamma[k][i] = [];
        for (j = 0; j < n; j += 1) {
          var terms = [];
          for (l = 0; l < n; l += 1) {
            var bracket = add(add(D(g[l][j], x[i]), D(g[i][l], x[j])), mul("-1", D(g[i][j], x[l])));
            terms.push(mul(gInv[k][l], bracket));
          }
          Gamma[k][i][j] = S(mul("0.5", sum(terms)));
        }
      }
    }

    var G = [];
    var N = [];
    for (k = 0; k < n; k += 1) {
      var gt = [];
      N[k] = [];
      for (i = 0; i < n; i += 1) {
        var nt = [];
        for (j = 0; j < n; j += 1) {
          gt.push(mul(mul(Gamma[k][i][j], y[i]), y[j]));
          nt.push(mul(Gamma[k][i][j], y[j]));
        }
        N[k][i] = S(sum(nt));
      }
      G[k] = S(sum(gt));
    }

    var euler = [];
    for (i = 0; i < n; i += 1) euler.push(mul(y[i], D(L, y[i])));

    return {
      L: L,
      n: n,
      x: x,
      y: y,
      g: g,
      gInv: gInv,
      detg: invData.det,
      Gamma: Gamma,
      G: G,
      N: N,
      homogeneityResidual: S(sub(sum(euler), mul("2", L)))
    };
  }

  function renderBase(s, elapsed) {
    var results = document.getElementById("results");
    var homogeneous = isZero(s.homogeneityResidual);
    var summary = '<div class="result-summary-grid">' +
      '<div class="summary-item"><span class="summary-label">2-homogeneity</span><span class="summary-value">' + (homogeneous ? 'Verified symbolically' : 'Residual nonzero') + '</span></div>' +
      '<div class="summary-item"><span class="summary-label">Geometry</span><span class="summary-value">Quadratic / Riemannian fast path</span></div>' +
      '<div class="summary-item"><span class="summary-label">Cartan tensor</span><span class="summary-value">Zero</span></div>' +
      '<div class="summary-item"><span class="summary-label">Time</span><span class="summary-value">' + elapsed.toFixed(0) + ' ms</span></div>' +
      '</div>';

    results.innerHTML =
      card('Geometry check', 'optimized quadratic path', summary, 'geometry-summary') +
      card('Fundamental tensor', 'g and g⁻¹', block('g_{ij}=' + matrixTex(s.g)) + block('g^{ij}=' + matrixTex(s.gInv)) + block('\\det(g)=' + tex(s.detg)), 'metric-results') +
      card('Spray & nonlinear connection', 'G and N', '<h3>Geodesic spray</h3>' + list(vectorComponents('G^{I}', s.G)) + '<h3>Canonical nonlinear connection</h3>' + list(matrixComponents('N^{I}{}_{J}', s.N)), 'spray-results') +
      card('Christoffel symbols', 'Berwald = Chern–Rund = Levi-Civita', '<p class="result-note">For a quadratic Finsler Lagrangian, the Cartan tensor vanishes and both Finsler connections reduce to the Levi-Civita connection.</p>' + list(gammaComponents(s.Gamma)), 'connection-results');
    typeset(results);
  }

  function computeAffineCurvature(s) {
    var n = s.n;
    var x = s.x;
    var G = s.Gamma;
    var R = [];
    for (var k = 0; k < n; k += 1) {
      R[k] = [];
      for (var l = 0; l < n; l += 1) {
        R[k][l] = [];
        for (var i = 0; i < n; i += 1) {
          R[k][l][i] = [];
          for (var j = 0; j < n; j += 1) {
            var terms = [D(G[k][j][l], x[i]), mul("-1", D(G[k][i][l], x[j]))];
            for (var m = 0; m < n; m += 1) {
              terms.push(mul(G[k][i][m], G[m][j][l]));
              terms.push(mul("-1", mul(G[k][j][m], G[m][i][l])));
            }
            R[k][l][i][j] = S(sum(terms));
          }
        }
      }
    }
    return R;
  }

  function renderCurvature(s, elapsed) {
    var n = s.n;
    var y = s.y;
    var affineR = computeAffineCurvature(s);
    var nonlinear = [];
    var deviation = [];
    var affineRicci = [];
    var i;
    var j;
    var k;
    var l;

    for (k = 0; k < n; k += 1) {
      nonlinear[k] = [];
      deviation[k] = [];
      for (i = 0; i < n; i += 1) {
        nonlinear[k][i] = [];
        for (j = 0; j < n; j += 1) {
          var rt = [];
          for (l = 0; l < n; l += 1) rt.push(mul(affineR[k][l][i][j], y[l]));
          nonlinear[k][i][j] = S(sum(rt));
        }
        var dt = [];
        for (j = 0; j < n; j += 1) dt.push(mul(nonlinear[k][i][j], y[j]));
        deviation[k][i] = S(sum(dt));
      }
    }

    for (l = 0; l < n; l += 1) {
      affineRicci[l] = [];
      for (j = 0; j < n; j += 1) {
        var at = [];
        for (i = 0; i < n; i += 1) at.push(affineR[i][l][i][j]);
        affineRicci[l][j] = S(sum(at));
      }
    }

    var ricTerms = [];
    for (l = 0; l < n; l += 1) {
      for (j = 0; j < n; j += 1) ricTerms.push(mul(mul(affineRicci[l][j], y[l]), y[j]));
    }
    var Ric = S(sum(ricTerms));
    var Ricci = [];
    for (i = 0; i < n; i += 1) {
      Ricci[i] = [];
      for (j = 0; j < n; j += 1) Ricci[i][j] = S(mul("0.5", D(D(Ric, y[i]), y[j])));
    }

    var group = document.getElementById("curvature-group");
    if (group) group.remove();
    group = document.createElement("div");
    group.id = "curvature-group";
    group.className = "results-stack";
    group.innerHTML =
      card('Nonlinear curvature', 'Rᵏᵢⱼ', list(nonlinearComponents(nonlinear)), 'nonlinear-curvature-results') +
      card('Geodesic deviation', 'Rᵏᵢ', block('R^k{}_i=' + matrixTex(deviation)), 'deviation-results') +
      card('Finsler-Ricci quantities', 'Ric and Rᵢⱼ', block('\\mathrm{Ric}=' + tex(Ric)) + block('R_{ij}=' + matrixTex(Ricci)), 'ricci-results') +
      card('Affine curvature', 'quadratic / Berwald case', '<p class="result-note">Computed directly from the induced affine connection.</p><h3>Curvature tensor</h3>' + list(affineComponents(affineR)) + '<h3>Affine Ricci tensor</h3>' + block('\\bar R_{ij}=' + matrixTex(affineRicci)) + '<p class="result-note">Curvature calculation: ' + elapsed.toFixed(0) + ' ms.</p>', 'affine-curvature-results');
    document.getElementById("results").appendChild(group);
    typeset(document.getElementById("results"));
  }

  function getInput() {
    var n = Number(document.getElementById("dimension").value);
    var L = document.getElementById("lagrangian").value.trim();
    if (!L) throw new Error("Enter a Finsler Lagrangian first.");
    math.parse(L);
    return { n: n, L: L };
  }

  function intercept(mode, event) {
    var input;
    var start = performance.now();
    try {
      input = getInput();
      setStatus("Checking for a quadratic/Riemannian fast path…", "working");
      var s = computeFastBase(input.L, input.n);
      if (!s) return false;

      event.preventDefault();
      event.stopImmediatePropagation();
      renderBase(s, performance.now() - start);
      if (mode === "curvature") {
        setStatus("Computing curvature with the optimized quadratic path…", "working");
        var cstart = performance.now();
        renderCurvature(s, performance.now() - cstart);
      }
      setStatus("Calculation complete using the optimized quadratic path.", "success");
      return true;
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.error(error);
      setStatus(error.message || String(error), "error");
      return true;
    }
  }

  function init() {
    var connection = document.getElementById("computeConnection");
    var curvature = document.getElementById("computeCurvature");
    if (!connection || !curvature || !window.math) return;

    connection.addEventListener("click", function (event) {
      intercept("connection", event);
    }, true);

    curvature.addEventListener("click", function (event) {
      intercept("curvature", event);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();