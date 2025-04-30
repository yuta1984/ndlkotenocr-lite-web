/**
 * NDLKotenOCR Web版 - メインエントリーポイント
 *
 * このファイルは、NDLKotenOCR Web版のメインエントリーポイントです。
 * 各モジュールを統合し、ブラウザ上でのOCR処理を実行します。
 */

import { RTMDet } from './layout-detector.js';
import { PARSEQ } from './text-recognizer.js';
import {
  ReadingOrderProcessor,
  loadConfig as loadReadingOrderConfig,
} from './reading-order.js';
import {
  OutputGenerator,
  loadConfig as loadOutputConfig,
} from './output-generator.js';

/**
 * NDLKotenOCR クラス
 * 古典籍OCRの全体処理を管理するクラス
 */
export class NDLKotenOCR {
  /**
   * コンストラクタ
   */
  constructor() {
    this.layoutDetector = null;
    this.textRecognizer = null;
    this.initialized = false;
    this.progress = 0;
    this.progressCallback = null;
  }

  /**
   * 初期化処理
   * モデルのロードと初期設定を行います
   *
   * @param {string} layoutModelPath レイアウト認識モデルのパス
   * @param {Object} layoutConfig レイアウト認識の設定
   * @param {string} layoutConfigPath レイアウト認識の設定ファイルパス（オプション）
   * @param {string} recognizerModelPath 文字認識モデルのパス
   * @param {Object} recognizerConfig 文字認識の設定
   * @param {string} recognizerConfigPath 文字認識の設定ファイルパス（オプション）
   * @param {Function} progressCallback 進捗コールバック関数
   * @returns {Promise<void>}
   */
  async initialize(
    layoutModelPath,
    layoutConfig = {},
    layoutConfigPath = null,
    recognizerModelPath,
    recognizerConfig = {},
    recognizerConfigPath = null,
    progressCallback = null
  ) {
    this.progressCallback = progressCallback;
    this.updateProgress(0, '初期化中...');
    this.configPath =
      layoutConfigPath || recognizerConfigPath || null;

    try {
      // レイアウト検出器の初期化
      this.layoutDetector = new RTMDet(
        layoutModelPath,
        layoutConfig,
        layoutConfigPath
      );
      await this.layoutDetector.initialize(
        layoutConfigPath
      );
      this.updateProgress(
        25,
        'レイアウト認識モデルをロードしました'
      );

      // テキスト認識器の初期化
      this.textRecognizer = new PARSEQ(
        recognizerModelPath,
        recognizerConfig,
        recognizerConfigPath,
        'config/NDLmoji.yaml' // 文字リストファイルパス
      );
      await this.textRecognizer.initialize(
        recognizerConfigPath,
        'config/NDLmoji.yaml'
      );
      this.updateProgress(
        50,
        '文字認識モデルをロードしました'
      );

      // 読み順処理の設定を読み込む
      const readingOrderConfig =
        await loadReadingOrderConfig(this.configPath);
      this.readingOrderProcessor =
        new ReadingOrderProcessor(readingOrderConfig);
      this.updateProgress(
        65,
        '読み順処理の設定を読み込みました'
      );

      // 出力生成の設定を読み込む
      const outputConfig = await loadOutputConfig(
        this.configPath
      );
      this.outputGenerator = new OutputGenerator(
        outputConfig
      );
      this.updateProgress(
        75,
        '出力生成の設定を読み込みました'
      );

      this.initialized = true;
      this.updateProgress(100, '初期化完了');
    } catch (error) {
      console.error('初期化エラー:', error);
      throw new Error(
        `NDLKotenOCR の初期化に失敗しました: ${error.message}`
      );
    }
  }

  /**
   * 進捗状況の更新
   *
   * @param {number} progress 進捗率 (0-100)
   * @param {string} message 進捗メッセージ
   * @private
   */
  updateProgress(progress, message) {
    this.progress = progress;
    if (this.progressCallback) {
      this.progressCallback(progress, message);
    }
  }

  /**
   * 画像処理の実行
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 処理する画像
   * @param {Object} options オプション設定
   * @returns {Promise<Object>} 処理結果
   */
  async process(imageData, options = {}) {
    if (!this.initialized) {
      throw new Error(
        'NDLKotenOCR が初期化されていません。initialize() を先に呼び出してください。'
      );
    }

    this.updateProgress(0, '処理を開始します');

    try {
      // 1. レイアウト検出
      this.updateProgress(10, 'レイアウト検出中...');
      const detections = await this.layoutDetector.detect(
        imageData
      );
      this.updateProgress(
        40,
        `${detections.length}個のテキスト領域を検出しました`
      );

      // 2. テキスト認識
      this.updateProgress(50, '文字認識中...');
      const recognizedDetections = [];
      let count = 0;
      for (const detection of detections) {
        // 検出された領域を切り出し
        const lineImage = this.cropImage(
          imageData,
          detection.box
        );
        console.log(detection.box);
        // テキスト認識
        const text = await this.textRecognizer.read(
          lineImage
        );
        recognizedDetections.push({
          ...detection,
          text,
        });

        count++;
        this.updateProgress(
          50 + Math.floor((count / detections.length) * 30),
          `文字認識中... (${count}/${detections.length})`
        );
      }

      // 3. 読み順処理
      this.updateProgress(80, '読み順処理中...');
      const orderedDetections =
        this.readingOrderProcessor.process(
          recognizedDetections,
          imageData.width,
          imageData.height
        );

      // 4. 出力生成
      this.updateProgress(90, '結果生成中...');
      const results = {
        detections: orderedDetections,
        xml: this.outputGenerator.generateXML(
          orderedDetections,
          imageData.width,
          imageData.height,
          options.imageName || 'image'
        ),
        json: this.outputGenerator.generateJSON(
          orderedDetections,
          imageData.width,
          imageData.height,
          options.imageName || 'image'
        ),
        text: this.outputGenerator.generateTXT(
          orderedDetections
        ),
      };

      this.updateProgress(100, '処理完了');
      return results;
    } catch (error) {
      console.error('処理エラー:', error);
      throw new Error(
        `画像処理に失敗しました: ${error.message}`
      );
    }
  }

