# NDLKotenOCR Web 版

NDLKotenOCR Web 版は、国立国会図書館が開発した古典籍 OCR アプリケーション [ndlkotenocr-lite](https://github.com/ndl-lab/ndlkotenocr-lite) の Web ブラウザ版です。WebAssembly（WASM）と ONNX Runtime Web を使用して、ブラウザ上で古典籍の文字認識を行うことができます。

## 機能

- 画像内のテキスト領域の検出（レイアウト認識）
- 検出されたテキスト領域内の文字認識
- 日本語の古典籍に適した読み順処理
- 結果の XML/JSON/TXT 形式での出力

## 技術スタック

- **ONNX Runtime Web**: モデル推論エンジン
- **JavaScript**: 実装言語
- **HTML5 Canvas API**: 画像処理
- **WebAssembly**: パフォーマンス向上のための低レベル実行環境
- **Webpack**: モジュールバンドラー

## 必要条件

- Node.js 14.x 以上
- npm 6.x 以上

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/ndl-lab/ndlkotenocr-web.git
cd ndlkotenocr-web

# 依存パッケージのインストール
npm install
```

## 使用方法

### 開発サーバーの起動

```bash
npm start
```

これにより、開発サーバーが起動し、ブラウザで http://localhost:9000 が自動的に開きます。

### ビルド

```bash
npm run build
```

ビルドされたファイルは `dist` ディレクトリに出力されます。

## モデルファイル

このアプリケーションは、以下の ONNX モデルファイルを使用します：

- `models/rtmdet.onnx`: レイアウト認識モデル
- `models/parseq.onnx`: 文字認識モデル

## プロジェクト構造

```
ndlkotenocr-web/
├── index.html              # デモページ
├── src/
│   ├── index.js            # メインエントリーポイント
│   ├── layout-detector.js  # レイアウト認識モジュール
│   ├── text-recognizer.js  # 文字列認識モジュール
│   ├── reading-order.js    # 読み順処理モジュール
│   └── output-generator.js # 出力生成モジュール
├── models/                 # ONNXモデルファイル
│   ├── rtmdet.onnx
│   └── parseq.onnx
└── config/                 # 設定ファイル
    ├── ndl.yaml
    └── NDLmoji.yaml
```

## ライセンス

このプロジェクトは [MIT ライセンス](LICENSE) の下で公開されています。

## 謝辞

このプロジェクトは、国立国会図書館が開発した [ndlkotenocr-lite](https://github.com/ndl-lab/ndlkotenocr-lite) を基にしています。
