/**
 * ============================================
 * Gemini API による動画分析
 * ============================================
 */

/**
 * videosシートの動画を分析してanalysisシートに出力
 * @param {string} apiKey - Gemini API Key
 */
function analyzeAllVideos(apiKey) {
  const ss = SpreadsheetApp.getActive();

  const videosSheet = ss.getSheetByName(SHEET_NAMES.VIDEOS);
  if (!videosSheet) {
    throw new Error(`入力シート(${SHEET_NAMES.VIDEOS})が見つかりません`);
  }

  const analysisSheet = ss.getSheetByName(SHEET_NAMES.ANALYSIS) || ss.insertSheet(SHEET_NAMES.ANALYSIS);
  if (analysisSheet.getLastRow() === 0) {
    setupAnalysisSheet(ss);
  }

  const COL_STATUS = getColIndexByHeader(analysisSheet, 'ステータス');
  const COL_UPDATED = getColIndexByHeader(analysisSheet, '最終更新');

  const lastRow = videosSheet.getLastRow();
  if (lastRow < 2) return;

  // videosシート: A=動画名, B=固有ID, C=動画URL
  const values = videosSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const outMap = buildOutputIndex(analysisSheet);

  let processed = 0;

  for (let i = 0; i < values.length; i++) {
    if (processed >= GEMINI_CONFIG.MAX_FILES_PER_RUN) break;

    const [videoName, videoId, videoUrl] = values[i];
    if (!videoUrl) continue;

    // Drive URLからファイルIDを取得
    const driveFileId = extractFileIdFromUrl(videoUrl);

    const existingRow = outMap[driveFileId];
    const rowToWrite = existingRow || analysisSheet.getLastRow() + 1;

    if (!existingRow) {
      analysisSheet.getRange(rowToWrite, 1, 1, 2).setValues([[videoName, driveFileId]]);
    } else {
      const status = analysisSheet.getRange(existingRow, COL_STATUS).getValue();
      if (status === 'DONE') continue;
    }

    try {
      analysisSheet.getRange(rowToWrite, COL_STATUS).setValue('UPLOADING');

      const driveFile = getDriveFileById(driveFileId);

      // サイズ制限チェック
      const maxBytes = GEMINI_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
      if (GEMINI_CONFIG.MAX_FILE_SIZE_MB && driveFile.getSize() > maxBytes) {
        throw new Error(`ファイルが大きすぎます（>${GEMINI_CONFIG.MAX_FILE_SIZE_MB}MB）`);
      }

      const blob = driveFile.getBlob();
      const mimeType = blob.getContentType();

      // 1) Gemini Filesへアップロード
      const uploaded = uploadToGeminiFiles(apiKey, driveFile);

      // 2) state=ACTIVE まで待機
      const activeFile = waitUntilGeminiFileActive(apiKey, uploaded.name);

      // 3) 生成（要素抽出＋正規化）
      analysisSheet.getRange(rowToWrite, COL_STATUS).setValue('ANALYZING');
      const extracted = extractCreativeElements(apiKey, activeFile.uri, mimeType, driveFile.getName());

      // 4) 書き込み
      writeAnalysisRow(analysisSheet, rowToWrite, videoName, driveFileId, extracted);

      analysisSheet.getRange(rowToWrite, COL_STATUS).setValue('DONE');
      analysisSheet.getRange(rowToWrite, COL_UPDATED).setValue(new Date());

      processed++;
    } catch (e) {
      analysisSheet.getRange(rowToWrite, COL_STATUS).setValue(`ERROR: ${e.message || e}`);
      analysisSheet.getRange(rowToWrite, COL_UPDATED).setValue(new Date());
    }
  }
}

/**
 * Gemini Files APIにアップロード
 * @param {string} apiKey - API Key
 * @param {File} driveFile - Driveファイル
 * @returns {Object} アップロード結果
 */
function uploadToGeminiFiles(apiKey, driveFile) {
  const blob = driveFile.getBlob();
  const mimeType = blob.getContentType();
  const numBytes = driveFile.getSize();

  // start
  const startResp = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ file: { display_name: driveFile.getName() } }),
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType
      },
      muteHttpExceptions: true
    }
  );

  if (startResp.getResponseCode() >= 300) {
    throw new Error(`upload start failed: ${startResp.getResponseCode()} ${startResp.getContentText()}`);
  }

  const uploadUrl = getHeaderIgnoreCase(startResp.getAllHeaders(), 'x-goog-upload-url');
  if (!uploadUrl) throw new Error('upload url not found in response headers');

  // upload + finalize
  const upResp = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    contentType: mimeType,
    payload: blob,
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    muteHttpExceptions: true
  });

  if (upResp.getResponseCode() >= 300) {
    throw new Error(`upload finalize failed: ${upResp.getResponseCode()} ${upResp.getContentText()}`);
  }

  const json = JSON.parse(upResp.getContentText());
  return json.file;
}

