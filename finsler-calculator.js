(function () {
  "use strict";

  var state = null;
  var dimensionEl;
  var lagrangianEl;
  var exampleEl;
  var statusEl;
  var resultsEl;
  var connectionButton;
  var curvatureButton;
  var clearButton;
  var loadExampleButton;

  function vars(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i += 1) out.push(prefix + i);
    return out;
  }

  function S(expr) {
    var text = typeof expr === "string" ? expr : expr.toString();
    try {
      return math.simplify(text).toString({ parenthesis: "auto" });
    } catch (error) {
      return text;
    }
  }

  function D(expr, variable) {
    return S(math.derivative(math.parse(expr), variable));
  }

  function add(a, b) {
    return S("(" + a + ") + (" + b + ")");
  }

  function sub(a, b) {
    return S("(" + a + ") - (" + b + ")");
  }

  function mul(a, b) {
    return S("(" + a + ") * (" + b + ")");
  }

  function div(a, b) {
    return S("(" + a + ") / (" + b + ")");
  }

  function scale(a, c) {
    return mul(String(c), a);
  }

  function sum(expressions) {
    var total = "0";
    for (var i = 0; i < expressions.length; i += 1) total = add(total, expressions[i]);
    return total;
  }

  function isZero(expr) {
    var simplified = S(expr).replace(/\s+/g, "");
    return simplified === "0" || simplified === "0.0" || simplified === "-0";
  }

  function determinant(matrix) {
    var n = matrix.length;
    if (n === 1) return S(matrix[0][0]);
    if (n === 2) return sub(mul(matrix[0][0], matrix[1][1]), mul(matrix[0][1], matrix[1][0]));

    var terms = [];
    for (var col = 0; col < n; col += 1) {
      var minor = [];
      for (var r = 1; r < n; r += 1) {
        var row = [];
        for (var c = 0; c < n; c += 1) {
          if (c !== col) row.push(matrix[r][c]);
        }
        minor.push(row);
      }
      var term = mul(matrix[0][col], determinant(minor));
      terms.push(col % 2 === 0 ? term : scale(term, -1));
    }
    return S(sum(terms));
  }

  function inverseMatrix(matrix) {
    var n = matrix.length;
    var aug = [];
    var r;
    var c;
    for (r = 0; r < n; r += 1) {
      aug[r] = [];
      for (c = 0; c < n; c += 1) aug[r][c] = S(matrix[r][c]);
      for (c = 0; c < n; c += 1) aug[r][n + c] = r === c ? "1" : "0";
    }

    for (c = 0; c < n; c += 1) {
      var pivotRow = c;
      while (pivotRow < n && isZero(aug[pivotRow][c])) pivotRow += 1;
      if (pivotRow === n) throw new Error("The fundamental tensor is singular: no symbolic pivot was found in column " + (c + 1) + ".");
      if (pivotRow !== c) {
        var tmp = aug[c];
        aug[c] = aug[pivotRow];
        aug[pivotRow] = tmp;
      }

      var pivot = aug[c][c];
      if (isZero(pivot)) throw new Error("The fundamental tensor is singular.");
      for (var j = 0; j < 2 * n; j += 1) aug[c][j] = div(aug[c][j], pivot);

      for (r = 0; r < n; r += 1) {
        if (r === c) continue;
        var factor = aug[r][c];
        if (isZero(factor)) continue;
        for (j = 0; j < 2 * n; j += 1) {
          aug[r][j] = sub(aug[r][j], mul(factor, aug[c][j]));
        }
      }
    }

    var inverse = [];
    for (r = 0; r < n; r += 1) inverse[r] = aug[r].slice(n).map(S);
    return inverse;
  }

  function horizontalDerivative(expr, i, x, y, N) {
    var terms = [D(expr, x[i])];
    for (var a = 0; a < y.length; a += 1) {
      terms.push(scale(mul(N[a][i], D(expr, y[a])), -1));
    }
    return S(sum(terms));
  }

  function tex(expr) {
    try {
      return math.parse(expr).toTex({ parenthesis: "keep" })
        .replace(/\bx(\d+)\b/g, "x_{$1}")
        .replace(/\by(\d+)\b/g, "y_{$1}");
    } catch (error) {
      return escapeHtml(expr);
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function matrixTex(matrix) {
    var rows = [];
    for (var i = 0; i < matrix.length; i += 1) {
      rows.push(matrix[i].map(tex).join(" & "));
    }
    return "\\begin{pmatrix}" + rows.join(" \\\\ ") + "\\end{pmatrix}";
  }

  function mathBlock(content) {
    return '<div class="math-block">\\[' + content + '\\]</div>';
  }

  function componentList(items) {
    if (!items.length) return '<p class="empty-result">All components simplify to zero.</p>';
    return '<div class="component-list">' + items.map(function (item) {
      return '<div class="component-row">\\[' + item + '\\]</div>';
    }).join("") + '</div>';
  }

  function resultCard(title, meta, body, id) {
    return '<section class="result-card"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="result-card-header"><h2>' + escapeHtml(title) + '</h2>' +
      (meta ? '<span class="result-meta">' + escapeHtml(meta) + '</span>' : '') + '</div>' +
      body + '</section>';
  }

  function tensor3Components(symbol, tensor, lowerOrder) {
    var n = tensor.length;
    var out = [];
    for (var k = 0; k < n; k += 1) {
      for (var i = 0; i < n; i += 1) {
        for (var j = 0; j < n; j += 1) {
          if (lowerOrder && j < i) continue;
          var value = S(tensor[k][i][j]);
          if (!isZero(value)) out.push(symbol.replace("K", String(k + 1)).replace("I", String(i + 1)).replace("J", String(j + 1)) + "=" + tex(value));
        }
      }
    }
    return out;
  }

  function tensor4Components(symbol, tensor) {
    var n = tensor.length;
    var out = [];
    for (var k = 0; k < n; k += 1) {
      for (var l = 0; l < n; l += 1) {
        for (var i = 0; i < n; i += 1) {
          for (var j = i + 1; j < n; j += 1) {
            var value = S(tensor[k][l][i][j]);
            if (!isZero(value)) out.push(symbol.replace("K", String(k + 1)).replace("L", String(l + 1)).replace("I", String(i + 1)).replace("J", String(j + 1)) + "=" + tex(value));
          }
        }
      }
    }
    return out;
  }

  function cartanComponents(C) {
    var n = C.length;
    var out = [];
    for (var i = 0; i < n; i += 1) {
      for (var j = i; j < n; j += 1) {
        for (var k = j; k < n; k += 1) {
          var value = S(C[i][j][k]);
          if (!isZero(value)) out.push("C_{" + (i + 1) + (j + 1) + (k + 1) + "}=" + tex(value));
        }
      }
    }
    return out;
  }

  function vectorComponents(symbol, vector) {
    var out = [];
    for (var i = 0; i < vector.length; i += 1) {
      var value = S(vector[i]);
      if (!isZero(value)) out.push(symbol.replace("I", String(i + 1)) + "=" + tex(value));
    }
    return out;
  }

  function matrixComponentList(symbol, matrix) {
    var out = [];
    for (var i = 0; i < matrix.length; i += 1) {
      for (var j = 0; j < matrix.length; j += 1) {
        var value = S(matrix[i][j]);
        if (!isZero(value)) out.push(symbol.replace("I", String(i + 1)).replace("J", String(j + 1)) + "=" + tex(value));
      }
    }
    return out;
  }

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = "calc-status" + (type ? " is-" + type : "");
  }

  function setBusy(busy) {
    connectionButton.disabled = busy;
    curvatureButton.disabled = busy;
    loadExampleButton.disabled = busy;
  }

  function yieldFrame() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function typeset() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetClear && window.MathJax.typesetClear([resultsEl]);
      return window.MathJax.typesetPromise([resultsEl]);
    }
    return Promise.resolve();
  }

  function signature() {
    return dimensionEl.value + "|" + lagrangianEl.value.trim();
  }

  async function computeBase(render) {
    var n = Number(dimensionEl.value);
    var L = lagrangianEl.value.trim();
    if (!L) throw new Error("Enter a Finsler Lagrangian first.");
    math.parse(L);

    var x = vars("x", n);
    var y = vars("y", n);
    setStatus("Checking 2-homogeneity and computing the fundamental tensor…", "working");
    await yieldFrame();

    var eulerTerms = [];
    for (var a = 0; a < n; a += 1) eulerTerms.push(mul(y[a], D(L, y[a])));
    var homogeneityResidual = S(sub(sum(eulerTerms), scale(L, 2)));

    var g = [];
    var C = [];
    for (var i = 0; i < n; i += 1) {
      g[i] = [];
      for (var j = 0; j < n; j += 1) g[i][j] = scale(D(D(L, y[i]), y[j]), 0.5);
    }
    var detg = determinant(g);
    if (isZero(detg)) throw new Error("The fundamental tensor has determinant zero, so this Lagrangian is degenerate.");
    var gInv = inverseMatrix(g);

    for (i = 0; i < n; i += 1) {
      C[i] = [];
      for (j = 0; j < n; j += 1) {
        C[i][j] = [];
        for (var k = 0; k < n; k += 1) C[i][j][k] = scale(D(g[j][k], y[i]), 0.5);
      }
    }

    setStatus("Computing the canonical spray and nonlinear connection…", "working");
    await yieldFrame();

    var G = [];
    for (var upper = 0; upper < n; upper += 1) {
      var sprayTerms = [];
      for (k = 0; k < n; k += 1) {
        var innerTerms = [];
        for (var m = 0; m < n; m += 1) innerTerms.push(mul(y[m], D(D(L, y[k]), x[m])));
        var bracket = sub(sum(innerTerms), D(L, x[k]));
        sprayTerms.push(mul(gInv[upper][k], bracket));
      }
      G[upper] = scale(sum(sprayTerms), 0.5);
    }

    var N = [];
    for (upper = 0; upper < n; upper += 1) {
      N[upper] = [];
      for (i = 0; i < n; i += 1) N[upper][i] = scale(D(G[upper], y[i]), 0.5);
    }

    setStatus("Computing Berwald and Chern–Rund Christoffel symbols…", "working");
    await yieldFrame();

    var B = [];
    var Ch = [];
    for (upper = 0; upper < n; upper += 1) {
      B[upper] = [];
      Ch[upper] = [];
      for (i = 0; i < n; i += 1) {
        B[upper][i] = [];
        Ch[upper][i] = [];
        for (j = 0; j < n; j += 1) {
          B[upper][i][j] = scale(D(D(G[upper], y[i]), y[j]), 0.5);
          var chTerms = [];
          for (var l = 0; l < n; l += 1) {
            var metricBracket = add(
              add(horizontalDerivative(g[l][j], i, x, y, N), horizontalDerivative(g[i][l], j, x, y, N)),
              scale(horizontalDerivative(g[i][j], l, x, y, N), -1)
            );
            chTerms.push(mul(gInv[upper][l], metricBracket));
          }
          Ch[upper][i][j] = scale(sum(chTerms), 0.5);
        }
      }
    }

    var berwald = true;
    outer:
    for (upper = 0; upper < n; upper += 1) {
      for (i = 0; i < n; i += 1) {
        for (j = 0; j < n; j += 1) {
          for (a = 0; a < n; a += 1) {
            if (!isZero(D(B[upper][i][j], y[a]))) {
              berwald = false;
              break outer;
            }
          }
        }
      }
    }

    state = {
      signature: signature(), n: n, L: L, x: x, y: y,
      homogeneityResidual: homogeneityResidual,
      g: g, gInv: gInv, detg: detg, C: C,
      G: G, N: N, B: B, Ch: Ch, berwald: berwald,
      curvature: null
    };

    if (render !== false) renderConnection(state);
    return state;
  }

  function renderConnection(s) {
    var homogeneous = isZero(s.homogeneityResidual);
    var summary = '<div class="result-summary-grid">' +
      '<div class="summary-item"><span class="summary-label">2-homogeneity</span><span class="summary-value">' +
      (homogeneous ? 'Verified symbolically' : 'Not simplified to zero') + '</span></div>' +
      '<div class="summary-item"><span class="summary-label">Fundamental tensor</span><span class="summary-value">Nondegenerate symbolically</span></div>' +
      '<div class="summary-item"><span class="summary-label">Berwald test</span><span class="summary-value">' +
      (s.berwald ? 'Yes — Γᴮ is y-independent' : 'No — Γᴮ depends on y') + '</span></div>' +
      '<div class="summary-item"><span class="summary-label">Dimension</span><span class="summary-value">n = ' + s.n + '</span></div>' +
      '</div>' +
      (!homogeneous ? '<p class="result-note">Euler residual: \\(' + tex(s.homogeneityResidual) + '\\). A nonzero residual may mean the input is not 2-homogeneous, or simply that the symbolic simplifier did not prove the identity.</p>' : '');

    var metricBody = '<p class="result-note">Fundamental tensor, inverse metric and determinant.</p>' +
      mathBlock('g_{ij}=' + matrixTex(s.g)) +
      mathBlock('g^{ij}=' + matrixTex(s.gInv)) +
      mathBlock('\\det(g)=' + tex(s.detg)) +
      '<h3>Cartan tensor</h3>' + componentList(cartanComponents(s.C));

    var sprayBody = '<h3>Geodesic spray</h3>' + componentList(vectorComponents('G^{I}', s.G)) +
      '<h3>Canonical nonlinear connection</h3>' + componentList(matrixComponentList('N^{I}{}_{J}', s.N));

    var berwaldComponents = tensor3Components('{}^{B}\\Gamma^{K}{}_{IJ}', s.B, true);
    var chernComponents = tensor3Components('{}^{C}\\Gamma^{K}{}_{IJ}', s.Ch, true);
    var connectionBody = '<p class="result-note">Only nonzero components are displayed; symmetry in the two lower Christoffel indices is used.</p>' +
      '<h3>Berwald connection</h3>' + componentList(berwaldComponents) +
      '<h3>Chern–Rund connection</h3>' + componentList(chernComponents);

    resultsEl.innerHTML =
      resultCard('Geometry check', 'input validation', summary, 'geometry-summary') +
      resultCard('Fundamental & Cartan tensors', 'g, g⁻¹, C', metricBody, 'metric-results') +
      resultCard('Spray & nonlinear connection', 'G, N', sprayBody, 'spray-results') +
      resultCard('Christoffel symbols', 'Berwald and Chern–Rund', connectionBody, 'connection-results');

    setStatus("Connection calculation complete. You can now compute curvature.", "success");
    typeset();
  }

  async function computeCurvature() {
    var s = state;
    if (!s || s.signature !== signature()) s = await computeBase(true);
    var n = s.n;
    var x = s.x;
    var y = s.y;
    var N = s.N;

    setStatus("Computing nonlinear curvature Rᵏᵢⱼ…", "working");
    await yieldFrame();

    var R = [];
    for (var k = 0; k < n; k += 1) {
      R[k] = [];
      for (var i = 0; i < n; i += 1) {
        R[k][i] = [];
        for (var j = 0; j < n; j += 1) {
          R[k][i][j] = sub(
            horizontalDerivative(N[k][j], i, x, y, N),
            horizontalDerivative(N[k][i], j, x, y, N)
          );
        }
      }
    }

    setStatus("Contracting the deviation tensor and Finsler-Ricci quantities…", "working");
    await yieldFrame();

    var deviation = [];
    for (k = 0; k < n; k += 1) {
      deviation[k] = [];
      for (i = 0; i < n; i += 1) {
        var devTerms = [];
        for (j = 0; j < n; j += 1) devTerms.push(mul(R[k][i][j], y[j]));
        deviation[k][i] = sum(devTerms);
      }
    }

    var ricTerms = [];
    for (i = 0; i < n; i += 1) {
      for (j = 0; j < n; j += 1) ricTerms.push(mul(R[i][i][j], y[j]));
    }
    var Ric = S(sum(ricTerms));

    var Ricci = [];
    for (i = 0; i < n; i += 1) {
      Ricci[i] = [];
      for (j = 0; j < n; j += 1) Ricci[i][j] = scale(D(D(Ric, y[i]), y[j]), 0.5);
    }

    var affineR = null;
    var affineRicci = null;
    if (s.berwald) {
      setStatus("Berwald space detected; computing affine curvature as well…", "working");
      await yieldFrame();
      affineR = [];
      for (k = 0; k < n; k += 1) {
        affineR[k] = [];
        for (var l = 0; l < n; l += 1) {
          affineR[k][l] = [];
          for (i = 0; i < n; i += 1) {
            affineR[k][l][i] = [];
            for (j = 0; j < n; j += 1) {
              var affineTerms = [D(s.B[k][j][l], x[i]), scale(D(s.B[k][i][l], x[j]), -1)];
              for (var m = 0; m < n; m += 1) {
                affineTerms.push(mul(s.B[k][i][m], s.B[m][j][l]));
                affineTerms.push(scale(mul(s.B[k][j][m], s.B[m][i][l]), -1));
              }
              affineR[k][l][i][j] = S(sum(affineTerms));
            }
          }
        }
      }

      affineRicci = [];
      for (l = 0; l < n; l += 1) {
        affineRicci[l] = [];
        for (k = 0; k < n; k += 1) {
          var arTerms = [];
          for (i = 0; i < n; i += 1) arTerms.push(affineR[i][l][i][k]);
          affineRicci[l][k] = S(sum(arTerms));
        }
      }
    }

    s.curvature = { R: R, deviation: deviation, Ric: Ric, Ricci: Ricci, affineR: affineR, affineRicci: affineRicci };
    renderCurvature(s);
    setStatus("Curvature calculation complete.", "success");
  }

  function renderCurvature(s) {
    var c = s.curvature;
    var nonlinearBody = '<p class="result-note">Only independent lower-index pairs i&lt;j with nonzero components are shown.</p>' +
      componentList(tensor3Components('R^{K}{}_{IJ}', c.R, false).filter(function (entry) {
        var match = entry.match(/_\{(\d)(\d)\}/);
        return !match || Number(match[1]) < Number(match[2]);
      }));

    var deviationBody = '<p class="result-note">The geodesic-deviation endomorphism is \(R^k{}_i=R^k{}_{ij}y^j\).</p>' +
      mathBlock('R^k{}_i=' + matrixTex(c.deviation));

    var ricciBody = mathBlock('\\mathrm{Ric}=' + tex(c.Ric)) +
      mathBlock('R_{ij}=' + matrixTex(c.Ricci));

    var affineBody = "";
    if (s.berwald && c.affineR) {
      affineBody = resultCard(
        'Affine curvature (Berwald case)',
        'R̄ᵏₗᵢⱼ and R̄ᵢⱼ',
        '<p class="result-note">Because the Berwald Christoffel symbols are y-independent, the induced affine curvature of thesis equations (4.3)–(4.4) is also shown.</p>' +
        '<h3>Affine curvature tensor</h3>' + componentList(tensor4Components('\\bar R^{K}{}_{L IJ}', c.affineR)) +
        '<h3>Affine Ricci tensor</h3>' + mathBlock('\\bar R_{ij}=' + matrixTex(c.affineRicci)),
        'affine-curvature-results'
      );
    }

    var oldCurvature = document.getElementById("curvature-group");
    if (oldCurvature) oldCurvature.remove();
    var group = document.createElement("div");
    group.id = "curvature-group";
    group.className = "results-stack";
    group.innerHTML =
      resultCard('Nonlinear curvature', 'Rᵏᵢⱼ', nonlinearBody, 'nonlinear-curvature-results') +
      resultCard('Geodesic deviation', 'Rᵏᵢ', deviationBody, 'deviation-results') +
      resultCard('Finsler-Ricci quantities', 'Ric and Rᵢⱼ', ricciBody, 'ricci-results') +
      affineBody;
    resultsEl.appendChild(group);
    typeset();
  }

  async function runConnection() {
    setBusy(true);
    try {
      await computeBase(true);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function runCurvature() {
    setBusy(true);
    try {
      await computeCurvature();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function loadExample() {
    var value = exampleEl.value;
    if (value === "randers") {
      dimensionEl.value = "2";
      lagrangianEl.value = "(sqrt(exp(2*x1)*y1^2 + y2^2) + 0.18*y2)^2";
    } else if (value === "riemann2") {
      dimensionEl.value = "2";
      lagrangianEl.value = "(1 + x1^2)*y1^2 + exp(2*x1)*y2^2";
    } else if (value === "minkowski4") {
      dimensionEl.value = "4";
      lagrangianEl.value = "-y1^2 + y2^2 + y3^2 + y4^2";
    }
    state = null;
    resultsEl.innerHTML = "";
    setStatus("Example loaded.", "");
  }

  function init() {
    dimensionEl = document.getElementById("dimension");
    lagrangianEl = document.getElementById("lagrangian");
    exampleEl = document.getElementById("exampleSelect");
    statusEl = document.getElementById("status");
    resultsEl = document.getElementById("results");
    connectionButton = document.getElementById("computeConnection");
    curvatureButton = document.getElementById("computeCurvature");
    clearButton = document.getElementById("clearResults");
    loadExampleButton = document.getElementById("loadExample");

    connectionButton.addEventListener("click", runConnection);
    curvatureButton.addEventListener("click", runCurvature);
    loadExampleButton.addEventListener("click", loadExample);
    clearButton.addEventListener("click", function () {
      state = null;
      resultsEl.innerHTML = "";
      setStatus("Ready.", "");
    });
    dimensionEl.addEventListener("change", function () { state = null; });
    lagrangianEl.addEventListener("input", function () { state = null; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();