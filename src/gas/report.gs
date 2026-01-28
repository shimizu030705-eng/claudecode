/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * レポートモジュール（Meta Insights API）
 * ============================================
 */

/**
 * 全レポートシートの初期化
 */
function setupAllReportSheets() {
  const ss = SpreadsheetApp.getActive();
  const sheetNames = [
    SHEET_NAMES.REPORT_YESTERDAY,
    SHEET_NAMES.REPORT_LAST_7D,
    SHEET_NAMES.REPORT_LAST_30D,
    SHEET_NAMES.REPORT_LAST_90D
  ];

  for (const name of sheetNames) {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.clear();
    writeReportHeader_(sheet);
  }
}

/**
 * 全タブ更新
 */
function runReport_All() {
  runReport_Yesterday();
  runReport_Last7D();
  runReport_Last30D();
  runReport_Last90D();
}

/**
 * 昨日のレポート
 */
function runReport_Yesterday() {
  const r = REPORT_CONFIG.RANGES.YESTERDAY;
  const range = calcSinceUntil_(r.sinceOffsetDays, r.untilOffsetDays);
  writeMetaReportToSheet_(SHEET_NAMES.REPORT_YESTERDAY, range.since, range.until);
}

/**
 * 過去7日間のレポート
 */
function runReport_Last7D() {
  const r = REPORT_CONFIG.RANGES.LAST_7D;
  const range = calcSinceUntil_(r.sinceOffsetDays, r.untilOffsetDays);
  writeMetaReportToSheet_(SHEET_NAMES.REPORT_LAST_7D, range.since, range.until);
}

/**
 * 直近1ヶ月のレポート
 */
function runReport_Last30D() {
  const r = REPORT_CONFIG.RANGES.LAST_30D;
  const range = calcSinceUntil_(r.sinceOffsetDays, r.untilOffsetDays);
  writeMetaReportToSheet_(SHEET_NAMES.REPORT_LAST_30D, range.since, range.until);
}

/**
 * 直近3ヶ月のレポート
 */
function runReport_Last90D() {
  const r = REPORT_CONFIG.RANGES.LAST_90D;
  const range = calcSinceUntil_(r.sinceOffsetDays, r.untilOffsetDays);
  writeMetaReportToSheet_(SHEET_NAMES.REPORT_LAST_90D, range.since, range.until);
}

/**
 * 日次トリガー設定
 */
function createDailyAllTabsTrigger() {
  // 既存のトリガーを削除
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'runReport_All') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 毎日6時に実行
  ScriptApp.newTrigger('runReport_All')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  SpreadsheetApp.getUi().alert('日次トリガーを設定しました。毎日6時にレポートが更新されます。');
}

/**
 * 指定タブに指定期間のレポートを出力
 */
