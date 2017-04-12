'use strict';

/**
 * Reconstruction original size chroma in YCbCr
 * adaptive for Luma layer
 * @author AngReload
 */
class Wrapper {
	constructor (xRes, yRes, scaleX = 1, scaleY = 1) {
		this.xRes = xRes;
		this.yRes = yRes;
		this.scaleX = scaleX;
		this.scaleY = scaleY;
		this.data = new Float32Array(xRes * yRes);
	}

	static from(component) {
		const xRes = component.lines[0].length;
		const yRes = component.lines.length;
		const blank = new Wrapper(xRes, yRes, component.scaleX, component.scaleY);
		for (let y = 0; y < yRes; y++) {
			for (let x = 0; x < xRes; x++) {
				blank.set(x, y, component.lines[y][x]);
			}
		}

		return blank;
	}

	get(x, y) {
		if (0 <= x && x < this.xRes && 0 <= y && y < this.yRes) {
			return this.data[this.xRes * y + x];
		} else {
			return 0;
		}
	}

	set(x, y, v) {
		if (0 <= x && x < this.xRes && 0 <= y && y < this.yRes) {
			this.data[this.xRes * y + x] = v;
		}
	}

	toComponent() {
		const component = {
			scaleX: this.scaleX,
			scaleY: this.scaleY,
			lines: []
		};

		for (let y = 0; y < this.yRes; y++) {
			component.lines[y] = [];
			for (let x = 0; x < this.xRes; x++) {
				component.lines[y][x] = this.get(x, y);
			}
		}

		return component;
	}
}

// range shift for Cr and Cb (not 127.5?!)
const shift = 128;

// ITU-R BT.601 table 1
const kb = 0.114;
const kr = 0.299;
// inverted
const kb2 = 1.772; // 2 * (1 - kb)
const kr2 = 1.402; // 2 * (1 - kr)
// anti-green
const kb3 = 0.3441363;	// (2 * (1 - kb)) * kb / (1 - kb - kr)
const kr3 = 0.71413636; // (2 * (1 - kr)) * kr / (1 - kb - kr)

// utils
const {min, max, abs, floor, ceil} = Math;

const clamp = function (minL, v, maxL) {
	if (v < minL) return minL;
	if (v > maxL) return maxL;
	return v;
}

const errorCbCr = function (Y, Cb, Cr) {
	const r = Y + kr2 * (Cr - shift);
	const g = Y - kb3 * (Cb - shift) - kr3 * (Cr - shift);
	const b = Y + kb2 * (Cb - shift);

	const rClamp = clamp(0, r, 255);
	const gClamp = clamp(0, g, 255);
	const bClamp = clamp(0, b, 255);

	const rError = abs(r - rClamp);
	const gError = abs(g - gClamp);
	const bError = abs(b - bClamp);

	return rError + gError + bError;
}

function clampCbCr(Y, Cb, Cr) {
	// Y + kb2 * (Cb - shift) == [0, 255] ->
	// shift - Y / kb2 <= Cb <= shift + (255 - Y) / kb2
	let minCb = shift - Y / kb2;
	let maxCb = shift + (255 - Y) / kb2;
	// and 0 <= Cb <= 255
	minCb = max(0, minCb);
	// maxCb = min(maxCb, 255);
	Cb = clamp(minCb, Cb, maxCb);

	// also for the red component
	let minCr = shift - Y / kr2;
	let maxCr = shift + (255 - Y) / kr2;
	minCr = max(0, minCr);
	maxCr = min(maxCr, 255);
	Cr = clamp(minCr, Cr, maxCr);
	
	// Y - kb3 * (Cb - shift) - kr3 * (Cr - shift) == [0, 255] ->
	// Y + (kb3 + kr3) * shift - 255 <= Cb * kb3 + kr3 * Cr <= Y + (kb3 + kr3) * shift
	const sumCbCr = Cb * kb3 + kr3 * Cr;
	const minCbCr = Y + (kb3 + kr3) * shift - 255;
	const maxCbCr = Y + (kb3 + kr3) * shift -   0;
	// сorrection is proportional to the possibility of change Cb and Cr
	if (sumCbCr > maxCbCr) {
		const cbFree = Cb - minCb;
		const crFree = Cr - minCr;
		const x = (maxCbCr - kb3 * minCb - kr3 * minCr) / (kb3 * cbFree + kr3 * crFree);
		Cb = minCb + cbFree * x;
		Cr = minCr + crFree * x;
	} else if (sumCbCr < minCbCr) {
		const cbFree = maxCb - Cb;
		const crFree = maxCr - Cr;
		const x = (minCbCr - kb3 * Cb - kr3 * Cr) / (kb3 * cbFree + kr3 * crFree);
		Cb = Cb + cbFree * x;
		Cr = Cr + cbFree * x;
	}

	return [Cb, Cr];
}

