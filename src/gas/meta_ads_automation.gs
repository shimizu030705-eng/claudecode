/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * 統合版
 * ============================================
 */

// ============================================
// 設定・定数
// ============================================

const SHEET_NAMES = {
  CAMPAIGN_SETTINGS: 'キャンペーン設定',
  COMMON_SETTINGS: '共通設定',
  VIDEOS: 'videos',
  ANALYSIS: 'analysis',
  EXECUTION_LOG: '実行ログ'
};

const CAMPAIGN_COLS = {
  CAMPAIGN_NUMBER: 0,
  CAMPAIGN_NAME: 1,
  GENDER: 2,
  DAILY_BUDGET: 3,
  START_DATE: 4,
  START_TIME: 5,
  END_DATE: 6,
  END_TIME: 7,
  LP_URL: 8,
  AD_HEADLINE: 9,
  AD_BODY: 10,
  VIDEO_URL: 11,
  IMAGE_URL: 12,
  STATUS: 13,
  CAMPAIGN_ID: 14,
  ADSET_ID: 15,
  AD_ID_VIDEO: 16,
  VIDEO_ID: 17,
  PROCESSED_AT: 18,
  ERROR_MESSAGE: 19
};

const SETTINGS_ROWS = {
  AD_ACCOUNT_ID: 0,
  PAGE_ID: 1,
  INSTAGRAM_ACCOUNT_ID: 2,
  PIXEL_ID: 3,
  AGE_MIN: 4,
  AGE_MAX: 5,
  NOTIFICATION_EMAIL: 6,
  ACCESS_TOKEN: 7,
  GEMINI_API_KEY: 8
};

const META_API = {
  BASE_URL: 'https://graph.facebook.com/v21.0',
  CAMPAIGN_OBJECTIVE: 'OUTCOME_SALES',
  BID_STRATEGY: 'LOWEST_COST_WITHOUT_CAP',
  BILLING_EVENT: 'IMPRESSIONS',
  OPTIMIZATION_GOAL: 'OFFSITE_CONVERSIONS',
  CONVERSION_EVENT: 'PURCHASE',
  CTA_TYPE: 'LEARN_MORE'
};

const TARGETING = {
  COUNTRIES: ['JP'],
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed'],
  instagram_positions: ['stream', 'story', 'reels']
};

const GENDER_CODES = {
  '全員': null,
  '男性': [1],
  '女性': [2]
};

const STATUS = {
  UNPROCESSED: '未処理',
  COMPLETED: '完了',
  ERROR: 'エラー'
};

const GEMINI_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  MAX_FILES_PER_RUN: 5,
  MAX_FILE_SIZE_MB: 200,
  POLL_INTERVAL_MS: 5000,
  POLL_MAX_TRIES: 24,
  TAXONOMY_VERSION: 'v1.0'
};

// ============================================
// メニュー・メイン実行関数
// ============================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Meta広告自動化')
    .addItem('キャンペーン作成を実行', 'executeCreateCampaigns')
    .addSeparator()
    .addItem('動画分析を実行', 'executeVideoAnalysis')
    .addSeparator()
    .addItem('シート初期設定', 'setupAllSheets')
    .addItem('InstagramアカウントID取得', 'getInstagramAccountId')
    .addToUi();
}

function executeCreateCampaigns() {
  const ui = SpreadsheetApp.getUi();
  const results = { success: [], failed: [] };

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
          campaignName: campaign.campaignName,
          campaignId: result.campaignId,
          adsetId: result.adsetId,
          adIdVideo: result.adIdVideo,
          videoId: result.videoId
        });

        updateCampaignStatus(campaign.rowIndex, {
          status: STATUS.COMPLETED,
          campaignId: result.campaignId,
          adsetId: result.adsetId,
          adIdVideo: result.adIdVideo,
          videoId: result.videoId
        });

        addExecutionLog(campaign.campaignName, '成功', result.campaignId, result.adsetId, result.adIdVideo, result.videoId, 'キャンペーン作成完了');

      } catch (error) {
        results.failed.push({ campaignName: campaign.campaignName, error: error.message });
        updateCampaignStatus(campaign.rowIndex, { status: STATUS.ERROR, errorMessage: error.message });
        addExecutionLog(campaign.campaignName, '失敗', '', '', '', '', error.message);
      }
    }

    sendNotificationEmail(settings.notificationEmail, results);
    ui.alert(`処理完了\n成功: ${results.success.length}件\n失敗: ${results.failed.length}件`);

  } catch (error) {
    ui.alert(`エラーが発生しました: ${error.message}`);
    Logger.log(error);
  }
}

