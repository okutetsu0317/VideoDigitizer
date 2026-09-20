import {MODEL_ID, appConfig, allowedModelRequest} from './help-config.mjs?v=2.2.0-qa1';
import {retrieve, messagesFor, selectedArticle} from './help-core.mjs?v=2.2.0-qa1';

// Only fixed model assets can leave this worker. Prompts never enter a URL/body.
const originalFetch = self.fetch.bind(self);
self.fetch = (input, init = {}) => {
  if (!allowedModelRequest(input,init)) return Promise.reject(new Error('QAモデル以外への通信をブロックしました'));
  return originalFetch(input,{...init,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
};
let engine = null;
let busy = false;
const send = (id,type,data={}) => self.postMessage({id,type,...data});
self.onmessage = async ({data}) => {
  const {id,type,question} = data || {};
  if (busy || !Number.isSafeInteger(id)) return;
  busy = true;
  try {
    if (type === 'load') {
      const {CreateMLCEngine} = await import('./vendor/webllm/webllm-0.2.85.js');
      engine = await CreateMLCEngine(MODEL_ID, {appConfig,
        initProgressCallback: info=>send(id,'progress',{progress:info.progress}),logLevel:'ERROR'});
      send(id,'ready');
    } else if (type === 'ask') {
      if (!engine || typeof question !== 'string' || question.length>1000) throw new Error('AIが準備できていません');
      const sources = retrieve(question);
      if (!sources.length) { send(id,'done',{empty:true}); return; }
      const result = await engine.chat.completions.create({messages:messagesFor(question,sources),
        stream:false,max_tokens:64,temperature:0,
        response_format:{type:'json_object',schema:JSON.stringify({type:'object',properties:{
          article_id:{type:'string',enum:sources.map(a=>a.id)}
        },required:['article_id'],additionalProperties:false})},
        extra_body:{enable_thinking:false}});
      const chosen=selectedArticle(result.choices[0]?.message?.content || '',sources);
      send(id,'answer',{text:chosen ? chosen.text : 'AIは資料を特定できませんでした。下の参照資料を確認してください。',sourceId:chosen?.id});
      send(id,'done');
    } else if (type === 'delete') {
      const {deleteModelAllInfoInCache} = await import('./vendor/webllm/webllm-0.2.85.js');
      await engine?.unload(); engine = null;
      await deleteModelAllInfoInCache(MODEL_ID,appConfig);
      send(id,'deleted');
    }
  } catch (error) {
    send(id,'error',{message:String(error?.message || error).slice(0,600)});
  } finally { busy = false; }
};
