/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * キャンペーン作成モジュール
 * ============================================
 */

/**
 * 1件のキャンペーンを処理
 */
function processCampaign(campaign, settings) {
  // 1. 住所から緯度経度を取得
  const coordinates = getCoordinatesFromAddress(campaign.address);

  // 2. フォルダURLからIDを抽出
  const folderId = extractFolderIdFromUrl(campaign.creativeFolderUrl);

  // 3. Driveからクリエイティブファイルを取得
  const imageBlob = getFileFromDrive(folderId, campaign.imageFile);
  const videoBlob = campaign.videoFile ? getFileFromDrive(folderId, campaign.videoFile) : null;

  // 4. キャンペーンを作成
  const campaignId = createMetaCampaign(settings, campaign);

  // 5. 広告セットを作成
  const adsetId = createMetaAdSet(settings, campaign, campaignId, coordinates);

  // 6. クリエイティブをアップロード
  const imageHash = uploadMetaImage(settings, imageBlob);

  let videoId = null;
  let videoThumbnailUrl = null;
  let videoUrl = null;

  if (videoBlob) {
    const videoResult = uploadMetaVideo(settings, videoBlob);
    videoId = videoResult.videoId;
    videoThumbnailUrl = videoResult.thumbnailUrl;
    // Meta動画のURL（Ads Managerで確認可能な形式）
    videoUrl = `https://www.facebook.com/ads/library/?id=${videoId}`;
  }

  // 7. 広告を作成（画像）
  const adIdImage = createMetaAd(settings, campaign, adsetId, imageHash, null, 'image', null);

  // 8. 広告を作成（動画）
  let adIdVideo = null;
  if (videoId) {
    adIdVideo = createMetaAd(settings, campaign, adsetId, imageHash, videoId, 'video', videoThumbnailUrl);
  }

  return {
    campaignId: campaignId,
    adsetId: adsetId,
    adIdImage: adIdImage,
    adIdVideo: adIdVideo,
    videoId: videoId,
    videoUrl: videoUrl
  };
}

/**
 * キャンペーン作成
 */
function createMetaCampaign(settings, campaign) {
  const campaignName = generateCampaignName(campaign);

  const objective = campaign.campaignType === '認知'
    ? META_API.CAMPAIGN_OBJECTIVE_AWARENESS
    : META_API.CAMPAIGN_OBJECTIVE_LEAD;

  const payload = {
    name: campaignName,
    objective: objective,
    status: 'PAUSED',
    special_ad_categories: '[]',
    access_token: settings.accessToken
  };

  const url = `${META_API.BASE_URL}/${settings.adAccountId}/campaigns`;
  const response = callMetaApi(url, payload);

  if (!response.id) {
    throw new Error(`キャンペーン作成失敗: ${JSON.stringify(response)}`);
  }

  return response.id;
}

/**
 * 広告セット作成
 */
function createMetaAdSet(settings, campaign, campaignId, coordinates) {
  const adsetName = generateAdSetName(campaign);

  const startTime = combineDateTime(campaign.startDate, campaign.startTime);
  const endTime = campaign.endDate ? combineDateTime(campaign.endDate, campaign.endTime) : null;

  const targeting = {
    geo_locations: {
      custom_locations: [{
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        radius: campaign.targetRadius,
        distance_unit: 'kilometer'
      }]
    },
    age_min: settings.ageMin,
    age_max: settings.ageMax,
    publisher_platforms: PLACEMENTS.publisher_platforms,
    facebook_positions: PLACEMENTS.facebook_positions,
    instagram_positions: PLACEMENTS.instagram_positions,
    targeting_automation: {
      advantage_audience: 0
    }
  };

  const isAwareness = campaign.campaignType === '認知';
  const optimizationGoal = isAwareness ? 'REACH' : 'OFFSITE_CONVERSIONS';

  const payload = {
    name: adsetName,
    campaign_id: campaignId,
    status: 'PAUSED',
    billing_event: META_API.BILLING_EVENT,
    optimization_goal: optimizationGoal,
    daily_budget: String(Math.round(Number(campaign.dailyBudget))),
    start_time: String(startTime),
    targeting: JSON.stringify(targeting),
    access_token: settings.accessToken
  };

  if (isAwareness) {
    // 認知キャンペーン: 自動入札 + フリークエンシーキャップ（ピクセルなし）
    payload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
    payload.frequency_control_specs = JSON.stringify([{
      event: 'IMPRESSIONS',
      interval_days: 7,
      max_frequency: 2
    }]);
  } else {
    // 獲得キャンペーン: CPA上限 + ピクセル追跡
    payload.bid_strategy = META_API.BID_STRATEGY;
    payload.bid_amount = String(Math.round(Number(settings.cpaCap)));
    payload.promoted_object = JSON.stringify({
      pixel_id: settings.pixelId,
      custom_event_type: 'LEAD'
    });
  }

  if (endTime) {
    payload.end_time = String(endTime);
  }

  const url = `${META_API.BASE_URL}/${settings.adAccountId}/adsets`;
  const response = callMetaApi(url, payload);

  if (!response.id) {
    throw new Error(`広告セット作成失敗: ${JSON.stringify(response)}`);
  }

  return response.id;
}

