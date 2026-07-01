module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@": "./",
            "@customer": "./src/modes/customer",
            "@technician": "./src/modes/technician",
            "@profit-model": "./vendor/profit-model",
          },
          extensions: [".ios.ts", ".ios.tsx", ".ts", ".tsx", ".js", ".jsx", ".json"],
        },
      ],
    ],
  };
};
