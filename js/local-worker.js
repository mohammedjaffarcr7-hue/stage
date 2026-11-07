// Runs the built-in AI model off the main thread so the app stays smooth.
import { WebWorkerMLCEngineHandler } from "../vendor/web-llm.js"; // @mlc-ai/web-llm 0.2.86

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