function processCampaign(campaign, settings) {
  const videoFileId = extractFileIdFromUrl(campaign.videoUrl);
  const videoBlob = getFileFromDriveById(videoFileId);

  let imageBlob = null;
  if (campaign.imageUrl) {
    const imageFileId = extractFileIdFromUrl(campaign.imageUrl);
    imageBlob = getFileFromDriveById(imageFileId);
  }

  const videoResult = uploadVideo(settings, videoBlob);
  const videoId = videoResult.videoId;
  const videoThumbnailUrl = videoResult.thumbnailUrl;

  addVideoRecord(videoBlob.getName(), videoId, campaign.videoUrl, new Date());

  const campaignId = createCampaign(settings, campaign);
  const adsetId = createAdSet(settings, campaign, campaignId);

  let imageHash = null;
  if (imageBlob) {
    imageHash = uploadImage(settings, imageBlob);
  }

  const adIdVideo = createAd(settings, campaign, adsetId, imageHash, videoId, videoThumbnailUrl);

  return { campaignId, adsetId, adIdVideo, videoId };
}

function executeVideoAnalysis() {
  const ui = SpreadsheetApp.getUi();
  try {
    const settings = getCommonSettings();
    if (!settings.geminiApiKey) {
      ui.alert('エラー', 'Gemini API Keyが設定されていません。', ui.ButtonSet.OK);
      return;
    }
    analyzeAllVideos(settings.geminiApiKey);
    ui.alert('動画分析が完了しました。analysisシートを確認してください。');
  } catch (error) {
    ui.alert(`エラーが発生しました: ${error.message}`);
    Logger.log(error);
  }
}

function setupAllSheets() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  setupCampaignSettingsSheet(ss);
  setupCommonSettingsSheet(ss);
  setupVideosSheet(ss);
  setupAnalysisSheet(ss);
  setupExecutionLogSheet(ss);
  ui.alert('シートの初期設定が完了しました。');
}

