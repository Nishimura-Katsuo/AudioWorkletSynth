"use strict";
/* global setTimeout cookies fastElement ooura */

const chords = [];
chords[1] = {resolution: [2, 3, 4, 5, 6], type: "major", resolvesFrom: [4, 5]};
chords[2] = {resolution: [3, 5], type: "minor", resolvesFrom: [4, 6]};
chords[3] = {resolution: [4, 6], type: "minor", resolvesFrom: [2, 5]};
chords[4] = {resolution: [1, 2, 5], type: "major", resolvesFrom: [3, 6]};
chords[5] = {resolution: [1, 3, 6], type: "major", resolvesFrom: [2, 4]};
chords[6] = {resolution: [2, 4], type: "minor", resolvesFrom: [3, 5]};


let loaded = false;
let interacted = false;
let ready = false;
let context;
let gain;
let fineTune;
let notesPerOctave = 12;
let tt = Math.pow(2, 1 / notesPerOctave);
let zeroFreq = 440;
let offset = -69; // midi origin is 69 steps below 440 Hz (concert A)
let output;
let config;
let wave = new Float64Array(1 << 9);
let oo = new ooura(wave.length);
let keys = [];
let waveFrameCount = 32;

if (cookies.volume === undefined) {
	cookies.volume = 1;
}

if (cookies.detune === undefined) {
	cookies.detune = 0;
}

if (cookies.pitch === undefined) {
	cookies.pitch = 0;
}

if (cookies.sliders === undefined) {
	cookies.sliders = [0, 100, 66, 33]; // default wave
}

function noteFreq (midiNote) {
	return zeroFreq * Math.pow(tt, midiNote + offset);
}

function noteShift (semitones) {
	return Math.pow(tt, semitones);
}

let noteLetter = [	"C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
	"C0", "C#0/Db0", "D0", "D#0/Eb0", "E0", "F0", "F#0/Gb0", "G0", "G#0/Ab0", "A0", "A#0/Bb0", "B0",
	"C1", "C#1/Db1", "D1", "D#1/Eb1", "E1", "F1", "F#1/Gb1", "G1", "G#1/Ab1", "A1", "A#1/Bb1", "B1",
	"C2", "C#2/Db2", "D2", "D#2/Eb2", "E2", "F2", "F#2/Gb2", "G2", "G#2/Ab2", "A2", "A#2/Bb2", "B2",
	"C3", "C#3/Db3", "D3", "D#3/Eb3", "E3", "F3", "F#3/Gb3", "G3", "G#3/Ab3", "A3", "A#3/Bb3", "B3",
	"C4", "C#4/Db4", "D4", "D#4/Eb4", "E4", "F4", "F#4/Gb4", "G4", "G#4/Ab4", "A4", "A#4/Bb4", "B4",
	"C5", "C#5/Db5", "D5", "D#5/Eb5", "E5", "F5", "F#5/Gb5", "G5", "G#5/Ab5", "A5", "A#5/Bb5", "B5",
	"C6", "C#6/Db6", "D6", "D#6/Eb6", "E6", "F6", "F#6/Gb6", "G6", "G#6/Ab6", "A6", "A#6/Bb6", "B6",
	"C7", "C#7/Db7", "D7", "D#7/Eb7", "E7", "F7", "F#7/Gb7", "G7", "G#7/Ab7", "A7", "A#7/Bb7", "B7",
	"C8", "C#8/Db8", "D8", "D#8/Eb8", "E8", "F8", "F#8/Gb8", "G8", "G#8/Ab8", "A8", "A#8/Bb8", "B8",
	"C9", "C#9/Db9", "D9", "D#9/Eb9", "E9", "F9", "F#9/Gb9", "G9", "G#9/Ab9", "A9", "A#9/Bb9", "B9",
];

/*

function musicMode (mode) {
	var reference = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];

	if (typeof (mode) === 'string') {
		switch (mode.trim().toLowerCase()) {
		case "dorian":
			mode = 1;
			break;
		case "phrygian":
			mode = 2;
			break;
		case "lydian":
			mode = 3;
			break;
		case "mixolydian":
			mode = 4;
			break;
		case "minor":
		case "aeolian":
			mode = 5;
			break;
		case "diminished":
		case "locrian":
			mode = 6;
			break;
		default:
			mode = 0;
			break;
		}
	}

	if (typeof (mode) !== 'number') {
		mode = 0;
	}

	var notes = reference.slice(mode, mode + 7);

	for (var k in notes) {
		notes[k] -= reference[mode];
	}

	switch (mode) {
	case 1:
		notes.mode = "Dorian";
		break;
	case 2:
		notes.mode = "Phrygian";
		break;
	case 3:
		notes.mode = "Lydian";
		break;
	case 4:
		notes.mode = "Mixolydian";
		break;
	case 5:
		notes.mode = "Aeolian";
		break;
	case 6:
		notes.mode = "Locrian";
		break;
	default:
		notes.mode = "Ionian";
		break;
	}

	return notes;
}

*/