function clampTwoCbCr(Y0, Cb0, Cr0, Y1, Cb1, Cr1) {
	let newCb0;
	let newCr0;

	let newCb1;
	let newCr1;

	// the less freedom, the more accurately you can determine the color
	const err0 = errorCbCr(Y0, Cb0, Cr0);
	const err1 = errorCbCr(Y1, Cb1, Cr1);

	if (err0 > err1) {
		[newCb0, newCr0] = clampCbCr(Y0, Cb0, Cr0);
		// error diffusion
		newCb1 = (Cb0 + Cb1) - newCb0;
		newCr1 = (Cr0 + Cr1) - newCr0;
		// due to inaccurate input data (compression), a second correction is necessary
		[newCb1, newCr1] = clampCbCr(Y1, newCb1, newCr1);
	} else {
		[newCb1, newCr1] = clampCbCr(Y1, Cb1, Cr1);

		newCb0 = (Cb0 + Cb1) - newCb1;
		newCr0 = (Cr0 + Cr1) - newCr1;

		[newCb0, newCr0] = clampCbCr(Y0, newCb0, newCr0);
	}

	return [newCb0, newCr0, newCb1, newCr1];
}

function adaptiveSupersampler(
	L1, L2, L3, L4, L5, L6, 
	  B1,     B2,     B3,
	  R1,     R2,     R3
) {
	// luma differences, epsilon = 1
	const a = abs(L1 - L2) + 1;
	const b = abs(L2 - L3) + 1;
	const c = abs(L3 - L4) + 1;
	const d = abs(L4 - L5) + 1;
	const e = abs(L5 - L6) + 1;

	// сoefficient from direction vs center approximation
	const c2 = c * c;
	const k12 = c2 / ((a + c) * (b + c));
	const k32 = c2 / ((c + d) * (c + e));

	// from first pixel or center
	const from1Bl = (1 - k12) * B2 + k12 * B1;
	const from1Br = (1 - k12) * B2 + k12 * (B2 + B2 - B1);

	const from1Rl = (1 - k12) * R2 + k12 * R1;
	const from1Rr = (1 - k12) * R2 + k12 * (R2 + R2 - R1);

	// from third pixel or center
	const from3Bl = (1 - k32) * B2 + k32 * (B2 + B2 - B3);
	const from3Br = (1 - k32) * B2 + k32 * B3;
	
	const from3Rl = (1 - k32) * R2 + k32 * (R2 + R2 - R3);
	const from3Rr = (1 - k32) * R2 + k32 * R3;
	
	// priority for direction with smooth luma
	const k13 = a / (a + e);

	const Bl = (1 - k13) * from1Bl + k13 * from3Bl;
	const Br = (1 - k13) * from1Br + k13 * from3Br;

	const Rl = (1 - k13) * from1Rl + k13 * from3Rl;
	const Rr = (1 - k13) * from1Rr + k13 * from3Rr;

	return [Bl, Br, Rl, Rr];
}

