# Finsler calculator — spacetime catalogue validation

This file records the reference checks used while adding the Riemannian/spacetime catalogue. The page remains experimental; this is not a formal proof or a replacement for independent verification.

Reference: T. Müller and F. Grave, *Catalogue of Spacetimes*, arXiv:0904.4184v3.

## Convention

The calculator's affine curvature is interpreted as

`R^k{}_{l i j} = ∂_i Γ^k{}_{j l} - ∂_j Γ^k{}_{i l} + Γ^k{}_{i m}Γ^m{}_{j l} - Γ^k{}_{j m}Γ^m{}_{i l}`,

which agrees with the catalogue after matching the index names `(k,l,i,j) ↔ (μ,ν,ρ,σ)`. Hence no overall Riemann/Ricci sign flip is applied. All Lorentzian presets and catalogue entries shown by the page are normalized to the `(-+++)` metric-signature convention. Where a source entry uses the opposite global sign, the metric is multiplied by `-1`; the Levi-Civita connection and `(1,3)` Riemann tensor are unchanged by this global rescaling, while scalar contractions involving the inverse metric change sign accordingly.

## Checks performed

The metric matrices were independently evaluated with the same Levi-Civita/Ricci convention. Nonzero comparisons were made at regular sample points and agree to floating-point roundoff (typically `10^-15`–`10^-17`).

| Family / entry | Reference check |
| --- | --- |
| Minkowski | Riemann = 0, Ricci = 0 |
| Schwarzschild | Ricci = 0 |
| Alcubierre | metric and cross-term transcription checked; finite-curvature smoke test (catalogue defers full curvature output to its Maple worksheet) |
| Barriola–Vilenkin | `R = 2(1-k^2)/(k^2 r^2)` |
| Bertotti–Kasner | `Ric = Lambda g`, `R = 4 Lambda` |
| Bessel gravitational wave | Ricci = 0 using the Bessel derivative identities |
| Cosmic string in Schwarzschild | Ricci = 0 away from the string |
| Ernst | Ricci scalar = 0 (electrovac trace) |
| Friedmann–Robertson–Walker | `R = 6(a a'' + a'^2 + k)/a^2` for `c=1`; tested with a nontrivial explicit `a(t)` |
| Gödel | `R = -1/a^2` |
| Halilsoy standing wave | Ricci = 0 using the Bessel derivative identities |
| Janis–Newman–Winicour | catalogue Ricci scalar formula |
| Kasner | Ricci = 0 for a parameter triple satisfying the Kasner constraints |
| Kerr | Ricci = 0 |
| Kottler | `Ric = Lambda g`, `R = 4 Lambda` |
| Morris–Thorne | `R = -2 b0^2/(b0^2+l^2)^2` |
| Oppenheimer–Snyder exterior | Ricci = 0 |
| Petrov D AI | Ricci = 0 |
| Petrov D AII | Ricci = 0 |
| Petrov D AIII | Ricci = 0 |
| Petrov D BI | Ricci = 0 |
| Petrov D BII | Ricci = 0 |
| Petrov D BIII | Ricci = 0 |
| Petrov D C | Ricci = 0 |
| Plane gravitational wave | Ricci = 0 for an explicit profile pair satisfying `p''/p + q''/q = 0`; Riemann structure matches the catalogue form |
| Reissner–Nordström | Ricci scalar = 0 |
| de Sitter (flat slicing) | `Ric = 3 H^2 g`, `R = 12 H^2` |
| Straight spinning string | Ricci = 0 away from the axis |
| Sultana–Dyer | catalogue metric globally sign-flipped to `(-+++)`; curvature comparison adjusted consistently |
| Taub–NUT | Ricci = 0 |

Additional reference checks:

- unit round `S^2`: `Ric = g`, `R = 2`;
- unit round `S^3`: `Ric = 2g`, `R = 6`.

## Signature regression harness

`finsler-signature-regression.html` is a developer-only browser smoke test. It loads the same catalogue and signature-normalization script as the calculator, evaluates every Lorentzian matrix at a regular numerical sample point, checks symmetry, and uses a Jacobi eigenvalue calculation to require inertia `(1 negative, 3 positive, 0 zero)` for every entry. It also checks the Brinkmann/Randers pp-wave preset convention and uniqueness of catalogue source IDs.

The harness is intentionally not linked from the public site navigation. It is meant to catch accidental reintroduction of `(+---)` data or metadata during catalogue edits.

## Important scope limitation

These checks validate the catalogue transcription and the curvature convention independently. They do **not** constitute a browser-runtime benchmark of every large symbolic calculation. Kerr, Taub–NUT, Petrov C, Bessel and Halilsoy calculations can be expensive in the client-side CAS. The work-under-construction warning on the calculator therefore remains intentional.