function getInstagramAccountId() {
  const ui = SpreadsheetApp.getUi();
  const settings = getCommonSettings();
  if (!settings.pageId || !settings.accessToken) {
    ui.alert('エラー', 'ページIDまたはアクセストークンが設定されていません。', ui.ButtonSet.OK);
    return;
  }
  try {
    const url = `https://graph.facebook.com/v21.0/${settings.pageId}?fields=instagram_business_account&access_token=${settings.accessToken}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());
    if (result.error) {
      ui.alert('APIエラー', JSON.stringify(result.error), ui.ButtonSet.OK);
    } else if (result.instagram_business_account) {
      ui.alert('Instagram Business Account', `ID: ${result.instagram_business_account.id}\n\nこのIDを共通設定シートに設定してください。`, ui.ButtonSet.OK);
    } else {
      ui.alert('未設定', 'このFacebookページにInstagramビジネスアカウントがリンクされていません。', ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('エラー', e.message, ui.ButtonSet.OK);
  }
}

// ============================================
// Meta Marketing API
// ============================================

function createCampaign(settings, campaign) {
  const payload = {
    name: `${campaign.campaignNumber}_${campaign.campaignName}`,
    objective: META_API.CAMPAIGN_OBJECTIVE,
    status: 'PAUSED',
    special_ad_categories: '[]',
    access_token: settings.accessToken
  };
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/campaigns`;
  const response = callMetaApi(url, payload);
  if (!response.id) throw new Error(`キャンペーン作成失敗: ${JSON.stringify(response)}`);
  return response.id;
}

function createAdSet(settings, campaign, campaignId) {
  const startTime = combineDateTime(campaign.startDate, campaign.startTime);
  const endTime = campaign.endDate ? combineDateTime(campaign.endDate, campaign.endTime) : null;

  const targeting = {
    geo_locations: { countries: TARGETING.COUNTRIES },
    age_min: settings.ageMin,
    age_max: settings.ageMax,
    publisher_platforms: TARGETING.publisher_platforms,
    facebook_positions: TARGETING.facebook_positions,
    instagram_positions: TARGETING.instagram_positions,
    targeting_automation: { advantage_audience: 0 }
  };

  const genderCode = GENDER_CODES[campaign.gender];
  if (genderCode) targeting.genders = genderCode;

  const payload = {
    name: `${campaign.campaignName}_${campaign.gender || '全員'}`,
    campaign_id: campaignId,
    status: 'PAUSED',
    billing_event: META_API.BILLING_EVENT,
    optimization_goal: META_API.OPTIMIZATION_GOAL,
    bid_strategy: META_API.BID_STRATEGY,
    daily_budget: String(Math.round(Number(campaign.dailyBudget))),
    start_time: String(startTime),
    targeting: JSON.stringify(targeting),
    promoted_object: JSON.stringify({ pixel_id: settings.pixelId, custom_event_type: META_API.CONVERSION_EVENT }),
    access_token: settings.accessToken
  };

  if (endTime) payload.end_time = String(endTime);

  const url = `${META_API.BASE_URL}/${settings.adAccountId}/adsets`;
  const response = callMetaApi(url, payload);
  if (!response.id) throw new Error(`広告セット作成失敗: ${JSON.stringify(response)}`);
  return response.id;
}

function uploadImage(settings, imageBlob) {
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/adimages`;
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const payload = Utilities.newBlob(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="access_token"\r\n\r\n' + settings.accessToken + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="filename"; filename="' + imageBlob.getName() + '"\r\n' +
    'Content-Type: ' + imageBlob.getContentType() + '\r\n\r\n'
  ).getBytes().concat(imageBlob.getBytes()).concat(Utilities.newBlob('\r\n--' + boundary + '--\r\n').getBytes());

  const response = JSON.parse(UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    payload: payload,
    muteHttpExceptions: true
  }).getContentText());

  if (response.images) return Object.values(response.images)[0].hash;
  throw new Error(`画像アップロード失敗: ${JSON.stringify(response)}`);
}

function uploadVideo(settings, videoBlob) {
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/advideos`;
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const payload = Utilities.newBlob(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="access_token"\r\n\r\n' + settings.accessToken + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="source"; filename="' + videoBlob.getName() + '"\r\n' +
    'Content-Type: ' + videoBlob.getContentType() + '\r\n\r\n'
  ).getBytes().concat(videoBlob.getBytes()).concat(Utilities.newBlob('\r\n--' + boundary + '--\r\n').getBytes());

  const response = JSON.parse(UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    payload: payload,
    muteHttpExceptions: true
  }).getContentText());

  if (response.id) {
    waitForVideoReady(settings, response.id);
    return { videoId: response.id, thumbnailUrl: getVideoThumbnail(settings, response.id) };
  }
  throw new Error(`動画アップロード失敗: ${JSON.stringify(response)}`);
}

function waitForVideoReady(settings, videoId) {
  for (let i = 0; i < 30; i++) {
    const url = `${META_API.BASE_URL}/${videoId}?fields=status&access_token=${settings.accessToken}`;
    const response = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    if (response.status && response.status.video_status === 'ready') return;
    if (response.status && response.status.video_status === 'error') throw new Error('動画の処理中にエラー');
    Utilities.sleep(10000);
  }
  throw new Error('動画のアップロードがタイムアウト');
}

function getVideoThumbnail(settings, videoId) {
  const url = `${META_API.BASE_URL}/${videoId}?fields=thumbnails&access_token=${settings.accessToken}`;
  const response = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  return (response.thumbnails && response.thumbnails.data && response.thumbnails.data.length > 0) ? response.thumbnails.data[0].uri : null;
}