module.exports = function experiment(component1, component2, component3) {
	if (
		component1.scaleX === 1.0 && component1.scaleY === 1.0 &&
		component2.scaleX === 1.0 && component2.scaleY === 1.0 &&
		component3.scaleX === 1.0 && component3.scaleY === 1.0
	) { // 4:4:4
		console.log('4:4:4');

		const input1 = Wrapper.from(component1);
		const input2 = Wrapper.from(component2);
		const input3 = Wrapper.from(component3);

		const chromaX = input2.xRes;
		const chromaY = input2.yRes;

		const output2 = new Wrapper(chromaX, chromaY);
		const output3 = new Wrapper(chromaX, chromaY);

		// color diffusion, experimental
		for (let y = 0; y < chromaY; y++) {
			for (let x = 0; x < chromaX; x++) {
				const Y  = input1.get(x, y);

				const Cb = input2.get(x, y);
				const Cr = input3.get(x, y);

				const [clampedCb, clampedCr] = clampCbCr(Y, Cb, Cr);

				output2.set(x, y, clampedCb);
				output3.set(x, y, clampedCr);

				const errorCb = Cb - clampedCr;

				const vRCb = input2.get(x + 1, y    );
				const vLCb = input2.get(x - 1, y + 1);
				const vBCb = input2.get(x    , y + 1);

				input2.set(x + 1, y    , vRCb + errorCb / 2);
				input2.set(x - 1, y + 1, vLCb + errorCb / 4);
				input2.set(x    , y + 1, vBCb + errorCb / 4);

				const errorCr = Cr - clampedCr;

				const vRCr = input3.get(x + 1, y    );
				const vLCr = input3.get(x - 1, y + 1);
				const vBCr = input3.get(x    , y + 1);

				input3.set(x + 1, y    , vRCr + errorCr / 2);
				input3.set(x - 1, y + 1, vLCr + errorCr / 4);
				input3.set(x    , y + 1, vBCr + errorCr / 4);
			}
		}

		return [output2, output3].map(obj => obj.toComponent());
	} else if (
		component1.scaleX === 1.0 && component1.scaleY === 1.0 &&
		component2.scaleX === 0.5 && component2.scaleY === 1.0 &&
		component3.scaleX === 0.5 && component3.scaleY === 1.0
	) { // 4:2:2
		console.log('4:2:2');

		const input1 = Wrapper.from(component1);
		const input2 = Wrapper.from(component2);
		const input3 = Wrapper.from(component3);

		const lumaX = input1.xRes;
		const lumaY = input1.yRes;

		const chromaX = input2.xRes;
		const chromaY = input2.yRes;

		const output2 = new Wrapper(lumaX, lumaY);
		const output3 = new Wrapper(lumaX, lumaY);

		for (let y = 0; y < chromaY; y++) {
			for (let x = 0; x < chromaX; x++) {
				const x2 = x * 2;
				const L1 = input1.get(x2 - 2, y);
				const L2 = input1.get(x2 - 1, y);
				const L3 = input1.get(x2    , y);
				const L4 = input1.get(x2 + 1, y);
				const L5 = input1.get(x2 + 2, y);
				const L6 = input1.get(x2 + 3, y);
				const B1 = input2.get(x - 1, y);
				const B2 = input2.get(x    , y);
				const B3 = input2.get(x + 1, y);
				const R1 = input3.get(x - 1, y);
				const R2 = input3.get(x    , y);
				const R3 = input3.get(x + 1, y);
				let [Bl, Br, Rl, Rr] = adaptiveSupersampler(
					L1, L2, L3, L4, L5, L6,
					B1, B2, B3, R1, R2, R3
				);
				[Bl, Rl, Br, Rr] = clampTwoCbCr(L3, Bl, Rl, L4, Br, Rr);
				output2.set(x2    , y, Bl);
				output2.set(x2 + 1, y, Br);
				output3.set(x2    , y, Rl);
				output3.set(x2 + 1, y, Rr);
			}
		}

		return [output2, output3].map(obj => obj.toComponent());
	} else if (
		component1.scaleX === 1.0 && component1.scaleY === 1.0 &&
		component2.scaleX === 0.5 && component2.scaleY === 0.5 &&
		component3.scaleX === 0.5 && component3.scaleY === 0.5
	) { // 4:2:0
		console.log('4:2:0');

		const input1 = Wrapper.from(component1);
		const input2 = Wrapper.from(component2);
		const input3 = Wrapper.from(component3);

		const lumaX = input1.xRes;
		const lumaY = input1.yRes;

		const chromaX = input2.xRes;
		const chromaY = input2.yRes;

		// step 1
		const intermediate1 = new Wrapper(chromaX, lumaY, 0.5);
		const intermediate2 = new Wrapper(chromaX, lumaY, 0.5);
		const intermediate3 = new Wrapper(chromaX, lumaY, 0.5);

		for (let y = 0; y < lumaY; y++) {
			for (let x = 0; x < chromaX; x++) {
				const x2 = x * 2;
				const Y0 = input1.get(x2    , y);
				const Y1 = input1.get(x2 + 1, y);
				const Y = (Y0 + Y1) / 2;
				intermediate1.set(x, y, Y);
			}
		}

		for (let y = 0; y < chromaY; y++) {
			for (let x = 0; x < chromaX; x++) {
				const y2 = y * 2;
				const L1 = intermediate1.get(x, y2 - 2);
				const L2 = intermediate1.get(x, y2 - 1);
				const L3 = intermediate1.get(x, y2    );
				const L4 = intermediate1.get(x, y2 + 1);
				const L5 = intermediate1.get(x, y2 + 2);
				const L6 = intermediate1.get(x, y2 + 3);
				const B1 = input2.get(x, y - 1);
				const B2 = input2.get(x, y    );
				const B3 = input2.get(x, y + 1);
				const R1 = input3.get(x, y - 1);
				const R2 = input3.get(x, y    );
				const R3 = input3.get(x, y + 1);
				let [Bl, Br, Rl, Rr] = adaptiveSupersampler(
					L1, L2, L3, L4, L5, L6,
					B1, B2, B3, R1, R2, R3
				);
				[Bl, Rl, Br, Rr] = clampTwoCbCr(L3, Bl, Rl, L4, Br, Rr);
				intermediate2.set(x, y2    , Bl);
				intermediate2.set(x, y2 + 1, Br);
				intermediate3.set(x, y2    , Rl);
				intermediate3.set(x, y2 + 1, Rr);
			}
		}

		// step 2
		const output2 = new Wrapper(lumaX, lumaY);
		const output3 = new Wrapper(lumaX, lumaY);

		for (let y = 0; y < lumaY; y++) {
			for (let x = 0; x < chromaX; x++) {
				const x2 = x * 2;
				const L1 = input1.get(x2 - 2, y);
				const L2 = input1.get(x2 - 1, y);
				const L3 = input1.get(x2    , y);
				const L4 = input1.get(x2 + 1, y);
				const L5 = input1.get(x2 + 2, y);
				const L6 = input1.get(x2 + 3, y);
				const B1 = intermediate2.get(x - 1, y);
				const B2 = intermediate2.get(x    , y);
				const B3 = intermediate2.get(x + 1, y);
				const R1 = intermediate3.get(x - 1, y);
				const R2 = intermediate3.get(x    , y);
				const R3 = intermediate3.get(x + 1, y);
				let [Bl, Br, Rl, Rr] = adaptiveSupersampler(
					L1, L2, L3, L4, L5, L6,
					B1, B2, B3, R1, R2, R3
				);
				[Bl, Rl, Br, Rr] = clampTwoCbCr(L3, Bl, Rl, L4, Br, Rr);
				output2.set(x2    , y, Bl);
				output2.set(x2 + 1, y, Br);
				output3.set(x2    , y, Rl);
				output3.set(x2 + 1, y, Rr);
			}
		}

		return [output2, output3].map(obj => obj.toComponent());
	} else {
		console.log('not supported');
		return [component2, component3];
	}
};
