/**
 * The reference of a WebAssembly module which is copied from the wasm-bindgen
 * @see https://github.com/rustwasm/wasm-bindgen/blob/2c622715c9e6602f7bb377828c72f7953b178ed7/crates/cli-support/src/js/mod.rs#L656
 *
 * Your most common use case will be to pass a URL to a wasm file here.
 * + `WebAssembly.Module` - An instantiated wasm module.
 * + `URL` - Remote url to a wasm file
 * + `BufferSource` - An ArrayBufferView or an ArrayBuffer
 */
export type WebAssemblyModuleRef = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
//# sourceMappingURL=wasm.d.mts.map