# ONNX モデルファイル

このディレクトリには、NDLKotenOCR Web 版で使用する ONNX モデルファイルを配置します。

## 必要なモデルファイル

1. **rtmdet.onnx** - レイアウト認識モデル
2. **parseq.onnx** - 文字認識モデル

## モデルファイルの入手方法

これらのモデルファイルは、[ndlkotenocr-lite](https://github.com/ndl-lab/ndlkotenocr-lite) リポジトリから入手できます。

1. ndlkotenocr-lite リポジトリをクローンまたはダウンロードします。

   ```bash
   git clone https://github.com/ndl-lab/ndlkotenocr-lite.git
   ```

2. `model` ディレクトリ内の以下のファイルをこのディレクトリにコピーします。
   - `model/rtmdet-s-1280x1280.onnx` → `models/rtmdet.onnx`
   - `model/parseq-ndl-32x384-tiny-10.onnx` → `models/parseq.onnx`

## 注意事項

- モデルファイルは大きいため、このリポジトリには含まれていません。
- モデルファイルは、ndlkotenocr-lite のライセンスに従って使用してください。
