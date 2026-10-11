# Calm Evening — local AI evening planner

A calm English/Polish planner that checks transition time, keeps fixed commitments, and offers changes only inside explicitly allowed windows. This is a separate candidate for the Amazon Alexa+ track; the submitted Spokojny Tydzień project is unchanged.

## Current evidence

Qwen3-1.7B Q8_0 now runs through llama.cpp b11552 on this Windows computer. Three actual model/HTTP cases passed: fixed conflict, permitted flexible draft, and a clear evening. A generic JSON-RPC client also verified MCP initialization, notification, discovery, calculation and session closure over actual HTTP. See live-evidence.json. Detached desktop startup, model readiness, page delivery and graceful shutdown passed separately.

Twenty-five automated checks passed together before release: 4 constraint, 4 MCP handler, 2 ordinary preview, 7 bounded agent, 3 model adapter, 3 web handler and 2 AI UI checks. The automated UI checks use a simulated DOM. A separate real Chrome walkthrough after direct Windows startup verified English rendering, actual local AI reporting the fixed 20-minute conflict, an explicitly permitted 18:50–19:20 draft, and choosing that draft in the local form. No Alexa account, official MCP SDK, public app endpoint, mobile layout or continuous demo video has been verified. This remains a local prototype, not a completed contest submission.

## Start on this computer

Double-click Uruchom-Calm-Evening.cmd. It starts the model and app in the background, then opens http://127.0.0.1:8788/. Choose Polski for Polish. Ordinary calculations remain available; Ask local AI runs actual inference. Zatrzymaj-Calm-Evening.cmd requests graceful shutdown of this app and its owned model. Closing a browser tab alone does not stop the model. Inputs are not persisted.

The verified model/runtime are already downloaded on the author's machine under .local-ai. They are excluded from the source archive. For a fresh Windows x64 checkout, install Node.js 22.19+, run node build-preview.mjs, then run Setup-Local-AI.ps1 using an allowed PowerShell session and use the launch file. The setup downloads about 1.83 GB of model weights plus an 18.6 MB runtime from official sources, verifies SHA-256, and preserves upstream licenses. It does not change execution policy, install a service, create an account or use paid credits. If organizational policy prevents scripts, have the local administrator review the setup; do not disable protections.

For terminal use: node start-local.mjs (Ctrl-C stops both). The app binds only to 127.0.0.1:8788, model to 127.0.0.1:8790. Existing services on those ports are not stopped. The standalone ../Calm-Evening-demo.html is an offline calculation preview; its AI button is unavailable.

## What AI does

The small local model chooses the next workflow action using the user's goal and compact verified tool facts. First analysis is required; after analysis it may explore options or finish. Only unused tools are available. Check-only requests cannot ask for alternatives. The adapter binds the exact input schedule to tool calls. The engine, rather than model-generated prose, computes all displayed timing facts and drafts. The final display uses bilingual templates, not generated explanations. This is a deliberately narrow agent, not unrestricted conversation.

The tools analyze_evening and propose_evening_options share the MCP registry. Agent calls inside this app execute that registry directly; the separate HTTP MCP check proves protocol behavior, not that this agent consumed tools through an SDK or Alexa. The loop bounds decisions/time, rejects changed arguments, validates canonical results and honors cancellation. Editing a form invalidates late answers. Failed inference shows an error; it does not silently use a synthetic model.

## Constraints and privacy

2–8 anonymous task IDs; same-day HH:MM, transition minutes and locked flag. Movable tasks require an explicit full-activity window. Extra profile fields are rejected. The UI currently edits two activities. Options search one movable activity at a time, preserve durations and locked times, and require a separate choice. No calendars, messages, bookings, accounts or external AI service are touched; no request bodies are stored or logged. The local model process has logging disabled. The desktop log contains startup/error information only and stays outside the public archive.

The fictional example has a fixed session 17:30–18:30, twenty minutes afterwards, and a routine 18:30–19:00. Both fixed: 20-minute clash and needs coordination. Explicitly allow routine within 18:30–19:30: a draft starts 18:50 and ends 19:20. Applying it edits only the local form.

## Checks and packaging

Node's test command is node --test *.test.mjs. node build-preview.mjs creates the self-contained offline artifact and checks syntax/DOM target IDs. node live-check.mjs runs actual model/HTTP/MCP checks and stops afterwards; requires downloaded weights and free ports. node desktop-check.mjs verifies detached startup and shutdown; no browser is opened. agent-smoke-output.json remains clearly synthetic historical test evidence.

The handler implements the MCP 2025-11-25 Streamable HTTP JSON response path, temporary sessions, body/rate/origin checks, tools/list and tools/call. GET /mcp returns 405 (no SSE), DELETE closes a session. No remote hosting is configured. Before exposing it publicly, review HTTPS/authentication/origin policy and official-client interoperability. Prepare and review a real English walkthrough before submitting. No contest registration or submission has been performed. This repository publishes source code only; the AI application runs locally.

Application source: MIT. Model: Qwen Apache-2.0; runtime: llama.cpp MIT. Official sources: [Qwen model](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF), [pinned llama.cpp release](https://github.com/ggml-org/llama.cpp/releases/tag/b11552), [pinned API parser](https://github.com/ggml-org/llama.cpp/blob/b11552/tools/server/server-common.cpp), [Amazon event rules](https://amazonappdev2026.devpost.com/rules), [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Double-click preview fix (0.4.1)

preview.html now loads the generated classic browser-runtime.js rather than ES-module imports. This allows an ordinary file preview after double-clicking, while the same bundle is served by the local AI app. Run node build-preview.mjs after editing the UI, engine or browser client. The offline file has ordinary calculations only; AI remains disabled until launched through Uruchom-Calm-Evening.cmd. Preview checks execute the actual referenced runtime, not code with imports removed by the test. The web checks verify that this runtime is served with the correct JavaScript content type. These updated checks passed. The user confirmed the repaired preview, and the local HTTP application was subsequently verified in real Chrome.
