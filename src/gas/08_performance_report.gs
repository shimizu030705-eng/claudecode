/**
 * ============================================
 * Meta Ads パフォーマンスレポート
 * ============================================
 */

// レポート設定
const REPORT_CONFIG = {
  API_VERSION: 'v24.0',
  TIMEZONE: 'Asia/Tokyo',
  FETCH_CHUNK_DAYS: 14,

  // CV（件数 + 獲得単価）
  kpiActionTypes: ['purchase', 'initiate_checkout', 'complete_registration'],

  // タブ名
  SHEETS: {
    YESTERDAY: '昨日',
    LAST_7D: '過去7日間',
    LAST_30D: '直近1ヶ月',
    LAST_90D: '直近3ヶ月'
  },

  // 取得範囲（日数）
  RANGES: {
    YESTERDAY: { sinceOffsetDays: 1, untilOffsetDays: 1 },
    LAST_7D: { sinceOffsetDays: 7, untilOffsetDays: 0 },
    LAST_30D: { sinceOffsetDays: 30, untilOffsetDays: 1 },
    LAST_90D: { sinceOffsetDays: 90, untilOffsetDays: 1 }
  },

  time_increment: 1,
  level: 'ad'
};

// action_type -> 和名
const KPI_JP = {
  purchase: '購入',
  initiate_checkout: 'チェックアウト開始',
  complete_registration: '登録完了'
};

/**
 * 全レポートタブを作成（ヘッダーのみ）
 */
function setupAllReportSheets() {
  const ss = SpreadsheetApp.getActive();
  Object.values(REPORT_CONFIG.SHEETS).forEach((name) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.clear();
    writeReportHeader(sheet);
  });
}

/**
 * 全期間のレポートを実行
 */
function runAllReports() {
  runReport_Yesterday();
  runReport_Last7D();
  runReport_Last30D();
  runReport_Last90D();
}

function runReport_Yesterday() {
  const sheetName = REPORT_CONFIG.SHEETS.YESTERDAY;
  const r = REPORT_CONFIG.RANGES.YESTERDAY;
  const range = calcReportDateRange(r.sinceOffsetDays, r.untilOffsetDays);
  writeReportToSheet(sheetName, range.since, range.until);
}

function runReport_Last7D() {
  const sheetName = REPORT_CONFIG.SHEETS.LAST_7D;
  const r = REPORT_CONFIG.RANGES.LAST_7D;
  const range = calcReportDateRange(r.sinceOffsetDays, r.untilOffsetDays);
  writeReportToSheet(sheetName, range.since, range.until);
}

function runReport_Last30D() {
  const sheetName = REPORT_CONFIG.SHEETS.LAST_30D;
  const r = REPORT_CONFIG.RANGES.LAST_30D;
  const range = calcReportDateRange(r.sinceOffsetDays, r.untilOffsetDays);
  writeReportToSheet(sheetName, range.since, range.until);
}

function runReport_Last90D() {
  const sheetName = REPORT_CONFIG.SHEETS.LAST_90D;
  const r = REPORT_CONFIG.RANGES.LAST_90D;
  const range = calcReportDateRange(r.sinceOffsetDays, r.untilOffsetDays);
  writeReportToSheet(sheetName, range.since, range.until);
}

/**
 * 毎日6時に全レポートを更新するトリガーを作成
 */
function createDailyReportTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'runAllReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAllReports').timeBased().everyDays(1).atHour(6).create();
}

/**
 * 指定タブにレポートを出力
 * @param {string} sheetName - シート名
 * @param {string} since - 開始日
 * @param {string} until - 終了日
 */
