import { EventEmitter } from 'node:events';
export const sockets = [];
export let metadataHandler;
export function setMetadataHandler(handler) { metadataHandler = handler; }
export class FakeSocket extends EventEmitter {
  connected = true;
  sent = [];
  volatile = this;
  timeout() { return this; }
  emit(name, data, callback) {
    this.sent.push({ name, data });
    if (name === 'rpc-register') queueMicrotask(() => super.emit('rpc-registered', data));
    if (name === 'update-metadata') {
      if (metadataHandler) metadataHandler(this, data, callback);
      else {
        this.receive('update', { body: { t: 'update-session', metadata: { version: data.expectedVersion + 1, value: data.metadata } } });
        callback(null, { result: 'success', version: data.expectedVersion + 1, metadata: data.metadata });
      }
    }
    return true;
  }
  receive(name, data) { return super.emit(name, data); }
  disconnect() { this.connected = false; }
}
export function io() { const socket = new FakeSocket(); sockets.push(socket); return socket; }