function createAd(settings, campaign, adsetId, imageHash, videoId, videoThumbnailUrl) {
  const creativeId = createAdCreative(settings, campaign, imageHash, videoId, videoThumbnailUrl);
  const payload = {
    name: videoId,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'PAUSED',
    access_token: settings.accessToken
  };
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/ads`;
  const response = callMetaApi(url, payload);
  if (!response.id) throw new Error(`広告作成失敗: ${JSON.stringify(response)}`);
  return response.id;
}

function createAdCreative(settings, campaign, imageHash, videoId, videoThumbnailUrl) {
  const objectStorySpec = {
    page_id: settings.pageId,
    instagram_user_id: settings.instagramAccountId,
    video_data: {
      video_id: videoId,
      link_description: campaign.adBody,
      title: campaign.adHeadline,
      call_to_action: { type: META_API.CTA_TYPE, value: { link: campaign.lpUrl } }
    }
  };
  if (videoThumbnailUrl) objectStorySpec.video_data.image_url = videoThumbnailUrl;
  else if (imageHash) objectStorySpec.video_data.image_hash = imageHash;

  const payload = {
    name: `creative_${videoId}`,
    object_story_spec: JSON.stringify(objectStorySpec),
    access_token: settings.accessToken
  };
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/adcreatives`;
  const response = callMetaApi(url, payload);
  if (!response.id) throw new Error(`クリエイティブ作成失敗: ${JSON.stringify(response)}`);
  return response.id;
}

function callMetaApi(url, payload) {
  Logger.log('=== API Request ===');
  Logger.log('URL: ' + url);
  Logger.log('Payload: ' + JSON.stringify(payload));
  const response = UrlFetchApp.fetch(url, { method: 'post', payload: payload, muteHttpExceptions: true });
  const result = JSON.parse(response.getContentText());
  Logger.log('=== API Response ===');
  Logger.log(response.getContentText());
  if (result.error) throw new Error(`Meta API エラー: ${JSON.stringify(result.error)}`);
  return result;
}

// ============================================
// Google Drive
// ============================================

function extractFileIdFromUrl(url) {
  if (!url) throw new Error('URLが入力されていません');
  if (!url.includes('/')) return url;
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  throw new Error(`URLからファイルIDを抽出できません: ${url}`);
}

function getFileFromDriveById(fileId) {
  try {
    return DriveApp.getFileById(fileId).getBlob();
  } catch (error) {
    throw new Error(`Driveファイル取得エラー (ID: ${fileId}): ${error.message}`);
  }
}

function getDriveFileById(fileId) {
  try {
    return DriveApp.getFileById(fileId);
  } catch (error) {
    throw new Error(`Driveファイル取得エラー (ID: ${fileId}): ${error.message}`);
  }
}

// ============================================
// スプレッドシート操作
// ============================================

function getCommonSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.COMMON_SETTINGS);
  if (!sheet) throw new Error(`共通設定シートが見つかりません`);
  const data = sheet.getDataRange().getValues();
  return {
    adAccountId: normalizeAccountId(data[SETTINGS_ROWS.AD_ACCOUNT_ID][1]),
    pageId: data[SETTINGS_ROWS.PAGE_ID][1],
    instagramAccountId: data[SETTINGS_ROWS.INSTAGRAM_ACCOUNT_ID][1],
    pixelId: data[SETTINGS_ROWS.PIXEL_ID][1],
    ageMin: data[SETTINGS_ROWS.AGE_MIN][1],
    ageMax: data[SETTINGS_ROWS.AGE_MAX][1],
    notificationEmail: data[SETTINGS_ROWS.NOTIFICATION_EMAIL][1],
    accessToken: data[SETTINGS_ROWS.ACCESS_TOKEN][1],
    geminiApiKey: data[SETTINGS_ROWS.GEMINI_API_KEY] ? data[SETTINGS_ROWS.GEMINI_API_KEY][1] : ''
  };
}

function normalizeAccountId(accountId) {
  const s = String(accountId).trim();
  return s.startsWith('act_') ? s : `act_${s}`;
}

