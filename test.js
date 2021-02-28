var EspOTA = require('./index');

async function testota() {
	let testme = new EspOTA();

	testme.on('progress', (current, total) => {
		process.stdout.write(`${current} / ${total}     \r`);
	});

	testme.on('state', (state) => {
		console.log("");
		console.log("STATE: ", state);
		console.log("");
	});

	testme.setPassword('teste');

	try {
		await testme.uploadFile('firmware.bin', '127.0.0.1', 3232, EspOTA.FLASH);
		process.stdout.write("\n");
		console.log("DONE");
	} catch (e) {
		console.log("Handeled exception: ", e);
		console.log("Aborted");
	}
}

testota();
