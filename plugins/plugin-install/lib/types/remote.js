/** 设置页调用的 Typert Remote：按包名安装 profile 插件。 */
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
import { addProfilePlugin, parseNpmPackageName, resolveInstallAnchor } from "./add.js";
/**
 * 浏览器安装页调用的 Host RPC。
 */
let PluginInstallService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _target_decorators;
    let _install_decorators;
    return class PluginInstallService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _target_decorators = [Remote('target')];
            _install_decorators = [Remote('install')];
            __esDecorate(this, null, _target_decorators, { kind: "method", name: "target", static: false, private: false, access: { has: obj => "target" in obj, get: obj => obj.target }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _install_decorators, { kind: "method", name: "install", static: false, private: false, access: { has: obj => "install" in obj, get: obj => obj.install }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /** 当前组合写入的 profile。 */
        profile = (__runInitializers(this, _instanceExtraInitializers), 'web');
        /**
         * @param ctx - Host 上下文。
         */
        constructor(ctx) {
            super(ctx, 'pluginInstall');
        }
        /**
         * 当前组合写入的 profile：浏览器为 `web`，桌面客户端为 `desktop`。
         * @returns 与 `dsh plugin --profile` 相同的名字。
         */
        async target() {
            return { profile: this.profile };
        }
        /**
         * 只接受 npm 包名，写入 {@link profile}。
         * @param packageName - 输入框原文。
         * @returns 安装结果。
         */
        async install(packageName) {
            const name = parseNpmPackageName(packageName);
            if (name === undefined) {
                return {
                    ok: false,
                    code: 2,
                    stdout: '',
                    stderr: 'plugin-install: 只接受 npm 包名（例如 @sjhmars/task-notify）',
                };
            }
            const result = addProfilePlugin(this.profile, name, resolveInstallAnchor());
            if (!result.ok)
                return result;
            return this.mountInstalled(name, result);
        }
        /**
         * Hot-mount the freshly installed package into the running tree, so a
         * first-time install takes effect without a client restart. Durability
         * across restarts is the profile manifest's job (already written); the
         * loader mount is process-local and self-healing — a failed or partial
         * mount only downgrades to "effective after restart". Mounted rows run
         * with the plugin's default config; a bundle patch carrying row config or
         * overriding other rows reaches full fidelity at the next restart.
         * @param name - the installed package name.
         * @param result - the completed install result.
         * @returns the result with the live-mount outcome appended.
         */
        async mountInstalled(name, result) {
            try {
                await this.ctx.loader.create({ name });
                return {
                    ...result,
                    stdout: `${result.stdout}\nplugin-install: ${name} 已热挂载，无需重启；界面部分刷新页面即可。`
                        .split('\n').filter(part => part.length > 0).join('\n'),
                };
            }
            catch (error) {
                return {
                    ...result,
                    stderr: `${result.stderr}\nplugin-install: 安装成功，但热挂载失败，重启后生效：${error instanceof Error ? error.message : String(error)}`
                        .split('\n').filter(part => part.length > 0).join('\n'),
                };
            }
        }
    };
})();
export { PluginInstallService };
//# sourceMappingURL=remote.js.map