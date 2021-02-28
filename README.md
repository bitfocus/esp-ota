# esp-ota

[![Donate](https://img.shields.io/badge/donate-%3C3-blueviolet.svg)](https://donorbox.org/bitfocus-esp-ota)

A library for uploading files to FLASH (firmware) or SPIFFS filesystem on ESP32 and ESP8266 devices that uses `ArduinoOTA`.

It uses promises for main operation. But you can listen for 'state' and 'progress' events to get more information during the file transfer.

## Installation

```bash
npm install esp-ota
```

## Example

Here's a simple example of how to use this in a console-environment:

```js
var EspOTA = require('esp-ota');

var esp = new EspOTA();

esp.uploadFile('/path/to/firmware.bin', '10.0.0.1', 3232, EspOTA.FLASH)
	.then(function () {
		console.log("Done");
	})
	.catch(function (error) {
		console.error("Transfer error: ", error);
	});
```


Here's a more elaborate example showing more of the possibilities.

```js
var EspOTA = require('esp-ota');

var esp = new EspOTA(); // Optional arguments in this order: (bindAddress, bindPort, chunkSize, secondsTimeout)

esp.on('state', function (state) {
	console.log("Current state of transfer: ", state);
});

esp.on('progress', function (current, total) {
	console.log("Transfer progress: " + Math.round(current / total * 100) + "%");
});

// If you need to authenticate, uncomment the following and change the password
// esp.setPassword('admin');

var transfer = esp.uploadFile('/path/to/firmware.bin', '10.0.0.1', 3232, EspOTA.FLASH);

transfer
	.then(function () {
		console.log("Done");
	})
	.catch(function (error) {
		console.error("Transfer error: ", error);
	});
```

## Methods

For all functions below with port and/or target parameters, the default port is 3232, and the default target is EspOTA.FLASH.

* `setPassword(password)` - Set password before transfer
* `uploadFirmware(filename, address, port)` - Transfer firmware to FLASH of the device using the specified ip and port. This function returns a `Promise` that will succeed when the file is done transferring and accepted by the device. (an alias for `uploadFile(..., EspOTA.FLASH)`)
* `uploadSPIFFS(filename, address, port)` - Transfer SPIFFS filesystem to the device using the specified ip and port. This function returns a `Promise` that will succeed when the file is done transferring and accepted by the device. (an alias for `uploadFile(..., EspOTA.SPIFFS)`)
* `uploadFile(filename, address, port, target)` - Transfer files to target sections using the specified ip, port and target. This function returns a `Promise` that will succeed when the file is done transferring and accepted by the device.
* `uploadBuffer(buffer, address, port, target)` - Transfer method for buffers to target sections using the specified ip, port and target. This function returns a `Promise` that will succeed when the file is done transferring and accepted by the device.
* `on()` - This class extends the `EventEmitter` class, and exposes two events; `state` and `progress`.

***NOTE!*** The port for `ESP8266` devices is *8266*, and the port for `ESP32` devices is *3232*. Make sure you specify the correct one for your device.

## Flashing targets

Use these targets with `uploadFile` or `uploadBuffer` methods to specify the flashing target.

* `EspOTA.FLASH` - Upload to Main Flash.
* `EspOTA.SPIFFS` - Upload to File System.

## Possible "states"

Using the `.on('state')` event listener you can get the following events:

 * `invite_sent` - This means that a special UDP packet has been sent to the device to invite it to connect to us to download new data.
 * `resend_invite` - If nothing happens in 2 seconds, a new invite is sent. For up to 5 retries.
 * `invite_timeout` - It timed out in the invitation process. This usually either means that it has no connection with the device. But this is also eventually emitted if authentication fails, since the device fails silently.
 * `need_auth` - The device requires authentication to continue. If you have set the password previously, it will try to authenticate. If not, please set the correct password with the `.setPassword()` command before trying to upload.
 * `auth_sent` - Authentication attempt is sent to the device.
 * `invite_accepted` - The device reports that it is ready to transfer data.
 * `connected` - The device has connected to us via TCP, to receive data. This may or may not arrive before `invite_accepted`.
 * `transfer_timeout` - The transfer timed out. If this happens after you have seen that progress has transferred all data, there is a possibility that the transfer aborted due to the file transfer being corrupted. (The device checks the MD5sum of the transferred file before it accepts the new firmware and reboots)
 * `error` - Error opening file for transfer, or socket error. The specific error is sent via the promise rejection.
 * `done` - The transfer was successful, and the device is now rebooting.

## Installing the ArduinoOTA counterpart in your ESP32 code

```c++
#include <WiFi.h>
#include <ArduinoOTA.h>

const char* ssid = "..........";
const char* password = "..........";

void setup() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.waitForConnectResult() != WL_CONNECTED) {
    Serial.println("Connection Failed! Rebooting...");
    delay(5000);
    ESP.restart();
  }

  // If you want authentication, uncomment this line
  // ArduinoOTA.setPassword("admin");

  ArduinoOTA.begin();
}

void loop() {
  ArduinoOTA.handle();
}
```

## Sponsor
**Bitfocus AS**

A friendly Oslo based development company in the AV/Broadcast-industry.

www.bitfocus.io

## License

Copyright (c) 2019 Bitfocus AS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
