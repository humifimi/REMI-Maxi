/**
 * Cross-platform postinstall (Windows-safe).
 * Replaces `rm -rf ... && patch-package` from package.json.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");

const nestedDirs = [
  "vendor/react-native-draggable-flatlist/node_modules/react-native",
  "vendor/react-native-draggable-flatlist/node_modules/react-native-reanimated",
];

for (const rel of nestedDirs) {
  const target = path.join(root, rel);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

execSync("npx patch-package", { stdio: "inherit", cwd: root, shell: true });