function getUnprocessedCampaigns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS);
  if (!sheet) throw new Error(`キャンペーン設定シートが見つかりません`);
  const data = sheet.getDataRange().getValues();
  const campaigns = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[CAMPAIGN_COLS.STATUS];
    if (status === STATUS.UNPROCESSED || status === '' || status === null) {
      campaigns.push({
        rowIndex: i + 1,
        campaignNumber: row[CAMPAIGN_COLS.CAMPAIGN_NUMBER],
        campaignName: row[CAMPAIGN_COLS.CAMPAIGN_NAME],
        gender: row[CAMPAIGN_COLS.GENDER] || '全員',
        dailyBudget: row[CAMPAIGN_COLS.DAILY_BUDGET],
        startDate: row[CAMPAIGN_COLS.START_DATE],
        startTime: row[CAMPAIGN_COLS.START_TIME],
        endDate: row[CAMPAIGN_COLS.END_DATE],
        endTime: row[CAMPAIGN_COLS.END_TIME],
        lpUrl: row[CAMPAIGN_COLS.LP_URL],
        adHeadline: row[CAMPAIGN_COLS.AD_HEADLINE],
        adBody: row[CAMPAIGN_COLS.AD_BODY],
        videoUrl: row[CAMPAIGN_COLS.VIDEO_URL],
        imageUrl: row[CAMPAIGN_COLS.IMAGE_URL]
      });
    }
  }
  return campaigns;
}

function updateCampaignStatus(rowIndex, result) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS);
  sheet.getRange(rowIndex, CAMPAIGN_COLS.STATUS + 1).setValue(result.status);
  sheet.getRange(rowIndex, CAMPAIGN_COLS.PROCESSED_AT + 1).setValue(new Date());
  if (result.status === STATUS.COMPLETED) {
    sheet.getRange(rowIndex, CAMPAIGN_COLS.CAMPAIGN_ID + 1).setValue(result.campaignId);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.ADSET_ID + 1).setValue(result.adsetId);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.AD_ID_VIDEO + 1).setValue(result.adIdVideo);
    sheet.getRange(rowIndex, CAMPAIGN_COLS.VIDEO_ID + 1).setValue(result.videoId);
  } else {
    sheet.getRange(rowIndex, CAMPAIGN_COLS.ERROR_MESSAGE + 1).setValue(result.errorMessage);
  }
}

function addVideoRecord(videoName, videoId, videoUrl, uploadDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.VIDEOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.VIDEOS);
    sheet.getRange(1, 1, 1, 4).setValues([['動画名', '固有ID', '動画URL', 'アップ日']]);
    sheet.setFrozenRows(1);
  }
  const tz = Session.getScriptTimeZone();
  sheet.appendRow([videoName, videoId, videoUrl, Utilities.formatDate(uploadDate, tz, 'yyyy-MM-dd HH:mm:ss')]);
}

function addExecutionLog(campaignName, result, campaignId, adsetId, adIdVideo, videoId, detail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.EXECUTION_LOG);
  if (!sheet) return;
  sheet.appendRow([new Date(), campaignName, result, campaignId, adsetId, adIdVideo, videoId, detail]);
}

// ============================================
// シート初期設定
// ============================================

function setupCampaignSettingsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.CAMPAIGN_SETTINGS) || ss.insertSheet(SHEET_NAMES.CAMPAIGN_SETTINGS);
  const headers = ['キャンペーン番号', 'キャンペーン名', '性別', '日予算(円)', '開始日', '開始時刻', '終了日', '終了時刻', 'LP URL', '広告見出し', '広告本文', '動画URL', '画像URL（任意）', 'ステータス', 'キャンペーンID', '広告セットID', '広告ID（動画）', 'Meta動画ID', '処理日時', 'エラーメッセージ'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  const genderRule = SpreadsheetApp.newDataValidation().requireValueInList(['全員', '男性', '女性'], true).build();
  sheet.getRange(2, CAMPAIGN_COLS.GENDER + 1, 100, 1).setDataValidation(genderRule);
}

function setupCommonSettingsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.COMMON_SETTINGS) || ss.insertSheet(SHEET_NAMES.COMMON_SETTINGS);
  const settings = [
    ['広告アカウントID', ''],
    ['ページID', ''],
    ['InstagramアカウントID', ''],
    ['ピクセルID', ''],
    ['年齢下限', 18],
    ['年齢上限', 65],
    ['通知メールアドレス', ''],
    ['Meta Access Token', ''],
    ['Gemini API Key', '']
  ];
  sheet.getRange(1, 1, settings.length, 2).setValues(settings);
  sheet.autoResizeColumns(1, 2);
}

function setupVideosSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.VIDEOS) || ss.insertSheet(SHEET_NAMES.VIDEOS);
  sheet.getRange(1, 1, 1, 4).setValues([['動画名', '固有ID', '動画URL', 'アップ日']]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 4);
}

function setupAnalysisSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.ANALYSIS) || ss.insertSheet(SHEET_NAMES.ANALYSIS);
  const headers = ['ファイル名', 'ファイルID', 'フォーマット', '時間', '尺_秒', '冒頭3秒の掴み_映像', '（正）冒頭映像タイプ（主）', '（正）冒頭映像タグ1', '（正）冒頭映像タグ2', '（正）冒頭映像タグ3', '冒頭3秒の掴み_コピー', '（正）冒頭コピータイプ（主）', '（正）冒頭コピータグ1', '（正）冒頭コピータグ2', '（正）冒頭コピータグ3', 'ナレーション', 'BGM', '登場人物', 'シーン構成やテンポ', '主な訴求軸', '（正）訴求軸（主）', '（正）訴求タグ1', '（正）訴求タグ2', '喚起している感情', '（正）感情（主）', '（正）感情タグ1', '最後のCTA', '（正）CTAタイプ（主）', '（正）CTAタグ1', '（正）CTAタグ2', '（正）CTAタグ3', '（正）辞書バージョン', '（正）要レビュー', '（正）分類メモ', 'ステータス', '最終更新'];
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function setupExecutionLogSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.EXECUTION_LOG) || ss.insertSheet(SHEET_NAMES.EXECUTION_LOG);
  const headers = ['実行日時', 'キャンペーン名', '結果', 'キャンペーンID', '広告セットID', '広告ID（動画）', 'Meta動画ID', '詳細'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function getColIndexByHeader(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  if (idx === -1) throw new Error(`header not found: ${headerName}`);
  return idx + 1;
}

// ============================================
// ユーティリティ
// ============================================

function combineDateTime(date, time) {
  let dateObj;

  // 日付が空の場合は現在時刻を使用
  if (!date || date === '') {
    dateObj = new Date();
  } else if (date instanceof Date) {
    dateObj = new Date(date);
  } else {
    dateObj = new Date(date);
  }

  // 時刻の設定
  if (time && time !== '') {
    if (time instanceof Date) {
      dateObj.setHours(time.getHours(), time.getMinutes(), 0, 0);
    } else {
      const timeParts = time.toString().split(':');
      dateObj.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10) || 0, 0, 0);
    }
  }
  // 時刻が空の場合は現在時刻のまま（日付のみ指定の場合は0:00にしない）

  return Math.floor(dateObj.getTime() / 1000);
}

function getHeaderIgnoreCase(headers, nameLower) {
  const target = String(nameLower).toLowerCase();
  for (const k in headers) {
    if (String(k).toLowerCase() === target) return headers[k];
  }
  return null;
}

function padArray(arr, n) {
  const a = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a[i] || '');
  return out;
}

// ============================================
// メール通知
// ============================================

function sendNotificationEmail(email, results) {
  if (!email) return;
  const hasSuccess = results.success.length > 0;
  const hasFailed = results.failed.length > 0;
  let subject = '', body = '';

  if (hasSuccess && !hasFailed) {
    subject = `【完了】Meta広告キャンペーン作成 - ${results.success.length}件成功`;
    body = 'キャンペーンの作成が完了しました。\n\n';
    for (const item of results.success) {
      body += `【${item.campaignName}】\n  キャンペーンID: ${item.campaignId}\n  広告セットID: ${item.adsetId}\n  広告ID: ${item.adIdVideo}\n  Meta動画ID: ${item.videoId}\n\n`;
    }
  } else if (!hasSuccess && hasFailed) {
    subject = `【エラー】Meta広告キャンペーン作成 - ${results.failed.length}件失敗`;
    body = 'キャンペーンの作成中にエラーが発生しました。\n\n';
    for (const item of results.failed) {
      body += `【${item.campaignName}】\n  エラー: ${item.error}\n\n`;
    }
  } else {
    subject = `【一部エラー】Meta広告キャンペーン作成 - 成功${results.success.length}件 / 失敗${results.failed.length}件`;
    body = '処理が完了しました（一部エラーあり）。\n\n';
  }

  try { GmailApp.sendEmail(email, subject, body); } catch (e) { Logger.log(`メール送信エラー: ${e.message}`); }
}

// ============================================
// Gemini 動画分析
// ============================================

