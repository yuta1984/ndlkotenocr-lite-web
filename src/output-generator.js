/**
 * NDLKotenOCR Web版 - 出力生成モジュール
 *
 * このファイルは、OCR結果を様々な形式（XML, JSON, TXT）で出力するモジュールです。
 * 元のPythonコードのsrc/ndl_parser.pyを参考に実装しています。
 */

import * as yaml from 'js-yaml';

/**
 * 出力生成の設定
 */
const defaultConfig = {
  // XML出力の設定
  xml: {
    includeConfidence: true, // 信頼度スコアを含める
    prettyPrint: true, // 整形出力
    encoding: 'UTF-8', // 文字エンコーディング
  },
  // JSON出力の設定
  json: {
    includeConfidence: true, // 信頼度スコアを含める
    prettyPrint: true, // 整形出力
    includeMetadata: true, // メタデータを含める
  },
  // テキスト出力の設定
  txt: {
    separator: '\n', // 行区切り文字
    includeBoundingBox: false, // バウンディングボックス情報を含める
  },
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
      '出力生成: 設定ファイルのパスが指定されていません。デフォルト設定を使用します。'
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

    // 出力生成設定を取得
    if (yamlConfig && yamlConfig.output_generation) {
      const outputConfig = yamlConfig.output_generation;

      // XML設定を更新
      if (outputConfig.xml) {
        config.xml = { ...config.xml, ...outputConfig.xml };
      }

      // JSON設定を更新
      if (outputConfig.json) {
        config.json = {
          ...config.json,
          ...outputConfig.json,
        };
      }

      // テキスト設定を更新
      if (outputConfig.txt) {
        config.txt = { ...config.txt, ...outputConfig.txt };
      }
    }

    console.log(
      '出力生成: 設定ファイルを読み込みました:',
      config
    );
    return config;
  } catch (error) {
    console.warn(
      `出力生成: 設定ファイルの読み込みに失敗しました: ${error.message}。デフォルト設定を使用します。`
    );
    return config;
  }
}

/**
 * 出力生成クラス
 * OCR結果を様々な形式で出力するクラス
 */
export class OutputGenerator {
  /**
   * コンストラクタ
   *
   * @param {Object} config 設定オブジェクト
   */
  constructor(config = null) {
    this.config = config || { ...defaultConfig };
    console.log(
      '出力生成: 設定を適用しました:',
      this.config
    );
  }

  /**
   * XML形式で出力を生成
   *
   * @param {Array} detections 検出結果の配列
   * @param {number} imageWidth 画像の幅
   * @param {number} imageHeight 画像の高さ
   * @param {string} imageName 画像名
   * @returns {string} XML形式の出力
   */
  generateXML(
    detections,
    imageWidth,
    imageHeight,
    imageName = 'image'
  ) {
    console.log(
      `出力生成: XML形式で出力を生成します (${
        detections ? detections.length : 0
      }件)`
    );

    // 検出結果が空の場合は空のXMLを返す
    if (!detections || detections.length === 0) {
      return `<?xml version="1.0" encoding="${this.config.xml.encoding}"?>
<document>
  <image name="${imageName}" width="${imageWidth}" height="${imageHeight}">
  </image>
</document>`;
    }

    // XMLヘッダーと画像情報
    let xml = `<?xml version="1.0" encoding="${this.config.xml.encoding}"?>
<document>
  <image name="${imageName}" width="${imageWidth}" height="${imageHeight}">
`;

    // 各検出結果をXML要素として追加
    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const [x1, y1, x2, y2] = detection.box;
      const text = this._escapeXml(detection.text || '');

      let attributes = `id="${i + 1}" x="${Math.round(
        x1
      )}" y="${Math.round(y1)}" width="${Math.round(
        x2 - x1
      )}" height="${Math.round(y2 - y1)}"`;

      // 信頼度スコアを含める場合
      if (
        this.config.xml.includeConfidence &&
        detection.score !== undefined
      ) {
        attributes += ` confidence="${detection.score.toFixed(
          4
        )}"`;
      }

      xml += `    <text ${attributes}>${text}</text>\n`;
    }

