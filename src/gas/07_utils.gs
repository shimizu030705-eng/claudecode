/**
 * ============================================
 * ユーティリティ関数
 * ============================================
 */

/**
 * キャンペーン名を生成
 * @param {Object} campaign - キャンペーン設定
 * @returns {string} キャンペーン名
 */
function generateCampaignName(campaign) {
  return `${campaign.campaignNumber}_${campaign.campaignName}`;
}

/**
 * 広告セット名を生成
 * @param {Object} campaign - キャンペーン設定
 * @returns {string} 広告セット名
 */
function generateAdSetName(campaign) {
  const genderLabel = campaign.gender || '全員';
  return `${campaign.campaignName}_${genderLabel}`;
}

/**
 * 日付と時刻を組み合わせてUnixタイムスタンプを取得
 * @param {Date|string} date - 日付
 * @param {Date|string} time - 時刻
 * @returns {number} Unixタイムスタンプ（秒）
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

/**
 * HTTPレスポンスヘッダーを大文字小文字を無視して取得
 * @param {Object} headers - ヘッダーオブジェクト
 * @param {string} nameLower - ヘッダー名（小文字）
 * @returns {string|null} ヘッダー値
 */
function getHeaderIgnoreCase(headers, nameLower) {
  const target = String(nameLower).toLowerCase();
  for (const k in headers) {
    if (String(k).toLowerCase() === target) return headers[k];
  }
  return null;
}

/**
 * 配列を固定長にする（足りない分は空文字で埋める）
 * @param {Array} arr - 配列
 * @param {number} n - 固定長
 * @returns {Array} 固定長の配列
 */
function padArray(arr, n) {
  const a = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a[i] || '');
  return out;
}

// ============================================
// メール通知
// ============================================

/**
 * 通知メールを送信
 * @param {string} email - 送信先メールアドレス
 * @param {Object} results - 処理結果
 */
function sendNotificationEmail(email, results) {
  if (!email) {
    Logger.log('通知メールアドレスが設定されていません');
    return;
  }

  const hasSuccess = results.success.length > 0;
  const hasFailed = results.failed.length > 0;

  let subject = '';
  let body = '';

  if (hasSuccess && !hasFailed) {
    subject = `【完了】Meta広告キャンペーン作成 - ${results.success.length}件成功`;
    body = createSuccessEmailBody(results.success);
  } else if (!hasSuccess && hasFailed) {
    subject = `【エラー】Meta広告キャンペーン作成 - ${results.failed.length}件失敗`;
    body = createErrorEmailBody(results.failed);
  } else {
    subject = `【一部エラー】Meta広告キャンペーン作成 - 成功${results.success.length}件 / 失敗${results.failed.length}件`;
    body = createMixedEmailBody(results.success, results.failed);
  }

  try {
    GmailApp.sendEmail(email, subject, body);
  } catch (error) {
    Logger.log(`メール送信エラー: ${error.message}`);
  }
}

/**
 * 成功時のメール本文を作成
 * @param {Array} successList - 成功リスト
 * @returns {string} メール本文
 */
function createSuccessEmailBody(successList) {
  let body = 'キャンペーンの作成が完了しました。\n\n';
  body += '■ 処理結果\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of successList) {
    body += `【${item.campaignName}】\n`;
    body += `  キャンペーンID: ${item.campaignId}\n`;
    body += `  広告セットID: ${item.adsetId}\n`;
    body += `  広告ID（動画）: ${item.adIdVideo}\n`;
    body += `  Meta動画ID: ${item.videoId}\n`;
    body += '\n';
  }

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  body += '※ キャンペーンは「一時停止」状態で作成されています。\n';
  body += '  配信開始するには Meta 広告マネージャで有効化してください。\n';

  return body;
}

/**
 * エラー時のメール本文を作成
 * @param {Array} failedList - 失敗リスト
 * @returns {string} メール本文
 */
function createErrorEmailBody(failedList) {
  let body = 'キャンペーンの作成中にエラーが発生しました。\n\n';
  body += '■ エラー情報\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of failedList) {
    body += `【${item.campaignName}】\n`;
    body += `  エラー内容: ${item.error}\n\n`;
  }

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  body += 'スプレッドシートを確認し、問題を修正後に再実行してください。\n';

  return body;
}

/**
 * 一部成功時のメール本文を作成
 * @param {Array} successList - 成功リスト
 * @param {Array} failedList - 失敗リスト
 * @returns {string} メール本文
 */
function createMixedEmailBody(successList, failedList) {
  let body = 'キャンペーン作成が完了しました（一部エラーあり）。\n\n';

  body += '■ 成功（' + successList.length + '件）\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of successList) {
    body += `【${item.campaignName}】\n`;
    body += `  キャンペーンID: ${item.campaignId}\n`;
    body += `  広告セットID: ${item.adsetId}\n`;
    body += `  広告ID（動画）: ${item.adIdVideo}\n`;
    body += `  Meta動画ID: ${item.videoId}\n`;
    body += '\n';
  }

  body += '\n■ 失敗（' + failedList.length + '件）\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of failedList) {
    body += `【${item.campaignName}】\n`;
    body += `  エラー内容: ${item.error}\n\n`;
  }

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  body += '※ 成功したキャンペーンは「一時停止」状態で作成されています。\n';
  body += '※ 失敗したキャンペーンはスプレッドシートを確認し、再実行してください。\n';

  return body;
}
