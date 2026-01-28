/**
 * ============================================
 * Meta広告キャンペーン自動作成・分析システム
 * 通知モジュール
 * ============================================
 */

/**
 * 処理結果をメール通知
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
  } else if (hasSuccess && hasFailed) {
    subject = `【一部エラー】Meta広告キャンペーン作成 - 成功${results.success.length}件 / 失敗${results.failed.length}件`;
    body = createMixedEmailBody(results.success, results.failed);
  } else {
    // 処理対象なし
    return;
  }

  try {
    GmailApp.sendEmail(email, subject, body);
    Logger.log(`通知メール送信完了: ${email}`);
  } catch (error) {
    Logger.log(`メール送信エラー: ${error.message}`);
  }
}

/**
 * 成功時のメール本文
 */
function createSuccessEmailBody(successList) {
  let body = 'キャンペーンの作成が完了しました。\n\n';
  body += '■ 処理結果\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of successList) {
    body += `【${item.storeName}】\n`;
    body += `  キャンペーンID: ${item.campaignId}\n`;
    body += `  広告セットID: ${item.adsetId}\n`;
    body += `  広告ID（画像）: ${item.adIdImage}\n`;
    if (item.adIdVideo) {
      body += `  広告ID（動画）: ${item.adIdVideo}\n`;
    }
    body += '\n';
  }

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  body += '※ キャンペーンは「一時停止」状態で作成されています。\n';
  body += '  配信開始するには Meta 広告マネージャで有効化してください。\n';
  body += '\n';
  body += '■ 次のステップ\n';
  body += '1. Meta広告マネージャでキャンペーンを確認\n';
  body += '2. 問題なければキャンペーンを有効化\n';
  body += '3. 必要に応じて動画分析を実行\n';

  return body;
}

/**
 * エラー時のメール本文
 */
function createErrorEmailBody(failedList) {
  let body = 'キャンペーンの作成中にエラーが発生しました。\n\n';
  body += '■ エラー情報\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of failedList) {
    body += `【${item.storeName}】\n`;
    body += `  エラー内容: ${item.error}\n\n`;
  }

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  body += '■ 対処方法\n';
  body += '1. スプレッドシートの「キャンペーン設定」シートを確認\n';
  body += '2. エラーメッセージ列の内容を確認\n';
  body += '3. 問題を修正後、ステータスを「未処理」に戻して再実行\n';
  body += '\n';
  body += '■ よくあるエラーと対処法\n';
  body += '- 「住所から座標を取得できません」→ 住所の形式を確認\n';
  body += '- 「ファイルが見つかりません」→ ファイル名とフォルダを確認\n';
  body += '- 「Meta API エラー」→ トークンの有効期限を確認\n';

  return body;
}

/**
 * 一部成功・一部失敗時のメール本文
 */
function createMixedEmailBody(successList, failedList) {
  let body = 'キャンペーン作成が完了しました（一部エラーあり）。\n\n';

  body += '■ 成功（' + successList.length + '件）\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of successList) {
    body += `【${item.storeName}】\n`;
    body += `  キャンペーンID: ${item.campaignId}\n`;
    body += `  広告セットID: ${item.adsetId}\n`;
    body += `  広告ID（画像）: ${item.adIdImage}\n`;
    if (item.adIdVideo) {
      body += `  広告ID（動画）: ${item.adIdVideo}\n`;
    }
    body += '\n';
  }

  body += '\n■ 失敗（' + failedList.length + '件）\n';
  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of failedList) {
    body += `【${item.storeName}】\n`;
    body += `  エラー内容: ${item.error}\n\n`;
  }

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  body += '※ 成功したキャンペーンは「一時停止」状態で作成されています。\n';
  body += '※ 失敗した店舗はスプレッドシートを確認し、再実行してください。\n';

  return body;
}

/**
 * レポート更新完了通知（オプション）
 */
function sendReportUpdateNotification(email, sheetName, rowCount) {
  if (!email) {
    return;
  }

  const subject = `【レポート更新】${sheetName}`;
  let body = `${sheetName}のレポートが更新されました。\n\n`;
  body += `更新日時: ${new Date().toLocaleString('ja-JP')}\n`;
  body += `データ件数: ${rowCount}件\n`;

  try {
    GmailApp.sendEmail(email, subject, body);
  } catch (error) {
    Logger.log(`レポート通知メール送信エラー: ${error.message}`);
  }
}
