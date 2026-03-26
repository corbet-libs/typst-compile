import type { InitOptions } from '../options.init.mjs';
import type { TypstRenderer } from '../renderer.mjs';
export declare function getGlobalRenderer(): TypstRenderer | undefined;
export declare function createGlobalRenderer(creator: () => TypstRenderer, initOptions?: Partial<InitOptions>): Promise<TypstRenderer>;
export declare function withGlobalRenderer(creator: () => TypstRenderer, initOptions: Partial<InitOptions> | undefined, resolve: (renderer: TypstRenderer) => void, reject?: (err: any) => void): void;
//# sourceMappingURL=global-renderer.d.mts.map