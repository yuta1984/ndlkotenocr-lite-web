/**
 * NDLKotenOCR Web版 - レイアウト認識モジュール
 *
 * このファイルは、RTMDetモデルを使用して画像内のテキスト領域を検出するモジュールです。
 * 元のPythonコードのsrc/rtmdet.pyを参考に実装しています。
 */

import * as ort from 'onnxruntime-web';
import * as yaml from 'js-yaml';

/**
 * RTMDet クラス
 * 画像内のテキスト領域を検出するクラス
 */
export class RTMDet {
  /**
   * コンストラクタ
   *
   * @param {string} modelPath モデルファイルのパス
   * @param {Object} config 設定オブジェクト
   * @param {string} configPath 設定ファイルのパス（オプション）
   */
  constructor(modelPath, config = {}, configPath = null) {
    this.modelPath = modelPath;
    this.configPath = configPath;
    this.config = {
      inputShape: [1, 3, 1280, 1280], // デフォルト入力サイズ
      scoreThreshold: 0.3, // スコアの閾値
      nmsThreshold: 0.5, // NMSの閾値
      maxDetections: 100, // 最大検出数
      ...config,
    };
    this.session = null;
    this.initialized = false;
    this.classNames = ['text']; // デフォルトのクラス名
  }

  /**
   * 設定ファイルを読み込む
   *
   * @param {string} configPath 設定ファイルのパス
   * @returns {Promise<Object>} 読み込まれた設定
   */
  async loadConfig(configPath = null) {
    const path = configPath || this.configPath;
    if (!path) {
      console.log(
        '設定ファイルのパスが指定されていません。デフォルト設定を使用します。'
      );
      return this.config;
    }

    try {
      // 設定ファイルを取得
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(
          `設定ファイルの取得に失敗しました: ${response.statusText}`
        );
      }

      const yamlText = await response.text();
      const yamlConfig = yaml.load(yamlText);

      // レイアウト認識設定を取得
      if (yamlConfig && yamlConfig.layout_detection) {
        const layoutConfig = yamlConfig.layout_detection;

        // 設定を更新
        if (layoutConfig.score_threshold !== undefined) {
          this.config.scoreThreshold =
            layoutConfig.score_threshold;
        }
        if (layoutConfig.nms_threshold !== undefined) {
          this.config.nmsThreshold =
            layoutConfig.nms_threshold;
        }
        if (layoutConfig.max_detections !== undefined) {
          this.config.maxDetections =
            layoutConfig.max_detections;
        }
        if (layoutConfig.input_shape !== undefined) {
          this.config.inputShape = layoutConfig.input_shape;
        }
      }

      console.log(
        '設定ファイルを読み込みました:',
        this.config
      );
      return this.config;
    } catch (error) {
      console.warn(
        `設定ファイルの読み込みに失敗しました: ${error.message}。デフォルト設定を使用します。`
      );
      return this.config;
    }
  }

  /**
   * 初期化処理
   * 設定を読み込み、ONNXモデルをロードし、推論セッションを作成します
   *
   * @param {string} configPath 設定ファイルのパス（オプション）
   * @returns {Promise<void>}
   */
  async initialize(configPath = null) {
    try {
      // 設定ファイルを読み込む
      if (configPath || this.configPath) {
        await this.loadConfig(configPath);
      }

      // WebAssembly実行のためのオプション設定
      const options = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      };

      console.log(`モデルをロード中: ${this.modelPath}`);
      // モデルのロード
      this.session = await ort.InferenceSession.create(
        this.modelPath,
        options
      );
      console.log('モデルのロードが完了しました');

      // 入力テンソルの形状を取得 - 修正部分
      // 注意: 入力形状の取得を試みますが、失敗してもデフォルト値を使用して続行します
      try {
        if (
          this.session &&
          this.session.inputNames &&
          this.session.inputNames.length > 0
        ) {
          // デフォルトの入力形状をそのまま使用
          console.log(
            `入力名: ${this.session.inputNames[0]}`
          );
          console.log(
            `現在の入力形状: ${this.config.inputShape}`
          );
        }
      } catch (shapeError) {
        console.warn(
          '入力形状の検出に失敗しました。デフォルト形状を使用します:',
          shapeError
        );
      }

      this.initialized = true;
      console.log('RTMDet モデルの初期化が完了しました');
    } catch (error) {
      console.error(
        'RTMDet モデルの初期化に失敗しました:',
        error
      );
      throw new Error(
        `RTMDet モデルの初期化に失敗しました: ${error.message}`
      );
    }
  }

  /**
   * 画像の前処理
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 入力画像
   * @returns {Object} 前処理された画像データとメタデータ
   * @private
   */
  preprocess(imageData) {
    // 入力サイズの取得
    const [batchSize, channels, height, width] =
      this.config.inputShape;

    // 画像のサイズを取得
    let imgWidth, imgHeight;
    if (imageData instanceof ImageData) {
      imgWidth = imageData.width;
      imgHeight = imageData.height;
    } else {
      imgWidth = imageData.naturalWidth || imageData.width;
      imgHeight =
        imageData.naturalHeight || imageData.height;
    }

    // Pythonコードと同様に、正方形のパディング画像を作成
    const maxWH = Math.max(imgWidth, imgHeight);

    // Canvasを使用して画像をパディング
    const paddingCanvas = document.createElement('canvas');
    paddingCanvas.width = maxWH;
    paddingCanvas.height = maxWH;
    const paddingCtx = paddingCanvas.getContext('2d');

    // 背景を黒で塗りつぶし
    paddingCtx.fillStyle = 'rgb(0, 0, 0)';
    paddingCtx.fillRect(0, 0, maxWH, maxWH);

    // 元の画像を左上に配置
    if (imageData instanceof ImageData) {
      // ImageDataの場合は一度canvasに描画してから処理
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      paddingCtx.drawImage(tempCanvas, 0, 0);
    } else {
      // HTMLImageElement または HTMLCanvasElement の場合
      paddingCtx.drawImage(imageData, 0, 0);
    }

    // パディングされた画像をモデルの入力サイズにリサイズ
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // パディングされた画像をリサイズ
    ctx.drawImage(
      paddingCanvas,
      0,
      0,
      maxWH,
      maxWH,
      0,
      0,
      width,
      height
    );

    // Canvas から画素データを取得
    const imageDataResized = ctx.getImageData(
      0,
      0,
      width,
      height
    );
    const data = imageDataResized.data;

    // Float32Array に変換し、正規化 (0-255 -> 0-1)
    // NHWC (バッチ, 高さ, 幅, チャンネル) から NCHW (バッチ, チャンネル, 高さ, 幅) に変換
    const inputTensor = new Float32Array(
      batchSize * channels * height * width
    );

    // チャンネルごとの平均と標準偏差（正規化用）
    const mean = [123.675, 116.28, 103.53]; // RGB
    const std = [58.395, 57.12, 57.375]; // RGB

    // 画素データの変換と正規化
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const pixelOffset = (h * width + w) * 4; // RGBA

        // RGB値を取得し、正規化
        for (let c = 0; c < channels; c++) {
          const value = data[pixelOffset + c];
          // NCHW形式でのインデックス計算
          const tensorIdx =
            c * height * width + h * width + w;
          // 正規化: (pixel - mean) / std
          inputTensor[tensorIdx] =
            (value - mean[c]) / std[c];
        }
      }
    }

    // メタデータを返す（後処理で使用）
    const metadata = {
      originalWidth: imgWidth,
      originalHeight: imgHeight,
      maxWH: maxWH,
      inputWidth: width,
      inputHeight: height,
    };

    return {
      tensor: inputTensor,
      metadata: metadata,
    };
  }

  /**
   * 検出結果の後処理
   *
   * @param {Object} outputs モデルの出力結果
   * @param {Object} metadata 前処理で生成されたメタデータ
   * @returns {Array} 検出結果の配列
   * @private
   */
  postprocess(outputs, metadata) {
    const dets = outputs['dets'].data;
    const labels = outputs['labels'].data;

    const detections = [];

    const numDetections = dets.length / 5;

    for (let i = 0; i < numDetections; i++) {
      const x1 = dets[i * 5 + 0];
      const y1 = dets[i * 5 + 1];
      const x2 = dets[i * 5 + 2];
      const y2 = dets[i * 5 + 3];
      const score = dets[i * 5 + 4];
      const classId = Number(labels[i]);
      if (score >= this.config.scoreThreshold) {
        // ✅ 入力画像のサイズ（model input）→ 元画像サイズへ変換
        const normX1 = x1 / this.config.inputShape[3]; // width
        const normY1 = y1 / this.config.inputShape[2]; // height
        const normX2 = x2 / this.config.inputShape[3];
        const normY2 = y2 / this.config.inputShape[2];

        const squareSize = metadata.maxWH;

        const origX1 = normX1 * squareSize;
        const origY1 = normY1 * squareSize;
        const origX2 = normX2 * squareSize;
        const origY2 = normY2 * squareSize;
        const boxHeight = origY2 - origY1;
        const deltaH = boxHeight * 0.02;

        detections.push({
          box: [
            Math.max(0, Math.round(origX1)),
            Math.max(0, Math.round(origY1 - deltaH)), // ⬅ 上方向に拡張
            Math.min(
              metadata.originalWidth,
              Math.round(origX2)
            ),
            Math.min(
              metadata.originalHeight,
              Math.round(origY2 + deltaH)
            ), // ⬅ 下方向に拡張
          ],
          score,
          class: classId,
          className:
            this.classNames?.[classId] ??
            `class_${classId}`,
        });
      }
    }

    console.log(
      '[Postprocess] NMS前 検出数:',
      detections.length
    );
    const nmsResults = this.applyNMS(
      detections,
      this.config.nmsThreshold
    );
    console.log(
      '[Postprocess] NMS後 検出数:',
      nmsResults.length
    );

    return nmsResults;
  }

  /**
   * Non-Maximum Suppression (NMS) の適用
   * 重複する検出結果を除去します
   *
   * @param {Array} detections 検出結果の配列
   * @param {number} threshold IoU閾値
   * @returns {Array} NMS適用後の検出結果
   * @private
   */
  applyNMS(detections, threshold) {
    // スコアでソート（降順）
    const sortedDetections = [...detections].sort(
      (a, b) => b.score - a.score
    );
    const selected = [];

    while (sortedDetections.length > 0) {
      // スコアが最大の検出を選択
      const current = sortedDetections.shift();
      selected.push(current);

      // 残りの検出と比較
      for (
        let i = sortedDetections.length - 1;
        i >= 0;
        i--
      ) {
        const iou = this.calculateIoU(
          current.box,
          sortedDetections[i].box
        );
        if (iou >= threshold) {
          // IoUが閾値以上なら除去
          sortedDetections.splice(i, 1);
        }
      }

      // 最大検出数に達したら終了
      if (selected.length >= this.config.maxDetections) {
        break;
      }
    }

    return selected;
  }

  /**
   * Intersection over Union (IoU) の計算
   *
   * @param {Array} boxA 1つ目のバウンディングボックス [x1, y1, x2, y2]
   * @param {Array} boxB 2つ目のバウンディングボックス [x1, y1, x2, y2]
   * @returns {number} IoU値 (0-1)
   * @private
   */
  calculateIoU(boxA, boxB) {
    // 交差領域の計算
    const xA = Math.max(boxA[0], boxB[0]);
    const yA = Math.max(boxA[1], boxB[1]);
    const xB = Math.min(boxA[2], boxB[2]);
    const yB = Math.min(boxA[3], boxB[3]);

    // 交差領域の面積
    const intersectionArea =
      Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (intersectionArea === 0) {
      return 0;
    }

    // 各ボックスの面積
    const boxAArea =
      (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const boxBArea =
      (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);

    // IoUの計算
    return (
      intersectionArea /
      (boxAArea + boxBArea - intersectionArea)
    );
  }

  /**
   * 画像内のテキスト領域を検出
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 入力画像
   * @returns {Promise<Array>} 検出結果の配列
   */
  async detect(imageData) {
    if (!this.initialized) {
      throw new Error(
        'RTMDet モデルが初期化されていません'
      );
    }

    try {
      console.log('[Detect] 入力画像の取得');
      const { tensor, metadata } =
        this.preprocess(imageData);

      const inputTensor = new ort.Tensor(
        'float32',
        tensor,
        this.config.inputShape
      );
      const feeds = {};
      feeds[this.session.inputNames[0]] = inputTensor;

      console.log(
        '[Detect] モデルに入力:',
        this.session.inputNames[0]
      );
      const outputs = await this.session.run(feeds);

      const detections = this.postprocess(
        outputs,
        metadata
      );
      console.log(
        `[Detect] 検出数（NMS後）: ${detections.length}`
      );

      return detections;
    } catch (error) {
      console.error('検出処理中にエラー:', error);
      throw new Error(
        `検出処理に失敗しました: ${error.message}`
      );
    }
  }
}
