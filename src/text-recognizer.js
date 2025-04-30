/**
 * NDLKotenOCR Web版 - 文字列認識モジュール
 *
 * このファイルは、PARSeqモデルを使用して検出されたテキスト領域内の文字を認識するモジュールです。
 * 元のPythonコードのsrc/parseq.pyを参考に実装しています。
 */

import * as ort from 'onnxruntime-web';
import * as yaml from 'js-yaml';

/**
 * PARSEQ クラス
 * 画像内のテキストを認識するクラス
 */
export class PARSEQ {
  /**
   * コンストラクタ
   *
   * @param {string} modelPath モデルファイルのパス
   * @param {Object} config 設定オブジェクト
   * @param {string} configPath 設定ファイルのパス（オプション）
   * @param {string} charListPath 文字リストファイルのパス（オプション）
   */
  constructor(
    modelPath,
    config = {},
    configPath = null,
    charListPath = null
  ) {
    this.modelPath = modelPath;
    this.configPath = configPath;
    this.charListPath = charListPath;
    this.config = {
      inputShape: [1, 3, 32, 384], // デフォルト入力サイズ
      charList: [], // 文字リスト
      maxLength: 25, // 最大文字列長
      ...config,
    };
    this.session = null;
    this.initialized = false;
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

      // 文字認識設定を取得
      if (yamlConfig && yamlConfig.text_recognition) {
        const textConfig = yamlConfig.text_recognition;

        // 設定を更新
        if (textConfig.input_shape !== undefined) {
          this.config.inputShape = textConfig.input_shape;
        }
        if (textConfig.max_length !== undefined) {
          this.config.maxLength = textConfig.max_length;
        }
      }

      // 文字リストを取得
      this.config.charList =
        yamlConfig.model.charset_train.split('');
      console.log(
        `文字リストを読み込みました: ${this.config.charList.length}文字`
      );

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
   * 文字リストファイルを読み込む
   *
   * @param {string} charListPath 文字リストファイルのパス
   * @returns {Promise<Array<string>>} 読み込まれた文字リスト
   */
  async loadCharList(charListPath = null) {
    const path = charListPath || this.charListPath;
    if (!path) {
      console.log(
        '文字リストファイルのパスが指定されていません。デフォルトの文字リストを使用します。'
      );
      return this.config.charList;
    }

    try {
      // 文字リストファイルを取得
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(
          `文字リストファイルの取得に失敗しました: ${response.statusText}`
        );
      }

      const yamlText = await response.text();
      const yamlConfig = yaml.load(yamlText);

      // 文字リストを構築
      if (
        yamlConfig &&
        yamlConfig.model &&
        yamlConfig.model.charset_train
      ) {
        const charListStr = yamlConfig.model.charset_train;
        console.log(
          `文字リストを読み込みました: ${charListStr.length}文字`
        );
        this.config.charList = charListStr.split('');
      }

      return this.config.charList;
    } catch (error) {
      console.warn(
        `文字リストファイルの読み込みに失敗しました: ${error.message}。デフォルトの文字リストを使用します。`
      );
      return this.config.charList;
    }
  }

  /**
   * 初期化処理
   * 設定を読み込み、ONNXモデルをロードし、推論セッションを作成します
   *
   * @param {string} configPath 設定ファイルのパス（オプション）
   * @param {string} charListPath 文字リストファイルのパス（オプション）
   * @returns {Promise<void>}
   */
  async initialize(configPath = null, charListPath = null) {
    try {
      // 設定ファイルを読み込む
      if (configPath || this.configPath) {
        await this.loadConfig(configPath);
      }

      // 文字リストファイルを読み込む
      if (charListPath || this.charListPath) {
        await this.loadCharList(charListPath);
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
      console.log('PARSEQ モデルの初期化が完了しました');
    } catch (error) {
      console.error(
        'PARSEQ モデルの初期化に失敗しました:',
        error
      );
      throw new Error(
        `PARSEQ モデルの初期化に失敗しました: ${error.message}`
      );
    }
  }

  /**
   * 画像の前処理
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 入力画像
   * @returns {Float32Array} 前処理された画像データ
   * @private
   */
  preprocess(imageData) {
    const [batchSize, channels, height, width] =
      this.config.inputShape;

    // 画像サイズ取得
    let imgWidth, imgHeight;
    if (imageData instanceof ImageData) {
      imgWidth = imageData.width;
      imgHeight = imageData.height;
    } else {
      imgWidth = imageData.naturalWidth || imageData.width;
      imgHeight =
        imageData.naturalHeight || imageData.height;
    }

    // キャンバス準備（回転含むので一旦大きめ）
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let rotated = false;
    if (imgHeight > imgWidth) {
      // 縦長画像は90度回転（時計回り）
      canvas.width = imgHeight;
      canvas.height = imgWidth;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-canvas.height / 2, -canvas.width / 2);
      rotated = true;
    } else {
      canvas.width = imgWidth;
      canvas.height = imgHeight;
    }

    // 描画
    if (imageData instanceof ImageData) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      ctx.drawImage(imageData, 0, 0);
    }

