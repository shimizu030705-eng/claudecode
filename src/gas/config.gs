/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * 設定・定数
 * ============================================
 */

// ============================================
// シート名
// ============================================
const SHEET_NAMES = {
  COMMON_SETTINGS: '共通設定',
  CAMPAIGN_SETTINGS: 'キャンペーン設定',
  VIDEOS: 'videos',
  ANALYSIS: 'analysis',
  EXECUTION_LOG: '実行ログ',
  // レポートシート
  REPORT_YESTERDAY: '昨日',
  REPORT_LAST_7D: '過去7日間',
  REPORT_LAST_30D: '直近1ヶ月',
  REPORT_LAST_90D: '直近3ヶ月'
};

// ============================================
// キャンペーン設定シートの列インデックス（0始まり）
// ============================================
const CAMPAIGN_COLS = {
  CAMPAIGN_TYPE: 0,      // A: キャンペーン種別
  CAMPAIGN_NUMBER: 1,    // B: キャンペーン番号
  STORE_NAME: 2,         // C: 店舗名
  ADDRESS: 3,            // D: 住所
  TARGET_RADIUS: 4,      // E: ターゲット半径(km)
  DAILY_BUDGET: 5,       // F: 日予算(円)
  START_DATE: 6,         // G: 開始日
  START_TIME: 7,         // H: 開始時間
  END_DATE: 8,           // I: 終了日
  END_TIME: 9,           // J: 終了時間
  LP_URL: 10,            // K: LP URL
  AD_HEADLINE: 11,       // L: 広告見出し
  AD_BODY: 12,           // M: 広告本文
  CREATIVE_FOLDER_URL: 13, // N: クリエイティブフォルダURL
  IMAGE_FILE: 14,        // O: 画像ファイル名
  IMAGE_CR_NAME: 15,     // P: 画像CR名
  VIDEO_FILE: 16,        // Q: 動画ファイル名
  VIDEO_CR_NAME: 17,     // R: 動画CR名
  STATUS: 18,            // S: ステータス
  CAMPAIGN_ID: 19,       // T: キャンペーンID
  ADSET_ID: 20,          // U: 広告セットID
  AD_ID_IMAGE: 21,       // V: 広告ID(画像)
  AD_ID_VIDEO: 22,       // W: 広告ID(動画)
  PROCESSED_AT: 23,      // X: 処理日時
  ERROR_MESSAGE: 24      // Y: エラーメッセージ
};

// ============================================
// 共通設定シートの行インデックス（0始まり）
// ============================================
const SETTINGS_ROWS = {
  AD_ACCOUNT_ID: 0,
  PAGE_ID: 1,
  INSTAGRAM_ACCOUNT_ID: 2,
  PIXEL_ID: 3,
  AGE_MIN: 4,
  AGE_MAX: 5,
  CPA_CAP: 6,
  NOTIFICATION_EMAIL: 7,
  ACCESS_TOKEN: 8,
  GEMINI_API_KEY: 9
};

// ============================================
// videosシートの列インデックス（0始まり）
// ============================================
const VIDEO_COLS = {
  NAME: 0,         // A: 動画名
  VIDEO_ID: 1,     // B: 固有ID（Meta動画ID）
  URL: 2,          // C: 動画URL
  UPLOAD_DATE: 3,  // D: アップ日
  CAMPAIGN_ID: 4,  // E: キャンペーンID
  AD_ID: 5         // F: 広告ID
};

// ============================================
// Meta Marketing API 設定
// ============================================
const META_API = {
  BASE_URL: 'https://graph.facebook.com/v21.0',
  CAMPAIGN_OBJECTIVE_LEAD: 'OUTCOME_LEADS',
  CAMPAIGN_OBJECTIVE_AWARENESS: 'OUTCOME_AWARENESS',
  BID_STRATEGY: 'COST_CAP',
  BILLING_EVENT: 'IMPRESSIONS',
  CTA_TYPE: 'LEARN_MORE'
};

// ============================================
// 配信面設定
// ============================================
const PLACEMENTS = {
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed'],
  instagram_positions: ['stream', 'story', 'reels']
};

// ============================================
// ステータス定義
// ============================================
const STATUS = {
  UNPROCESSED: '未処理',
  COMPLETED: '完了',
  ERROR: 'エラー'
};

// ============================================
// Gemini API 設定
// ============================================
const GEMINI_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  MAX_FILES_PER_RUN: 5,
  MAX_FILE_SIZE_MB: 200,
  POLL_INTERVAL_MS: 5000,
  POLL_MAX_TRIES: 24,
  TAXONOMY_VERSION: 'v1.0'
};

// ============================================
// レポート設定
// ============================================
const REPORT_CONFIG = {
  API_VERSION: 'v24.0',
  TIMEZONE: 'Asia/Tokyo',
  FETCH_CHUNK_DAYS: 14,
  KPI_ACTION_TYPES: ['purchase', 'initiate_checkout', 'complete_registration'],
  RANGES: {
    YESTERDAY: { sinceOffsetDays: 1, untilOffsetDays: 1 },
    LAST_7D: { sinceOffsetDays: 7, untilOffsetDays: 0 },
    LAST_30D: { sinceOffsetDays: 30, untilOffsetDays: 1 },
    LAST_90D: { sinceOffsetDays: 90, untilOffsetDays: 1 }
  }
};

// action_type → 和名
const KPI_JP = {
  purchase: '購入',
  initiate_checkout: 'チェックアウト開始',
  complete_registration: '登録完了'
};
