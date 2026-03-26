export interface ElementChildren {
    tagName: string;
    getAttribute(name: string): string | null;
    cloneNode(deep: boolean): unknown;
}
export type TargetViewInstruction<T> = ['append', T] | ['reuse', number] | ['remove', number];
export type PatchPair<T> = [T, T];
export type ViewTransform<U> = [TargetViewInstruction<U>[], PatchPair<U>[]];
export declare function interpretTargetView<T extends ElementChildren, U extends T = T>(originChildren: T[], targetChildren: T[], tIsU?: (_x: T) => _x is U): ViewTransform<U>;
export type OriginViewInstruction<T> = ['insert', number, T] | ['swap_in', number, number] | ['remove', number];
export declare function changeViewPerspective<T extends ElementChildren, U extends T = T>(originChildren: T[], targetView: TargetViewInstruction<U>[], tIsU?: (_x: T) => _x is U): OriginViewInstruction<U>[];
export declare function patchRoot(prev: SVGElement, next: SVGElement): void;
//# sourceMappingURL=patch.d.mts.map