/**
 * Geminiファイルがアクティブになるまで待機
 * @param {string} apiKey - API Key
 * @param {string} fileName - ファイル名
 * @returns {Object} ファイル情報
 */
function waitUntilGeminiFileActive(apiKey, fileName) {
  let last = null;

  for (let i = 0; i < GEMINI_CONFIG.POLL_MAX_TRIES; i++) {
    const resp = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`,
      { muteHttpExceptions: true }
    );

    if (resp.getResponseCode() >= 300) {
      throw new Error(`files.get failed: ${resp.getResponseCode()} ${resp.getContentText()}`);
    }

    const file = JSON.parse(resp.getContentText());
    last = file;

    if (!file.state || String(file.state) === 'ACTIVE') return file;
    Utilities.sleep(GEMINI_CONFIG.POLL_INTERVAL_MS);
  }

  throw new Error(`file not ACTIVE after polling. lastState=${last && last.state}`);
}

/**
 * 動画要素を抽出・分析
 * @param {string} apiKey - API Key
 * @param {string} fileUri - ファイルURI
 * @param {string} mimeType - MIMEタイプ
 * @param {string} displayName - 表示名
 * @returns {Object} 分析結果
 */
function extractCreativeElements(apiKey, fileUri, mimeType, displayName) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const schema = {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['縦(9:16)', '横(16:9)', '正方形(1:1)', '不明'] },
      time: { type: 'string' },
      duration_seconds: { type: 'integer' },

      hook_visual_3sec: { type: 'string' },
      norm_hook_visual_type_main: {
        type: 'string',
        enum: [
          '日常/食事シーン', '悩み共感（落胆/不安）', '理想/変化提示（ビフォアフ含む）',
          'デモ/画面（操作・手元）', '権威/専門家（監修・白衣など）',
          'UGC風（自撮り・素人感）', 'ストーリー導入', 'その他/不明'
        ]
      },
      norm_hook_visual_tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },

      hook_copy_3sec: { type: 'string' },
      norm_hook_copy_type_main: {
        type: 'string',
        enum: ['数字・期間ベネフィット', '注意喚起/命令', 'ベネフィット断定', 'ターゲット指名', '否定/間違い指摘', '損失回避', '疑問', 'その他/不明']
      },
      norm_hook_copy_tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },

      narration: { type: 'string' },
      bgm: { type: 'string' },
      characters: { type: 'array', items: { type: 'string' } },
      scene_structure_tempo: { type: 'string' },

      main_value_props: { type: 'array', items: { type: 'string' } },
      norm_value_prop_main: {
        type: 'string',
        enum: ['楽さ/簡単', '短期間/即効', 'リバウンド防止', '健康', 'コスパ', '個別サポート', '実績/証拠（口コミ・数字）', '科学/根拠', '部位特化', 'その他/不明']
      },
      norm_value_prop_tags: { type: 'array', items: { type: 'string' }, maxItems: 2 },

      evoked_emotions: { type: 'array', items: { type: 'string' } },
      norm_emotion_main: { type: 'string', enum: ['不安', '希望', '安心', '焦り', '羨望', '恥/罪悪感', '自信', 'その他/不明'] },
      norm_emotion_tags: { type: 'array', items: { type: 'string' }, maxItems: 1 },

      final_cta: { type: 'string' },
      norm_cta_type_main: { type: 'string', enum: ['無料相談/無料体験の申込', 'LINE追加', 'リンク誘導/チェック', '購入/申込', 'その他/不明'] },
      norm_cta_tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },

      taxonomy_version: { type: 'string' },
      needs_review: { type: 'boolean' },
      normalize_note: { type: 'string' }
    },
    required: [
      'format', 'time', 'duration_seconds',
      'hook_visual_3sec', 'norm_hook_visual_type_main', 'norm_hook_visual_tags',
      'hook_copy_3sec', 'norm_hook_copy_type_main', 'norm_hook_copy_tags',
      'narration', 'bgm', 'characters', 'scene_structure_tempo',
      'main_value_props', 'norm_value_prop_main', 'norm_value_prop_tags',
      'evoked_emotions', 'norm_emotion_main', 'norm_emotion_tags',
      'final_cta', 'norm_cta_type_main', 'norm_cta_tags',
      'taxonomy_version', 'needs_review', 'normalize_note'
    ],
    additionalProperties: false
  };

  const prompt = `
あなたは「Meta広告の動画クリエイティブ分析者」です。
次の動画（${displayName}）を視聴し、指定JSONスキーマに**厳密に従って**出力してください。

【重要】
- まず「自由記述（動画で何が起きているか/何と言っているか）」を埋める
- 次に「正規化（和名カテゴリ）」を埋める（選択肢はスキーマのenumに完全一致させる）
- 不明でも空欄にしない。必ず埋める（その他/不明 を使って良い）
- 迷いがある/その他を使った/新しい表現が強い場合は needs_review=true にする
- normalize_note には、迷った理由や補足を短く書く
- タグ配列は最大数を守る（冒頭タグは最大3 / 訴求タグは最大2 / 感情タグは最大1 / CTAタグは最大3）
- taxonomy_version は "${GEMINI_CONFIG.TAXONOMY_VERSION}" を入れる

【抽出ガイド】
- 0〜3秒は最重要：映像（何が見えるか）とコピー（テロップ/字幕）を分ける
- コピーは完全一致でなくてOK、意味が通る範囲で要約
- duration_seconds は動画の長さを秒で推定して整数で

【タグ候補（できるだけここから選ぶ）】
- 冒頭映像タグ：食事 / 体重計 / 鏡 / お腹・贅肉 / スマホ画面 / ジェスチャー（数字） / 不安表情 / 笑顔 / 複数（男女） / 運動 / 家 / 外出
- 冒頭コピータグ：期間（3ヶ月） / 数字（10kg） / 矛盾（食べてないのに太る） / 運動しても落ちない / サプリ否定 / 部位（部分痩せ） / 永続（ずっと/一生） / 簡単 / 無料
- 訴求タグ：食事管理 / トレ不要 / 部位（下半身） / 生活習慣 / サポート / 実績（口コミ） / 科学（根拠） / コスパ
- 感情タグ：不安 / 焦り / 安心 / 希望 / 自信
- CTAタグ：無料 / 希少性（人数限定） / 緊急性（今すぐ） / リンク明示 / URL表示 / LINE追加 / 相談予約
`.trim();

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { file_data: { mime_type: mimeType, file_uri: fileUri } }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      temperature: 0.2
    }
  };

  const resp = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() >= 300) {
    throw new Error(`generateContent failed: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }

  const json = JSON.parse(resp.getContentText());
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No output text found in response');

  return JSON.parse(text);
}

