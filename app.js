try {
	var canvas = document.getElementById("myCanvas");
	var ctx = canvas.getContext("2d");
	var ResolutionScaleFactor = 1; //this impoves the resolution of the canvas by a factor
	var ResTemp = 0;
	var whilemousedown = 0;
	
	var width = canvas.width;
	var height = canvas.height;

	var TimerInterval = 5;	
	var TimerStatus = setInterval(function() {TimerTick()}, TimerInterval); // TimerTick() will be called every 10 milliseconds

	var txtSizeNewBall = document.getElementById('txtSizeNewBall');

	var NumberOfBalls = 1;
	var NumberOfBalls_SavedConfig = 0;
	var VerticalGravity = false;
	var MutualGravity = true;
	var DrawingMode = false; // Do or do not clear the canvas each frame
	var Collisions = true; //enable collisions
	var Boundaries = true;
	var SizeNewBall = 10;
	var MassNewBall = 1;
	var XspeedNewBall = 0;
	var YspeedNewBall = 2;
	var ColorNewBall ;
	var EnergyDissipation = 7; //in percents
	var RemoveText = false;

	var dt=0.5;
	var Old_dt = dt;
	var gy = 0.22; //strength vertical gravity
	var G = Math.pow(10, 1); //strength mutual gravity (Newtons constant)
	var NumberOfCollisionLoops = 5;

	CursorInCanvas = Boolean(false);
	var mousePosX = 0;
	var mousePosY = 0;

	function Ball() { // this is kind of a ball-class
		this.color = getRandomColor();
		this.r = 0; //radius ball
		this.x = 0;
		this.y = 0;
		this.vx = 0;
		this.vy = 0;
		this.ax = 0;
		this.ay = 0;
		this.Fx = 0;
		this.Fy = 0;
		this.dx = 0;
		this.dy = 0;
		this.m = 0;
	}


	var ball = [];
	var ball_SavedConfig = [];


	function OnLoad() { //acts when the page is loaded
		//UpdateElements(); 
		if (screen.width < 700)
			document.getElementById('Balls_mobile_text').innerHTML = "Idea: view this page on a pc for the best experience.";
		
		ColorNewBall = getRandomBlueColor();
		
		ResTemp = canvas.width;
		changeResolution(canvas, 3); // DONT OUT THIS AFTER SETUPCANVAS
		
		SetupCanvasSize(); //Dit moet hier ALLEEN als internet explorer wordt gebruikt!
	
		
		
		SetupScenario1();
		document.getElementById('chbPauseResume').checked = Boolean(true);
		
		}
	
	function SetupCanvasSize(){		
		//This function makes sure that the canvas CSS-size and HTML-size coindice.
		canvas.style.width = '90%';
		canvas.style.height = (canvas.height/canvas.width)*canvas.scrollWidth + 'px'; //Do this after screen resize
		var f = ResTemp/canvas.scrollWidth;
		ctx.scale(f,f);
		ResTemp = canvas.scrollWidth;
	}
	
	function CoordsCSS2HTMLfactor(){
		return  canvas.scrollWidth/width;
	}
	function CoordsHTML2CSSfactor(){
		return canvas.scrollWidth/canvas.width;
	}
	function UpdateElements() {
		document.getElementById('chbVerticalGravity').checked = VerticalGravity;
		document.getElementById('chbMutualGravity').checked = MutualGravity;
		document.getElementById('chbDrawingMode').checked = DrawingMode;
		document.getElementById('chbCollisions').checked = Collisions;
		document.getElementById('chbBoundaries').checked = Boundaries;
		document.getElementById('txtSizeNewBall').value = SizeNewBall;
		document.getElementById('txtMassNewBall').value = MassNewBall;
		document.getElementById('txtEnergyDissipation').value = EnergyDissipation;
		document.getElementById('txtXspeedNewBall').value = XspeedNewBall;
		document.getElementById('txtYspeedNewBall').value = -YspeedNewBall;
	}
	
	function getRandomColor() {
		var letters = '0123456789ABCDEF';
		var color = '#';
		for (var i = 0; i < 6; i++ ) {
			color += letters[Math.floor(Math.random() * 16)];
		}
		return color;
	}

	function getRandomBlueColor() {	
		var opt = Math.floor(Math.random()*2); //randomly pick either '0' or '1'
		if (opt==0) //pick dark blue's
		{
			var b = Math.floor(Math.random() * 255);
			var r=0;
			var g=0;
			
			return RGB2HTML(r,g,b);
		}
		else //pick light blue's
		{		
			var b = 255;
			var brightness = Math.min(200,Math.random()*255);
			var r = Math.floor(brightness);
			var g = Math.floor(brightness);
		
			return RGB2HTML(r,g,b);
		}
	}

	function RGB2HTML(red, green, blue) {// convert RGB color to html format
		var decColor =0x1000000+ blue + 0x100 * green + 0x10000 *red ;
		return '#'+decColor.toString(16).substr(1);
	}

	function getMousePos(canvas, evt) {
		var rect = canvas.getBoundingClientRect();
		return {
		  x: evt.clientX - rect.left,
		  y: evt.clientY - rect.top
		};
	  }
	  
	canvas.addEventListener('mousemove', function(evt) {
		//get all textfields unfocussed, so that the information is processed.
		document.getElementById('txtSizeNewBall').blur();
		document.getElementById('txtEnergyDissipation').blur();
		document.getElementById('txtMassNewBall').blur();
		document.getElementById('txtXspeedNewBall').blur();
		document.getElementById('txtYspeedNewBall').blur();
		
		var mousePos = getMousePos(canvas, evt);
		mousePosX = mousePos.x;
		mousePosY = mousePos.y;
		CursorInCanvas = Boolean(true);
	  }, false);
	canvas.addEventListener('mouseout', function(evt) {
		CursorInCanvas=Boolean(false);
		clearInterval(whilemousedown);
	  }, false);
	canvas.addEventListener('mousedown', function(evt) {
		//get all textfields unfocussed, so that the information is processed.
		document.getElementById('txtSizeNewBall').blur();
		document.getElementById('txtEnergyDissipation').blur();
		document.getElementById('txtMassNewBall').blur();
		document.getElementById('txtXspeedNewBall').blur();
		document.getElementById('txtYspeedNewBall').blur();
		whileMouseDown();
		whilemousedown = setInterval(function() {whileMouseDown()},400);
		CursorInCanvas = Boolean(false); //Ensures that on touchscreen devices the cursor ball does not keep being drawn after click
		
	  }, false);
	  canvas.addEventListener('mouseup', function(evt) {
		//get all textfields unfocussed, so that the information is processed.
		clearInterval(whilemousedown);
	  }, false);
	  
	function whileMouseDown() {
		if (CheckFreeSpace(mousePosX/CoordsCSS2HTMLfactor(),mousePosY/CoordsCSS2HTMLfactor(), SizeNewBall))
		{
			CreateBall(mousePosX/CoordsCSS2HTMLfactor(),mousePosY/CoordsCSS2HTMLfactor(),SizeNewBall,MassNewBall,XspeedNewBall,YspeedNewBall);
			NumberOfBalls += 1;
		};
	  }
	  
		
	  
	window.addEventListener('resize', function(event){
		SetupCanvasSize();
		});

	 function changeResolution(canvas, scaleFactor) {
		canvas.width = Math.ceil(canvas.width * scaleFactor);
		canvas.height = Math.ceil(canvas.height * scaleFactor);
		ctx.scale(scaleFactor, scaleFactor);
	}
	 
	function CheckFreeSpace(x,y,R) {  //check for space in a radius R around (x,y)

		if ((x-R) < 0 || (x+R) > width || (y-R) < 0 || (y+R) > height) //if out of boundaries
				{
					return Boolean(false);
				}
				
		for (i = 0; i < NumberOfBalls; i++) //check for balls
				{
					ball[i].dx = (ball[i].vx + ball[i].dvx) * dt;
					ball[i].dy = (ball[i].vy + ball[i].dvy) * dt;

					if ((Math.pow((ball[i].x + ball[i].dx - x), 2) + Math.pow((ball[i].y + ball[i].dy - y), 2) < Math.pow((ball[i].r + R), 2))) //als geen plek
					{
						return Boolean(false);
					}
				}
		return Boolean(true);
	}
	  
	function CreateBall(x,y,R,m,vx,vy) {
		ball[NumberOfBalls] = new Ball();
		ball[NumberOfBalls].color = ColorNewBall;
		ball[NumberOfBalls].r = R; //radius ball
		ball[NumberOfBalls].x = x;
		ball[NumberOfBalls].y = y;
		ball[NumberOfBalls].vx = vx;
		ball[NumberOfBalls].vy = vy;
		ball[NumberOfBalls].ax = 0;
		ball[NumberOfBalls].ay = 0;
		ball[NumberOfBalls].Fx = 0;
		ball[NumberOfBalls].Fy = 0;
		ball[NumberOfBalls].dx;
		ball[NumberOfBalls].dy;
		ball[NumberOfBalls].m = m;
		ColorNewBall = getRandomBlueColor();
	}	
	  
	function handle_chbVerticalGravity_Click(){
		if (document.getElementById('chbVerticalGravity').checked) {
				VerticalGravity=Boolean(true);
			} else {
				VerticalGravity=Boolean(false);
			}
	}
	function handle_chbMutualGravity_Click(){
		if (document.getElementById('chbMutualGravity').checked) {
				MutualGravity=Boolean(true);
			} else {
				MutualGravity=Boolean(false);
			}
	}
	function handle_chbDrawingMode_Click()	{
		if (document.getElementById('chbDrawingMode').checked) {
				DrawingMode=Boolean(true);
			} else {
				DrawingMode=Boolean(false);
			}
	}
	function handle_chbCollisions_Click()	{
		if (document.getElementById('chbCollisions').checked) {
				Collisions=Boolean(true);
			} else {
				Collisions=Boolean(false);
			}
	}

	function handle_chbBoundaries_Click() {
		if (document.getElementById('chbBoundaries').checked) {
				Boundaries = Boolean(true);
			} else {
				Boundaries = Boolean(false);
			}
	}
	
	function handle_chbPauseResume_Click() {
		if (document.getElementById('chbPauseResume').checked) {
				//clearInterval(TimerStatus);
				//TimerStatus = setInterval(TimerTick, TimerInterval);
				dt = Old_dt;
			} else {
				//clearInterval(TimerStatus);
				Old_dt = dt;
				dt = 0;
			}
	}
	

	
	
	function handle_btnInvertVerticalGravity_Click()	{
		gy = -gy;
	}
	function handle_btnInvertMutualGravity_Click(){
		G = -G;
	}
	
	function handle_btnClearScreen_click(){
		NumberOfBalls = 0;
		ctx.clearRect(0, 0, CoordsCSS2HTMLfactor()*width, CoordsCSS2HTMLfactor()*height);
		
	}

	function handle_txtEnergyDissipation_change()	{
		EnergyDissipation = parseFloat(document.getElementById('txtEnergyDissipation').value); //parsefloat makes float from string
	}

	function handle_txtSizeNewBall_change()	{
		SizeNewBall = parseFloat(document.getElementById('txtSizeNewBall').value); //parsefloat makes float from string
	}

	function handle_txtMassNewBall_change()	{
		MassNewBall = parseFloat(document.getElementById('txtMassNewBall').value); //parsefloat makes float from string
	}  

	function handle_txtXspeedNewBall_change(){
		XspeedNewBall = parseFloat(document.getElementById('txtXspeedNewBall').value); //parsefloat makes float from string
	}

	function handle_txtYspeedNewBall_change()	{
		YspeedNewBall = -parseFloat(document.getElementById('txtYspeedNewBall').value); //parsefloat makes float from string
	}

	function handle_btnRemoveLastBall_click()	{
		NumberOfBalls -= 1;
	}

	function handle_btnScenario1_click()	{
		SetupScenario1();
	}
	
	function handle_btnScenario2_click()	{
		SetupScenario2();
	}
	
	function handle_btnSaveCanvasAsImage_click()	{
		var d=canvas.toDataURL("image/png");
		var w=window.open('about:blank','image from canvas');
		w.document.write("<img src='"+d+"' alt='from canvas'/>");
	}
	
	function handle_btnSaveConfig_click()	{
		for (i=0;i<NumberOfBalls;i++) {
			ball_SavedConfig[i] = new Ball();
			ball_SavedConfig[i].color = ball[i].color;
			ball_SavedConfig[i].r = ball[i].r; 
			ball_SavedConfig[i].x = ball[i].x;
			ball_SavedConfig[i].y = ball[i].y;
			ball_SavedConfig[i].vx = ball[i].vx;
			ball_SavedConfig[i].vy = ball[i].vy;
			ball_SavedConfig[i].ax = ball[i].ax;
			ball_SavedConfig[i].ay = ball[i].ay;
			ball_SavedConfig[i].Fx = ball[i].Fx;
			ball_SavedConfig[i].Fy = ball[i].Fy;
			ball_SavedConfig[i].dx = ball[i].dx;
			ball_SavedConfig[i].dy = ball[i].dy;
			ball_SavedConfig[i].m = ball[i].m;
		}
		NumberOfBalls_SavedConfig = NumberOfBalls;
	}
	function handle_btnLoadConfig_click()	{
		NumberOfBalls =0;
		for (i=0;i<NumberOfBalls_SavedConfig;i++) {
			CreateBall(ball_SavedConfig[i].x,ball_SavedConfig[i].y,ball_SavedConfig[i].r,ball_SavedConfig[i].m,ball_SavedConfig[i].vx,ball_SavedConfig[i].vy);
			NumberOfBalls += 1;
		}
	}
	
	function Calculate_Vertical_Gravity(ball){
		ball.Fy = 0;
		ball.Fx = 0;
		
		if (VerticalGravity) //calculate vertical gravity
				if ((((ball.y + ball.dy + ball.r) < height - 1) && (gy > 0)) || (((ball.y + ball.dy - ball.r) > 0 + 1) && (gy < 0)))
				{
				  ball.Fy += ball.m * gy;
				}
	}

	function Prepare_Collision_Check( ball ){ //first call this function before checking for any collisions
				ball.ax = ball.Fx / ball.m;
				ball.dvx = ball.ax * dt;

				ball.ay = ball.Fy / ball.m;
				ball.dvy = ball.ay * dt;

				ball.dx = (ball.vx + ball.dvx) * dt;
				ball.dy = (ball.vy + ball.dvy) * dt;
			}  

	function Check_Collision_Right_Wall(ball) {
		if ((ball.x + ball.dx + ball.r) > width)
				{
					return Boolean(true);
				}
				else
				{
					return Boolean(false);
				}	
	}

	function Collision_Right_Wall(ball) {
		
		ball.dvx = - Math.abs(ball.dvx);
		ball.vx = - Math.abs(ball.vx)*(1-0.01*EnergyDissipation);
		ball.vy = (1-0.01*EnergyDissipation)*ball.vy;
	}	

	function Check_Collision_Left_Wall(ball) {
		if ((ball.x + ball.dx - ball.r) < 0)
				{
					return Boolean(true);
				}
				else
				{
					return Boolean(false);
				}	
	}
	function Collision_Left_Wall(ball) {
		
		ball.dvx =  Math.abs(ball.dvx);
		ball.vx =  Math.abs(ball.vx)*(1-0.01*EnergyDissipation);
		ball.vy = (1-0.01*EnergyDissipation)*ball.vy;
	}

	function Check_Collision_Upper_Wall(ball) {
		if ((ball.y + ball.dy - ball.r) < 0)
				{
					return Boolean(true);
				}
				else
				{
					return Boolean(false);
				}	
	}
	function Collision_Upper_Wall(ball) {
		
		ball.dvy =  Math.abs(ball.dvy);
		ball.vy =  Math.abs(ball.vy)*(1-0.01*EnergyDissipation);
		ball.vx = (1-0.01*EnergyDissipation)*ball.vx;
	}

	function Check_Collision_Lower_Wall(ball) {
		if ((ball.y + ball.dy + ball.r) > height)
				{
					return Boolean(true);
				}
				else
				{
					return Boolean(false);
				}	
	}
	function Collision_Lower_Wall(ball) {
		
		ball.dvy = - Math.abs(ball.dvy)*(1-0.01*EnergyDissipation);
		ball.vy =  - Math.abs(ball.vy)*(1-0.01*EnergyDissipation);
		ball.vx = (1-0.01*EnergyDissipation)*ball.vx;
	}

	function Check_Collision_Ball(ball, ball2){
				ball2.dx = (ball2.vx + ball2.dvx) * dt;
				ball2.dy = (ball2.vy + ball2.dvy) * dt;

				if ((Math.pow((ball.x + ball.dx - ball2.x - ball2.dx), 2) + Math.pow((ball.y + ball.dy - ball2.y - ball2.dy), 2) < Math.pow((ball.r + ball2.r), 2)) && (Math.pow((ball.x + ball.dx - ball2.x - ball2.dx), 2) + Math.pow((ball.y + ball.dy - ball2.y - ball2.dy), 2) < (Math.pow(ball.x - ball2.x, 2) + Math.pow((ball.y - ball2.y), 2))))  //als botsing (het argument na '||' geeft aan dat de ballen naar elkaar to moeten bewegen!)
				{
					return Boolean(true);
				}
				else
				{
					return Boolean(false);
				}
			}

	function Collision_Ball(ball, ball2){
		var phi, theta, v1_xb, v1_yb, v2_xb, v2_yb, yb_x, yb_y, v1_xb_nieuw, v2_xb_nieuw, v1_yb_nieuw, v2_yb_nieuw, CoM_vx, CoM_vy; //Variables for computation
			
		yb_y = ball.y - ball2.y;
			yb_x = ball.x - ball2.x;

		theta = Math.atan((Math.abs(yb_x) / Math.abs(yb_y)));

			if ((yb_y > 0) && (yb_x > 0)) //BEPAAL PHI (de hoek tussen de x-as en de botsings-as.)
					phi = theta;
			else if (yb_y > 0)
					phi = -theta;
			else if (yb_x > 0)
					phi = Math.PI - theta;
			else
				phi = theta - Math.PI;

		// BEPAAL SNELHEIDSCOMPONENTEN op de botsings-as en de as loodrecht daarop

			v1_yb = ball.vx * Math.sin(phi) + ball.vy * Math.cos(phi);
			v1_xb = ball.vx * Math.cos(phi) - ball.vy * Math.sin(phi);

			v2_yb = ball2.vx * Math.sin(phi) + ball2.vy * Math.cos(phi);
			v2_xb = ball2.vx * Math.cos(phi) - ball2.vy * Math.sin(phi);

		// BEPAAL NIEUWE SNELHEIDSCOMPONENTEN a.d.h.v. de Wet van Impuls

			v1_yb_nieuw = v1_yb * (ball.m - ball2.m) / (ball.m + ball2.m) + 2 * ball2.m * v2_yb / (ball.m + ball2.m);
			v2_yb_nieuw = v2_yb * (ball2.m - ball.m) / (ball.m + ball2.m) + 2 * ball.m * v1_yb / (ball.m + ball2.m);

		// REKEN TERUG naar vx en vy

			ball.vx = (v1_xb * Math.cos(phi) + v1_yb_nieuw * Math.sin(phi)) ;
			ball.vy = (-v1_xb * Math.sin(phi) + v1_yb_nieuw * Math.cos(phi)) ;

			ball2.vx = (v2_xb * Math.cos(phi) + v2_yb_nieuw * Math.sin(phi)) ;
			ball2.vy = (-v2_xb * Math.sin(phi) + v2_yb_nieuw * Math.cos(phi)) ;
			
			//Take into account the dissipation of energy in the direction perpendicular to the center of mass momentum:
			 if (EnergyDissipation != 0) {

				// Transform to CoM frame
				CoM_vx = (ball.m * ball.vx + ball2.m * ball2.vx) / (ball.m + ball2.m); //CoM x velocity
				CoM_vy = (ball.m * ball.vy + ball2.m * ball2.vy) / (ball.m + ball2.m);

				v1_xb = ball.vx - CoM_vx;  //x velocity in CoM frame rigid_ball 1
				v2_xb = ball2.vx - CoM_vx; //rigid_ball 2

				v1_yb = ball.vy - CoM_vy;  //y velocity in CoM frame rigid_ball 1
				v2_yb = ball2.vy - CoM_vy; //rigid_ball 2
				
				//In the CoM frame we apply the dissipation of energy
				v1_xb_nieuw = v1_xb * (1 - 0.01*EnergyDissipation);
				v2_xb_nieuw = v2_xb * (1 - 0.01*EnergyDissipation);
				v1_yb_nieuw = v1_yb * (1 - 0.01*EnergyDissipation);
				v2_yb_nieuw = v2_yb * (1 - 0.01*EnergyDissipation);
						

				//Now we transform back to the 'lab' frame
				ball.vx = v1_xb_nieuw + CoM_vx;
				ball2.vx = v2_xb_nieuw + CoM_vx;
				ball.vy = v1_yb_nieuw + CoM_vy;
				ball2.vy = v2_yb_nieuw + CoM_vy;			
			}
			//reset forces
			ball.Fx=0;
			ball.Fy=0;
			ball2.Fx=0;
			ball2.Fy=0;
	}

	function Calculate_Mutual_Gravity(ball,ball2){
		var theta, phi, X, Y, R;

		X = ball2.x - ball.x;
		Y = ball2.y - ball.y;

		R = Math.sqrt(Math.pow(X, 2) + Math.pow(Y, 2)); //afstand tussen de twee ballen

		if ((Collisions && ((R - 1) > Math.sqrt(Math.pow(ball.r + ball2.r, 2)))) || ((!Collisions) && ((R - 1) > 5))) //Als botsingen aan staan, dan alleen aantrekkingskracht als ze NIET overlappen, anders gaat het fout (test ivm Collisions_Between_Balls uit)
		{
			theta = Math.atan(Math.abs(Y) / Math.abs(X));

			if ((Y > 0) && (X > 0)) //BEPAAL PHI
				phi = theta;
			else if (X > 0)
				phi = -theta;
			else if (Y > 0)
				phi = Math.PI - theta;
			else
				phi = theta - Math.PI;

			ball.Fx += G * ball.m * ball2.m / Math.pow(Math.max(R,30), 2) * Math.cos(phi);  // we use Math.Max(R,30) instead of R to avoid extreme high forces when the balls come to close
			ball.Fy += G * ball.m * ball2.m / Math.pow(Math.max(R, 30), 2) * Math.sin(phi);
			ball2.Fx += (-G * ball2.m * ball.m / Math.pow(Math.max(R, 30), 2) * Math.cos(phi));
			ball2.Fy += (-G * ball2.m * ball.m / Math.pow(Math.max(R, 30), 2) * Math.sin(phi));
		}
		
	}

	function TimerTick() {
			// The following code is executed each tick of the timer.

		for (i = 0; i < NumberOfBalls; i++) 
			Calculate_Vertical_Gravity(ball[i]);
		
		//Calculate mutual gravity
		if (MutualGravity)
		{
			for (i = 0; i < NumberOfBalls; i++) 
			{	
				for (j=i+1; j<NumberOfBalls; j++)
				{
					Calculate_Mutual_Gravity(ball[i], ball[j])
				}
			}
		}
		
		
		for (n = 0; n<NumberOfCollisionLoops; n++)
		{
			for (i = 0; i < NumberOfBalls; i++) 
				Prepare_Collision_Check(ball[i]); //calculates `naive' new positions, resuting only from forces
		
		
			//Collisions between balls
			for (i = 0; i < NumberOfBalls; i++) 
			{
				if (Collisions)
				{
					for (j=i+1; j<NumberOfBalls; j++)
					{
						if (Check_Collision_Ball(ball[i], ball[j]))
							{
								Collision_Ball(ball[i], ball[j]);
							}
					}
				}
			}
		
			if (Boundaries) {
				for (i = 0; i < NumberOfBalls; i++) 
				{
					//Collisions with the walls.
					// Placing this part again AFTER the ball-ball collisions ensures that balls do not go out of the canvas.
					if (Check_Collision_Right_Wall(ball[i]))
							{
								Collision_Right_Wall(ball[i]);
							}
						if (Check_Collision_Left_Wall(ball[i])) 
							{
									Collision_Left_Wall(ball[i]);
							}
						if (Check_Collision_Upper_Wall(ball[i]))
							{
									Collision_Upper_Wall(ball[i]);
							}
						if (Check_Collision_Lower_Wall(ball[i]))
						{
							Collision_Lower_Wall(ball[i]);
						}
				}
			}
		}
		
		for (i = 0; i < NumberOfBalls; i++) 
		{
			ball[i].vx = ball[i].vx + ball[i].dvx
			ball[i].vy = ball[i].vy + ball[i].dvy
			ball[i].dx = ball[i].vx * dt;
			ball[i].x = ball[i].x+ball[i].dx;
			ball[i].dy = ball[i].vy * dt;
			ball[i].y = ball[i].y+ball[i].dy;
		}
		
		//clear screen
		if (!DrawingMode)
		{	
			
			ctx.clearRect(0, 0, CoordsCSS2HTMLfactor()*width, CoordsCSS2HTMLfactor()*height);
			
			//if (!RemoveText) {
			//	ctx.textAlign="center"; 
			//	ctx.font = '20pt Calibri';
			//	ctx.fillStyle = 'black';
			//	ctx.fillText("Click in this box to add balls",CoordsCSS2HTMLfactor()*width/2,CoordsCSS2HTMLfactor()*(height/2+150));
			//}				
		}
		
		//draw balls
		for (i = 0; i < NumberOfBalls; i++)
		{
			ctx.beginPath();
			ctx.arc(CoordsCSS2HTMLfactor()*ball[i].x, CoordsCSS2HTMLfactor()*ball[i].y, CoordsCSS2HTMLfactor()*ball[i].r, 0, Math.PI*2);
			ctx.fillStyle = ball[i].color;
			ctx.fill();
			ctx.closePath();
		}
		
		
		//draw cursor ball
		if (CursorInCanvas & !DrawingMode) 
		{
			
			ctx.beginPath();
			ctx.arc(mousePosX, mousePosY, CoordsCSS2HTMLfactor()*SizeNewBall, 0, Math.PI*2);
			ctx.fillStyle = ColorNewBall;
			ctx.fill();
			ctx.closePath();
		}
			
		
	}

	
	function SetupScenario1()	{
		NumberOfBalls = 0;
		ctx.clearRect(0, 0, width, height);
		
		//settings
		VerticalGravity = Boolean(false);
		MutualGravity = Boolean(true);
		Collisions = Boolean(false);
		DrawingMode = Boolean(false);	
		Boundaries = Boolean(false);
		
		//balls
		CreateBall(width/2,height/2,15,250,-0.02,0);
		//CreateBall(CoordsCSS2HTMLfactor()*width/2,CoordsCSS2HTMLfactor()*height/2,15,250,-CoordsCSS2HTMLfactor()*0.02,CoordsCSS2HTMLfactor()*0);
		NumberOfBalls += 1;
		CreateBall(width/2,height/2+100,10,1,5,0);
		NumberOfBalls += 1;
		
		UpdateElements();
	}
	
	function SetupScenario2()	{
		NumberOfBalls = 0;
		ctx.clearRect(0, 0, width, height);
		
		//settings
		VerticalGravity = Boolean(false);
		MutualGravity = Boolean(false);
		Collisions = Boolean(true);
		DrawingMode = Boolean(false);
		Boundaries = Boolean(true);
		EnergyDissipation = 7;
		
		for (i = 0; i < 15; i++) {  
			CreateBall(width/2,height/2,20,2,(Math.random()-0.5)*15,(Math.random()-0.5)*15);
			NumberOfBalls +=1 ;
		}
		UpdateElements();
	}
	
}
catch(err) 
{
    //document.getElementById("article").innerHTML = err.message;
	//document.getElementById("article").innerHTML = err.name;
	//alert(err.message);
	//alert(err.name);
	alert('Unfortunately an error occured. This could be a browser specific issue.');
}