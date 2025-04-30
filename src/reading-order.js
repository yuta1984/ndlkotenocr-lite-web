/**
 * NDLKotenOCR Web版 - 読み順処理モジュール
 *
 * このファイルは、検出されたテキスト領域を適切な読み順に整列するモジュールです。
 * 元のPythonコードのsrc/reading_order/xy_cut/eval.pyを参考に実装しています。
 */

import * as yaml from 'js-yaml';

/**
 * 読み順処理の設定
 */
const defaultConfig = {
  verticalMode: true, // 縦書きモード（true: 縦書き, false: 横書き）
};

/**
 * 設定ファイルを読み込む
 *
 * @param {string} configPath 設定ファイルのパス
 * @returns {Promise<Object>} 読み込まれた設定
 */
export async function loadConfig(configPath) {
  let config = { ...defaultConfig };

  if (!configPath) {
    console.log(
      '読み順処理: 設定ファイルのパスが指定されていません。デフォルト設定を使用します。'
    );
    return config;
  }

  try {
    // 設定ファイルを取得
    const response = await fetch(configPath);
    if (!response.ok) {
      throw new Error(
        `設定ファイルの取得に失敗しました: ${response.statusText}`
      );
    }

    const yamlText = await response.text();
    const yamlConfig = yaml.load(yamlText);

    // 読み順処理設定を取得
    if (yamlConfig && yamlConfig.reading_order) {
      const readingConfig = yamlConfig.reading_order;

      // 設定を更新
      if (readingConfig.vertical_mode !== undefined) {
        config.verticalMode = readingConfig.vertical_mode;
      }
    }

    console.log(
      '読み順処理: 設定ファイルを読み込みました:',
      config
    );
    return config;
  } catch (error) {
    console.warn(
      `読み順処理: 設定ファイルの読み込みに失敗しました: ${error.message}。デフォルト設定を使用します。`
    );
    return config;
  }
}

/**
 * 読み順処理クラス
 * 検出されたテキスト領域を適切な読み順に整列するクラス
 */
export class ReadingOrderProcessor {
  /**
   * コンストラクタ
   *
   * @param {Object} config 設定オブジェクト
   */
  constructor(config = null) {
    this.config = config || { ...defaultConfig };
    console.log(
      '読み順処理: 設定を適用しました:',
      this.config
    );
  }

  /**
   * XY-cut法による読み順の決定
   *
   * @param {Array} detections 検出結果の配列
   * @param {number} imageWidth 画像の幅
   * @param {number} imageHeight 画像の高さ
   * @returns {Array} 読み順に整列された検出結果
   */
  process(detections, imageWidth, imageHeight) {
    // 検出結果が空の場合は空配列を返す
    if (!detections || detections.length === 0) {
      return [];
    }

    console.log(
      `読み順処理: ${detections.length}個のテキスト領域を処理します`
    );
    console.log(
      `読み順処理: 縦書きモード = ${this.config.verticalMode}`
    );

    // 検出結果をディープコピー
    const boxes = JSON.parse(JSON.stringify(detections));

    // 各ボックスにIDを付与
    boxes.forEach((box, index) => {
      box.id = index;
    });

    // XY-cut法による読み順の決定
    const orderedBoxes = this._xycut(
      boxes,
      imageWidth,
      imageHeight
    );

    // 元の検出結果の順序を読み順に基づいて並べ替え
    const orderedDetections = [];
    for (const box of orderedBoxes) {
      orderedDetections.push(detections[box.id]);
    }

    console.log(
      `読み順処理: 処理完了 (${orderedDetections.length}個)`
    );
    return orderedDetections;
  }

  /**
   * XY-cut法の実装
   *
   * @param {Array} boxes バウンディングボックスの配列
   * @param {number} imageWidth 画像の幅
   * @param {number} imageHeight 画像の高さ
   * @returns {Array} 読み順に整列されたボックス
   * @private
   */
  _xycut(boxes, imageWidth, imageHeight) {
    // ボックスが1つ以下の場合はそのまま返す
    if (boxes.length <= 1) {
      return boxes;
    }

    // 各ボックスの中心座標を計算
    boxes.forEach((box) => {
      const [x1, y1, x2, y2] = box.box;
      box.center = {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
      };
    });

    // 縦方向の分割を試みる
    const verticalGroups = this._trySplitVertical(
      boxes,
      imageWidth,
      imageHeight
    );
    if (verticalGroups.length > 1) {
      // 縦方向の分割が成功した場合、各グループに対して再帰的にXY-cutを適用
      let result = [];
      for (const group of verticalGroups) {
        result = result.concat(
          this._xycut(group, imageWidth, imageHeight)
        );
      }
      return result;
    }

    // 横方向の分割を試みる
    const horizontalGroups = this._trySplitHorizontal(
      boxes,
      imageWidth,
      imageHeight
    );
    if (horizontalGroups.length > 1) {
      // 横方向の分割が成功した場合、各グループに対して再帰的にXY-cutを適用
      let result = [];
      for (const group of horizontalGroups) {
        result = result.concat(
          this._xycut(group, imageWidth, imageHeight)
        );
      }
      return result;
    }

    // 分割できない場合は、位置でソート
    return this._sortBoxesByPosition(boxes);
  }