function analyzeAllVideos(apiKey) {
  const ss = SpreadsheetApp.getActive();
  const videosSheet = ss.getSheetByName(SHEET_NAMES.VIDEOS);
  if (!videosSheet) throw new Error('videosシートが見つかりません');

  const analysisSheet = ss.getSheetByName(SHEET_NAMES.ANALYSIS) || ss.insertSheet(SHEET_NAMES.ANALYSIS);
  if (analysisSheet.getLastRow() === 0) setupAnalysisSheet(ss);

  const COL_STATUS = getColIndexByHeader(analysisSheet, 'ステータス');
  const COL_UPDATED = getColIndexByHeader(analysisSheet, '最終更新');
  const lastRow = videosSheet.getLastRow();
  if (lastRow < 2) return;

  const values = videosSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const outMap = buildOutputIndex(analysisSheet);
  let processed = 0;

  for (let i = 0; i < values.length; i++) {
    if (processed >= GEMINI_CONFIG.MAX_FILES_PER_RUN) break;
    const [videoName, videoId, videoUrl] = values[i];
    if (!videoUrl) continue;

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
      const maxBytes = GEMINI_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
      if (driveFile.getSize() > maxBytes) throw new Error(`ファイルが大きすぎます（>${GEMINI_CONFIG.MAX_FILE_SIZE_MB}MB）`);

      const blob = driveFile.getBlob();
      const mimeType = blob.getContentType();
      const uploaded = uploadToGeminiFiles(apiKey, driveFile);
      const activeFile = waitUntilGeminiFileActive(apiKey, uploaded.name);

      analysisSheet.getRange(rowToWrite, COL_STATUS).setValue('ANALYZING');
      const extracted = extractCreativeElements(apiKey, activeFile.uri, mimeType, driveFile.getName());
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

function uploadToGeminiFiles(apiKey, driveFile) {
  const blob = driveFile.getBlob();
  const mimeType = blob.getContentType();
  const numBytes = driveFile.getSize();

  const startResp = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ file: { display_name: driveFile.getName() } }),
    headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(numBytes), 'X-Goog-Upload-Header-Content-Type': mimeType },
    muteHttpExceptions: true
  });
  if (startResp.getResponseCode() >= 300) throw new Error(`upload start failed: ${startResp.getResponseCode()}`);

  const uploadUrl = getHeaderIgnoreCase(startResp.getAllHeaders(), 'x-goog-upload-url');
  if (!uploadUrl) throw new Error('upload url not found');

  const upResp = UrlFetchApp.fetch(uploadUrl, {
    method: 'post', contentType: mimeType, payload: blob,
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    muteHttpExceptions: true
  });
  if (upResp.getResponseCode() >= 300) throw new Error(`upload finalize failed: ${upResp.getResponseCode()}`);
  return JSON.parse(upResp.getContentText()).file;
}

function waitUntilGeminiFileActive(apiKey, fileName) {
  for (let i = 0; i < GEMINI_CONFIG.POLL_MAX_TRIES; i++) {
    const resp = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 300) throw new Error(`files.get failed: ${resp.getResponseCode()}`);
    const file = JSON.parse(resp.getContentText());
    if (!file.state || String(file.state) === 'ACTIVE') return file;
    Utilities.sleep(GEMINI_CONFIG.POLL_INTERVAL_MS);
  }
  throw new Error('file not ACTIVE after polling');
}

