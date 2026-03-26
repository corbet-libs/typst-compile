import { FsAccessModel } from '../internal.types.mjs';
import { WritableAccessModel } from './index.mjs';
export interface FetchAccessOptions {
    polyfillHeadRequest?: boolean;
    fullyCached?: boolean;
}
export declare class FetchAccessModel implements FsAccessModel, WritableAccessModel {
    private root;
    fullyCached: boolean;
    mTimes: Map<string, Date | undefined>;
    mRealPaths: Map<string, string | undefined>;
    mData: Map<string, Uint8Array | undefined>;
    constructor(root: string, options?: FetchAccessOptions);
    reset(): void;
    resolvePath(path: string): string;
    insertFile(path: string, data: Uint8Array, mtime: Date): void;
    removeFile(path: string): void;
    getPreloadScript(): Promise<string>;
    getLastModified(path: string): string | null;
    getMTimeInternal(path: string): Date | undefined;
    getMTime(path: string): Date | undefined;
    isFile(): boolean | undefined;
    getRealPath(path: string): string | undefined;
    readAllInternal(path: string): Uint8Array | undefined;
    readAll(path: string): Uint8Array | undefined;
}
//# sourceMappingURL=fetch.d.mts.map