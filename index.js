/*
 * EspOTA for node.js > 8.5
 *
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

const fs = require('fs');
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const U_FLASH = 0;
const U_SPIFFS = 100;
const U_AUTH = 200;

/* TODO: Class should fully support multiple operations on a single instance */

function fsReadPromise(fd, buffer, chunkSize) {
	return new Promise((resolve, reject) => {
		fs.read(fd, buffer, 0, chunkSize, null, async (err, bytesRead) => {
			if (err) {
				return reject(err);
			}

			resolve(bytesRead);
		});
	});
}

const md5 = data => crypto.createHash('md5').update(data).digest('hex');

class EspOTA extends EventEmitter {

	constructor(serverHost = "0.0.0.0", serverPort = 0, chunkSize = 1460, timeout = 10) {
		super();
		this.serverHost = serverHost;
		this.serverPort = serverPort;
		this.chunkSize = chunkSize || 1460;
		this.timeoutTime = timeout * 1000;

		this.udpsocket = dgram.createSocket('udp4');
	}

	TARGET = { U_FLASH: 0, U_SPIFFS: 100 };

	setPassword(passsword) {
		if (passsword !== undefined) {
			this.passsword = md5(passsword);
		} else {
			this.passsword = undefined;
		}
	}

	async uploadFirmware(filename, address, port = 3232) {
		await this.uploadFile(filename, address, port, U_FLASH);
	}

	async uploadSPIFFS(filename, address, port = 3232) {
		await this.uploadFile(filename, address, port, U_SPIFFS);
	}

