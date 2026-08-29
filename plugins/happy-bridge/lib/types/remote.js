/** Typert Remote for the settings card: pairing status, start, disconnect. */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/**
 * Host RPC the browser settings card calls.
 */
let HappyBridgeService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _getStatus_decorators;
    let _startPairing_decorators;
    let _disconnect_decorators;
    let _rePair_decorators;
    return class HappyBridgeService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _getStatus_decorators = [Remote('getStatus')];
            _startPairing_decorators = [Remote('startPairing')];
            _disconnect_decorators = [Remote('disconnect')];
            _rePair_decorators = [Remote('rePair')];
            __esDecorate(this, null, _getStatus_decorators, { kind: "method", name: "getStatus", static: false, private: false, access: { has: obj => "getStatus" in obj, get: obj => obj.getStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _startPairing_decorators, { kind: "method", name: "startPairing", static: false, private: false, access: { has: obj => "startPairing" in obj, get: obj => obj.startPairing }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _disconnect_decorators, { kind: "method", name: "disconnect", static: false, private: false, access: { has: obj => "disconnect" in obj, get: obj => obj.disconnect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _rePair_decorators, { kind: "method", name: "rePair", static: false, private: false, access: { has: obj => "rePair" in obj, get: obj => obj.rePair }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /** Live bridge; swapped when settings rebuild. */
        live = __runInitializers(this, _instanceExtraInitializers);
        /**
         * @param ctx - Host context.
         */
        constructor(ctx) {
            super(ctx, 'happyBridge');
        }
        /**
         * Current pairing / connection snapshot, including a QR data URL while pairing.
         * @returns status for the settings card.
         */
        async getStatus() {
            if (this.live === undefined) {
                return { paired: false, pairing: false, serverUrl: '' };
            }
            return this.live.status();
        }
        /**
         * Start or resume pairing.
         */
        async startPairing() {
            await this.live?.beginPairing();
            return this.getStatus();
        }
        /**
         * Disconnect Happy. The web UI keeps running.
         */
        async disconnect() {
            await this.live?.disconnect();
            return this.getStatus();
        }
        /**
         * Drop the current login and start a fresh QR pairing.
         */
        async rePair() {
            await this.live?.rePair();
            return this.getStatus();
        }
    };
})();
export { HappyBridgeService };
//# sourceMappingURL=remote.js.map