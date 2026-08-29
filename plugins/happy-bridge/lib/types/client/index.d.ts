/** Browser half: Happy remote card on Settings → Plugins. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type HappyBridgeKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'happy-bridge': HappyBridgeKey;
    }
}
/** Required client services. */
export declare const inject: string[];
/**
 * Register the Happy remote card under the `happy-bridge` settings namespace.
 * @param ctx - browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map