import { TypstRenderer } from './renderer.mjs';
import { GConstructor, TypstDocumentContext } from './contrib/dom/typst-doc.mjs';
export interface ITypstDomDocument {
    mountDom(pixelPerPt: number | undefined): Promise<void>;
}
export interface InitDomDocArgs {
    renderer: TypstRenderer;
    domScale?: number;
}
export declare function provideDomDoc<TBase extends GConstructor<TypstDocumentContext<InitDomDocArgs>>>(Base: TBase): TBase & GConstructor<ITypstDomDocument>;
declare const TypstDomDocument_base: new (options: import("./contrib/dom/typst-doc.mjs").Options & InitDomDocArgs) => import("./contrib/dom/typst-doc.mjs").TypstDocument<TypstDocumentContext<InitDomDocArgs> & ITypstDomDocument>;
export declare class TypstDomDocument extends TypstDomDocument_base {
}
export {};
//# sourceMappingURL=dom.d.mts.map