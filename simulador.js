// simulador.js
// Gráfico interactivo de la ley de Planck usando Plotly.js
(function(){
	const h = 6.62607015e-34;
	const c = 299792458;
	const k = 1.380649e-23;

	// Wavelength grid (micrometers) — logspaced to cover desde UV hasta radio
	const N = 3000;
	const lamMin_um = 0.01;
	const lamMax_um = 300;
	const logMin = Math.log10(lamMin_um);
	const logMax = Math.log10(lamMax_um);
	const lambda_um = new Array(N);
	const lambda_m = new Array(N);
	for(let i=0;i<N;i++){
		const v = logMin + (i/(N-1))*(logMax-logMin);
		lambda_um[i] = Math.pow(10, v);
		lambda_m[i] = lambda_um[i] * 1e-6;
	}

	function planck_lambda(lambda, T){
		// lambda in meters, returns spectral radiance B_lambda in W·sr^-1·m^-3
		const a = 2 * h * c * c;
		const b = (h * c) / (lambda * k * T);
		if (b > 700) return 0; // avoid overflow in exp
		const denom = Math.expm1(b); // exp(b)-1, better numerical
		if (denom <= 0) return 0;
		return a / Math.pow(lambda,5) / denom;
	}

	function spectrumForTemperature(T){
		const y = new Array(N);
		for(let i=0;i<N;i++){
			y[i] = planck_lambda(lambda_m[i], T);
		}
		return y;
	}

	function rgbToHex(r, g, b){
		return '#' + [r, g, b].map(x => {
			const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		}).join('');
	}


	// Initial temperature
	let T = 5850;

    function makeMainTrace(y, color){
        return {
            x: lambda_um,
            y: y,
            mode: 'lines',
            name: 'Curva de radiación espectral',   
            showlegend: true,
            line: {color: color, width: 2},
        }
    }

	function makePeakTrace(lambdaPeak_um, ymax){
		return {
			x: [lambdaPeak_um, lambdaPeak_um],
			y: [0, ymax],
			mode: 'lines+markers',
			name: 'Longitud de onda del pico',
            showlegend: true,
			line: {color: '#d62728', width: 1, dash: 'dash'},
            marker: {
            size: 10,       // hace fácil el hover
            color: '#d62728',
            opacity: 1
        },
		};
	}

	const layout = {
		xaxis: {title: { text: 'Longitud de onda λ (µm)', standoff: 15}, type: 'log', autorange:true,},
		yaxis: {title: { text: 'Radiancia espectral I(λ,T) (W·sr⁻¹·m⁻³)', standoff: 15}, autorange:false, exponentformat: 'e', showexponent: 'all', range: [0, 1e12]},
		title: `Ley de Planck — Temperatura: ${T} K`,
		legend: {orientation: 'h'},
		margin: {t:60, r:100},
        paper_bgcolor: 'black',
        font: {color: 'white'},
        plot_bgcolor: '#111111',
        hovermode: 'closest'
	};

	// DOM elements
	const slider = document.getElementById('slider');
	const Tinput = document.getElementById('Tinput');
	const Tval = document.getElementById('Tval');
	const lambdaPeakLabel = document.getElementById('lambdaPeak');
	const playBtn = document.getElementById('play');

	function updateDisplay(T){
		Tval.textContent = Math.round(T);
		if(typeof Tinput !== 'undefined' && Tinput) Tinput.value = Math.round(T);
		const lam_peak_um = 2.897771955e-3 / T * 1e6;
		lambdaPeakLabel.textContent = lam_peak_um.toFixed(3);
	}

	function updatePlot(Tnew){
		const ynew = spectrumForTemperature(Tnew);
		const ymax = Math.max.apply(null, ynew);
		const lam_peak_um = 2.897771955e-3 / Tnew * 1e6;
		const lam_peak_nm = lam_peak_um * 1000;

		// Integrate total and visible-band radiance (trapezoidal)
		let total = 0, visible = 0;
		for(let i=0;i<N-1;i++){
			const dx = (lambda_m[i+1] - lambda_m[i]);
			const avg = 0.5*(ynew[i] + ynew[i+1]);
			total += avg * dx;
			const lam_um_center = 0.5*(lambda_um[i] + lambda_um[i+1]);
			if(lam_um_center >= 0.4 && lam_um_center <= 0.75){
				visible += avg * dx;
			}
		}
		const fracVisible = total > 0 ? visible / total : 0;

		// Helper: wavelength (nm) -> rgb approximation
		function wavelengthToRgb(w) {
			// w en nm
			let r = 0, g = 0, b = 0;

			// fuera del visible → negro
			if (w < 400 || w > 750) {
				return [0, 0, 0];
			}

			// espectro visible aproximado
			if (w < 450) {                 // violeta
				r = (450 - w) / (450 - 400);
				b = 1;
			}
			else if (w < 495) {            // azul
				g = (w - 450) / (495 - 450);
				b = 1;
			}
			else if (w < 570) {            // verde
				g = 1;
				b = (570 - w) / (570 - 495);
			}
			else if (w < 590) {            // amarillo
				r = (w - 570) / (590 - 570);
				g = 1;
			}
			else if (w < 620) {            // naranja
				r = 1;
				g = (620 - w) / (620 - 590);
			}
			else  if (w <= 700) {                // rojo visible
				r = 1;
			}

			else {                              // 700–750 nm: rojo tenue
			r = (750 - w) / (750 - 700);    // 700→1, 750→0
			}	

			// corrección gamma (opcional pero ok)
			const gamma = 0.8;
			function adjust(c) {
				return Math.round(255 * Math.pow(c, gamma));
			}

			return [adjust(r), adjust(g), adjust(b)];
		}


		function rgbToRgbaString(rgb, a){ return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }

		// Decide curve color: if most energy in visible -> white; else if peak in visible -> wavelength color; else black
		let curveColorHex = '#000000';
		if(fracVisible > 0.6){
			curveColorHex = '#ffffff';
		} else if(lam_peak_nm >= 400 && lam_peak_nm <= 750){
			const rgb = wavelengthToRgb(lam_peak_nm);
			curveColorHex = rgbToHex(rgb[0], rgb[1], rgb[2]);
		} else {
			curveColorHex = '#000000';
		}

		// Build visible-band colored shapes (segments) from 400-750 nm
		const visShapes = [];
		const visStart = 0.4; const visEnd = 0.75; // µm
		const segCount = 40;
		for(let i=0;i<segCount;i++){
			const a = visStart + (i/segCount)*(visEnd-visStart);
			const b = visStart + ((i+1)/segCount)*(visEnd-visStart);
			const center_nm = (a+b)/2*1000;
			const rgb = wavelengthToRgb(center_nm);
			visShapes.push({
				type: 'rect', xref: 'x', yref: 'paper', x0: a, x1: b, y0: 0, y1: 1,
				fillcolor: rgbToRgbaString(rgb, 0.14), line: {width: 0}
			});
		}

		// Use Plotly.react for a smooth transition
		let newTraces = [
			makeMainTrace(ynew, curveColorHex),
			makePeakTrace(lam_peak_um, ymax)
		];

		let newLayout = Object.assign({}, layout, {
			title: `Ley de Planck — Temperatura: ${Math.round(Tnew)} K`,
			shapes: visShapes
		});

		Plotly.react('plot', newTraces, newLayout, {transition:{duration:240, easing:'cubic-in-out'}, displayModeBar: false});
		updateDisplay(Tnew);
        
        

    }

	slider.addEventListener('input', (e)=>{
		T = +e.target.value;
		// sync numeric input
		if(typeof Tinput !== 'undefined' && Tinput) Tinput.value = Math.round(T);
		// update smoothly
		updatePlot(T);
	});

	// Allow numeric keyboard input for temperature, with clamping 200..12000
	if(typeof Tinput !== 'undefined' && Tinput){
		Tinput.addEventListener('input', (e)=>{
			const raw = e.target.value;
			if(raw === '') return;
			let v = Number(raw);
			if(Number.isNaN(v)) return;
			v = Math.round(v);
			// clamp to allowed range
			v = Math.max(200, Math.min(12000, v));
			e.target.value = v;
			slider.value = v;
			T = v;
			updatePlot(T);
		});

		Tinput.addEventListener('change', (e)=>{
			let v = Number(e.target.value);
			if(Number.isNaN(v)) v = 200;
			v = Math.round(Math.max(200, Math.min(12000, v)));
			e.target.value = v;
			slider.value = v;
			T = v;
			updatePlot(T);
		});
	}

	// Play button: animates temperature from current to max and back
	let playing = false;
	let playAnim;
	playBtn.addEventListener('click', ()=>{
		if(playing){
			playing = false;
			playBtn.textContent = '▶︎ Reproducir';
			cancelAnimationFrame(playAnim);
			return;
		}
		playing = true;
		playBtn.textContent = '■ Parar';

		const minT = +3865;
		const maxT = +7600;
		const duration = 8000; // ms for full sweep
		const start = performance.now();

		function step(now){
			const t = ((now - start) % duration) / duration; // 0..1
			// ease in-out
			const ease = 0.5 - 0.5*Math.cos(Math.PI*2*t);
			const Ttarget = minT + ease*(maxT - minT);
			slider.value = Math.round(Ttarget);
			T = Math.round(Ttarget);
			updatePlot(T);
			playAnim = requestAnimationFrame(step);
		}
		playAnim = requestAnimationFrame(step);
	});

	// Initialize display (render using new plotting logic)
	updatePlot(T);

	// (Y-range buttons will be initialized after their definitions)

	// Y-axis range cycling with +/- buttons
	const yRanges = [
		{max: 7e8, label: 'Rango Y: [0, 7e8]'},
        {max: 1e10, label: 'Rango Y: [0, 1e10]'},
        {max: 1e11, label: 'Rango Y: [0, 1e11]'},
		{max: 1e12, label: 'Rango Y: [0, 1e12]'},
        {max: 1e13, label: 'Rango Y: [0, 1e13]'},
        {max: 1e14, label: 'Rango Y: [0, 1e14]'},
		{max: 1.03e15, label: 'Rango Y: [0, 1.03e15]'}
	];
	let currentYRangeIdx = 5; // start at 1e14

	const decreaseYBtn = document.getElementById('decreaseY');
	const increaseYBtn = document.getElementById('increaseY');
	const yRangeLabel = document.getElementById('yRangeLabel');

	function applyYRange(idx){
		currentYRangeIdx = idx;

        if(idx == 0){
            decreaseYBtn.disabled = true;
            decreaseYBtn.style.backgroundColor = 'gray';
            decreaseYBtn.style.pointerEvents = 'none';
        } else{
            decreaseYBtn.disabled = false;
            decreaseYBtn.style.backgroundColor = '#333';
            decreaseYBtn.style.pointerEvents = 'all';
        }

        if(idx == yRanges.length - 1){
            increaseYBtn.disabled = true;
            increaseYBtn.style.backgroundColor = 'gray';
            increaseYBtn.style.pointerEvents = 'none';
        } else{
            increaseYBtn.disabled = false;
            increaseYBtn.style.backgroundColor = '#333';
            increaseYBtn.style.pointerEvents = 'all';
        }

		const range = yRanges[idx];
		Plotly.relayout('plot', {
			'yaxis.range': [0, range.max],
			'yaxis.autorange': false,
            'xaxis.autorange': true
		});
		yRangeLabel.textContent = range.label;
	}

	if(decreaseYBtn){
		decreaseYBtn.addEventListener('click', ()=>{
            if(currentYRangeIdx != 0){
                applyYRange(currentYRangeIdx - 1);
            }
		});
	}

	if(increaseYBtn){
		increaseYBtn.addEventListener('click', ()=>{
            if(currentYRangeIdx != yRanges.length){
                applyYRange(currentYRangeIdx + 1);
            } 
		});
	}

	// initialize Y-range label/buttons to current index
	applyYRange(currentYRangeIdx);

})();

