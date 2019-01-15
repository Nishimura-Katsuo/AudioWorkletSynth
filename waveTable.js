let depth = 1 << 9;
let mask = depth - 1;
let waveTable = [new Float64Array(depth)];
let sRate = sampleRate;
let stepRate = depth / sRate;

for (let c = 0; c < depth; c++) { // sine, 1st harmonic @ 1, 2nd harmonic @ 2/3, 3rd harmonic @ 1/3
	waveTable[0][c] = (3 * Math.sin(2 * Math.PI * c / depth) + 2 * Math.sin(4 * Math.PI * c / depth) + Math.sin(6 * Math.PI * c / depth)) / 6;
}

registerProcessor('config', class extends AudioWorkletProcessor {
	constructor (...anything) {
		super(...anything);
		this.port.onmessage = event => this.onmessage(event.data);
	}

	onmessage (data) {
		if (typeof data.bank === 'number' && data.wave.length === depth) {
			waveTable[data.bank & 0xFFFFFF] = data.wave;
		}
	}

	process () {
		return false;
	}
});

let delayLength = 2;

while (delayLength < sRate) {
	delayLength <<= 1;
}

let delayMask = delayLength - 1;

registerProcessor('effectsProcessor', class extends AudioWorkletProcessor {
	constructor (...anything) {
		super(...anything);
		this.delayIndex = 0;
		this.max = 1;
		this.min = -1;
		this.delay = new Float64Array(delayLength);
	}

	static get parameterDescriptors () {
		return [
			{name: 'gain', defaultValue: 1},
			{name: 'feedbackGain', defaultValue: 0.100},
			{name: 'feedbackPower', defaultValue: 0.100},
			{name: 'feedbackDelay', defaultValue: 0.300, minValue: 1 / sRate, maxValue: delayLength / sRate}
		];
	}

	process (inputs, outputs, params) {
		let input = inputs[0][0], output = outputs[0][0], gain = params.gain, fGain = params.feedbackGain, fPower = params.feedbackPower, fDelay = params.feedbackDelay, fValue;

		if (input.length) {
			for (let c = 0; c < output.length; c++) {
				if (isFinite(input[c])) {
					output[c] = input[c];
				}
			}
		}

		for (let c = 0; c < output.length; c++) {
			fValue = this.delay[(this.delayIndex - sRate * fDelay[c % fDelay.length]) & delayMask];
			this.delay[this.delayIndex] = output[c] + fValue * fPower[c % fPower.length];
			output[c] += fValue * fGain[c % fGain.length];
			this.max = Math.max(this.max, output[c]);
			this.min = Math.min(this.min, output[c]);
			this.delayIndex = (this.delayIndex + 1) & delayMask;
		}

		let dcOffset = (this.max + this.min) / 2;
		let amplitude = (this.max - this.min) * 1.1 / 2;

		for (let c = 0; c < output.length; c++) {
			output[c] = (output[c] - dcOffset) * gain[c % gain.length] / amplitude;

			if (output[c] < -1 || output[c] > 1) {
				console.warn("Clipping: " + output[c]);
			}
		}

		return true;
	}
});

registerProcessor('wavetableSynth', class extends AudioWorkletProcessor {
	constructor (...anything) {
		super(...anything);
		this.phase = 0;
		this.port.onmessage = event => this.onmessage(event.data);
		let ds = 2;

		while (ds < sRate) {
			ds <<= 1;
		}
	}

	static get parameterDescriptors () {
		return [
			{name: 'frequency', defaultValue: 440, minValue: 0},
			{name: 'detune', defaultValue: 1.0},
			{name: 'pitch', defaultValue: 1.0},
			{name: 'gain', defaultValue: 1.0},
			{name: 'bank', defaultValue: 0.0}
		];
	}

	onmessage (data) {
		console.log(data);
	}

	process (inputs, outputs, params) {
		let output = outputs[0][0];
		let currentFreq = 0, banka, bankb, bankf, samplea, sampleb, samplef;

		for (let c = 0; c < output.length; c++) {
			bankf = params.bank[c % params.bank.length];
			banka = Math.max(Math.floor(bankf), 0);
			bankb = Math.min(Math.ceil(bankf), waveTable.length - 1);
			bankf %= 1;

			samplea = Math.floor(this.phase) & mask;
			sampleb = Math.ceil(this.phase) & mask;
			samplef = this.phase % 1;

			output[c] =
						((1 - bankf)	* ((1 - samplef) * waveTable[banka][samplea] + samplef * waveTable[banka][sampleb]) +
						bankf		* ((1 - samplef) * waveTable[bankb][samplea] + samplef * waveTable[bankb][sampleb])) * params.gain[c % params.gain.length];

			currentFreq = params.frequency[c % params.frequency.length] * params.detune[c % params.detune.length] * params.pitch[c % params.pitch.length];
			this.phase += stepRate * currentFreq;
		}

		return true;
	}
});