function updateStuff () {
	if (!output) {
		return;
	}

	output.innerHTML =
		'Status: Ready!\n' +
		'Volume: ' + (cookies.volume * 100).toFixed(0) + '%\n' +
		'Pitch:  ' + (cookies.pitch * 100).toFixed(0) + ' cents\n' +
		'Detune: ' + Math.round(cookies.detune * 100) + ' cents\n' +
		'Notes:  ' + keys.map((v, i) => v ? noteLetter[i].split('/')[0] : null).filter(Boolean).join(', ') + '\n';
}

function updateFFTWave () {
	if (config) { // TODO: move this to a webworker
		setTimeout(() => { // divert heavy computation to the event loop, suppresses warnings about long handlers
			let wavetable = [];
			wavetable[0] = wave.slice();

			for (let c = 1; c < waveFrameCount; c++) {
				wavetable[c] = wavetable[c - 1].slice();

				for (let d = 3; d < wavetable[c].length; d += 2) {
					wavetable[c][d] *= 1.55 / (d - 1);
				}
			}

			wavetable.forEach(w => oo.ifftInPlace(w.buffer));
			let max = wavetable[0].reduce((total, value) => Math.max(total, value), 0);
			let min = wavetable[0].reduce((total, value) => Math.min(total, value), 0);
			let dcOffset = (max + min) / 2;
			let amplitude = (max - min) / 2;

			// normalize wave to [-1, 1], sine/cosine could be simplified, but not true for samples if we ever use them
			for (let c = 0; c < wavetable.length; c++) {
				for (let d = 0; d < wavetable[c].length; d++) {
					wavetable[c][d] = (wavetable[c][d] - dcOffset) / amplitude;
				}
			}

			wavetable.forEach((w, b) => config.port.postMessage({bank: b, wave: w}));
		}, 10);
	}
}

function init () {
	if (!loaded || !interacted || context) {
		return;
	}

	output.innerHTML = 'Status: Loading...';

	context = new AudioContext();
	context.audioWorklet.addModule('waveTable.js').then(() => {
		gain = new AudioWorkletNode(context, 'effectsProcessor');
		['gain', 'feedbackGain', 'feedbackPower', 'feedbackDelay'].forEach(param => {
			gain[param] = gain.parameters.get(param);
		});
		gain.gain.value = cookies.volume;
		gain.connect(context.destination);
		fineTune = context.createConstantSource();
		fineTune.offset.value = 0;
		fineTune.start();
		config = new AudioWorkletNode(context, 'config');

		let textStyle = {
			color: 'white',
			verticalAlign: 'top',
			fontFamily: 'monospace',
			whiteSpace: 'pre'
		};

		let hBox = fastElement({
			tag: 'div',
			style: {
				padding: '5px',
				margin: '5px',
				display: 'inline-block',
				verticalAlign: 'top'
			}
		});

		for (let c = 1; c <= 32; c++) {
			let harmonic = c;

			if (typeof cookies.sliders[harmonic] === 'number') {
				wave[harmonic * 2 + 1] = cookies.sliders[harmonic];
			}

			fastElement({
				tag: 'span',
				parent: hBox,
				innerHTML: (Math.log2(harmonic) % 1 ? ' ' : '+') + harmonic.toString().padStart(2, ' ') + 'h:',
				style: textStyle,
			});

			let slider = fastElement({
				tag: 'input',
				parent: hBox,
				id: 'harmonic' + c,
				type: 'range',
				min: '0',
				max: '100',
				step: '1',
				value: wave[harmonic * 2 + 1]
			});

			let label = fastElement({
				tag: 'span',
				parent: hBox,
				innerHTML: '' + wave[harmonic * 2 + 1],
				style: textStyle
			});

			slider.onchange = () => {
				cookies.sliders[harmonic] = wave[harmonic * 2 + 1] = slider.value | 0;
				label.innerHTML = '' + wave[harmonic * 2 + 1];
				updateFFTWave();
			};

			fastElement({tag: "br", parent: hBox});
		}


		let sBox = fastElement({
			tag: 'div',
			style: {
				margin: '5px',
				padding: '5px',
				display: 'inline-block',
				verticalAlign: 'top',
			}
		});

		[['feedbackDelay', 'Echo Delay', 0.075, 1000, 'ms'], ['feedbackGain', ' Echo Gain', 0.015, 1, ''], ['feedbackPower', '  Feedback', 0.415, 1, '']].forEach(param => {

			fastElement({
				tag: 'span',
				parent: sBox,
				innerHTML: param[1] + ':',
				style: textStyle
			});

			let pSlider = fastElement({
				tag: 'input',
				parent: sBox,
				type: 'range',
				min: '0.001',
				max: '1',
				step: '0.001',
				value: cookies[param[0]] || param[2]
			});

			let label = fastElement({
				tag: 'span',
				parent: sBox,
				innerHTML: pSlider.value * param[3] + param[4],
				style: textStyle
			});

			gain[param[0]].value = pSlider.value;

			pSlider.onchange = () => {
				cookies[param[0]] = pSlider.value;
				gain[param[0]].value = cookies[param[0]];
				label.innerHTML = pSlider.value * param[3] + param[4];
			};

			fastElement({tag: 'br', parent: sBox});


		});

		ready = true;
		updateStuff();

		if (cookies.sliders.length) {
			updateFFTWave();
		}
	});
}

