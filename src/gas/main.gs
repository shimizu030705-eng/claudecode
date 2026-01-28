/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * メイン実行関数・メニュー
 * ============================================
 */

/**
 * スプレッドシートを開いた時にメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Meta広告自動化')
    .addItem('キャンペーン作成を実行', 'executeCreateCampaigns')
    .addSeparator()
    .addItem('動画をvideosシートに書き出す', 'exportVideoFilesToSheet')
    .addItem('動画を分析して書き出す', 'analyzeAllVideos')
    .addItem('分析シートのヘッダー初期化', 'setupAnalysisSheet')
    .addSeparator()
    .addItem('レポート更新（昨日）', 'runReport_Yesterday')
    .addItem('レポート更新（過去7日間）', 'runReport_Last7D')
    .addItem('レポート更新（直近1ヶ月）', 'runReport_Last30D')
    .addItem('レポート更新（直近3ヶ月）', 'runReport_Last90D')
    .addItem('レポート全タブ更新', 'runReport_All')
    .addSeparator()
    .addItem('日次トリガー設定', 'createDailyAllTabsTrigger')
    .addSeparator()
    .addItem('シート初期設定', 'initializeAllSheets')
    .addToUi();
}

/**
 * 全シートを初期化
 */
function initializeAllSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '確認',
    '全シートを初期化します。既存のデータは消去されます。よろしいですか？',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 共通設定シート
  setupCommonSettingsSheet_(ss);

  // キャンペーン設定シート
  setupCampaignSettingsSheet_(ss);

  // videosシート
  setupVideosSheet_(ss);

  // analysisシート
  setupAnalysisSheet();

  // 実行ログシート
  setupExecutionLogSheet_(ss);

  // レポートシート
  setupAllReportSheets();

  ui.alert('全シートの初期化が完了しました。');
}

/**
 * 共通設定シートの初期化
 */
function setupCommonSettingsSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.COMMON_SETTINGS) ||
                ss.insertSheet(SHEET_NAMES.COMMON_SETTINGS);

  sheet.clear();

  const headers = [
    ['広告アカウントID', ''],
    ['ページID', ''],
    ['InstagramアカウントID', ''],
    ['ピクセルID', ''],
    ['年齢下限', 18],
    ['年齢上限', 65],
    ['CPA上限', 5000],
    ['通知メールアドレス', ''],
    ['アクセストークン', ''],
    ['GeminiAPIキー', '']
  ];

  sheet.getRange(1, 1, headers.length, 2).setValues(headers);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 400);
}

/**
 * キャンペーン設定シートの初期化
 */
function setupCampaignSettingsSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS) ||
                ss.insertSheet(SHEET_NAMES.CAMPAIGN_SETTINGS);

  sheet.clear();

  const headers = [
    'キャンペーン種別',
    'キャンペーン番号',
    '店舗名',
    '住所',
    'ターゲット半径(km)',
    '日予算(円)',
    '開始日',
    '開始時間',
    '終了日',
    '終了時間',
    'LP URL',
    '広告見出し',
    '広告本文',
    'クリエイティブフォルダURL',
    '画像ファイル名',
    '画像CR名',
    '動画ファイル名',
    '動画CR名',
    'ステータス',
    'キャンペーンID',
    '広告セットID',
    '広告ID(画像)',
    '広告ID(動画)',
    '処理日時',
    'エラーメッセージ'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  // ドロップダウン設定（キャンペーン種別）
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['認知', 'リード獲得'], true)
    .build();
  sheet.getRange('A2:A1000').setDataValidation(rule);

  // ステータス列のデフォルト値
  sheet.getRange('S2:S1000').setValue(STATUS.UNPROCESSED);
}

/**
 * videosシートの初期化
 */
function setupVideosSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.VIDEOS) ||
                ss.insertSheet(SHEET_NAMES.VIDEOS);

  sheet.clear();

  const headers = ['動画名', '固有ID', '動画URL', 'アップ日', 'キャンペーンID', '広告ID'];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * 実行ログシートの初期化
 */
function setupExecutionLogSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.EXECUTION_LOG) ||
                ss.insertSheet(SHEET_NAMES.EXECUTION_LOG);

  sheet.clear();

  const headers = [
    '実行日時',
    '店舗名',
    '結果',
    'キャンペーンID',
    '広告セットID',
    '広告ID(画像)',
    '広告ID(動画)',
    '詳細'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * キャンペーン作成のメイン実行関数
 */
function executeCreateCampaigns() {
  const ui = SpreadsheetApp.getUi();

  const results = {
    success: [],
    failed: []
  };

  try {
    const settings = getCommonSettings();
    const campaigns = getUnprocessedCampaigns();

    if (campaigns.length === 0) {
      ui.alert('未処理のキャンペーンデータがありません。');
      return;
    }

    for (const campaign of campaigns) {
      try {
        const result = processCampaign(campaign, settings);
        results.success.push({
          storeName: campaign.storeName,
          campaignId: result.campaignId,
          adsetId: result.adsetId,
          adIdImage: result.adIdImage,
          adIdVideo: result.adIdVideo
        });

        updateCampaignStatus(campaign.rowIndex, {
          status: STATUS.COMPLETED,
          campaignId: result.campaignId,
          adsetId: result.adsetId,
          adIdImage: result.adIdImage,
          adIdVideo: result.adIdVideo
        });

        // videosシートに動画情報を記録
        if (result.videoId) {
          addVideoRecord(
            campaign.videoFile,
            result.videoId,
            result.videoUrl || '',
            result.campaignId,
            result.adIdVideo
          );
        }

        addExecutionLog(
          campaign.storeName,
          '成功',
          result.campaignId,
          result.adsetId,
          result.adIdImage,
          result.adIdVideo,
          'キャンペーン作成完了'
        );

      } catch (error) {
        results.failed.push({
          storeName: campaign.storeName,
          error: error.message
        });

        updateCampaignStatus(campaign.rowIndex, {
          status: STATUS.ERROR,
          errorMessage: error.message
        });

        addExecutionLog(campaign.storeName, '失敗', '', '', '', '', error.message);
      }
    }

    sendNotificationEmail(settings.notificationEmail, results);

    ui.alert(`処理完了\n成功: ${results.success.length}件\n失敗: ${results.failed.length}件`);

  } catch (error) {
    ui.alert(`エラーが発生しました: ${error.message}`);
    Logger.log(error);
  }
}

/**
 * 共通設定を取得
 */
function getCommonSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.COMMON_SETTINGS);

  if (!sheet) {
    throw new Error('共通設定シートが見つかりません。シート初期設定を実行してください。');
  }

  const data = sheet.getDataRange().getValues();

  return {
    adAccountId: data[SETTINGS_ROWS.AD_ACCOUNT_ID][1],
    pageId: data[SETTINGS_ROWS.PAGE_ID][1],
    instagramAccountId: data[SETTINGS_ROWS.INSTAGRAM_ACCOUNT_ID][1],
    pixelId: data[SETTINGS_ROWS.PIXEL_ID][1],
    ageMin: data[SETTINGS_ROWS.AGE_MIN][1],
    ageMax: data[SETTINGS_ROWS.AGE_MAX][1],
    cpaCap: data[SETTINGS_ROWS.CPA_CAP][1],
    notificationEmail: data[SETTINGS_ROWS.NOTIFICATION_EMAIL][1],
    accessToken: data[SETTINGS_ROWS.ACCESS_TOKEN][1],
    geminiApiKey: data[SETTINGS_ROWS.GEMINI_API_KEY][1]
  };
}

/**
 * 未処理のキャンペーンを取得
 */
function getUnprocessedCampaigns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS);

  if (!sheet) {
    throw new Error('キャンペーン設定シートが見つかりません。');
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
        storeName: row[CAMPAIGN_COLS.STORE_NAME],
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
        creativeFolderUrl: row[CAMPAIGN_COLS.CREATIVE_FOLDER_URL],
        imageFile: row[CAMPAIGN_COLS.IMAGE_FILE],
        imageCrName: row[CAMPAIGN_COLS.IMAGE_CR_NAME],
        videoFile: row[CAMPAIGN_COLS.VIDEO_FILE],
        videoCrName: row[CAMPAIGN_COLS.VIDEO_CR_NAME]
      });
    }
  }

  return campaigns;
}

/**
 * キャンペーンのステータスを更新
 */
function updateCampaignStatus(rowIndex, result) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS);

  sheet.getRange(rowIndex, CAMPAIGN_COLS.STATUS + 1).setValue(result.status);
  sheet.getRange(rowIndex, CAMPAIGN_COLS.PROCESSED_AT + 1).setValue(new Date());

  if (result.status === STATUS.COMPLETED) {
    sheet.getRange(rowIndex, CAMPAIGN_COLS.CAMPAIGN_ID + 1).setValue(result.campaignId);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.ADSET_ID + 1).setValue(result.adsetId);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.AD_ID_IMAGE + 1).setValue(result.adIdImage);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.AD_ID_VIDEO + 1).setValue(result.adIdVideo);
  } else {
    sheet.getRange(rowIndex, CAMPAIGN_COLS.ERROR_MESSAGE + 1).setValue(result.errorMessage);
  }
}

/**
 * videosシートに動画情報を追加
 */
function addVideoRecord(videoName, videoId, videoUrl, campaignId, adId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.VIDEOS);

  if (!sheet) {
    setupVideosSheet_(ss);
    sheet = ss.getSheetByName(SHEET_NAMES.VIDEOS);
  }

  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const formattedDate = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    videoName,
    videoId,
    videoUrl,
    formattedDate,
    campaignId,
    adId
  ]);
}

/**
 * 実行ログを追加
 */
function addExecutionLog(storeName, result, campaignId, adsetId, adIdImage, adIdVideo, detail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.EXECUTION_LOG);

  if (!sheet) {
    return;
  }

  sheet.appendRow([
    new Date(),
    storeName,
    result,
    campaignId,
    adsetId,
    adIdImage,
    adIdVideo,
    detail
  ]);
}
