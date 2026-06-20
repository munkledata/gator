/// <reference types="vite/client" />

// Electron historically augmented the DOM File with a local `path`. It was removed in
// Electron 32+ (use webUtils.getPathForFile) and never existed in a plain browser, but
// some legacy file-path call sites still read it. Declared here so they compile.
// TODO: rewire those via a window.bbShell.getPathForFile preload bridge (webUtils).
interface File {
    readonly path: string;
}
