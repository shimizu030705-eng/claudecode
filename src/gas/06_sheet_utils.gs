/**
 * ============================================
 * スプレッドシート操作
 * ============================================
 */

/**
 * 共通設定を取得
 * @returns {Object} 共通設定
 */
function getCommonSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.COMMON_SETTINGS);
  if (!sheet) {
    throw new Error(`共通設定シート(${SHEET_NAMES.COMMON_SETTINGS})が見つかりません`);
  }

  const data = sheet.getDataRange().getValues();

  return {
    adAccountId: normalizeAccountId(data[SETTINGS_ROWS.AD_ACCOUNT_ID][1]),
    pageId: data[SETTINGS_ROWS.PAGE_ID][1],
    instagramAccountId: data[SETTINGS_ROWS.INSTAGRAM_ACCOUNT_ID][1],
    pixelId: data[SETTINGS_ROWS.PIXEL_ID][1],
    ageMin: data[SETTINGS_ROWS.AGE_MIN][1],
    ageMax: data[SETTINGS_ROWS.AGE_MAX][1],
    cpaCap: data[SETTINGS_ROWS.CPA_CAP][1],
    notificationEmail: data[SETTINGS_ROWS.NOTIFICATION_EMAIL][1],
    accessToken: data[SETTINGS_ROWS.ACCESS_TOKEN][1],
    geminiApiKey: data[SETTINGS_ROWS.GEMINI_API_KEY] ? data[SETTINGS_ROWS.GEMINI_API_KEY][1] : ''
  };
}

/**
 * 広告アカウントIDを正規化（act_プレフィックスを付与）
 * @param {string} accountId - アカウントID
 * @returns {string} 正規化されたID
 */
function normalizeAccountId(accountId) {
  const s = String(accountId).trim();
  return s.startsWith('act_') ? s : `act_${s}`;
}

/**
 * 未処理のキャンペーンを取得
 * @returns {Array} キャンペーンデータの配列
 */
function getUnprocessedCampaigns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS);
  if (!sheet) {
    throw new Error(`キャンペーン設定シート(${SHEET_NAMES.CAMPAIGN_SETTINGS})が見つかりません`);
  }

  const data = sheet.getDataRange().getValues();
  const campaigns = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[CAMPAIGN_COLS.STATUS];

    if (status === STATUS.UNPROCESSED || status === '' || status === null) {
      campaigns.push({
        rowIndex: i + 1,
        campaignType: row[CAMPAIGN_COLS.CAMPAIGN_TYPE],
        campaignNumber: row[CAMPAIGN_COLS.CAMPAIGN_NUMBER],
        campaignName: row[CAMPAIGN_COLS.CAMPAIGN_NAME],
        address: row[CAMPAIGN_COLS.ADDRESS],
        targetRadius: row[CAMPAIGN_COLS.TARGET_RADIUS],
        dailyBudget: row[CAMPAIGN_COLS.DAILY_BUDGET],
        startDate: row[CAMPAIGN_COLS.START_DATE],
        startTime: row[CAMPAIGN_COLS.START_TIME],
        endDate: row[CAMPAIGN_COLS.END_DATE],
        endTime: row[CAMPAIGN_COLS.END_TIME],
        lpUrl: row[CAMPAIGN_COLS.LP_URL],
        adHeadline: row[CAMPAIGN_COLS.AD_HEADLINE],
        adBody: row[CAMPAIGN_COLS.AD_BODY],
        videoUrl: row[CAMPAIGN_COLS.VIDEO_URL],
        videoCrName: row[CAMPAIGN_COLS.VIDEO_CR_NAME],
        imageUrl: row[CAMPAIGN_COLS.IMAGE_URL],
        imageCrName: row[CAMPAIGN_COLS.IMAGE_CR_NAME]
      });
    }
  }

  return campaigns;
}

/**
 * キャンペーンのステータスを更新
 * @param {number} rowIndex - 行番号
 * @param {Object} result - 処理結果
 */
function updateCampaignStatus(rowIndex, result) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS);

  sheet.getRange(rowIndex, CAMPAIGN_COLS.STATUS + 1).setValue(result.status);
  sheet.getRange(rowIndex, CAMPAIGN_COLS.PROCESSED_AT + 1).setValue(new Date());

  if (result.status === STATUS.COMPLETED) {
    sheet.getRange(rowIndex, CAMPAIGN_COLS.CAMPAIGN_ID + 1).setValue(result.campaignId);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.ADSET_ID + 1).setValue(result.adsetId);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.AD_ID_VIDEO + 1).setValue(result.adIdVideo);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.AD_ID_IMAGE + 1).setValue(result.adIdImage || '');
  } else {
    sheet.getRange(rowIndex, CAMPAIGN_COLS.ERROR_MESSAGE + 1).setValue(result.errorMessage);
  }
}

/**
 * videosシートに動画情報を追加
 * @param {string} videoName - 動画名
 * @param {string} videoId - Meta動画ID
 * @param {string} videoUrl - 動画URL
 * @param {Date} uploadDate - アップロード日時
 */
