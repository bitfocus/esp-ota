/*
 * Copyright (c) 2019 Bitfocus AS
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

 // WARNING: This script is just a hack to test the library.

var net = require('net');
var dgram = require('dgram');
var testsocket = dgram.createSocket('udp4');
const crypto = require('crypto');

let testAuth = undefined;
//let testAuth = crypto.createHash('md5').update('password').digest('hex');

let state = 'idle';
let fileInfo;
let nonce;

testsocket.bind(3232);
testsocket.on('message', (buf, info) => {
	let data = buf.toString().trim();
	console.log("Message: ", data);
	let split = data.split(/\s+/);

	if (state === 'idle' && split.length === 4) {
		if (split[0] === '0') {
			if (testAuth) {
				nonce = crypto.createHash('md5').update(String(Date.now())).digest('hex');
				testsocket.send(`AUTH ${nonce}\n`, info.port, info.address);
				console.log(`AUTH ${nonce}\n`);
				fileInfo = split;
				state = 'wait_auth';
			} else {
				console.log("OK");
				transfer(info, split);
			}
		}
	}
	else if (state === 'wait_auth') {
		state = 'idle';
		if (split[0] === '200' && split.length === 3) {
			const [ cmd, client_nonce, sum ] = split;

			const challenge = `${testAuth}:${nonce}:${client_nonce}`;
			console.log("challenge:", challenge);
			const md5sum = crypto.createHash('md5').update(challenge).digest('hex');

			if (md5sum === sum) {
				console.log("OK");
				transfer(info, fileInfo);
			} else {
				console.log("AUTH FAILED ", { md5sum, sum });
			}
		}
	}
});

function transfer(info, split) {
	testsocket.send('OK', info.port, info.address);

	let conn = net.createConnection(split[1], info.address, () => {
		console.log("Connected, waiting for file");
		const hash = crypto.createHash('md5');
		let total = 0;

		conn.on('data', (chunk) => {
			total += chunk.length;
			hash.update(chunk);
			conn.write(String(chunk.length));
			process.stdout.write("received " + total + " / " + split[2] + "    \r");
			if (total === parseInt(split[2])) {
				let sum = hash.digest('hex');
				console.log("");
				console.log("Compare MD5sums: ");
				console.log(split[3], ' === ', sum);
				if (sum === split[3]) {
					conn.write('OK');
				}
			}
		});
	});
	conn.on('error', () => {
		console.log("retry");
		setTimeout(() => {
			transfer(info, split);
		}, 500);
	});
}