    // 固定リサイズ（アスペクト比無視）→ Pythonと一致
    const resizeCanvas = document.createElement('canvas');
    resizeCanvas.width = width;
    resizeCanvas.height = height;
    const resizeCtx = resizeCanvas.getContext('2d');
    resizeCtx.drawImage(canvas, 0, 0, width, height);

    const resizedImageData = resizeCtx.getImageData(
      0,
      0,
      width,
      height
    );
    const data = resizedImageData.data;

    // Float32Arrayに変換（正規化: [-1, 1]）
    const inputTensor = new Float32Array(
      batchSize * channels * height * width
    );
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const pixelOffset = (h * width + w) * 4;
        for (let c = 0; c < channels; c++) {
          const value = data[pixelOffset + c] / 255.0;
          const tensorIdx =
            c * height * width + h * width + w;
          inputTensor[tensorIdx] = 2.0 * (value - 0.5);
        }
      }
    }

    return inputTensor;
  }

  /**
   * 認識結果の後処理
   *
   * @param {Object} outputs モデルの出力結果
   * @returns {string} 認識されたテキスト
   * @private
   */
  postprocess(outputs) {
    const outputNames = this.session.outputNames;
    const rawLogits = outputs[outputNames[0]].data;
    const logits = Array.from(rawLogits).map((value) =>
      typeof value === 'bigint' ? Number(value) : value
    );

    const [batchSize, seqLength, vocabSize] =
      outputs[outputNames[0]].dims;

    const resultClassIds = [];

    for (let i = 0; i < seqLength; i++) {
      const scores = [];
      for (let j = 0; j < vocabSize; j++) {
        scores.push(logits[i * vocabSize + j]);
      }

      // 最大スコアとインデックスを取得
      const maxScore = Math.max(...scores);
      const maxIndex = scores.indexOf(maxScore);
      // <eos> トークン（ID=0）が出たら終了（Pythonと一致）
      if (maxIndex === 0) break;
      // 特殊トークン（<s>, </s>, <pad>, <unk>）は除外
      if (maxIndex < 4) continue;

      resultClassIds.push(maxIndex - 1); // Pythonと同様に charlist の 0-index に合わせる
    }
    // 文字リストから文字を取得
    const resultText = [];
    // 連続を除外して文字列を作成
    let prevClassId = -1;
    for (const classId of resultClassIds) {
      if (classId !== prevClassId) {
        resultText.push(this.config.charList[classId]);
        prevClassId = classId;
      }
    }

    return resultText.join('');
  }

  /**
   * 画像内のテキストを認識
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 入力画像
   * @returns {Promise<string>} 認識されたテキスト
   */
  async read(imageData) {
    if (!this.initialized) {
      throw new Error(
        'PARSEQ モデルが初期化されていません。initialize() を先に呼び出してください。'
      );
    }

    try {
      // 前処理
      const tensor = this.preprocess(imageData);

      // 推論用の入力データを作成
      const inputTensor = new ort.Tensor(
        'float32',
        tensor,
        this.config.inputShape
      );
      const feeds = {};
      feeds[this.session.inputNames[0]] = inputTensor;

      // 推論実行
      const outputs = await this.session.run(feeds);

      // 後処理
      const text = this.postprocess(outputs);

      return text;
    } catch (error) {
      console.error(
        '認識処理中にエラーが発生しました:',
        error
      );
      throw new Error(
        `認識処理に失敗しました: ${error.message}`
      );
    }
  }
}