window.addEventListener('load', () => {
	output = fastElement({
		tag: "pre",
		innerHTML: "Status: Please click here or press a keyboard key to load.",
		style: {
			padding: "5px",
			margin: "0px",
			color: "white"
		}
	});

	loaded = true;
	init();
}, {passive: true});

window.addEventListener('keyup', () => {
	interacted = true;
	init();
}, {passive: true});

window.addEventListener('click', () => {
	interacted = true;
	init();
}, {passive: true});

function keyEvent (data) {
	if (!ready) {
		return;
	}

	if (keys[data[1]]) {
		let oldkey = keys[data[1]];
		oldkey[0].gain.linearRampToValueAtTime(0, context.currentTime + 0.065);
		setTimeout(() => oldkey.forEach(node => node.disconnect && node.disconnect()), 70);
		delete keys[data[1]];
		updateStuff();
	}

	if (data[2] > 0) {
		let key = new AudioWorkletNode(context, 'wavetableSynth');
		key.frequency = key.parameters.get('frequency');
		key.gain = key.parameters.get('gain');
		key.detune = key.parameters.get('detune');
		key.pitch = key.parameters.get('pitch');
		key.bank = key.parameters.get('bank');
		key.frequency.value = noteFreq(data[1]);
		key.gain.setValueAtTime(key.gain.value = 0.0001, context.currentTime);
		key.gain.exponentialRampToValueAtTime(data[2] / 127, context.currentTime + 0.5 / noteFreq(data[1]));
		key.bank.setValueAtTime(key.bank.value = 0, context.currentTime);
		key.bank.linearRampToValueAtTime(waveFrameCount - 1, context.currentTime + 10 / noteShift(data[1] - 47));
		fineTune.connect(key.detune);
		key.connect(gain);
		keys[data[1]] = [key];
		updateStuff();
	}
}

function keyAftertouch (data) {
	console.log('Aftertouch (key): ', data);
}

function channelAftertouch (data) {
	console.log('Aftertouch (channel): ', data);
}

function dialEvent (data) {
	if (!ready) {
		return;
	}

	switch (data[1]) {
	case 7:
		gain.gain.value = cookies.volume = data[2] / 127;
		updateStuff();
		break;
	case 1:
		cookies.detune = (data[2] - 64) / 100;
		fineTune.offset.value = noteShift(cookies.pitch + cookies.detune) - 1;
		updateStuff();
		break;
	default:
		console.log('Dial Event: ', data);
		break;
	}
}

function pitchEvent (data) {
	if (!ready) {
		return;
	}

	let newpitch = data[2] < 64 ? (data[2] - 64) / 64 : (data[2] - 64) / 63;

	if (newpitch > 0) {
		cookies.pitch = (newpitch * -12) | 0; // slide down 12 with a fretted effect
	} else {
		cookies.pitch = newpitch * -2; // bend up 2
	}

	fineTune.offset.value = noteShift(cookies.pitch + cookies.detune) - 1;
	updateStuff();
}

function programEvent (data) {
	console.log('Program Change: ', data);
}

function systemEvent (data) {
	console.log('System: ', data);
}

function unknownEvent (data, ev) {
	console.log('Unrecognized event: ', ev, data);
}

let midiHandlers = [unknownEvent, unknownEvent, unknownEvent, unknownEvent, unknownEvent, unknownEvent, unknownEvent, unknownEvent,
	keyEvent,
	keyEvent,
	keyAftertouch,
	dialEvent,
	programEvent,
	channelAftertouch,
	pitchEvent,
	systemEvent,
];

function midiMessage (e) {
	let midievent = e.data[0] >> 4;
	e.data[0] &= 15;
	(midiHandlers[midievent] || unknownEvent)(e.data, midievent);
}

function registerMidiPort (port) {
	if (port.type === "input") {
		if (port.connection === "closed") {
			port.open();
			port.onmidimessage = midiMessage;
		}
	}
}

function midiStateChange (e) {
	registerMidiPort(e.port);
}

let midiAccess = undefined;

if (navigator.requestMIDIAccess) {
	navigator.requestMIDIAccess().then(function (access) {
		midiAccess = access;
		midiAccess.onstatechange = midiStateChange;

		for (let i of midiAccess.inputs.values()) {
			registerMidiPort(i);
		}
	});
}

