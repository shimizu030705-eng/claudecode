/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * 設定・定数定義
 * ============================================
 */

// ============================================
// シート名定義
// ============================================
const SHEET_NAMES = {
  CAMPAIGN_SETTINGS: 'キャンペーン設定',
  COMMON_SETTINGS: '共通設定',
  VIDEOS: 'videos',
  ANALYSIS: 'analysis',
  EXECUTION_LOG: '実行ログ'
};

// ============================================
// キャンペーン設定シートの列定義
// ============================================
const CAMPAIGN_COLS = {
  CAMPAIGN_TYPE: 0,        // A: キャンペーン種別
  CAMPAIGN_NUMBER: 1,      // B: キャンペーン番号
  CAMPAIGN_NAME: 2,        // C: キャンペーン名
  ADDRESS: 3,              // D: 住所
  TARGET_RADIUS: 4,        // E: ターゲット半径
  DAILY_BUDGET: 5,         // F: 日予算
  START_DATE: 6,           // G: 開始日
  START_TIME: 7,           // H: 開始時刻
  END_DATE: 8,             // I: 終了日
  END_TIME: 9,             // J: 終了時刻
  LP_URL: 10,              // K: LP URL
  AD_HEADLINE: 11,         // L: 広告見出し
  AD_BODY: 12,             // M: 広告本文
  VIDEO_URL: 13,           // N: 動画URL
  VIDEO_CR_NAME: 14,       // O: 動画クリエイティブ名
  IMAGE_URL: 15,           // P: 画像URL（任意）
  IMAGE_CR_NAME: 16,       // Q: 画像クリエイティブ名
  STATUS: 17,              // R: ステータス
  CAMPAIGN_ID: 18,         // S: キャンペーンID
  ADSET_ID: 19,            // T: 広告セットID
  AD_ID_VIDEO: 20,         // U: 広告ID（動画）
  AD_ID_IMAGE: 21,         // V: 広告ID（画像）
  PROCESSED_AT: 22,        // W: 処理日時
  ERROR_MESSAGE: 23        // X: エラーメッセージ
};

// ============================================
// 共通設定シートの行定義
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
// videosシートの列定義
// ============================================
const VIDEOS_COLS = {
  VIDEO_NAME: 0,           // A: 動画名
  VIDEO_ID: 1,             // B: 固有ID
  VIDEO_URL: 2,            // C: 動画URL
  UPLOAD_DATE: 3           // D: アップ日
};

// ============================================
// Meta API設定
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
// 配置設定
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
// Gemini API設定
// ============================================
const GEMINI_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  MAX_FILES_PER_RUN: 5,
  MAX_FILE_SIZE_MB: 200,
  POLL_INTERVAL_MS: 5000,
  POLL_MAX_TRIES: 24,
  TAXONOMY_VERSION: 'v1.0'
};
