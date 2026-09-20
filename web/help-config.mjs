export const MODEL_ID = 'Qwen3-0.6B-q4f16_1-MLC';
export const MODEL_URL = 'https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/resolve/8c14ce481d4c692769976ad52afea453a102df19/';
export const WASM_URL = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm';
export const appConfig = { cacheBackend:'indexeddb', model_list:[{
  model_id:MODEL_ID, model:MODEL_URL, model_lib:WASM_URL,
  required_features:['shader-f16'], overrides:{context_window_size:4096},
}] };
export function allowedModelRequest(input, init = {}) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init.method || input.method || 'GET';
  if (method !== 'GET' || init.body != null) return false;
  if (url === WASM_URL) return true;
  if (!url.startsWith(MODEL_URL)) return false;
  return /^(?:mlc-chat-config\.json|ndarray-cache\.json|tensor-cache\.json|tokenizer\.json|tokenizer\.model|params_shard_\d+\.bin)$/.test(url.slice(MODEL_URL.length));
}