  /**
   * 縦方向の分割を試みる
   *
   * @param {Array} boxes バウンディングボックスの配列
   * @param {number} imageWidth 画像の幅
   * @param {number} imageHeight 画像の高さ
   * @returns {Array} 分割されたグループの配列
   * @private
   */
  _trySplitVertical(boxes, imageWidth, imageHeight) {
    // ボックスが少ない場合は分割しない
    if (boxes.length <= 2) {
      return [boxes];
    }

    // 各ボックスのY座標の範囲を取得
    const yRanges = boxes.map((box) => {
      const [x1, y1, x2, y2] = box.box;
      return { min: y1, max: y2 };
    });

    // Y座標の最小値と最大値を取得
    const minY = Math.min(
      ...yRanges.map((range) => range.min)
    );
    const maxY = Math.max(
      ...yRanges.map((range) => range.max)
    );
    const height = maxY - minY;

    // 分割候補となるY座標を探索
    const candidates = [];
    const step = height / 20; // 20分割して探索

    for (let y = minY + step; y < maxY - step; y += step) {
      let hasIntersection = false;

      // このY座標でボックスが交差するかチェック
      for (const range of yRanges) {
        if (range.min < y && range.max > y) {
          hasIntersection = true;
          break;
        }
      }

      // 交差がなければ分割候補に追加
      if (!hasIntersection) {
        candidates.push(y);
      }
    }

    // 分割候補がなければ分割しない
    if (candidates.length === 0) {
      return [boxes];
    }

    // 最適な分割位置を選択（中央に近いもの）
    const middleY = minY + height / 2;
    const splitY = candidates.reduce((prev, curr) =>
      Math.abs(curr - middleY) < Math.abs(prev - middleY)
        ? curr
        : prev
    );

    // ボックスを分割
    const upperGroup = boxes.filter(
      (box) => box.center.y < splitY
    );
    const lowerGroup = boxes.filter(
      (box) => box.center.y >= splitY
    );

    // どちらかのグループが空の場合は分割しない
    if (
      upperGroup.length === 0 ||
      lowerGroup.length === 0
    ) {
      return [boxes];
    }

    return [upperGroup, lowerGroup];
  }

  /**
   * 横方向の分割を試みる
   *
   * @param {Array} boxes バウンディングボックスの配列
   * @param {number} imageWidth 画像の幅
   * @param {number} imageHeight 画像の高さ
   * @returns {Array} 分割されたグループの配列
   * @private
   */
  _trySplitHorizontal(boxes, imageWidth, imageHeight) {
    // ボックスが少ない場合は分割しない
    if (boxes.length <= 2) {
      return [boxes];
    }

    // 各ボックスのX座標の範囲を取得
    const xRanges = boxes.map((box) => {
      const [x1, y1, x2, y2] = box.box;
      return { min: x1, max: x2 };
    });

    // X座標の最小値と最大値を取得
    const minX = Math.min(
      ...xRanges.map((range) => range.min)
    );
    const maxX = Math.max(
      ...xRanges.map((range) => range.max)
    );
    const width = maxX - minX;

    // 分割候補となるX座標を探索
    const candidates = [];
    const step = width / 20; // 20分割して探索

    for (let x = minX + step; x < maxX - step; x += step) {
      let hasIntersection = false;

      // このX座標でボックスが交差するかチェック
      for (const range of xRanges) {
        if (range.min < x && range.max > x) {
          hasIntersection = true;
          break;
        }
      }

      // 交差がなければ分割候補に追加
      if (!hasIntersection) {
        candidates.push(x);
      }
    }

    // 分割候補がなければ分割しない
    if (candidates.length === 0) {
      return [boxes];
    }

    // 最適な分割位置を選択（中央に近いもの）
    const middleX = minX + width / 2;
    const splitX = candidates.reduce((prev, curr) =>
      Math.abs(curr - middleX) < Math.abs(prev - middleX)
        ? curr
        : prev
    );

    // 縦書きモードに応じて左右のグループを決定
    let leftGroup, rightGroup;
    if (this.config.verticalMode) {
      // 縦書きモード: 右から左への順序
      rightGroup = boxes.filter(
        (box) => box.center.x >= splitX
      );
      leftGroup = boxes.filter(
        (box) => box.center.x < splitX
      );
      // 縦書きモードでは右から左の順序で返す
      return [rightGroup, leftGroup];
    } else {
      // 横書きモード: 左から右への順序
      leftGroup = boxes.filter(
        (box) => box.center.x < splitX
      );
      rightGroup = boxes.filter(
        (box) => box.center.x >= splitX
      );
      // 横書きモードでは左から右の順序で返す
      return [leftGroup, rightGroup];
    }
  }

  /**
   * ボックスを位置でソート
   *
   * @param {Array} boxes バウンディングボックスの配列
   * @returns {Array} ソートされたボックス
   * @private
   */
  _sortBoxesByPosition(boxes) {
    if (this.config.verticalMode) {
      // 縦書きモード: 右から左、上から下
      return [...boxes].sort((a, b) => {
        // X座標の差が大きい場合（異なる列）
        const xDiff = b.center.x - a.center.x;
        if (Math.abs(xDiff) > 20) {
          return xDiff; // 右から左へ
        }

        // 同じ列の場合はY座標でソート
        return a.center.y - b.center.y; // 上から下へ
      });
    } else {
      // 横書きモード: 上から下、左から右
      return [...boxes].sort((a, b) => {
        // Y座標の差が大きい場合（異なる行）
        const yDiff = a.center.y - b.center.y;
        if (Math.abs(yDiff) > 20) {
          return yDiff; // 上から下へ
        }

        // 同じ行の場合はX座標でソート
        return a.center.x - b.center.x; // 左から右へ
      });
    }
  }
}

/**
 * 後方互換性のための関数
 *
 * @param {Array} detections 検出結果の配列
 * @param {number} imageWidth 画像の幅
 * @param {number} imageHeight 画像の高さ
 * @returns {Array} 読み順に整列された検出結果
 */
export function evalXml(
  detections,
  imageWidth,
  imageHeight
) {
  const processor = new ReadingOrderProcessor();
  return processor.process(
    detections,
    imageWidth,
    imageHeight
  );
}