/**
 * 分析結果をシートに書き込む
 * @param {Sheet} sheet - 対象シート
 * @param {number} row - 行番号
 * @param {string} fileName - ファイル名
 * @param {string} fileId - ファイルID
 * @param {Object} d - 分析データ
 */
function writeAnalysisRow(sheet, row, fileName, fileId, d) {
  const hv = padArray(d.norm_hook_visual_tags, 3);
  const hc = padArray(d.norm_hook_copy_tags, 3);
  const vp = padArray(d.norm_value_prop_tags, 2);
  const em = padArray(d.norm_emotion_tags, 1);
  const ct = padArray(d.norm_cta_tags, 3);

  // 1列目〜34列目まで（ステータス/最終更新は除外）
  sheet.getRange(row, 1, 1, 34).setValues([
    [
      fileName,
      fileId,

      d.format,
      d.time,
      d.duration_seconds,

      d.hook_visual_3sec,
      d.norm_hook_visual_type_main,
      hv[0], hv[1], hv[2],

      d.hook_copy_3sec,
      d.norm_hook_copy_type_main,
      hc[0], hc[1], hc[2],

      d.narration,
      d.bgm,
      (d.characters || []).join('\n'),
      d.scene_structure_tempo,

      (d.main_value_props || []).join('\n'),
      d.norm_value_prop_main,
      vp[0], vp[1],

      (d.evoked_emotions || []).join('\n'),
      d.norm_emotion_main,
      em[0],

      d.final_cta,
      d.norm_cta_type_main,
      ct[0], ct[1], ct[2],

      d.taxonomy_version || GEMINI_CONFIG.TAXONOMY_VERSION,
      !!d.needs_review,
      d.normalize_note || ''
    ]
  ]);
}

/**
 * analysisシートのfileId -> 行番号インデックスを構築
 * @param {Sheet} outSheet - analysisシート
 * @returns {Object} インデックス
 */
function buildOutputIndex(outSheet) {
  const map = {};
  const lastRow = outSheet.getLastRow();
  if (lastRow < 2) return map;

  const ids = outSheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i][0];
    if (id) map[id] = i + 2;
  }
  return map;
}
