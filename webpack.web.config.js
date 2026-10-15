const path = require('path');
const fs = require('fs');

// Public path for GitHub project pages, e.g. /TerraformEditor/ for
// https://<owner>.github.io/TerraformEditor/. Override with --env PUBLIC_PATH.
module.exports = (env = {}) => {
  const publicPath = env.PUBLIC_PATH ?? '/TerraformEditor/';
  return {
    mode: 'production',
    entry: './src/renderer/renderer.ts',
    target: 'web',
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.ts$/,
          include: /src/,
          use: [{ loader: 'ts-loader', options: { transpileOnly: false } }],
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    output: {
      path: path.resolve(__dirname, 'web'),
      filename: 'renderer.js',
      publicPath: publicPath,
      // web/index.html is source-controlled; never wipe the output folder.
      clean: false,
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@common': path.resolve(__dirname, 'src/common/'),
        '@renderer': path.resolve(__dirname, 'src/renderer/'),
      },
    },
    plugins: [
      {
        apply: compiler => {
          compiler.hooks.afterEmit.tap('CopyStaticAssets', () => {
            const webDir = path.resolve(__dirname, 'web');
            fs.copyFileSync(path.resolve(__dirname, 'styles.css'), path.join(webDir, 'styles.css'));
            // Blockly media must be served from the app origin (strict CSP
            // blocks the default external CDN host).
            fs.cpSync(path.resolve(__dirname, 'node_modules', 'blockly', 'media'), path.join(webDir, 'media'), {
              recursive: true,
            });
          });
        },
      },
    ],
    performance: {
      hints: 'error',
      // Blockly is a large dependency; enforce an explicit ceiling of 1 MiB
      // so bundle growth beyond this fails the build (warnings are errors).
      maxAssetSize: 1024 * 1024,
      maxEntrypointSize: 1024 * 1024,
    },
  };
};
