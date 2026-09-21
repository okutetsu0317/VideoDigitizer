import {writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const webRoot = new URL(existsSync(new URL('../web_viewer',import.meta.url)) ? '../web_viewer/' : '../web/',import.meta.url);
const {articles} = await import(new URL('help-core.mjs',webRoot));

const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const groups = [
  ['はじめて使う・基本操作',['start','range','advance','zoom','markers','trajectory']],
  ['座標の編集・確認',['table','copy-interpolate','quality']],
  ['4点法・時刻の設定',['calibration','calibration-import','fps']],
  ['保存・書き出し',['save','csv','privacy']],
  ['分析・追跡',['analysis','ai-pose','tracking','steps']],
  ['困ったとき',['open']],
];
const pictures = {
  start:['overview','動画を読み込んだ画面。右側でマーカーを選び、動画上をクリックします。'],
  range:['input','「入力」の範囲・送り幅・打点後の設定。'],
  zoom:['display','「表示」のズームと軌跡の設定。'],
  calibration:['calibration','「4点法 実長換算」の設定欄。この画像は未設定の例で、実座標は実際の寸法に変更します。'],
  save:['file','「ファイル」の保存・読込・出力メニュー。'],
};
const ordered = groups.flatMap(([,ids])=>ids.map(id=>articles.find(article=>article.id===id)));
if(ordered.some(article=>!article) || ordered.length!==articles.length) throw Error('Guide contents are incomplete');
const topic = article => {
  const picture = pictures[article.id];
  const figure = picture ? `<figure><a href="./guide-assets/${picture[0]}.png" target="_blank" rel="noopener"><img src="./guide-assets/${picture[0]}.png" alt="${escape(picture[1])}" loading="lazy" width="1440" height="1000" /></a><figcaption>${escape(picture[1])}</figcaption></figure>` : '';
  const note = article.id==='calibration' ? '<p class="note">測定上の注意：固定したカメラで、4点と測定対象を同じ平面に置きます。4点は重複せず、どの3点も一直線にならない配置にしてください。奥行きのずれやレンズのゆがみは誤差になります。較正に使った点だけでなく、別の既知の距離・検証点で確かめてください。</p>' : '';
  return `<section class="guide-topic" id="${article.id}" data-tags="${escape(article.tags)}"><h3>${escape(article.title)}</h3>${article.text.split('\n').map(line=>`<p>${escape(line)}</p>`).join('')}${note}${figure}</section>`;
};
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="referrer" content="no-referrer" /><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
<title>使い方ガイド | VideoDigitizer</title><link rel="icon" href="./icon-192.png" /><link rel="stylesheet" href="./help.css?v=2.2.0-guide1" /><script defer src="./help.js?v=2.2.0-guide1"></script></head>
<body><header><a class="brand" href="./index.html"><img src="./icon-192.png" alt="" width="30" height="30" />VideoDigitizer</a><a href="./index.html">デジタイズ画面へ</a></header>
<div class="layout"><aside><details open><summary>目次・検索</summary><label for="guideSearch">機能名で探す</label><div class="search-row"><input id="guideSearch" type="search" placeholder="例：4点法、保存" maxlength="200" /><button id="clearSearch" type="button" aria-label="検索をクリア" title="検索をクリア">×</button></div><p id="searchStatus" role="status"></p><nav id="contents" aria-label="使い方の目次">${ordered.map(article=>`<a href="#${article.id}">${escape(article.title)}</a>`).join('')}</nav></details></aside>
<main><div class="intro"><h1>使い方ガイド</h1><p>動画を開き、調べたい位置に点を打ち、座標を保存します。まずは短い範囲で試してみましょう。</p><p class="muted">Web版を中心に説明しています。Macアプリ版だけの機能は本文に明記しています。スクリーンショットの動画は操作確認用のサンプルです。</p><div class="quick-links"><a href="#start">はじめて使う</a><a href="#calibration">4点法</a><a href="#save">保存・再開</a><a href="#open">困ったとき</a></div></div>
<p id="noResults" hidden>該当する項目がありません。「保存」「ズーム」など短い機能名で探すか、検索をクリアしてください。</p>
${groups.map(([title,ids])=>`<section class="guide-group"><h2>${title}</h2>${ids.map(id=>topic(articles.find(article=>article.id===id))).join('')}</section>`).join('')}
<footer><p class="muted">更新：2026年9月21日 · 重要な作業はプロジェクトファイルでも保存してください。</p><a href="./privacy.html">プライバシーポリシー</a></footer></main></div></body></html>`;
await writeFile(new URL('help.html',webRoot),html+'\n');
