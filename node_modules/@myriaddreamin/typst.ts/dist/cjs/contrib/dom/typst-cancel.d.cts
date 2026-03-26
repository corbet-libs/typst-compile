export declare class TypstCancellationToken {
    isCancellationRequested: boolean;
    private _onCancelled;
    private _onCancelledResolveResolved;
    constructor();
    cancel(): Promise<void>;
    isCancelRequested(): boolean;
    consume(): Promise<void>;
    wait(): Promise<void>;
}
//# sourceMappingURL=typst-cancel.d.mts.map