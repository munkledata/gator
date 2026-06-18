// Legacy server code reads Electron's historical `File.path` augmentation (removed in
// Electron 32+, use webUtils.getPathForFile). These call sites are in code the bbd
// backend now supersedes; declared here so the build typechecks. The renderer-side
// equivalent lives in packages/ui/src/react-app-env.d.ts.
interface File {
    readonly path: string;
}
