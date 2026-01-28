/**
 * ============================================
 * Meta Marketing API 操作
 * ============================================
 */

/**
 * キャンペーンを作成
 * @param {Object} settings - 共通設定
 * @param {Object} campaign - キャンペーン設定
 * @returns {string} キャンペーンID
 */
function createCampaign(settings, campaign) {
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
 * 広告セットを作成
 * @param {Object} settings - 共通設定
 * @param {Object} campaign - キャンペーン設定
 * @param {string} campaignId - キャンペーンID
 * @param {Object} coordinates - 座標 {lat, lng}
 * @returns {string} 広告セットID
 */
function createAdSet(settings, campaign, campaignId, coordinates) {
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
    // 認知キャンペーン: 自動入札 + フリークエンシーキャップ
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
 * 画像をアップロード
 * @param {Object} settings - 共通設定
 * @param {Blob} imageBlob - 画像のBlob
 * @returns {string} 画像ハッシュ
 */
function uploadImage(settings, imageBlob) {
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
 * 動画をアップロード
 * @param {Object} settings - 共通設定
 * @param {Blob} videoBlob - 動画のBlob
 * @returns {Object} {videoId, thumbnailUrl}
 */
function uploadVideo(settings, videoBlob) {
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
 * @param {Object} settings - 共通設定
 * @param {string} videoId - 動画ID
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
 * 動画のサムネイルURLを取得
 * @param {Object} settings - 共通設定
 * @param {string} videoId - 動画ID
 * @returns {string|null} サムネイルURL
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
 * 広告を作成
 * @param {Object} settings - 共通設定
 * @param {Object} campaign - キャンペーン設定
 * @param {string} adsetId - 広告セットID
 * @param {string|null} imageHash - 画像ハッシュ
 * @param {string|null} videoId - 動画ID
 * @param {string} type - 'image' または 'video'
 * @param {string|null} videoThumbnailUrl - 動画サムネイルURL
 * @returns {string} 広告ID
 */
function createAd(settings, campaign, adsetId, imageHash, videoId, type, videoThumbnailUrl) {
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
 * 広告クリエイティブを作成
 * @param {Object} settings - 共通設定
 * @param {Object} campaign - キャンペーン設定
 * @param {string|null} imageHash - 画像ハッシュ
 * @param {string|null} videoId - 動画ID
 * @param {string} type - 'image' または 'video'
 * @param {string|null} videoThumbnailUrl - 動画サムネイルURL
 * @returns {string} クリエイティブID
 */
function createAdCreative(settings, campaign, imageHash, videoId, type, videoThumbnailUrl) {
  const creativeName = `creative_${campaign.campaignName}_${type}`;

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
 * Meta APIを呼び出す
 * @param {string} url - APIエンドポイント
 * @param {Object} payload - リクエストボディ
 * @returns {Object} レスポンス
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