	async uploadFile(filename, address, port = 8266, target = U_FLASH) {
		this.filename = filename;
		this.address = address;
		this.port = port;

		const fileInfo = await this.getFileInfo();

		const server = await this.initServer();
		const sendInvitationPromise = this.sendInvitation(target, fileInfo, server.address().port);

		const fileTransferPromise = new Promise((resolve, reject) => {
			server.once('connection', async (socket) => {
				server.close();
				try {
					await this.handleTransfer(socket, fileInfo);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});

		await sendInvitationPromise;
		await fileTransferPromise;
	}

	async uploadBuffer(buffer, address, port = 8266, target = U_FLASH) {
		this.buffer = buffer
		this.address = address;
		this.port = port;
		const fileInfo = await this.getBufferInfo();
		console.log(fileInfo);

		const server = await this.initServer();
		const sendInvitationPromise = this.sendInvitation(target, fileInfo, server.address().port);

		const fileTransferPromise = new Promise((resolve, reject) => {
			server.once('connection', async (socket) => {
				server.close();
				try {
					await this.handleTransfer(socket, fileInfo);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});

		await sendInvitationPromise;
		await fileTransferPromise;
	}

	handleTransfer(socket, fileInfo) {
		this.udpsocket.unref();
		this.emit('state', 'connected');
		this.emit('progress', 0, fileInfo.filesize);
		const buffer = new Buffer.alloc(this.chunkSize);
		let bytesTransfered = 0;
		socket.setTimeout(this.timeoutTime);

		return new Promise(async (resolve, reject) => {
			const handleTimeout = () => {
				socket.removeAllListeners();
				this.udpsocket.close();
				socket.end();
				this.emit('state', 'transfer_timeout');
				reject(new Error('Transmission timeout'));
			};
			let timeout = setTimeout(handleTimeout, this.timeoutTime);

			socket.on('data', (data) => {
				if (data.toString().match(/OK/)) {
					clearTimeout(timeout);
					socket.removeAllListeners();
					socket.end();
					this.udpsocket.close();
					this.emit('state', 'done');
					resolve();
				} else {
					// Reset timer when we get data
					clearTimeout(timeout);
					timeout = setTimeout(handleTimeout, this.timeoutTime);
				}
			});

			socket.on('error', (e) => {
				this.udpsocket.close();
				clearTimeout(timeout);
				reject(e);
			});

			if(this.buffer != undefined){
				let bytesRead;
				while (1) {
					let bytesRead = this.buffer.slice(bytesTransfered, bytesTransfered + this.chunkSize).length;

					if (bytesRead > 0) {
						await new Promise(resolve => {
							socket.write(this.buffer.slice(bytesTransfered, bytesTransfered + this.chunkSize), resolve);
						});
						bytesTransfered += bytesRead;
						this.emit('progress', bytesTransfered, fileInfo.filesize);

						// Wait for client to ack
						await new Promise(resolve => {
							socket.once('data', () => {
								resolve();
							});
						});
					}

					if (bytesRead < this.chunkSize) {
						break;
					}
				}
			}else{
			fs.open(this.filename, 'r', async (err, fd) => {
				if (err) {
					this.udpsocket.close();
					clearTimeout(timeout);
					return reject(err);
				}

				let bytesRead;
				while (1) {
					let bytesRead = await fsReadPromise(fd, buffer, this.chunkSize);

					if (bytesRead > 0) {
						await new Promise(resolve => {
							socket.write(buffer.slice(0, bytesRead), resolve);
						});
						bytesTransfered += bytesRead;
						this.emit('progress', bytesTransfered, fileInfo.filesize);

						// Wait for client to ack
						await new Promise(resolve => {
							socket.once('data', () => {
								resolve();
							});
						});
					}

					if (bytesRead < this.chunkSize) {
						fs.close(fd, () => {});
						break;
					}
				}

				// Done sending, wait for response from esp32
			});
			}
		});
	}

	initServer() {
		return new Promise((resolve, reject) => {
			try {
				let server = net.createServer();
				server.listen(this.serverPort, () => {
					resolve(server);
				}).unref();
			} catch (e) {
				reject(e);
			}
		});
	}

	async getFileInfo() {
		// Calculate md5 of entire file without using a lot of memory
		const md5sum = await new Promise((resolve, reject) => {
			const hash = crypto.createHash('md5');
			const buffer = new Buffer.alloc(this.chunkSize);

			fs.open(this.filename, 'r', async (err, fd) => {
				if (err) {
					return reject(err);
				}

				let bytesRead;
				let exitLoop = false;
				while (!exitLoop) {
					let bytesRead = await fsReadPromise(fd, buffer, this.chunkSize);

					if (bytesRead > 0) {
						hash.update(buffer.slice(0, bytesRead));
					}

					if (bytesRead < this.chunkSize) {
						break;
					}
				}

				resolve(hash.digest('hex'));
			});
		});

		const filesize = await new Promise((resolve, reject) => {
			fs.stat(this.filename, (err, stat) => {
				if (err) {
					return reject(err);
				}

				resolve(stat.size);
			});
		});

		return { md5sum, filesize };
	}

	async getBufferInfo() {
		// Calculate md5 of entire file without using a lot of memory
		const hash = crypto.createHash('md5');
		hash.update(this.buffer.slice());
		const md5sum = hash.digest('hex');
		const filesize = this.buffer.length

		return { md5sum, filesize };
	}

	authenticate(data) {
		let match = data.match(/AUTH (\S+)/);
		if (match) {
			const nonce = match[1];
			const client_nonce = md5(nonce + this.address + String(Date.now()));
			const challenge = `${this.passsword}:${nonce}:${client_nonce}`;
			const md5sum = md5(challenge);

			const buf = new Buffer.from(`${U_AUTH} ${client_nonce} ${md5sum}\n`);
			this.udpsocket.send(buf, 0, buf.length, this.port, this.address, () => {
				this.emit('state', 'auth_sent');
			});
		}
	}

	sendInvitation(command, fileInfo, port, retries = 0) {
		return new Promise((resolve, reject) => {

			const timeout = setTimeout(async () => {
				if (retries < 5) {
					try {
						this.emit('state', 'resend_invite');
						await this.sendInvitation(command, fileInfo, port, retries + 1);
					} catch (e) {
						reject(e);
					}
				} else {
					this.emit('state', 'invite_timeout');
					this.udpsocket.close();
					reject('Invite timeout');
				}
			}, 2000);

			const buf = new Buffer.from(`${command} ${port} ${fileInfo.filesize} ${fileInfo.md5sum}`);

			this.udpsocket.send(buf, 0, buf.length, this.port, this.address, () => {
				this.emit('state', 'invite_sent');
			});
			this.udpsocket.on('message', (data) => {
				let stringData = data.toString();

				if (stringData.match(/OK/)) {
					clearTimeout(timeout);
					this.emit('state', 'invite_accepted');
					return resolve();
				} else if (stringData.match(/AUTH/)) {
					this.emit('state', 'need_auth');
					this.authenticate(stringData);
				}
			});
		});
	}
}

module.exports = EspOTA;