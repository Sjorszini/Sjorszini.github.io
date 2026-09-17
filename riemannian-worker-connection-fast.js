"use strict";

importScripts("riemannian-worker.js?v=4");

/* Keep the already-tested curvature pipeline untouched.  This wrapper only
   substitutes a sparse/symmetric connection builder when the user requests
   Christoffels or geodesics without any curvature quantity. */
var fullChristoffel = christoffel;
var fullOnMessage = onmessage;

function metricDependsOn(expr, variable) {
  if (expr === "0") return false;
  try {
    var found = false;
    math.parse(expr).traverse(function(node) {
      if (!node || !node.isSymbolNode) return;
      /* Internal user-function tokens hide their original arguments, so be
         conservative and let D() decide their coordinate dependence. */
      if (node.name === variable || functionInfo[node.name]) found = true;
    });
    return found;
  } catch (e) {
    return true;
  }
}

function fastChristoffel(metric, inv, x) {
  var n = metric.length, G = [], dg = [], invNZ = [];
  var a, b, c, d, i, j, k;

  /* Cache only derivatives that can be nonzero. */
  for (i = 0; i < n; i++) {
    dg[i] = [];
    for (j = 0; j < n; j++) {
      dg[i][j] = new Array(n).fill("0");
      if (isZero(metric[i][j])) continue;
      for (k = 0; k < n; k++) {
        if (metricDependsOn(metric[i][j], x[k])) dg[i][j][k] = D(metric[i][j], x[k]);
      }
    }
  }

  /* Traverse only nonzero inverse-metric entries. */
  for (a = 0; a < n; a++) {
    invNZ[a] = [];
    for (d = 0; d < n; d++) if (!isZero(inv[a][d])) invNZ[a].push(d);
  }

  for (a = 0; a < n; a++) {
    G[a] = [];
    for (b = 0; b < n; b++) G[a][b] = new Array(n).fill("0");
  }

  /* Levi-Civita symmetry means only b <= c needs to be computed. */
  for (a = 0; a < n; a++) for (b = 0; b < n; b++) for (c = b; c < n; c++) {
    var terms = [];
    for (var q = 0; q < invNZ[a].length; q++) {
      d = invNZ[a][q];
      var bracketTerms = [];
      var p1 = dg[d][c][b], p2 = dg[b][d][c], p3 = dg[b][c][d];
      if (p1 !== "0") bracketTerms.push(p1);
      if (p2 !== "0") bracketTerms.push(p2);
      if (p3 !== "0") bracketTerms.push(neg(p3));
      if (!bracketTerms.length) continue;
      terms.push(mul(inv[a][d], sum(bracketTerms)));
    }
    var value = terms.length ? S(mul("1/2", sum(terms))) : "0";
    if (value !== "0" && isZero(value)) value = "0";
    G[a][b][c] = value;
    G[a][c][b] = value;
  }
  return G;
}

onmessage = function(event) {
  var outputs = event && event.data && event.data.outputs || {};
  var needsCurvature = !!(outputs.riemann || outputs.ricci || outputs.scalar || outputs.einstein);
  christoffel = needsCurvature ? fullChristoffel : fastChristoffel;
  try {
    return fullOnMessage(event);
  } finally {
    christoffel = fullChristoffel;
  }
};
