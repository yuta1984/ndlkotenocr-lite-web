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
        10,
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
        15,
        '文字認識モデルをロードしました'
      );

      // 読み順処理の設定を読み込む
      const readingOrderConfig =
        await loadReadingOrderConfig(this.configPath);
      this.readingOrderProcessor =
        new ReadingOrderProcessor(readingOrderConfig);
      this.updateProgress(
        20,
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
        30,
        '出力生成の設定を読み込みました'
      );

      this.initialized = true;
      //this.updateProgress(100, '初期化完了');
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

    this.updateProgress(40, '処理を開始します');
    // UIの更新を許可するためのマイクロタスク
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      // 1. レイアウト検出
      this.updateProgress(45, 'レイアウト検出中...');
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) =>
        setTimeout(resolve, 0)
      );

      const detections = await this.layoutDetector.detect(
        imageData
      );
      this.updateProgress(
        50,
        `${detections.length}個のテキスト領域を検出しました`
      );
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) =>
        setTimeout(resolve, 0)
      );

      // 2. テキスト認識
      this.updateProgress(50, '文字認識中...');
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) =>
        setTimeout(resolve, 0)
      );

      const recognizedDetections = [];
      let count = 0;
      for (const detection of detections) {
        // 検出された領域を切り出し
        const lineImage = this.cropImage(
          imageData,
          detection.box
        );
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

        // UIの更新を許可するためのマイクロタスク
        // 各テキスト領域の処理後に追加
        await new Promise((resolve) =>
          setTimeout(resolve, 0)
        );
      }

      // 3. 読み順処理
      this.updateProgress(80, '読み順処理中...');
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) =>
        setTimeout(resolve, 0)
      );

      const orderedDetections =
        this.readingOrderProcessor.process(
          recognizedDetections,
          imageData.width,
          imageData.height
        );

      // 4. 出力生成
      this.updateProgress(90, '結果生成中...');
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) =>
        setTimeout(resolve, 0)
      );

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
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) =>
        setTimeout(resolve, 0)
      );

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
  // タブ切り替え機能
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', function () {
      // アクティブなタブを切り替え
      document
        .querySelector('.tab.active')
        .classList.remove('active');
      this.classList.add('active');

      // タブコンテンツを切り替え
      const tabName = this.getAttribute('data-tab');
      document
        .querySelector('.tab-content.active')
        .classList.remove('active');
      document
        .getElementById(`${tabName}-content`)
        .classList.add('active');
    });
  });

  const imageUpload =
    document.getElementById('image-upload');
  const sampleButton =
    document.getElementById('sample-button');
  const previewContainer = document.getElementById(
    'image-preview-container'
  );
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
  const imageSelector = document.getElementById(
    'image-selector'
  );
  const prevImageButton = document.getElementById(
    'prev-image-button'
  );
  const nextImageButton = document.getElementById(
    'next-image-button'
  );

  // 選択された画像を保持する配列
  let selectedImages = [];
  // 処理結果を保持する配列
  let processedResults = [];
  // 現在処理中の画像インデックス
  let currentImageIndex = 0;
  // 現在表示中の結果インデックス
  let currentResultIndex = 0;
  // 全体の進捗状況
  let overallProgress = 0;

  // NDLKotenOCRインスタンスの作成
  const ocr = new NDLKotenOCR();

  // サムネイル生成関数
  function createThumbnail(file, index) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (event) {
        const thumbnailWrapper =
          document.createElement('div');
        thumbnailWrapper.className = 'thumbnail-wrapper';

        const thumbnail = document.createElement('img');
        thumbnail.className = 'thumbnail';
        thumbnail.src = event.target.result;
        thumbnail.alt = `画像 ${index + 1}`;

        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.textContent =
          file.name.length > 15
            ? file.name.substring(0, 12) + '...'
            : file.name;

        thumbnailWrapper.appendChild(thumbnail);
        thumbnailWrapper.appendChild(label);

        resolve({
          element: thumbnailWrapper,
          dataUrl: event.target.result,
          file: file,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // 画像選択時の処理
  imageUpload.addEventListener(
    'change',
    async function (e) {
      // 既存のサムネイルをクリア
      previewContainer.innerHTML = '';
      selectedImages = [];

      if (e.target.files.length > 0) {
        const files = Array.from(e.target.files).filter(
          (file) => file.type.match('image.*')
        );

        if (files.length === 0) return;

        // サムネイル生成と表示
        const thumbnailPromises = files.map((file, index) =>
          createThumbnail(file, index)
        );

        const thumbnails = await Promise.all(
          thumbnailPromises
        );
        selectedImages = thumbnails;

        // サムネイルをコンテナに追加
        thumbnails.forEach((thumbnail) => {
          previewContainer.appendChild(thumbnail.element);
        });

        // 処理ボタンを有効化
        processButton.disabled = false;
      } else {
        processButton.disabled = true;
      }
    }
  );

  // ドラッグ&ドロップ処理
  const uploadSection = document.querySelector(
    '.upload-section'
  );

  uploadSection.addEventListener('dragover', function (e) {
    e.preventDefault();
    this.style.borderColor = '#4CAF50';
  });

  uploadSection.addEventListener('dragleave', function () {
    this.style.borderColor = '#ccc';
  });

  uploadSection.addEventListener(
    'drop',
    async function (e) {
      e.preventDefault();
      this.style.borderColor = '#ccc';

      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type.match('image.*')
      );

      if (files.length === 0) return;

      // ファイル入力要素にファイルを設定
      const dataTransfer = new DataTransfer();
      files.forEach((file) => dataTransfer.items.add(file));
      imageUpload.files = dataTransfer.files;

      // 既存のサムネイルをクリア
      previewContainer.innerHTML = '';
      selectedImages = [];

      // サムネイル生成と表示
      const thumbnailPromises = files.map((file, index) =>
        createThumbnail(file, index)
      );

      const thumbnails = await Promise.all(
        thumbnailPromises
      );
      selectedImages = thumbnails;

      // サムネイルをコンテナに追加
      thumbnails.forEach((thumbnail) => {
        previewContainer.appendChild(thumbnail.element);
      });

      // 処理ボタンを有効化
      processButton.disabled = false;
    }
  );

  // サンプル画像ボタンのイベントリスナー
  sampleButton.addEventListener('click', async () => {
    // 既存のサムネイルをクリア
    previewContainer.innerHTML = '';
    selectedImages = [];

    try {
      // サンプル画像のURLを設定
      const sampleImageUrl = 'public/sample.png';

      // 画像をフェッチして File オブジェクトに変換
      const response = await fetch(sampleImageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'sample.png', {
        type: blob.type,
      });

      // サムネイル生成
      const thumbnail = await createThumbnail(file, 0);
      selectedImages = [thumbnail];

      // サムネイルをコンテナに追加
      previewContainer.appendChild(thumbnail.element);

      // 処理ボタンを有効化
      processButton.disabled = false;
    } catch (error) {
      console.error('サンプル画像の読み込みエラー:', error);
      alert('サンプル画像の読み込みに失敗しました。');
    }
  });

  // 進捗コールバック
  const updateProgress = (progress, message) => {
    // 現在の画像の進捗を全体の進捗に反映
    const singleImageWeight = 100 / selectedImages.length;
    overallProgress =
      currentImageIndex * singleImageWeight +
      (progress * singleImageWeight) / 100;

    progressBar.value = Math.round(overallProgress);

    // 進捗メッセージに画像番号を追加
    const overallMessage = `画像 ${currentImageIndex + 1}/${
      selectedImages.length
    }: ${message}`;

    // 画面上の進捗メッセージを更新
    const loadingMessage = document.getElementById(
      'loading-message'
    );
    if (loadingMessage) {
      loadingMessage.textContent = overallMessage;
    } else {
      console.error(
        'loading-message 要素が見つかりませんでした'
      );
    }

    console.log(
      `進捗: ${Math.round(
        overallProgress
      )}% - ${overallMessage}`
    );
  };

  // 画像セレクタの変更イベント
  imageSelector.addEventListener('change', function () {
    const selectedIndex = this.selectedIndex;
    if (
      selectedIndex >= 0 &&
      selectedIndex < processedResults.length
    ) {
      displayResult(selectedIndex);
    }
  });

  // 前の画像ボタンのイベントリスナー
  prevImageButton.addEventListener('click', function () {
    if (currentResultIndex > 0) {
      displayResult(currentResultIndex - 1);
    }
  });

  // 次の画像ボタンのイベントリスナー
  nextImageButton.addEventListener('click', function () {
    if (currentResultIndex < processedResults.length - 1) {
      displayResult(currentResultIndex + 1);
    }
  });

  // ナビゲーションボタンの状態を更新
  function updateNavigationButtons() {
    prevImageButton.disabled = currentResultIndex <= 0;
    nextImageButton.disabled =
      currentResultIndex >= processedResults.length - 1;
  }

  // 結果表示関数
  function displayResult(index) {
    currentResultIndex = index;
    const result = processedResults[index];

    // セレクタの選択を更新
    imageSelector.selectedIndex = index;

    // 結果の表示
    textResult.textContent = result.text.replace(
      /\\n/g,
      '\n'
    );
    xmlResult.textContent = result.xml;
    jsonResult.textContent = JSON.stringify(
      result.json,
      null,
      2
    );

    // 画像の取得
    const img = new Image();
    img.onload = function () {
      // 結果の可視化
      drawResults(resultCanvas, img, result.detections);
    };
    img.src = selectedImages[index].dataUrl;

    // ナビゲーションボタンの状態を更新
    updateNavigationButtons();
  }

  // 初期化ボタンのイベントリスナー
  processButton.addEventListener('click', async () => {
    try {
      if (selectedImages.length === 0) {
        alert('画像を選択してください');
        return;
      }

      document.getElementById('loading').style.display =
        'block';
      processButton.disabled = true;
      processedResults = [];
      currentImageIndex = 0;
      overallProgress = 0;

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

      // 各画像を順番に処理
      for (let i = 0; i < selectedImages.length; i++) {
        currentImageIndex = i;
        const imageInfo = selectedImages[i];

        // 画像の取得
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = imageInfo.dataUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

        // 処理実行
        const results = await ocr.process(imageData, {
          imageName:
            imageInfo.file.name || `image_${i + 1}`,
        });

        // 結果を保存
        processedResults.push(results);
      }

      // 画像セレクタの設定
      imageSelector.innerHTML = '';
      selectedImages.forEach((image, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent =
          image.file.name || `画像 ${index + 1}`;
        imageSelector.appendChild(option);
      });

      // 最初の結果を表示
      if (processedResults.length > 0) {
        currentResultIndex = 0;
        displayResult(0);

        // ナビゲーションボタンの有効化（複数画像がある場合）
        prevImageButton.disabled = true;
        nextImageButton.disabled =
          processedResults.length <= 1;
      }

      // 結果セクションの表示
      document.querySelector(
        '.result-section'
      ).style.display = 'block';

      // 複数画像がある場合は統合ダウンロードセクションを表示
      if (processedResults.length > 1) {
        document.querySelector(
          '.download-section'
        ).style.display = 'block';
      } else {
        document.querySelector(
          '.download-section'
        ).style.display = 'none';
      }
    } catch (error) {
      console.error('エラー:', error);
      alert(
        `処理中にエラーが発生しました: ${error.message}`
      );
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

  // ファイルダウンロード用のヘルパー関数
  function downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ダウンロードボタンのイベントリスナー
  document
    .getElementById('download-text-button')
    .addEventListener('click', () => {
      if (processedResults.length === 0) return;

      // 画像名の配列を作成
      const imageNames = selectedImages.map(
        (image, index) =>
          image.file.name || `image_${index + 1}`
      );

      // 統合テキストを生成
      const combinedText =
        ocr.outputGenerator.generateCombinedTXT(
          processedResults,
          imageNames
        );

      // ファイル名を生成（現在の日時を含める）
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .substring(0, 19);
      const fileName = `ndl_ocr_results_${timestamp}.txt`;

      // ダウンロード
      downloadFile(
        combinedText,
        fileName,
        'text/plain;charset=utf-8'
      );
    });

  document
    .getElementById('download-xml-button')
    .addEventListener('click', () => {
      if (processedResults.length === 0) return;

      // 画像名の配列を作成
      const imageNames = selectedImages.map(
        (image, index) =>
          image.file.name || `image_${index + 1}`
      );

      // 統合XMLを生成
      const combinedXML =
        ocr.outputGenerator.generateCombinedXML(
          processedResults,
          imageNames
        );

      // ファイル名を生成（現在の日時を含める）
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .substring(0, 19);
      const fileName = `ndl_ocr_results_${timestamp}.xml`;

      // ダウンロード
      downloadFile(
        combinedXML,
        fileName,
        'application/xml;charset=utf-8'
      );
    });

  document
    .getElementById('download-json-button')
    .addEventListener('click', () => {
      if (processedResults.length === 0) return;

      // 画像名の配列を作成
      const imageNames = selectedImages.map(
        (image, index) =>
          image.file.name || `image_${index + 1}`
      );

      // 統合JSONを生成
      const combinedJSON =
        ocr.outputGenerator.generateCombinedJSON(
          processedResults,
          imageNames
        );

      // JSONを文字列に変換（整形して読みやすく）
      const jsonString = JSON.stringify(
        combinedJSON,
        null,
        2
      );

      // ファイル名を生成（現在の日時を含める）
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .substring(0, 19);
      const fileName = `ndl_ocr_results_${timestamp}.json`;

      // ダウンロード
      downloadFile(
        jsonString,
        fileName,
        'application/json;charset=utf-8'
      );
    });

  // コピーボタンの機能を追加
  const copyButtons =
    document.querySelectorAll('.copy-button');

  // 各ボタンにイベントリスナーを追加
  copyButtons.forEach((button) => {
    button.addEventListener('click', () => {
      // コピー対象の要素IDを取得
      const targetId = button.getAttribute('data-target');
      const targetElement =
        document.getElementById(targetId);

      // テキストをコピー
      const text = targetElement.textContent;
      navigator.clipboard
        .writeText(text)
        .then(() => {
          // コピー成功時のフィードバック表示
          const feedback = button.nextElementSibling;
          feedback.classList.add('show');

          // 2秒後にフィードバックを非表示
          setTimeout(() => {
            feedback.classList.remove('show');
          }, 2000);
        })
        .catch((err) => {
          console.error('コピーに失敗しました:', err);
          alert('コピーに失敗しました。');
        });
    });
  });
});