function writeMetaReportToSheet_(sheetName, since, until) {
  const settings = getCommonSettings();
  const token = settings.accessToken;
  const accountId = settings.adAccountId;

  if (!token || !accountId) {
    throw new Error('アクセストークンまたは広告アカウントIDが設定されていません。');
  }

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  // 作り直し
  sheet.clear();
  writeReportHeader_(sheet);

  // 期間分割取得
  const rows = fetchMetaInsightsSegmented_(
    token,
    accountId,
    since,
    until,
    REPORT_CONFIG.FETCH_CHUNK_DAYS
  );

  const now = new Date();

  if (rows.length === 0) {
    sheet.getRange(2, 1).setValue(`データなし（${since}〜${until}）`);
    return;
  }

  const out = rows.map((r) => buildMetaOutputRecordJP_(r, now));
  sheet.getRange(2, 1, out.length, out[0].length).setValues(out);
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

/**
 * レポートヘッダー書き込み
 */
function writeReportHeader_(sheet) {
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

    ...REPORT_CONFIG.KPI_ACTION_TYPES.map((x) => `${KPI_JP[x] || x}（件数）`),
    ...REPORT_CONFIG.KPI_ACTION_TYPES.map((x) => `${KPI_JP[x] || x}（獲得単価）`),

    'actions生データ(JSON)',
    'cost_per_action_type生データ(JSON)',
    '更新日時'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

/**
 * 長期間を分割して Insights を取得
 */
function fetchMetaInsightsSegmented_(token, accountId, sinceStr, untilStr, chunkDays) {
  const since = parseYmd_(sinceStr);
  const until = parseYmd_(untilStr);

  const out = [];
  let cur = new Date(since.getTime());

  while (cur.getTime() <= until.getTime()) {
    const segSince = new Date(cur.getTime());
    const segUntil = new Date(cur.getTime());
    segUntil.setDate(segUntil.getDate() + (chunkDays - 1));

    if (segUntil.getTime() > until.getTime()) {
      segUntil.setTime(until.getTime());
    }

    const s = formatYmd_(segSince);
    const u = formatYmd_(segUntil);

    Logger.log(`fetch segment: ${s} ~ ${u}`);
    const part = fetchMetaInsights_(token, accountId, s, u);
    part.forEach((x) => out.push(x));

    cur.setDate(cur.getDate() + chunkDays);
  }

  return out;
}

/**
 * Meta Insights API 取得（1セグメント分）
 */
function fetchMetaInsights_(token, accountId, since, until) {
  const acct = normalizeAct_(accountId);

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
    fields: fields,
    level: 'ad',
    time_increment: 1,
    time_range: JSON.stringify({ since, until }),
    limit: 500
  };

  const baseUrl = `https://graph.facebook.com/${REPORT_CONFIG.API_VERSION}/${acct}/insights`;

  const all = [];
  let url = baseUrl + '?' + toQuery_(params);

  while (url) {
    const json = metaFetchJsonWithRetry_(url);
    (json.data || []).forEach((x) => all.push(x));
    url = json.paging && json.paging.next ? json.paging.next : null;
  }

  return all;
}

/**
 * 1行データ構築
 */
function buildMetaOutputRecordJP_(r, now) {
  const actions = arrToMap_(r.actions);
  const cpa = arrToMap_(r.cost_per_action_type);

  const num = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return isFinite(n) ? n : '';
  };

  // 動画メトリクス
  const video3s = pickAction_(actions, ['video_view']);
  const thruplay = extractMetricValue_(r.video_thruplay_watched_actions);
  const p25 = extractMetricValue_(r.video_p25_watched_actions);
  const p50 = extractMetricValue_(r.video_p50_watched_actions);
  const p75 = extractMetricValue_(r.video_p75_watched_actions);
  const p95 = extractMetricValue_(r.video_p95_watched_actions);
  const p100 = extractMetricValue_(r.video_p100_watched_actions);
  const avgWatch = extractMetricValue_(r.video_avg_time_watched_actions);

  // クリック
  let outboundClicks = pickAction_(actions, ['outbound_click', 'outbound_clicks']);
  if (outboundClicks === '' || outboundClicks === undefined) {
    outboundClicks = pickAction_(actions, ['link_click']);
  }
  const outboundCtrPct = calcRatePct_(outboundClicks, r.impressions);

  // LPV
  const lpv =
    pickAction_(actions, ['landing_page_view', 'landing_page_views']) ||
    pickAction_(actions, ['omni_landing_page_view', 'omni_landing_page_views']);

  // CV
  const kpiCounts = REPORT_CONFIG.KPI_ACTION_TYPES.map((t) => pickAction_(actions, [t]));
  const kpiCosts = REPORT_CONFIG.KPI_ACTION_TYPES.map((t) => pickAction_(cpa, [t]));

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
 */
function metaFetchJsonWithRetry_(url) {
  const maxTries = 6;
  let lastText = '';

  for (let i = 0; i < maxTries; i++) {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    const text = resp.getContentText();
    lastText = text;

    if (code >= 200 && code < 300) {
      return JSON.parse(text);
    }

    // トークン失効チェック
    try {
      const j = JSON.parse(text);
      const err = j && j.error;
      if (err && err.code === 190) {
        throw new Error(
          `Metaトークン失効(code=190). アクセストークンを再発行して更新してください。`
        );
      }
    } catch (_) {}

    // 一時障害/レート制限はリトライ
    if (code === 429 || (code >= 500 && code < 600)) {
      const sleepMs = 800 * Math.pow(2, i);
      Utilities.sleep(sleepMs);
      continue;
    }

    throw new Error(`Meta API error ${code}: ${text}`);
  }

  throw new Error(`Meta API error (after retries): ${lastText}`);
}

/**
 * アカウントID正規化
 */
function normalizeAct_(accountId) {
  const s = String(accountId).trim();
  return s.startsWith('act_') ? s : `act_${s}`;
}

/**
 * URLパラメータ構築
 */
function toQuery_(obj) {
  const parts = [];
  for (const k in obj) {
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
  }
  return parts.join('&');
}

/**
 * actionsを連想配列に変換
 */
function arrToMap_(arr) {
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

/**
 * action_typeから値を取得
 */
function pickAction_(map, candidates) {
  for (const c of candidates) {
    if (map[c] !== undefined) return map[c];
  }
  return '';
}

/**
 * メトリクス値抽出
 */
function extractMetricValue_(v) {
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

/**
 * 割合計算
 */
function calcRatePct_(numVal, denomVal) {
  const n = Number(numVal);
  const d = Number(denomVal);
  if (!isFinite(n) || !isFinite(d) || d === 0) return '';
  return (n / d) * 100;
}

/**
 * since/until計算
 */
function calcSinceUntil_(sinceOffsetDays, untilOffsetDays) {
  const tz = REPORT_CONFIG.TIMEZONE;
  const now = new Date();

  const since = new Date(now.getTime());
  since.setDate(since.getDate() - sinceOffsetDays);

  const until = new Date(now.getTime());
  until.setDate(until.getDate() - untilOffsetDays);

  const fmt = (d) => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return { since: fmt(since), until: fmt(until) };
}

/**
 * 日付文字列をDateに変換
 */
function parseYmd_(ymd) {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  return new Date(y, m - 1, d);
}

/**
 * DateをYMD文字列に変換
 */
function formatYmd_(dateObj) {
  return Utilities.formatDate(dateObj, REPORT_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}