  /**
   * 画像から指定された領域を切り出す
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 元画像
   * @param {Array<number>} box 切り出し領域 [x1, y1, x2, y2]
   * @returns {ImageData} 切り出された画像
   * @private
   */
  cropImage(imageData, box) {
    const [x1, y1, x2, y2] = box;
    const width = Math.max(1, Math.round(x2 - x1)); // 最小幅を1pxに設定
    const height = Math.max(1, Math.round(y2 - y1)); // 最小高さを1pxに設定

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

    // 座標が画像の範囲内に収まるように調整
    const safeX1 = Math.max(
      0,
      Math.min(imgWidth - 1, Math.round(x1))
    );
    const safeY1 = Math.max(
      0,
      Math.min(imgHeight - 1, Math.round(y1))
    );
    const safeWidth = Math.min(width, imgWidth - safeX1);
    const safeHeight = Math.min(height, imgHeight - safeY1);

    // Canvas要素を作成
    const canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;
    const ctx = canvas.getContext('2d');

    // 画像の種類に応じて適切に描画
    if (imageData instanceof ImageData) {
      // ImageDataの場合
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(
        tempCanvas,
        safeX1,
        safeY1,
        safeWidth,
        safeHeight,
        0,
        0,
        safeWidth,
        safeHeight
      );
    } else {
      // HTMLImageElement または HTMLCanvasElement の場合
      ctx.drawImage(
        imageData,
        safeX1,
        safeY1,
        safeWidth,
        safeHeight,
        0,
        0,
        safeWidth,
        safeHeight
      );
    }

    return ctx.getImageData(0, 0, safeWidth, safeHeight);
  }
}

// ブラウザ環境での初期化処理
document.addEventListener('DOMContentLoaded', () => {
  const imageUpload =
    document.getElementById('image-upload');
  const imagePreview =
    document.getElementById('image-preview');
  const processButton = document.getElementById(
    'process-button'
  );
  const progressBar =
    document.getElementById('progress-bar');
  const resultCanvas =
    document.getElementById('result-canvas');
  const textResult = document.getElementById('text-result');
  const xmlResult = document.getElementById('xml-result');
  const jsonResult = document.getElementById('json-result');

  // NDLKotenOCRインスタンスの作成
  const ocr = new NDLKotenOCR();

  // 進捗コールバック
  const updateProgress = (progress, message) => {
    progressBar.value = progress;
    console.log(`進捗: ${progress}% - ${message}`);
  };

  // 初期化ボタンのイベントリスナー
  processButton.addEventListener('click', async () => {
    try {
      document.getElementById('loading').style.display =
        'block';
      processButton.disabled = true;

      // 画像の取得
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = imagePreview.naturalWidth;
      canvas.height = imagePreview.naturalHeight;
      ctx.drawImage(imagePreview, 0, 0);
      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      // 初期化（実際のアプリケーションでは、起動時に一度だけ行う）
      if (!ocr.initialized) {
        await ocr.initialize(
          'models/rtmdet-s-1280x1280.onnx',
          {}, // レイアウト設定（空オブジェクト）
          'config/ndl.yaml', // レイアウト設定ファイルパス
          'models/parseq-ndl-32x384-tiny-10.onnx',
          {}, // 文字認識設定（空オブジェクト）
          'config/ndl.yaml', // 文字認識設定ファイルパス
          updateProgress
        );
      }

      // 処理実行
      const results = await ocr.process(imageData, {
        imageName: 'uploaded_image',
      });

      // 結果の表示
      textResult.textContent = results.text;
      xmlResult.textContent = results.xml;
      jsonResult.textContent = JSON.stringify(
        results.json,
        null,
        2
      );

      // 結果の可視化
      drawResults(
        resultCanvas,
        imagePreview,
        results.detections
      );

      // 結果セクションの表示
      document.getElementById('loading').style.display =
        'none';
      document.querySelector(
        '.result-section'
      ).style.display = 'block';
      processButton.disabled = false;
    } catch (error) {
      console.error('エラー:', error);
      alert(
        `処理中にエラーが発生しました: ${error.message}`
      );
      document.getElementById('loading').style.display =
        'none';
      processButton.disabled = false;
    }
  });

  // 結果の可視化関数
  function drawResults(canvas, image, detections) {
    const ctx = canvas.getContext('2d');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // 元画像の描画
    ctx.drawImage(image, 0, 0);

    // 検出結果の描画
    detections.forEach((detection, index) => {
      const [x1, y1, x2, y2] = detection.box;

      // 枠の描画
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // テキストの描画
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(x1, y1 - 20, 40, 20);
      ctx.fillStyle = 'black';
      ctx.font = '16px Arial';
      ctx.fillText(`${index + 1}`, x1 + 5, y1 - 5);
    });
  }
});
