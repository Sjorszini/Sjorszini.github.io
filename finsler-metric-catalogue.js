(function(){
  "use strict";

  function diag(a,b,c,d){ return [[a,"0","0","0"],["0",b,"0","0"],["0","0",c,"0"],["0","0","0",d]]; }

  window.FINSLER_METRIC_CATALOGUE = [
    {
      id:"sphere2", group:"Reference geometries", title:"Round 2-sphere", dim:2,
      coords:["theta","phi"], matrix:[["1","0"],["0","sin(theta)^2"]],
      description:"Unit round S² in standard spherical coordinates.", source:"Reference geometry",
      validation:"R = 2", status:"verified"
    },
    {
      id:"sphere3", group:"Reference geometries", title:"Round 3-sphere (Hopf coordinates)", dim:3,
      coords:["eta","phi","psi"], matrix:[["1","0","0"],["0","cos(eta)^2","0"],["0","0","sin(eta)^2"]],
      description:"Unit round S³. Useful for the Einstein–Kropina Hopf-field example.", source:"Reference geometry",
      validation:"Ric = 2 g; R = 6", status:"verified"
    },
    {
      id:"generic-static-spherical", group:"Ansätze / pre-solutions", title:"Generic static spherical spacetime", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-exp(2*Phi(r))","exp(2*LambdaF(r))","r^2","r^2*sin(theta)^2"),
      description:"Static spherically symmetric ansatz with arbitrary Φ(r) and Λ(r).", source:"Standard ansatz",
      validation:"Symbolic-function support", status:"structural"
    },
    {
      id:"generic-spherical", group:"Ansätze / pre-solutions", title:"Generic spherical spacetime", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-A(t,r)","B(t,r)","r^2","r^2*sin(theta)^2"),
      description:"Time-dependent spherical ansatz with arbitrary A(t,r), B(t,r).", source:"Standard ansatz",
      validation:"Symbolic-function support", status:"structural"
    },
    {
      id:"minkowski", group:"Catalogue · Flat / elementary", title:"Minkowski spacetime", dim:4,
      coords:["t","x","y","z"], matrix:diag("-1","1","1","1"),
      description:"Cartesian Minkowski coordinates.", source:"Catalogue §2.1", validation:"Ric = 0; Riemann = 0", status:"verified"
    },
    {
      id:"schwarzschild", group:"Catalogue · Black holes", title:"Schwarzschild", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-(1-r_s/r)","1/(1-r_s/r)","r^2","r^2*sin(theta)^2"),
      description:"Standard Schwarzschild coordinates; r_s is the Schwarzschild radius.", source:"Catalogue §2.2", validation:"Ric = 0", status:"verified"
    },
    {
      id:"alcubierre", group:"Catalogue · Exotic / waves", title:"Alcubierre warp metric", dim:4,
      coords:["t","x","y","z"],
      matrix:[["-1+v^2*fA^2","-v*fA","0","0"],["-v*fA","1","0","0"],["0","0","1","0"],["0","0","0","1"]],
      definitions:{fA:"(tanh(sigma*(sqrt((x-v*t)^2+y^2+z^2)+R))-tanh(sigma*(sqrt((x-v*t)^2+y^2+z^2)-R)))/(2*tanh(sigma*R))"},
      description:"Constant-velocity Alcubierre bubble with the catalogue's smooth tanh shape function substituted explicitly.", source:"Catalogue §2.3", validation:"Metric form checked", status:"structural"
    },
    {
      id:"barriola-vilenkin", group:"Catalogue · Strings / defects", title:"Barriola–Vilenkin monopole", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-1","1","k^2*r^2","k^2*r^2*sin(theta)^2"),
      description:"Global monopole metric with deficit/surplus factor k.", source:"Catalogue §2.4", validation:"R = 2(1-k²)/(k² r²)", status:"verified"
    },
    {
      id:"bertotti-kasner", group:"Catalogue · Cosmology / homogeneous", title:"Bertotti–Kasner", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-1","exp(2*sqrt(Lambda)*t)","1/Lambda","sin(theta)^2/Lambda"),
      description:"Bertotti–Kasner form with positive cosmological constant Λ.", source:"Catalogue §2.5", validation:"Ric = Λ g; R = 4Λ", status:"verified"
    },
    {
      id:"bessel-wave", group:"Catalogue · Exotic / waves", title:"Bessel gravitational wave", dim:4,
      coords:["t","rho","phi","z"],
      matrix:diag("-exp(-2*U+2*K)","exp(-2*U+2*K)","exp(-2*U)*rho^2","exp(2*U)"),
      definitions:{U:"C*J0(rho)*cos(t)",K:"(C^2*rho/2)*(rho*(J0(rho)^2+J1(rho)^2)-2*J0(rho)*J1(rho)*cos(t)^2)"},
      description:"Exact cylindrical Bessel gravitational wave. J0 and J1 are Bessel functions.", source:"Catalogue §2.6", validation:"Vacuum: Ric = 0", status:"verified-special"
    },
    {
      id:"cosmic-string-schwarzschild", group:"Catalogue · Strings / defects", title:"Cosmic string in Schwarzschild", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-(1-rs/r)","1/(1-rs/r)","r^2","beta^2*r^2*sin(theta)^2"),
      description:"Schwarzschild spacetime pierced by an axial cosmic string.", source:"Catalogue §2.7", validation:"Ric = 0 away from the string", status:"verified"
    },
    {
      id:"ernst", group:"Catalogue · Black holes", title:"Ernst spacetime", dim:4,
      coords:["t","r","theta","phi"],
      matrix:diag("LambdaE^2*(-(1-2*M/r))","LambdaE^2/(1-2*M/r)","LambdaE^2*r^2","r^2*sin(theta)^2/LambdaE^2"),
      definitions:{LambdaE:"1+Bmag^2*r^2*sin(theta)^2"},
      description:"Schwarzschild black hole in a Melvin-type magnetic field (catalogue normalization).", source:"Catalogue §2.8", validation:"Electrovac trace: R = 0", status:"verified"
    },
    {
      id:"frw", group:"Catalogue · Cosmology / homogeneous", title:"Friedmann–Robertson–Walker (generic a(t))", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-1","a(t)^2/(1-k*r^2)","a(t)^2*r^2","a(t)^2*r^2*sin(theta)^2"),
      description:"FLRW/FRW with arbitrary scale factor a(t) and curvature k.", source:"Catalogue §2.9", validation:"R = 6(a a¨ + a˙² + k)/a²", status:"verified-function"
    },
    {
      id:"godel", group:"Catalogue · Cosmology / homogeneous", title:"Gödel universe", dim:4,
      coords:["t","r","phi","z"],
      matrix:[["-1","0","-r^2/(sqrt(2)*aG)","0"],["0","1/(1+(r/(2*aG))^2)","0","0"],["-r^2/(sqrt(2)*aG)","0","r^2*(1-(r/(2*aG))^2)","0"],["0","0","0","1"]],
      description:"Gödel metric in the catalogue's cylindrical coordinates (c=1).", source:"Catalogue §2.10", validation:"Catalogue components spot-checked", status:"verified"
    },
    {
      id:"halilsoy", group:"Catalogue · Exotic / waves", title:"Halilsoy standing wave", dim:4,
      coords:["t","rho","phi","z"],
      matrix:[["-V*exp(2*K)","0","0","0"],["0","V*exp(2*K)","0","0"],["0","0","V*rho^2+Aphi^2/V","Aphi/V"],["0","0","Aphi/V","1/V"]],
      definitions:{V:"cosh(alpha)^2*exp(-2*C*J0(rho)*cos(t))+sinh(alpha)^2*exp(2*C*J0(rho)*cos(t))",K:"(C^2/2)*(rho^2*(J0(rho)^2+J1(rho)^2)-2*rho*J0(rho)*J1(rho)*cos(t)^2)",Aphi:"-2*C*sinh(2*alpha)*rho*J1(rho)*sin(t)"},
      description:"Standing cylindrical wave with cross-term dz dφ.", source:"Catalogue §2.11", validation:"Vacuum form / special-function check", status:"verified-special"
    },
    {
      id:"jnw", group:"Catalogue · Black holes", title:"Janis–Newman–Winicour", dim:4,
      coords:["t","r","theta","phi"],
      matrix:diag("-Ajnw^gamma","Ajnw^(-gamma)","r^2*Ajnw^(1-gamma)","r^2*Ajnw^(1-gamma)*sin(theta)^2"),
      definitions:{Ajnw:"1-rs/(gamma*r)"},
      description:"Static massless-scalar solution in standard spherical coordinates.", source:"Catalogue §2.12", validation:"Catalogue Ricci scalar checked", status:"verified"
    },
    {
      id:"kasner", group:"Catalogue · Cosmology / homogeneous", title:"Kasner", dim:4,
      coords:["t","x","y","z"], matrix:diag("-1","t^(2*p1)","t^(2*p2)","t^(2*p3)"),
      description:"Kasner vacuum metric; impose p1+p2+p3=1 and p1²+p2²+p3²=1.", source:"Catalogue §2.13", validation:"Ric = 0 under Kasner constraints", status:"verified"
    },
    {
      id:"kerr", group:"Catalogue · Black holes", title:"Kerr (Boyer–Lindquist)", dim:4,
      coords:["t","r","theta","phi"],
      matrix:[["-(1-rs*r/Sigma)","0","0","-rs*aK*r*sin(theta)^2/Sigma"],["0","Sigma/Delta","0","0"],["0","0","Sigma","0"],["-rs*aK*r*sin(theta)^2/Sigma","0","0","(r^2+aK^2+rs*aK^2*r*sin(theta)^2/Sigma)*sin(theta)^2"]],
      definitions:{Sigma:"r^2+aK^2*cos(theta)^2",Delta:"r^2-rs*r+aK^2"},
      description:"Kerr vacuum black hole in Boyer–Lindquist coordinates.", source:"Catalogue §2.14", validation:"Ric = 0", status:"verified-heavy"
    },
    {
      id:"kottler", group:"Catalogue · Black holes", title:"Kottler / Schwarzschild–de Sitter", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-Ak","1/Ak","r^2","r^2*sin(theta)^2"),
      definitions:{Ak:"1-rs/r-Lambda*r^2/3"},
      description:"Schwarzschild–(anti-)de Sitter/Kottler metric.", source:"Catalogue §2.15", validation:"Ric = Λ g; R = 4Λ", status:"verified"
    },
    {
      id:"morris-thorne", group:"Catalogue · Wormholes", title:"Morris–Thorne wormhole", dim:4,
      coords:["t","l","theta","phi"], matrix:diag("-1","1","b0^2+l^2","(b0^2+l^2)*sin(theta)^2"),
      description:"Simple Morris–Thorne wormhole in proper radial coordinate l.", source:"Catalogue §2.16", validation:"R = -2 b0²/(b0²+l²)²", status:"verified"
    },
    {
      id:"oppenheimer-snyder", group:"Catalogue · Collapse", title:"Oppenheimer–Snyder exterior (free-fall coordinates)", dim:4,
      coords:["tau","R","theta","phi"],
      matrix:diag("-1","R*(R^(3/2)-(3/2)*sqrt(rs)*tau)^(-2/3)","(R^(3/2)-(3/2)*sqrt(rs)*tau)^(4/3)","(R^(3/2)-(3/2)*sqrt(rs)*tau)^(4/3)*sin(theta)^2"),
      description:"Exterior Schwarzschild region in the catalogue's comoving/free-fall form.", source:"Catalogue §2.17", validation:"Exterior Ric = 0", status:"verified"
    },
    {
      id:"petrov-ai", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case AI", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-(r-b)/r","r/(r-b)","r^2","r^2*sin(theta)^2"),
      description:"Levi-Civita type-D case AI; Schwarzschild when b=rs.", source:"Catalogue §2.18.1", validation:"Vacuum: Ric = 0", status:"verified"
    },
    {
      id:"petrov-aii", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case AII", dim:4,
      coords:["t","r","phi","z"], matrix:diag("-(b-z)/z","z^2","z^2*sinh(r)^2","z/(b-z)"),
      description:"Levi-Civita type-D case AII.", source:"Catalogue §2.18.2", validation:"Vacuum: Ric = 0", status:"verified"
    },
    {
      id:"petrov-aiii", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case AIII", dim:4,
      coords:["t","r","phi","z"], matrix:diag("-1/z","z^2","z^2*r^2","z"),
      description:"Levi-Civita type-D case AIII.", source:"Catalogue §2.18.3", validation:"Vacuum: Ric = 0", status:"verified"
    },
    {
      id:"petrov-bi", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case BI", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-r^2*sin(theta)^2","r/(r-b)","r^2","(r-b)/r"),
      description:"Levi-Civita type-D case BI.", source:"Catalogue §2.18.4", validation:"Vacuum: Ric = 0", status:"verified"
    },
    {
      id:"petrov-bii", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case BII", dim:4,
      coords:["t","r","phi","z"], matrix:diag("-z^2*sinh(r)^2","z^2","(b-z)/z","z/(b-z)"),
      description:"Levi-Civita type-D case BII.", source:"Catalogue §2.18.5", validation:"Vacuum: Ric = 0", status:"verified"
    },
    {
      id:"petrov-biii", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case BIII", dim:4,
      coords:["t","r","phi","z"], matrix:diag("-z^2*r^2","z^2","1/z","z"),
      description:"Levi-Civita type-D case BIII.", source:"Catalogue §2.18.6", validation:"Vacuum: Ric = 0", status:"verified"
    },
    {
      id:"petrov-c", group:"Catalogue · Petrov D (Levi-Civita)", title:"Petrov D · case C", dim:4,
      coords:["t","x","y","phi"],
      matrix:diag("fmy/(x+y)^2","1/(fx*(x+y)^2)","-1/(fmy*(x+y)^2)","fx/(x+y)^2"),
      definitions:{fx:"x^3+aC*x+bC",fmy:"-y^3-aC*y+bC"},
      description:"Levi-Civita type-D case C with f(u)=u³+a u+b (one sign convention).", source:"Catalogue §2.18.7", validation:"Vacuum: Ric = 0", status:"verified-heavy"
    },
    {
      id:"plane-wave", group:"Catalogue · Exotic / waves", title:"Plane gravitational wave", dim:4,
      coords:["t","x","y","z"], matrix:diag("-1","1","p(t-x)^2","q(t-x)^2"),
      description:"Rosen-form plane wave. p and q are arbitrary profile functions; vacuum requires p''/p+q''/q=0.", source:"Catalogue §2.19", validation:"Catalogue Riemann form checked", status:"verified-function"
    },
    {
      id:"reissner-nordstrom", group:"Catalogue · Black holes", title:"Reissner–Nordström", dim:4,
      coords:["t","r","theta","phi"], matrix:diag("-Arn","1/Arn","r^2","r^2*sin(theta)^2"),
      definitions:{Arn:"1-rs/r+rhoQ*Q^2/r^2"},
      description:"Charged static black hole in standard coordinates.", source:"Catalogue §2.20", validation:"Electrovac trace: R = 0", status:"verified"
    },
    {
      id:"desitter", group:"Catalogue · Cosmology / homogeneous", title:"de Sitter (flat slicing)", dim:4,
      coords:["t","x","y","z"], matrix:diag("-1","exp(2*H*t)","exp(2*H*t)","exp(2*H*t)"),
      description:"Cartesian/flat slicing of de Sitter space.", source:"Catalogue §2.21", validation:"Ric = 3H² g; R = 12H²", status:"verified"
    },
    {
      id:"spinning-string", group:"Catalogue · Strings / defects", title:"Straight spinning string", dim:4,
      coords:["t","rho","phi","z"],
      matrix:[["-1","0","aS","0"],["0","1","0","0"],["aS","0","k^2*rho^2-aS^2","0"],["0","0","0","1"]],
      description:"Locally flat spinning cosmic-string metric outside the axis.", source:"Catalogue §2.22", validation:"Ric = 0 away from axis", status:"verified"
    },
    {
      id:"sultana-dyer", group:"Catalogue · Black holes", title:"Sultana–Dyer", dim:4,
      coords:["t","r","theta","phi"],
      matrix:[["-t^4*(1-2*M/r)","2*M*t^4/r","0","0"],["2*M*t^4/r","t^4*(1+2*M/r)","0","0"],["0","0","t^4*r^2","0"],["0","0","0","t^4*r^2*sin(theta)^2"]],
      description:"Black hole in an Einstein–de Sitter universe, globally sign-flipped from the catalogue's (+---) presentation to the page-wide (-+++) convention.", source:"Catalogue §2.23", validation:"Catalogue curvature check after global metric sign conversion to (-+++)", status:"verified"
    },
    {
      id:"taub-nut", group:"Catalogue · Black holes", title:"Taub–NUT", dim:4,
      coords:["t","r","theta","phi"],
      matrix:[["-Delta/Sigma","0","0","-2*lN*cos(theta)*Delta/Sigma"],["0","Sigma/Delta","0","0"],["0","0","Sigma","0"],["-2*lN*cos(theta)*Delta/Sigma","0","0","Sigma*sin(theta)^2-4*lN^2*cos(theta)^2*Delta/Sigma"]],
      definitions:{Sigma:"r^2+lN^2",Delta:"r^2-2*M*r-lN^2"},
      description:"Vacuum Taub–NUT metric in standard coordinates.", source:"Catalogue §2.24", validation:"Ric = 0", status:"verified-heavy"
    }
  ];
})();