function addVideoRecord(videoName, videoId, videoUrl, uploadDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.VIDEOS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.VIDEOS);
    sheet.getRange(1, 1, 1, 4).setValues([['動画名', '固有ID', '動画URL', 'アップ日']]);
    sheet.setFrozenRows(1);
  }

  const tz = Session.getScriptTimeZone();
  const formattedDate = Utilities.formatDate(uploadDate, tz, 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([videoName, videoId, videoUrl, formattedDate]);
}

/**
 * 実行ログを追加
 * @param {string} campaignName - キャンペーン名
 * @param {string} result - 結果
 * @param {string} campaignId - キャンペーンID
 * @param {string} adsetId - 広告セットID
 * @param {string} adIdVideo - 動画広告ID
 * @param {string} adIdImage - 画像広告ID
 * @param {string} detail - 詳細
 */
function addExecutionLog(campaignName, result, campaignId, adsetId, adIdVideo, adIdImage, detail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.EXECUTION_LOG);

  if (!sheet) return;

  sheet.appendRow([
    new Date(),
    campaignName,
    result,
    campaignId,
    adsetId,
    adIdVideo,
    adIdImage,
    detail
  ]);
}

// ============================================
// シート初期設定関数
// ============================================

/**
 * キャンペーン設定シートの初期設定
 * @param {Spreadsheet} ss - スプレッドシート
 */
function setupCampaignSettingsSheet(ss) {
  const sheetName = SHEET_NAMES.CAMPAIGN_SETTINGS;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const headers = [
    'キャンペーン種別',
    'キャンペーン番号',
    'キャンペーン名',
    '住所',
    'ターゲット半径(km)',
    '日予算(円)',
    '開始日',
    '開始時刻',
    '終了日',
    '終了時刻',
    'LP URL',
    '広告見出し',
    '広告本文',
    '動画URL',
    '動画クリエイティブ名',
    '画像URL',
    '画像クリエイティブ名',
    'ステータス',
    'キャンペーンID',
    '広告セットID',
    '広告ID（動画）',
    '広告ID（画像）',
    '処理日時',
    'エラーメッセージ'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * 共通設定シートの初期設定
 * @param {Spreadsheet} ss - スプレッドシート
 */
function setupCommonSettingsSheet(ss) {
  const sheetName = SHEET_NAMES.COMMON_SETTINGS;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const settings = [
    ['広告アカウントID', ''],
    ['ページID', ''],
    ['InstagramアカウントID', ''],
    ['ピクセルID', ''],
    ['年齢下限', 18],
    ['年齢上限', 65],
    ['CPA上限(円)', 5000],
    ['通知メールアドレス', ''],
    ['Meta Access Token', ''],
    ['Gemini API Key', '']
  ];

  sheet.getRange(1, 1, settings.length, 2).setValues(settings);
  sheet.autoResizeColumns(1, 2);
}

/**
 * videosシートの初期設定
 * @param {Spreadsheet} ss - スプレッドシート
 */
function setupVideosSheet(ss) {
  const sheetName = SHEET_NAMES.VIDEOS;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const headers = ['動画名', '固有ID', '動画URL', 'アップ日'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * analysisシートの初期設定
 * @param {Spreadsheet} ss - スプレッドシート
 */
function setupAnalysisSheet(ss) {
  const sheetName = SHEET_NAMES.ANALYSIS;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const headers = [
    'ファイル名',
    'ファイルID',

    'フォーマット',
    '時間',
    '尺_秒',

    '冒頭3秒の掴み_映像',
    '（正）冒頭映像タイプ（主）',
    '（正）冒頭映像タグ1',
    '（正）冒頭映像タグ2',
    '（正）冒頭映像タグ3',

    '冒頭3秒の掴み_コピー',
    '（正）冒頭コピータイプ（主）',
    '（正）冒頭コピータグ1',
    '（正）冒頭コピータグ2',
    '（正）冒頭コピータグ3',

    'ナレーション',
    'BGM',
    '登場人物',
    'シーン構成やテンポ',

    '主な訴求軸',
    '（正）訴求軸（主）',
    '（正）訴求タグ1',
    '（正）訴求タグ2',

    '喚起している感情',
    '（正）感情（主）',
    '（正）感情タグ1',

    '最後のCTA',
    '（正）CTAタイプ（主）',
    '（正）CTAタグ1',
    '（正）CTAタグ2',
    '（正）CTAタグ3',

    '（正）辞書バージョン',
    '（正）要レビュー',
    '（正）分類メモ',

    'ステータス',
    '最終更新'
  ];

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

/**
 * 実行ログシートの初期設定
 * @param {Spreadsheet} ss - スプレッドシート
 */
function setupExecutionLogSheet(ss) {
  const sheetName = SHEET_NAMES.EXECUTION_LOG;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const headers = [
    '実行日時',
    'キャンペーン名',
    '結果',
    'キャンペーンID',
    '広告セットID',
    '広告ID（動画）',
    '広告ID（画像）',
    '詳細'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * ヘッダー名から列番号を取得
 * @param {Sheet} sheet - シート
 * @param {string} headerName - ヘッダー名
 * @returns {number} 列番号（1-based）
 */
function getColIndexByHeader(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  if (idx === -1) throw new Error(`header not found: ${headerName}`);
  return idx + 1;
}
