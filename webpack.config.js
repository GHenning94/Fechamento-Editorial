"use strict";

const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/index.ts",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "index.js",
    },
    devtool: isProduction ? false : "source-map",
    resolve: {
      extensions: [".ts", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    plugins: [
      new CleanWebpackPlugin(),
      new MiniCssExtractPlugin({ filename: "styles.css" }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "src/index.html", to: "index.html" },
          { from: "manifest.json", to: "manifest.json" },
          { from: "VERSION", to: "VERSION", toType: "file", noErrorOnMissing: true },
          { from: "changelog.json", to: "changelog.json", toType: "file", noErrorOnMissing: true },
          { from: "icons", to: "icons", noErrorOnMissing: true },
          { from: "src/assets/work-spinner.gif", to: "icons/work-spinner.gif" },
          { from: "src/assets/update-download.png", to: "icons/update-download.png" },
        ],
      }),
    ],
    externals: {
      uxp: "commonjs2 uxp",
      indesign: "commonjs2 indesign",
      "indesign-20.0": "commonjs2 indesign-20.0",
      "indesign-19.0": "commonjs2 indesign-19.0",
      "indesign-18.5": "commonjs2 indesign-18.5",
      os: "commonjs2 os",
      fs: "commonjs2 fs",
      clipboard: "commonjs2 clipboard",
    },
    optimization: {
      minimize: isProduction,
    },
  };
};