function writeReportToSheet(sheetName, since, until) {
  const settings = getCommonSettings();

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  sheet.clear();
  writeReportHeader(sheet);

  const rows = fetchInsightsSegmented(
    settings.accessToken,
    settings.adAccountId,
    since,
    until,
    REPORT_CONFIG.FETCH_CHUNK_DAYS
  );

  const now = new Date();
  if (rows.length === 0) {
    sheet.getRange(2, 1).setValue(`データなし（${since}〜${until}）`);
    return;
  }

  const out = rows.map((r) => buildReportRecord(r, now));
  sheet.getRange(2, 1, out.length, out[0].length).setValues(out);
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

/**
 * レポートヘッダーを書き込む
 * @param {Sheet} sheet - シート
 */
function writeReportHeader(sheet) {
  const headers = [
    '開始日',
    '終了日',
    'キャンペーンID',
    'キャンペーン名',
    '広告セットID',
    '広告セット名',
    '広告ID',
    '広告名',

    '消化金額',
    '表示回数',
    'リーチ',
    'フリークエンシー',
    'CPM',

    '動画_3秒再生',
    '動画_ThruPlay',
    '動画_25%視聴',
    '動画_50%視聴',
    '動画_75%視聴',
    '動画_95%視聴',
    '動画_100%視聴',
    '動画_平均視聴秒数',

    'アウトバウンドクリック（代替含む）',
    'アウトバウンドCTR（%）',
    'ランディングページビュー（LPV）',

    ...REPORT_CONFIG.kpiActionTypes.map((x) => `${KPI_JP[x] || x}（件数）`),
    ...REPORT_CONFIG.kpiActionTypes.map((x) => `${KPI_JP[x] || x}（獲得単価）`),

    'actions生データ(JSON)',
    'cost_per_action_type生データ(JSON)',
    '更新日時'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

/**
 * 期間を分割してInsightsを取得
 * @param {string} token - アクセストークン
 * @param {string} accountId - アカウントID
 * @param {string} sinceStr - 開始日
 * @param {string} untilStr - 終了日
 * @param {number} chunkDays - 分割日数
 * @returns {Array} Insightsデータ
 */
function fetchInsightsSegmented(token, accountId, sinceStr, untilStr, chunkDays) {
  const since = parseYmd(sinceStr);
  const until = parseYmd(untilStr);

  const out = [];
  let cur = new Date(since.getTime());

  while (cur.getTime() <= until.getTime()) {
    const segSince = new Date(cur.getTime());
    const segUntil = new Date(cur.getTime());
    segUntil.setDate(segUntil.getDate() + (chunkDays - 1));
    if (segUntil.getTime() > until.getTime()) segUntil.setTime(until.getTime());

    const s = formatYmd(segSince);
    const u = formatYmd(segUntil);

    Logger.log(`fetch segment: ${s} ~ ${u}`);
    const part = fetchInsights(token, accountId, s, u);
    part.forEach((x) => out.push(x));

    cur.setDate(cur.getDate() + chunkDays);
  }
  return out;
}

/**
 * Insightsを取得
 * @param {string} token - アクセストークン
 * @param {string} accountId - アカウントID
 * @param {string} since - 開始日
 * @param {string} until - 終了日
 * @returns {Array} Insightsデータ
 */
function fetchInsights(token, accountId, since, until) {
  const fields = [
    'date_start',
    'date_stop',
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',

    'spend',
    'impressions',
    'reach',
    'frequency',
    'cpm',

    'video_thruplay_watched_actions',
    'video_p25_watched_actions',
    'video_p50_watched_actions',
    'video_p75_watched_actions',
    'video_p95_watched_actions',
    'video_p100_watched_actions',
    'video_avg_time_watched_actions',

    'actions',
    'cost_per_action_type'
  ].join(',');

  const params = {
    access_token: token,
    fields,
    level: REPORT_CONFIG.level,
    time_increment: REPORT_CONFIG.time_increment,
    time_range: JSON.stringify({ since, until }),
    limit: 500
  };

  const baseUrl = `https://graph.facebook.com/${REPORT_CONFIG.API_VERSION}/${accountId}/insights`;

  const all = [];
  let url = baseUrl + '?' + toQueryString(params);

  while (url) {
    const json = fetchWithRetry(url);
    (json.data || []).forEach((x) => all.push(x));
    url = json.paging && json.paging.next ? json.paging.next : null;
  }

  return all;
}

/**
 * レポート1行を生成
 * @param {Object} r - Insightsデータ
 * @param {Date} now - 現在時刻
 * @returns {Array} 行データ
 */
function buildReportRecord(r, now) {
  const actions = arrToMap(r.actions);
  const cpa = arrToMap(r.cost_per_action_type);

  const num = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return isFinite(n) ? n : '';
  };

  const video3s = pickAction(actions, ['video_view']);
  const thruplay = extractMetricValue(r.video_thruplay_watched_actions);
  const p25 = extractMetricValue(r.video_p25_watched_actions);
  const p50 = extractMetricValue(r.video_p50_watched_actions);
  const p75 = extractMetricValue(r.video_p75_watched_actions);
  const p95 = extractMetricValue(r.video_p95_watched_actions);
  const p100 = extractMetricValue(r.video_p100_watched_actions);
  const avgWatch = extractMetricValue(r.video_avg_time_watched_actions);

  let outboundClicks = pickAction(actions, ['outbound_click', 'outbound_clicks']);
  if (outboundClicks === '' || outboundClicks === undefined) {
    outboundClicks = pickAction(actions, ['link_click']);
  }
  const outboundCtrPct = calcRatePct(outboundClicks, r.impressions);

  const lpv =
    pickAction(actions, ['landing_page_view', 'landing_page_views']) ||
    pickAction(actions, ['omni_landing_page_view', 'omni_landing_page_views']);

  const kpiCounts = REPORT_CONFIG.kpiActionTypes.map((t) => pickAction(actions, [t]));
  const kpiCosts = REPORT_CONFIG.kpiActionTypes.map((t) => pickAction(cpa, [t]));

  return [
    r.date_start || '',
    r.date_stop || '',
    r.campaign_id || '',
    r.campaign_name || '',
    r.adset_id || '',
    r.adset_name || '',
    r.ad_id || '',
    r.ad_name || '',

    num(r.spend),
    num(r.impressions),
    num(r.reach),
    num(r.frequency),
    num(r.cpm),

    num(video3s),
    num(thruplay),
    num(p25),
    num(p50),
    num(p75),
    num(p95),
    num(p100),
    num(avgWatch),

    num(outboundClicks),
    outboundCtrPct === '' ? '' : outboundCtrPct,
    num(lpv),

    ...kpiCounts.map(num),
    ...kpiCosts.map(num),

    JSON.stringify(r.actions || []),
    JSON.stringify(r.cost_per_action_type || []),
    now
  ];
}

/**
 * リトライ付きfetch
 * @param {string} url - URL
 * @returns {Object} JSONレスポンス
 */
function fetchWithRetry(url) {
  const maxTries = 6;
  let lastText = '';

  for (let i = 0; i < maxTries; i++) {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    const text = resp.getContentText();
    lastText = text;

    if (code >= 200 && code < 300) return JSON.parse(text);

    try {
      const j = JSON.parse(text);
      const err = j && j.error;
      if (err && err.code === 190) {
        throw new Error(`Metaトークン失効(code=190, subcode=${err.error_subcode})`);
      }
    } catch (_) {}

    if (code === 429 || (code >= 500 && code < 600)) {
      const sleepMs = 800 * Math.pow(2, i);
      Utilities.sleep(sleepMs);
      continue;
    }

    throw new Error(`Meta API error ${code}: ${text}`);
  }

  throw new Error(`Meta API error (after retries): ${lastText}`);
}

// ヘルパー関数

function toQueryString(obj) {
  const parts = [];
  for (const k in obj) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
  return parts.join('&');
}

function arrToMap(arr) {
  const map = {};
  if (!Array.isArray(arr)) return map;
  for (const x of arr) {
    if (!x) continue;
    const t = x.action_type;
    const v = x.value;
    if (t) map[t] = v;
  }
  return map;
}

function pickAction(map, candidates) {
  for (const c of candidates) {
    if (map[c] !== undefined) return map[c];
  }
  return '';
}

function extractMetricValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;

  if (Array.isArray(v) && v.length > 0) {
    const hit = v.find((x) => x && x.action_type === 'video_view' && x.value !== undefined);
    if (hit) return hit.value;

    const first = v[0];
    if (first && first.value !== undefined) return first.value;
  }
  return '';
}

function calcRatePct(numVal, denomVal) {
  const n = Number(numVal);
  const d = Number(denomVal);
  if (!isFinite(n) || !isFinite(d) || d === 0) return '';
  return (n / d) * 100;
}

function calcReportDateRange(sinceOffsetDays, untilOffsetDays) {
  const tz = REPORT_CONFIG.TIMEZONE;
  const now = new Date();

  const since = new Date(now.getTime());
  since.setDate(since.getDate() - sinceOffsetDays);

  const until = new Date(now.getTime());
  until.setDate(until.getDate() - untilOffsetDays);

  const fmt = (d) => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return { since: fmt(since), until: fmt(until) };
}

function parseYmd(ymd) {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  return new Date(y, m - 1, d);
}

function formatYmd(dateObj) {
  return Utilities.formatDate(dateObj, REPORT_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}
