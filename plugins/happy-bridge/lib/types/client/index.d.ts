/** Browser half: Happy remote configuration on its Plugins bundle page. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type HappyBridgeKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'happy-bridge': HappyBridgeKey;
    }
}
/** Required client services. */
export declare const inject: string[];
/**
 * Register the Happy remote page using its Loader entry configuration.
 * @param ctx - browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map