function extractCreativeElements(apiKey, fileUri, mimeType, displayName) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const schema = {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['縦(9:16)', '横(16:9)', '正方形(1:1)', '不明'] },
      time: { type: 'string' }, duration_seconds: { type: 'integer' },
      hook_visual_3sec: { type: 'string' },
      norm_hook_visual_type_main: { type: 'string', enum: ['日常/食事シーン', '悩み共感（落胆/不安）', '理想/変化提示（ビフォアフ含む）', 'デモ/画面（操作・手元）', '権威/専門家（監修・白衣など）', 'UGC風（自撮り・素人感）', 'ストーリー導入', 'その他/不明'] },
      norm_hook_visual_tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      hook_copy_3sec: { type: 'string' },
      norm_hook_copy_type_main: { type: 'string', enum: ['数字・期間ベネフィット', '注意喚起/命令', 'ベネフィット断定', 'ターゲット指名', '否定/間違い指摘', '損失回避', '疑問', 'その他/不明'] },
      norm_hook_copy_tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      narration: { type: 'string' }, bgm: { type: 'string' },
      characters: { type: 'array', items: { type: 'string' } },
      scene_structure_tempo: { type: 'string' },
      main_value_props: { type: 'array', items: { type: 'string' } },
      norm_value_prop_main: { type: 'string', enum: ['楽さ/簡単', '短期間/即効', 'リバウンド防止', '健康', 'コスパ', '個別サポート', '実績/証拠（口コミ・数字）', '科学/根拠', '部位特化', 'その他/不明'] },
      norm_value_prop_tags: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      evoked_emotions: { type: 'array', items: { type: 'string' } },
      norm_emotion_main: { type: 'string', enum: ['不安', '希望', '安心', '焦り', '羨望', '恥/罪悪感', '自信', 'その他/不明'] },
      norm_emotion_tags: { type: 'array', items: { type: 'string' }, maxItems: 1 },
      final_cta: { type: 'string' },
      norm_cta_type_main: { type: 'string', enum: ['無料相談/無料体験の申込', 'LINE追加', 'リンク誘導/チェック', '購入/申込', 'その他/不明'] },
      norm_cta_tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      taxonomy_version: { type: 'string' }, needs_review: { type: 'boolean' }, normalize_note: { type: 'string' }
    },
    required: ['format', 'time', 'duration_seconds', 'hook_visual_3sec', 'norm_hook_visual_type_main', 'norm_hook_visual_tags', 'hook_copy_3sec', 'norm_hook_copy_type_main', 'norm_hook_copy_tags', 'narration', 'bgm', 'characters', 'scene_structure_tempo', 'main_value_props', 'norm_value_prop_main', 'norm_value_prop_tags', 'evoked_emotions', 'norm_emotion_main', 'norm_emotion_tags', 'final_cta', 'norm_cta_type_main', 'norm_cta_tags', 'taxonomy_version', 'needs_review', 'normalize_note'],
    additionalProperties: false
  };

  const prompt = `あなたは「Meta広告の動画クリエイティブ分析者」です。動画（${displayName}）を視聴し、JSONスキーマに従って出力してください。taxonomy_version は "${GEMINI_CONFIG.TAXONOMY_VERSION}" を入れてください。`;

  const body = {
    contents: [{ parts: [{ text: prompt }, { file_data: { mime_type: mimeType, file_uri: fileUri } }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2 }
  };

  const resp = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) throw new Error(`generateContent failed: ${resp.getResponseCode()}`);
  const text = JSON.parse(resp.getContentText())?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No output text');
  return JSON.parse(text);
}

function writeAnalysisRow(sheet, row, fileName, fileId, d) {
  const hv = padArray(d.norm_hook_visual_tags, 3);
  const hc = padArray(d.norm_hook_copy_tags, 3);
  const vp = padArray(d.norm_value_prop_tags, 2);
  const em = padArray(d.norm_emotion_tags, 1);
  const ct = padArray(d.norm_cta_tags, 3);

  sheet.getRange(row, 1, 1, 34).setValues([[
    fileName, fileId, d.format, d.time, d.duration_seconds,
    d.hook_visual_3sec, d.norm_hook_visual_type_main, hv[0], hv[1], hv[2],
    d.hook_copy_3sec, d.norm_hook_copy_type_main, hc[0], hc[1], hc[2],
    d.narration, d.bgm, (d.characters || []).join('\n'), d.scene_structure_tempo,
    (d.main_value_props || []).join('\n'), d.norm_value_prop_main, vp[0], vp[1],
    (d.evoked_emotions || []).join('\n'), d.norm_emotion_main, em[0],
    d.final_cta, d.norm_cta_type_main, ct[0], ct[1], ct[2],
    d.taxonomy_version || GEMINI_CONFIG.TAXONOMY_VERSION, !!d.needs_review, d.normalize_note || ''
  ]]);
}

function buildOutputIndex(outSheet) {
  const map = {};
  const lastRow = outSheet.getLastRow();
  if (lastRow < 2) return map;
  const ids = outSheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0]) map[ids[i][0]] = i + 2;
  }
  return map;
}
