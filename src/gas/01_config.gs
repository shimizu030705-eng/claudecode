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
  CAMPAIGN_NUMBER: 0,      // A: キャンペーン番号
  CAMPAIGN_NAME: 1,        // B: キャンペーン名
  GENDER: 2,               // C: 性別（全員/男性/女性）
  DAILY_BUDGET: 3,         // D: 日予算
  START_DATE: 4,           // E: 開始日
  START_TIME: 5,           // F: 開始時刻
  END_DATE: 6,             // G: 終了日
  END_TIME: 7,             // H: 終了時刻
  LP_URL: 8,               // I: LP URL
  AD_HEADLINE: 9,          // J: 広告見出し
  AD_BODY: 10,             // K: 広告本文
  VIDEO_URL: 11,           // L: 動画URL
  IMAGE_URL: 12,           // M: 画像URL（任意）
  STATUS: 13,              // N: ステータス
  CAMPAIGN_ID: 14,         // O: キャンペーンID
  ADSET_ID: 15,            // P: 広告セットID
  AD_ID_VIDEO: 16,         // Q: 広告ID（動画）
  VIDEO_ID: 17,            // R: Meta動画ID
  PROCESSED_AT: 18,        // S: 処理日時
  ERROR_MESSAGE: 19        // T: エラーメッセージ
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
  NOTIFICATION_EMAIL: 6,
  ACCESS_TOKEN: 7,
  GEMINI_API_KEY: 8
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
  CAMPAIGN_OBJECTIVE: 'OUTCOME_SALES',        // 売上目的
  BID_STRATEGY: 'LOWEST_COST_WITHOUT_CAP',    // 最大数量
  BILLING_EVENT: 'IMPRESSIONS',
  OPTIMIZATION_GOAL: 'OFFSITE_CONVERSIONS',
  CONVERSION_EVENT: 'PURCHASE',               // 購入イベント
  CTA_TYPE: 'LEARN_MORE'
};

// ============================================
// ターゲティング設定
// ============================================
const TARGETING = {
  COUNTRIES: ['JP'],  // 日本全域
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed'],
  instagram_positions: ['stream', 'story', 'reels']
};

// ============================================
// 性別コード
// ============================================
const GENDER_CODES = {
  '全員': null,      // 指定なし
  '男性': [1],       // 男性のみ
  '女性': [2]        // 女性のみ
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
