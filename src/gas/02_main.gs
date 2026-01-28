/**
 * ============================================
 * メイン実行関数
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
    .addItem('動画分析を実行', 'executeVideoAnalysis')
    .addSeparator()
    .addItem('シート初期設定', 'setupAllSheets')
    .addItem('InstagramアカウントID取得', 'getInstagramAccountId')
    .addToUi();
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

        addExecutionLog(
          campaign.campaignName,
          '成功',
          result.campaignId,
          result.adsetId,
          result.adIdVideo,
          result.videoId,
          'キャンペーン作成完了'
        );

      } catch (error) {
        results.failed.push({
          campaignName: campaign.campaignName,
          error: error.message
        });

        updateCampaignStatus(campaign.rowIndex, {
          status: STATUS.ERROR,
          errorMessage: error.message
        });

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

/**
 * 1つのキャンペーンを処理する
 * @param {Object} campaign - キャンペーン設定
 * @param {Object} settings - 共通設定
 * @returns {Object} 作成されたIDの情報
 */
function processCampaign(campaign, settings) {
  // 1. Drive から動画ファイルを取得
  const videoFileId = extractFileIdFromUrl(campaign.videoUrl);
  const videoBlob = getFileFromDriveById(videoFileId);

  // 2. 画像ファイルを取得（設定されている場合）
  let imageBlob = null;
  if (campaign.imageUrl) {
    const imageFileId = extractFileIdFromUrl(campaign.imageUrl);
    imageBlob = getFileFromDriveById(imageFileId);
  }

  // 3. 動画をアップロード（先にアップロードしてvideoIdを取得）
  const videoResult = uploadVideo(settings, videoBlob);
  const videoId = videoResult.videoId;
  const videoThumbnailUrl = videoResult.thumbnailUrl;

  // 4. videosシートに動画情報を自動記録
  addVideoRecord(
    videoBlob.getName(),
    videoId,
    campaign.videoUrl,
    new Date()
  );

  // 5. キャンペーンを作成
  const campaignId = createCampaign(settings, campaign);

  // 6. 広告セットを作成（日本全域ターゲティング）
  const adsetId = createAdSet(settings, campaign, campaignId);

  // 7. 画像をアップロード（設定されている場合）
  let imageHash = null;
  if (imageBlob) {
    imageHash = uploadImage(settings, imageBlob);
  }

  // 8. 動画広告を作成（広告名にvideoIdを使用）
  const adIdVideo = createAd(
    settings,
    campaign,
    adsetId,
    imageHash,
    videoId,
    videoThumbnailUrl
  );

  return {
    campaignId: campaignId,
    adsetId: adsetId,
    adIdVideo: adIdVideo,
    videoId: videoId
  };
}

/**
 * 動画分析のメイン実行関数
 */
function executeVideoAnalysis() {
  const ui = SpreadsheetApp.getUi();

  try {
    const settings = getCommonSettings();

    if (!settings.geminiApiKey) {
      ui.alert('エラー', 'Gemini API Keyが設定されていません。共通設定シートを確認してください。', ui.ButtonSet.OK);
      return;
    }

    analyzeAllVideos(settings.geminiApiKey);

    ui.alert('動画分析が完了しました。analysisシートを確認してください。');

  } catch (error) {
    ui.alert(`エラーが発生しました: ${error.message}`);
    Logger.log(error);
  }
}

/**
 * 全シートの初期設定
 */
function setupAllSheets() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();

  // キャンペーン設定シート
  setupCampaignSettingsSheet(ss);

  // 共通設定シート
  setupCommonSettingsSheet(ss);

  // videosシート
  setupVideosSheet(ss);

  // analysisシート
  setupAnalysisSheet(ss);

  // 実行ログシート
  setupExecutionLogSheet(ss);

  ui.alert('シートの初期設定が完了しました。');
}

/**
 * InstagramアカウントIDを取得（ヘルパー関数）
 */
function getInstagramAccountId() {
  const ui = SpreadsheetApp.getUi();
  const settings = getCommonSettings();

  const pageId = settings.pageId;
  const token = settings.accessToken;

  if (!pageId || !token) {
    ui.alert('エラー', 'ページIDまたはアクセストークンが設定されていません。', ui.ButtonSet.OK);
    return;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${token}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());

    if (result.error) {
      ui.alert('APIエラー', JSON.stringify(result.error), ui.ButtonSet.OK);
    } else if (result.instagram_business_account) {
      ui.alert(
        'Instagram Business Account',
        `ID: ${result.instagram_business_account.id}\n\nこのIDを共通設定シートのInstagramアカウントIDに設定してください。`,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert('未設定', 'このFacebookページにInstagramビジネスアカウントがリンクされていません。', ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('エラー', e.message, ui.ButtonSet.OK);
  }
}
