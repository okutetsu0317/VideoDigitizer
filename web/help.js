import {articles,retrieve} from './help-core.mjs?v=2.2.0-qa1';

const $ = id=>document.getElementById(id);
let worker = null, sequence = 0, active = null, ready = false, watchdog = 0;
let lockRelease = null;

function renderTopics(query = '') {
  $('topics').replaceChildren();
  const matches = query.trim() ? retrieve(query,articles.length) : articles;
  for (const article of matches) {
    const button = document.createElement('button'); button.type='button'; button.textContent=article.title;
    button.onclick=()=>{ showSources([article]); $('question').focus(); };
    $('topics').append(button);
  }
  if (!matches.length) $('topics').textContent='該当する資料がありません。';
}
function message(label,text,kind='assistant') {
  const item=document.createElement('article'); item.className=`message ${kind}`;
  const title=document.createElement('h3'); title.textContent=label;
  const body=document.createElement('p'); body.textContent=text;
  item.append(title,body); $('conversation').append(item);
  while ($('conversation').children.length>40) $('conversation').firstElementChild.remove();
  item.scrollIntoView({block:'nearest'});
  return {item,body};
}
function showSources(sources,container) {
  const target=container || message('参照資料','').item;
  for(const source of sources) {
    const detail=document.createElement('details'); detail.open=true;
    const title=document.createElement('summary'); title.textContent=source.title;
    const body=document.createElement('p'); body.textContent=source.text;
    detail.append(title,body); target.append(detail);
  }
  target.scrollIntoView({block:'nearest'});
  return target;
}
function controls() {
  $('loadAI').disabled=Boolean(active)||ready;
  $('releaseAI').disabled=!worker;
  $('deleteModel').disabled=Boolean(active);
  $('sendQuestion').disabled=Boolean(active);
  $('question').disabled=Boolean(active);
  $('stopAnswer').hidden=!active;
  $('clearChat').disabled=Boolean(active);
  $('aiBadge').textContent=ready?'ON':active?.kind==='load'?'準備中':'OFF';
  $('modeLabel').textContent=ready?'端末内AI + 参照資料':'資料検索';
  $('loadProgress').hidden=active?.kind!=='load';
}
function endWorker(status) {
  sequence += 1;
  if(active?.body?.textContent==='資料を確認しています…') active.body.textContent='AIの処理を終了しました。参照資料を確認してください。';
  clearTimeout(watchdog); watchdog=0;
  worker?.terminate(); worker=null; ready=false; active=null;
  lockRelease?.(); lockRelease=null;
  if(status) $('aiStatus').textContent=status;
  controls();
}
async function acquireLock() {
  if(!navigator.locks) return true;
  return new Promise(resolve=>{
    navigator.locks.request('video-digitizer-help-model',{ifAvailable:true},lock=>{
      if(!lock) { resolve(false); return; }
      return new Promise(release=>{lockRelease=release;resolve(true);});
    }).catch(()=>resolve(false));
  });
}
function startWorker() {
  if(worker) return;
  worker=new Worker(new URL('./help-worker.js?v=2.2.0-qa1',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(!active || data.id!==active.id) return;
    if(data.type==='progress') {
      const progress=Math.max(0,Math.min(1,Number(data.progress)||0));
      $('loadProgress').value=progress;
      $('aiStatus').textContent=`モデルを準備中 ${Math.round(progress*100)}%`;
    } else if(data.type==='answer') {
      active.body.textContent=String(data.text).slice(0,6000);
    } else if(data.type==='ready') {
      clearTimeout(watchdog); active=null; ready=true;
      $('aiStatus').textContent='端末内AIを使用中。終了するとメモリを解放します。'; controls();
    } else if(data.type==='done') {
      clearTimeout(watchdog);
      if(!active.body.textContent.trim() || active.body.textContent==='資料を確認しています…') active.body.textContent='AIの回答を得られませんでした。参照資料を確認してください。';
      active=null; controls();
    } else if(data.type==='deleted') {
      endWorker('QAモデルを削除しました。プロジェクトの保存データは変更していません。');
    } else if(data.type==='error') {
      if(active.body) active.body.textContent='AIの処理に失敗しました。参照資料は引き続き利用できます。';
      endWorker('AIを利用できませんでした。通信・空き容量・WebGPU対応を確認してください。');
    }
  };
  worker.onerror=event=>{event.preventDefault(); endWorker('AIの起動に失敗しました。資料検索をご利用ください。');};
  worker.onmessageerror=()=>endWorker('AIの応答を受け取れませんでした。資料検索をご利用ください。');
}
function request(kind,extra={},body=null) {
  const id=++sequence; active={id,kind,body}; controls();
  clearTimeout(watchdog);
  watchdog=setTimeout(()=>{
    if(active?.body) active.body.textContent='AIの処理を時間制限で中止しました。参照資料を確認してください。';
    endWorker('処理を時間制限で中止しました。必要に応じて再度読み込んでください。');
  },kind==='load'?10*60_000:kind==='ask'?90_000:30_000);
  worker.postMessage({id,type:kind,...extra});
}

$('loadAI').onclick=()=>{ $('modelConsent').showModal(); };
$('cancelLoad').onclick=()=>{ $('modelConsent').close(); };
$('confirmLoad').onclick=async()=>{
  $('modelConsent').close();
  if(active||ready) return;
  const preparation = ++sequence;
  active={id:preparation,kind:'prepare'}; controls();
  watchdog=setTimeout(()=>endWorker('WebGPUの確認がタイムアウトしました。資料検索をご利用ください。'),15000);
  $('aiStatus').textContent='WebGPUを確認しています。';
  try {
    const adapter=await navigator.gpu?.requestAdapter();
    if(sequence!==preparation) return;
    if(!adapter || !adapter.features.has('shader-f16')) {
      endWorker('この環境はAIに必要なWebGPUに未対応です。資料検索をご利用ください。'); return;
    }
    if(!await acquireLock()) { endWorker('別のQAページでAIを使用中です。そちらのAIを終了してください。');return; }
    if(sequence!==preparation || document.hidden) { lockRelease?.(); lockRelease=null; return; }
    startWorker(); request('load');
  } catch(_) { endWorker('WebGPUを開始できませんでした。資料検索をご利用ください。'); }
};
$('releaseAI').onclick=()=>endWorker('AIを終了しました。モデルの保存は残ります。');
$('stopAnswer').onclick=()=>{
  if(active?.body) active.body.textContent+='\n（生成を中止しました。参照資料を確認してください。）';
  endWorker('AIを中止し、メモリを解放しました。');
};
$('deleteModel').onclick=async()=>{
  if(active || !confirm('QAのモデルだけをブラウザから削除しますか？')) return;
  if(!worker && !await acquireLock()) { $('aiStatus').textContent='別のQAページのAIを終了してから削除してください。'; return; }
  try { startWorker(); request('delete'); } catch(_) {endWorker('モデルを削除できませんでした。');}
};
$('questionForm').onsubmit=event=>{
  event.preventDefault();
  const question=$('question').value.trim();
  if(!question || question.length>1000 || active) return;
  message('あなた',question,'user'); $('question').value='';
  const sources=retrieve(question);
  if(!sources.length) {message('資料検索','関連する資料が見つかりませんでした。ボタン名や「4点法」「保存」などの機能名を含めて質問してください。');return;}
  const reply=message(ready?'端末内AI（資料原文から回答）':'資料検索',ready?'資料を確認しています…':'関連する使い方です。');
  showSources(sources,reply.item);
  if(ready) reply.item.querySelectorAll('details').forEach(detail=>{detail.open=false;});
  if(ready) request('ask',{question},reply.body);
};
$('clearChat').onclick=()=>{ $('conversation').replaceChildren(); };
$('guideFilter').oninput=()=>renderTopics($('guideFilter').value);
window.addEventListener('pagehide',()=>endWorker());
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && (worker || active)) endWorker('ページを離れたためAIを終了しました。モデルの保存は残ります。');
});
renderTopics();
message('使い方QA','知りたい操作を入力してください。AIなしでも参照資料を検索できます。');
controls();
