const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getSentryExpoConfig(projectRoot);

// npm workspaces hoist deps to the repo root; without these settings Metro can
// resolve duplicate copies of react / @tanstack/react-query and break context
// (e.g. "No QueryClient set" on login even though Providers is mounted).
config.watchFolders = [monorepoRoot];

config.resolver = config.resolver ?? {};
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@customer": path.resolve(projectRoot, "src/modes/customer"),
  "@technician": path.resolve(projectRoot, "src/modes/technician"),
  react: path.resolve(monorepoRoot, "node_modules/react"),
  "react-dom": path.resolve(monorepoRoot, "node_modules/react-dom"),
  "@tanstack/react-query": path.resolve(
    monorepoRoot,
    "node_modules/@tanstack/react-query",
  ),
  "@tanstack/query-core": path.resolve(
    monorepoRoot,
    "node_modules/@tanstack/query-core",
  ),
};

module.exports = config;