    // XMLフッター
    xml += `  </image>
</document>`;

    return xml;
  }

  /**
   * JSON形式で出力を生成
   *
   * @param {Array} detections 検出結果の配列
   * @param {number} imageWidth 画像の幅
   * @param {number} imageHeight 画像の高さ
   * @param {string} imageName 画像名
   * @returns {Object} JSON形式の出力
   */
  generateJSON(
    detections,
    imageWidth,
    imageHeight,
    imageName = 'image'
  ) {
    console.log(
      `出力生成: JSON形式で出力を生成します (${
        detections ? detections.length : 0
      }件)`
    );

    // 検出結果が空の場合は空のJSONを返す
    if (!detections || detections.length === 0) {
      return {
        document: {
          image: {
            name: imageName,
            width: imageWidth,
            height: imageHeight,
            text: [],
          },
        },
      };
    }

    // 各検出結果をJSON要素として追加
    const textElements = [];
    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const [x1, y1, x2, y2] = detection.box;

      const textElement = {
        id: i + 1,
        x: Math.round(x1),
        y: Math.round(y1),
        width: Math.round(x2 - x1),
        height: Math.round(y2 - y1),
        text: detection.text || '',
      };

      // 信頼度スコアを含める場合
      if (
        this.config.json.includeConfidence &&
        detection.score !== undefined
      ) {
        textElement.confidence = parseFloat(
          detection.score.toFixed(4)
        );
      }

      textElements.push(textElement);
    }

    // JSON構造を作成
    const jsonOutput = {
      document: {
        image: {
          name: imageName,
          width: imageWidth,
          height: imageHeight,
          text: textElements,
        },
      },
    };

    // メタデータを含める場合
    if (this.config.json.includeMetadata) {
      jsonOutput.metadata = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        engine: 'NDLKotenOCR Web',
      };
    }

    return jsonOutput;
  }

  /**
   * テキスト形式で出力を生成
   *
   * @param {Array} detections 検出結果の配列
   * @returns {string} テキスト形式の出力
   */
  generateTXT(detections) {
    console.log(
      `出力生成: テキスト形式で出力を生成します (${
        detections ? detections.length : 0
      }件)`
    );

    // 検出結果が空の場合は空の文字列を返す
    if (!detections || detections.length === 0) {
      return '';
    }

    // 各検出結果のテキストを結合
    let text = '';
    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      if (detection.text) {
        // バウンディングボックス情報を含める場合
        if (this.config.txt.includeBoundingBox) {
          const [x1, y1, x2, y2] = detection.box;
          text += `[${i + 1}] (${Math.round(
            x1
          )},${Math.round(y1)},${Math.round(
            x2
          )},${Math.round(y2)}): `;
        }

        text += detection.text + this.config.txt.separator;
      }
    }

    return text;
  }

  /**
   * XMLで使用される特殊文字をエスケープ
   *
   * @param {string} str エスケープする文字列
   * @returns {string} エスケープされた文字列
   * @private
   */
  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * 後方互換性のための関数
 */
export function generateXML(
  detections,
  imageWidth,
  imageHeight,
  imageName = 'image'
) {
  const generator = new OutputGenerator();
  return generator.generateXML(
    detections,
    imageWidth,
    imageHeight,
    imageName
  );
}

export function generateJSON(
  detections,
  imageWidth,
  imageHeight,
  imageName = 'image'
) {
  const generator = new OutputGenerator();
  return generator.generateJSON(
    detections,
    imageWidth,
    imageHeight,
    imageName
  );
}

export function generateTXT(detections) {
  const generator = new OutputGenerator();
  return generator.generateTXT(detections);
}