/**
 * 画像アップロード
 */
function uploadMetaImage(settings, imageBlob) {
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/adimages`;

  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

  const payload = Utilities.newBlob(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="access_token"\r\n\r\n' +
    settings.accessToken + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="filename"; filename="' + imageBlob.getName() + '"\r\n' +
    'Content-Type: ' + imageBlob.getContentType() + '\r\n\r\n'
  ).getBytes()
    .concat(imageBlob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + boundary + '--\r\n').getBytes());

  const options = {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    payload: payload,
    muteHttpExceptions: true
  };

  const response = JSON.parse(UrlFetchApp.fetch(url, options).getContentText());

  if (response.images) {
    const imageData = Object.values(response.images)[0];
    return imageData.hash;
  }

  throw new Error(`画像アップロード失敗: ${JSON.stringify(response)}`);
}

/**
 * 動画アップロード
 */
function uploadMetaVideo(settings, videoBlob) {
  const url = `${META_API.BASE_URL}/${settings.adAccountId}/advideos`;

  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

  const payload = Utilities.newBlob(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="access_token"\r\n\r\n' +
    settings.accessToken + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="source"; filename="' + videoBlob.getName() + '"\r\n' +
    'Content-Type: ' + videoBlob.getContentType() + '\r\n\r\n'
  ).getBytes()
    .concat(videoBlob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + boundary + '--\r\n').getBytes());

  const options = {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    payload: payload,
    muteHttpExceptions: true
  };

  const response = JSON.parse(UrlFetchApp.fetch(url, options).getContentText());

  if (response.id) {
    waitForVideoReady(settings, response.id);

    // サムネイルURLを取得
    const thumbnailUrl = getVideoThumbnail(settings, response.id);

    return {
      videoId: response.id,
      thumbnailUrl: thumbnailUrl
    };
  }

  throw new Error(`動画アップロード失敗: ${JSON.stringify(response)}`);
}

/**
 * 動画の処理完了を待機
 */
function waitForVideoReady(settings, videoId) {
  const maxAttempts = 30;
  const waitTime = 10000;

  for (let i = 0; i < maxAttempts; i++) {
    const url = `${META_API.BASE_URL}/${videoId}?fields=status&access_token=${settings.accessToken}`;
    const response = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());

    if (response.status && response.status.video_status === 'ready') {
      return;
    }

    if (response.status && response.status.video_status === 'error') {
      throw new Error('動画の処理中にエラーが発生しました');
    }

    Utilities.sleep(waitTime);
  }

  throw new Error('動画のアップロードがタイムアウトしました');
}

/**
 * 動画サムネイル取得
 */
function getVideoThumbnail(settings, videoId) {
  const url = `${META_API.BASE_URL}/${videoId}?fields=thumbnails&access_token=${settings.accessToken}`;
  const response = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());

  if (response.thumbnails && response.thumbnails.data && response.thumbnails.data.length > 0) {
    return response.thumbnails.data[0].uri;
  }

  return null;
}

/**
 * 広告作成
 */
function createMetaAd(settings, campaign, adsetId, imageHash, videoId, type, videoThumbnailUrl) {
  const adName = generateAdName(campaign, type);

  const creativeId = createAdCreative(settings, campaign, imageHash, videoId, type, videoThumbnailUrl);

  const payload = {
    name: adName,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'PAUSED',
    access_token: settings.accessToken
  };

  const url = `${META_API.BASE_URL}/${settings.adAccountId}/ads`;
  const response = callMetaApi(url, payload);

  if (!response.id) {
    throw new Error(`広告作成失敗: ${JSON.stringify(response)}`);
  }

  return response.id;
}

/**
 * 広告クリエイティブ作成
 */
function createAdCreative(settings, campaign, imageHash, videoId, type, videoThumbnailUrl) {
  const creativeName = `creative_${campaign.storeName}_${type}`;

  let objectStorySpec = {
    page_id: settings.pageId,
    instagram_user_id: settings.instagramAccountId
  };

  if (type === 'image') {
    objectStorySpec.link_data = {
      image_hash: imageHash,
      link: campaign.lpUrl,
      message: campaign.adBody,
      name: campaign.adHeadline,
      call_to_action: {
        type: META_API.CTA_TYPE,
        value: {
          link: campaign.lpUrl
        }
      }
    };
  } else {
    objectStorySpec.video_data = {
      video_id: videoId,
      link_description: campaign.adBody,
      title: campaign.adHeadline,
      call_to_action: {
        type: META_API.CTA_TYPE,
        value: {
          link: campaign.lpUrl
        }
      }
    };

    // サムネイル設定
    if (videoThumbnailUrl) {
      objectStorySpec.video_data.image_url = videoThumbnailUrl;
    } else if (imageHash) {
      objectStorySpec.video_data.image_hash = imageHash;
    }
  }

  const payload = {
    name: creativeName,
    object_story_spec: JSON.stringify(objectStorySpec),
    access_token: settings.accessToken
  };

  const url = `${META_API.BASE_URL}/${settings.adAccountId}/adcreatives`;
  const response = callMetaApi(url, payload);

  if (!response.id) {
    throw new Error(`クリエイティブ作成失敗: ${JSON.stringify(response)}`);
  }

  return response.id;
}

/**
 * Meta API呼び出し
 */
function callMetaApi(url, payload) {
  const options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  };

  Logger.log('=== API Request ===');
  Logger.log('URL: ' + url);
  Logger.log('Payload: ' + JSON.stringify(payload));

  const response = UrlFetchApp.fetch(url, options);
  const responseText = response.getContentText();

  Logger.log('=== API Response ===');
  Logger.log(responseText);

  const result = JSON.parse(responseText);

  if (result.error) {
    const errorDetail = JSON.stringify(result.error);
    throw new Error(`Meta API エラー: ${errorDetail}`);
  }

  return result;
}

/**
 * 住所から座標を取得
 */
function getCoordinatesFromAddress(address) {
  try {
    const geocoder = Maps.newGeocoder();
    geocoder.setLanguage('ja');

    const response = geocoder.geocode(address);

    if (response.status !== 'OK' || response.results.length === 0) {
      throw new Error(`住所から座標を取得できません: ${address}`);
    }

    const location = response.results[0].geometry.location;

    return {
      lat: location.lat,
      lng: location.lng
    };

  } catch (error) {
    throw new Error(`ジオコーディングエラー: ${error.message}`);
  }
}

/**
 * DriveフォルダURLからIDを抽出
 */
function extractFolderIdFromUrl(url) {
  if (!url) {
    throw new Error('クリエイティブフォルダURLが入力されていません');
  }

  if (!url.includes('/')) {
    return url;
  }

  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  throw new Error(`フォルダURLからIDを抽出できません: ${url}`);
}

/**
 * Driveからファイルを取得
 */
function getFileFromDrive(folderId, fileName) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      throw new Error(`ファイルが見つかりません: ${fileName}`);
    }

    const file = files.next();
    return file.getBlob();

  } catch (error) {
    throw new Error(`Driveファイル取得エラー: ${error.message}`);
  }
}

/**
 * キャンペーン名生成
 */
function generateCampaignName(campaign) {
  const type = campaign.campaignType === '認知' ? '認知' : 'リード獲得';
  const cleanName = getCleanStoreName(campaign.storeName);
  return `${campaign.campaignNumber}_${cleanName}_${type}_${campaign.targetRadius}km圏内_初期販促`;
}

/**
 * 広告セット名生成
 */
function generateAdSetName(campaign) {
  const cleanName = getCleanStoreName(campaign.storeName);
  return `${cleanName}_${campaign.targetRadius}km圏内`;
}

/**
 * 広告名生成
 */
function generateAdName(campaign, type) {
  const date = new Date(campaign.startDate);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  const typeCode = type === 'image' ? 'i' : 'm';
  const crName = type === 'image' ? campaign.imageCrName : campaign.videoCrName;

  return `${mm}${dd}_${typeCode}_${crName}`;
}

/**
 * 店舗名をクリーンアップ
 */
function getCleanStoreName(storeName) {
  // プレフィックスを除去（例: "LifeFit "）
  return storeName.replace(/^LifeFit\s*/i, '');
}

/**
 * 日付と時間を結合してUnixタイムスタンプを返す
 */
function combineDateTime(date, time) {
  let dateObj;

  if (date instanceof Date) {
    dateObj = new Date(date);
  } else if (date) {
    dateObj = new Date(date);
  } else {
    throw new Error('開始日が入力されていません');
  }

  if (time) {
    if (time instanceof Date) {
      dateObj.setHours(time.getHours(), time.getMinutes(), 0, 0);
    } else {
      const timeParts = time.toString().split(':');
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10) || 0;
      dateObj.setHours(hours, minutes, 0, 0);
    }
  } else {
    dateObj.setHours(0, 0, 0, 0);
  }

  return Math.floor(dateObj.getTime() / 1000);
}
