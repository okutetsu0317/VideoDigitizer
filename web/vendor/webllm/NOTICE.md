# Browser QA Runtime

WebLLM 0.2.85 is distributed unmodified from the official npm package
`@mlc-ai/web-llm`, under Apache License 2.0 (see LICENSE). Its bundled source
retains upstream copyright notices. Source: https://github.com/mlc-ai/web-llm
The bundled loglevel MIT terms are in loglevel-LICENSE-MIT. Apache TVM's
notice is in TVM-NOTICE. Microsoft's tslib permission notice is retained in
the unmodified JavaScript bundle.

Package integrity (SHA-512, base64):
`CwUiSAvDCYnmAZlpPMkurPHDfBLq6fvdRB3vRgoA894hRG/V/BSeY9bmMm6iIIU5VpjJxfb/dLPpJX2at0L9rw==`

The optional model is Qwen3-0.6B, quantized by MLC as
`mlc-ai/Qwen3-0.6B-q4f16_1-MLC`. The original Qwen3-0.6B model is released
under Apache License 2.0: https://huggingface.co/Qwen/Qwen3-0.6B
Weights are not included in this distribution; they are downloaded only after
confirmation. The selected model and WASM revisions are pinned in help-config.mjs.

The QA page does not send questions, movies, coordinates or projects to an
inference API. Model downloads disclose normal connection information such as
IP addresses to the asset providers. Responses are generated in a local Worker.
The model selects an allowlisted reference ID; the application displays that
reference's original text rather than model-written instructions. Reference
selection can still be wrong. Related references remain visible for checking.
