import type { PackageSpec } from '../internal.types.mjs';
import { FetchPackageRegistry } from './package.mjs';
import type { WritableAccessModel } from './index.mjs';
export declare class NodeFetchPackageRegistry extends FetchPackageRegistry {
    private request;
    constructor(am: WritableAccessModel, request: any);
    pullPackageData(path: PackageSpec): Uint8Array | undefined;
}
//# sourceMappingURL=package.node.d.mts.map