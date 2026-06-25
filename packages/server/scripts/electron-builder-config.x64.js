// Intel (x86_64) build config. Inherits the arm64 base verbatim and overrides only the
// arch, the macOS floor, and the native-rebuild flag.
//
// The three native addons are cross-rebuilt for x64 by build-x64.sh BEFORE this runs and
// copied into the bundle via the base config's extraResources, so npmRebuild stays OFF here
// (otherwise electron-builder would try to re-resolve them and could clobber the x64 binaries).
const base = require('./electron-builder-config.js');

module.exports = {
    ...base,
    npmRebuild: false,
    artifactName: '${productName}-${version}-x64.${ext}',
    mac: {
        ...base.mac,
        // Intel Macs top out at macOS 15 (Sequoia); 11.0 covers Big Sur → Sequoia.
        // (The arm64 base uses 26.0, which is Apple-Silicon-only.)
        minimumSystemVersion: '11.0',
        target: [
            {
                target: 'dmg',
                arch: ['x64']
            }
        ]
    }
};
