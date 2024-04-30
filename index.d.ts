type EmitterEvent = {
	type: 'error',
	data: Error
} | {
	type: 'state',
	data: 'error' | 'transfer_timeout' | 'connected' | 'auth_sent' | 'done' | 'resend_invite' | 'invite_timeout' | 'invite_sent' | 'invite_accepted' | 'need_auth'
} | {
	type: 'progress',
	data: { sent: number, total: number }
}
declare module 'esp-ota' {

    import EventEmitter = require("events");
    import net = require("net");

    class EspOTA extends EventEmitter {
        static U_FLASH: number;
        static U_SPIFFS: number;
        static FLASH: number;
        static SPIFFS: number;

        constructor(serverHost?: string, serverPort?: number, chunkSize?: number, timeout?: number);

        setPassword(password: string): void;
        uploadFirmware(filename: string, address: string, port?: number): Promise<void>;
        uploadSPIFFS(filename: string, address: string, port?: number): Promise<void>;
        uploadFile(filename: string, address: string, port?: number, target?: number): Promise<void>;
        uploadBuffer(buffer: Buffer, address: string, port?: number, target?: number): Promise<void>;
        handleTransfer(socket: net.Socket, fileInfo: { md5sum: string, filesize: number }): Promise<void>;
        initServer(): Promise<net.Server>;
        getFileInfo(): Promise<{ md5sum: string, filesize: number }>;
        getBufferInfo(): Promise<{ md5sum: string, filesize: number }>;
        authenticate(data: string): void;
        sendInvitation(command: number, fileInfo: { md5sum: string, filesize: number }, port: number, retries?: number): Promise<void>;
		on<T extends EmitterEvent["type"]>(event: T, listener: (data: Extract<EmitterEvent, { type: T }>['data']) => void): this;
    }

    export = EspOTA;
}