// NOTE: All paths are relative to the package.json that will be loading this configuration file.
// Making them relative to the scripts folder will break the commands
module.exports = {
    "productName": "BlueBubbles",
    "appId": "com.BlueBubbles.BlueBubbles-Server",
    "electronVersion": "42.4.1",
    "npmRebuild": true,
    "directories": {
        "output": "releases",
        "buildResources": "appResources"
    },
    "asar": true,
    // Native bindings must live OUTSIDE the asar (dlopen needs a real path).
    // smartUnpack catches node-mac-*, but better-sqlite3 takes the prebuilt-install
    // path and is missed — unpack all .node plus the whole better-sqlite3 module.
    "asarUnpack": [
        "**/*.node",
        "**/node_modules/better-sqlite3/**"
    ],
    // Embed the bbd backend the Electron shell forks (utilityProcess) — its bundled
    // CJS entry plus the minimal native runtime it can't bundle (better-sqlite3 +
    // bindings; node-mac-* for contacts/permissions, which degrade gracefully if absent).
    // The forked process resolves these from resources/bbd/node_modules.
    "extraResources": [
        "appResources",
        { "from": "../bbd/dist/daemon-entry.cjs", "to": "bbd/daemon-entry.cjs" },
        { "from": "../../node_modules/better-sqlite3", "to": "bbd/node_modules/better-sqlite3" },
        { "from": "../../node_modules/bindings", "to": "bbd/node_modules/bindings" },
        { "from": "../../node_modules/file-uri-to-path", "to": "bbd/node_modules/file-uri-to-path" },
        { "from": "../../node_modules/node-mac-contacts", "to": "bbd/node_modules/node-mac-contacts" },
        { "from": "../../node_modules/node-mac-permissions", "to": "bbd/node_modules/node-mac-permissions" }
    ],
    "mac": {
        "category": "public.app-category.social-networking",
        "publish": [
            {
                "provider": "github",
                "repo": "bluebubbles-server",
                "owner": "BlueBubblesApp",
                "private": false,
                "channel": "latest",
                "releaseType": "draft",
                "vPrefixedTagName": true
            }
        ],
        "target": [
            {
                "target": "dmg",
                "arch": [
                    "arm64"
                ],
            }
        ],
        "type": "distribution",
        "icon": "../../icons/macos/dock-icon.png",
        "darkModeSupport": true,
        "hardenedRuntime": true,
        "notarize": false,
        "entitlements": "./scripts/entitlements.mac.plist",
        "entitlementsInherit": "./scripts/entitlements.mac.plist",
        "extendInfo": {
            "NSContactsUsageDescription": "BlueBubbles needs access to your Contacts",
            "NSAppleEventsUsageDescription": "BlueBubbles needs access to run AppleScripts",
            "NSSystemAdministrationUsageDescription": "BlueBubbles needs access to manage your system",
        },
        "gatekeeperAssess": false,
        "minimumSystemVersion": "26.0",
        "signIgnore": [
            "ngrok$",
            "zrok$",
            "cloudflared$"
        ],
    },
    "dmg": {
        "sign": false,
        "writeUpdateInfo": false
    },
    // "afterSign": "./scripts/notarize.js"
};
