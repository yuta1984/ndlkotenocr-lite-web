const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/index.js',
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    devtool: isProduction
      ? 'source-map'
      : 'eval-source-map',
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      compress: true,
      port: 9000,
      hot: true,
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        filename: 'index.html',
        inject: false,
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'node_modules/onnxruntime-web/dist/*.wasm',
            to: '[name][ext]',
          },
          {
            from: 'models',
            to: 'models',
            noErrorOnMissing: true,
          },
          {
            from: 'config',
            to: 'config',
            noErrorOnMissing: true,
          },
          {
            from: 'public',
            to: 'public',
            noErrorOnMissing: true,
          },
        ],
      }),
    ],
    resolve: {
      extensions: ['.js'],
    },
    module: {
      rules: [
        {
          test: /\.wasm$/,
          type: 'asset/resource',
        },
      ],
    },
    experiments: {
      asyncWebAssembly: true,
    },
  };
};
