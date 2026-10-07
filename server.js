import { createServer } from "node:http";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Bot, InlineKeyboard } from "grammy";
import { createDefaultWorkflow, nodeKinds } from "./src/workflow.js";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, ".data");
const storePath = join(dataDir, "store.json");
const keyPath = join(dataDir, "token-encryption.key");
mkdirSync(dataDir, { recursive: true });
let key;
try { key = readFileSync(keyPath); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600, flag: "wx" });
  try { chmodSync(keyPath, 0o600); } catch { /* Windows applies the user's inherited folder ACL. */ }
}
if (key.length !== 32) throw new Error("Invalid local encryption key. Keep .data/token-encryption.key safe.");

let store;
try { store = JSON.parse(readFileSync(storePath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; store = { bots: [], usage: {} }; }
store.bots ||= []; store.usage ||= {};
const running = new Map();
const PORT = Number(process.env.BOTSUITE_PORT || 4174);
const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";
const MONTHLY_AI_LIMIT = 20;

function persist() {
  const tempPath = `${storePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  try { chmodSync(tempPath, 0o600); } catch { /* Windows applies the user's inherited folder ACL. */ }
  renameSync(tempPath, storePath);
}
function encrypt(value) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") };
}
function decrypt(value) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8");
}
function safeBot(bot) {
  const safe = { ...bot };
  delete safe.encryptedToken;
  return { ...safe, tokenMasked: `••••${bot.username ? ` @${bot.username}` : ""}` };
}
function response(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}
async function bodyOf(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 1024 * 1024) throw new Error("Request too large"); }
  return raw ? JSON.parse(raw) : {};
}
function localRequest(req) {
  const host = req.headers.host || "";
  if (!/^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/i.test(host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}` || /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin);
}
function getBot(id) { return store.bots.find((bot) => bot.id === id); }
function monthKey() { return new Date().toISOString().slice(0, 7); }

async function askLocalAI(prompt, config, mode = "customer", format = undefined) {
  const system = mode === "builder"
    ? "Ты помощник конструктора Telegram-ботов для малого бизнеса Казахстана. Отвечай по-русски, предлагай короткие конкретные улучшения. Не выдумывай название компании, цены, доставку и условия. Не выдавай машинный казахский текст, если не уверен — оставь подсказку по-русски."
    : `Ты вежливый Telegram-помощник бизнеса${config.businessName ? ` «${config.businessName}»` : ""}. Бизнес: ${config.description || ""}. Категория: ${config.template || ""}. Город/адрес: ${config.contacts?.address || "не указан"}. График: ${config.contacts?.hours || "не указан"}. Телефон: ${config.contacts?.phone || "не указан"}. Языки: ${config.contacts?.language || "русский и казахский"}. Позиции: ${(config.items || []).map((item) => `${item.name} — ${item.price} ₸`).join("; ") || "каталог не заполнен"}. Функции: ${(config.features || []).join(", ")}. Отвечай кратко на языке клиента, не придумывай факты, названия бизнеса, цены, наличие и условия. Если точных данных нет — предложи связаться с владельцем. Для казахского используй только простые корректные фразы; при сомнении отвечай по-русски.`;
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, ...(format ? { format } : {}), messages: [{ role: "system", content: system }, { role: "user", content: prompt }], options: { num_ctx: 4096, temperature: 0.15, num_predict: format ? 300 : 180 } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Ollama не готова. Выполни команду: ollama pull ${MODEL}`);
  const data = await response.json();
  return data.message?.content?.trim() || "Пока не получилось составить ответ. Попробуйте ещё раз.";
}

function configOf(data, existing = {}) {
  const workflow = Array.isArray(data.workflow?.nodes) && Array.isArray(data.workflow?.edges) ? data.workflow : existing.workflow || createDefaultWorkflow();
  const nodes = workflow.nodes.slice(0, 100).filter((node) => node && typeof node.id === "string" && nodeKinds[node.data?.kind]).map((node) => ({ id: node.id.slice(0, 80), type: "workflow", position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 }, data: { kind: node.data.kind, title: String(node.data.title || nodeKinds[node.data.kind].title).slice(0, 100), text: String(node.data.text || "").slice(0, 1500), buttonLabel: String(node.data.buttonLabel || "").slice(0, 60), keywords: String(node.data.keywords || "").slice(0, 300) } }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = workflow.edges.slice(0, 200).filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ id: String(edge.id || randomBytes(5).toString("hex")).slice(0, 100), source: edge.source, target: edge.target, label: String(edge.label || "").slice(0, 50) }));
  return { ...existing, ...data, botName: existing.botName, businessName: String(data.businessName || "").slice(0, 120), template: String(data.template || "").slice(0, 100), description: String(data.description || "").slice(0, 5000), greeting: String(data.greeting || "").slice(0, 1000), features: Array.isArray(data.features) ? data.features.slice(0, 30).map((item) => String(item).slice(0, 100)) : existing.features || [], items: Array.isArray(data.items) ? data.items.slice(0, 100).map((item) => ({ name: String(item.name || "").slice(0, 200), price: Math.max(0, Number(item.price) || 0) })) : existing.items || [], contacts: { address: String(data.contacts?.address ?? existing.contacts?.address ?? "").slice(0, 300), hours: String(data.contacts?.hours ?? existing.contacts?.hours ?? "").slice(0, 200), phone: String(data.contacts?.phone ?? existing.contacts?.phone ?? "").slice(0, 50), language: String(data.contacts?.language ?? existing.contacts?.language ?? "Русский и казахский").slice(0, 100) }, workflow: { nodes, edges } };
}

async function executeFlow(bot, ctx, record, startId, depth = 0) {
  if (depth > 15) return;
  const workflow = record.config.workflow || createDefaultWorkflow();
  const current = workflow.nodes.find((node) => node.id === startId);
  if (!current) return;
  const outgoing = workflow.edges.filter((edge) => edge.source === current.id);
  const config = record.config;
  const next = async () => { if (outgoing.length === 1) await executeFlow(bot, ctx, record, outgoing[0].target, depth + 1); };
  switch (current.data.kind) {
    case "start":
      await next();
      break;
    case "message":
      if (current.data.text) await ctx.reply(current.id === "welcome" ? (config.greeting || current.data.text) : current.data.text);
      await next();
      break;
    case "menu": {
      if (!outgoing.length) break;
      const keyboard = new InlineKeyboard();
      outgoing.forEach((edge, index) => {
        const target = workflow.nodes.find((node) => node.id === edge.target);
        if (target) {
          keyboard.text(target.data.buttonLabel || target.data.title || nodeKinds[target.data.kind].title, `flow:${target.id}`);
          if (index % 2 === 1) keyboard.row();
        }
      });
      await ctx.reply("Выберите действие:", { reply_markup: keyboard });
      break;
    }
    case "catalog": {
      const entries = config.items || [];
      await ctx.reply(entries.length ? entries.map((item) => `• ${item.name} — ${Number(item.price || 0).toLocaleString("ru-RU")} ₸`).join("\n") : "Каталог пока не заполнен. Добавьте товары или услуги в редакторе бота.");
      await next();
      break;
    }
    case "contacts": {
      const contact = config.contacts || {};
      await ctx.reply([contact.address, contact.hours, contact.phone].filter(Boolean).join("\n") || "Контакты пока не заполнены. Напишите владельцу бота.");
      await next();
      break;
    }
    case "booking":
      await ctx.reply(current.data.text || `Чтобы оставить заявку, свяжитесь с нами${config.contacts?.phone ? ` по телефону ${config.contacts.phone}` : " по контактам из меню"}.`);
      await next();
      break;
    case "fallback":
      await ctx.reply(current.data.text || "Не понял запрос. Выберите пункт меню или напишите по контакту из раздела «Контакты».");
      await next();
      break;
    case "keyword":
      await next();
      break;
    default:
      break;
  }
}

async function startBot(record) {
  if (running.has(record.id)) return;
  const bot = new Bot(decrypt(record.encryptedToken));
  const config = record.config || {};
  bot.command("start", async (ctx) => {
    const workflow = config.workflow || createDefaultWorkflow();
    const trigger = workflow.nodes.find((node) => node.data.kind === "start");
    if (trigger) await executeFlow(bot, ctx, record, trigger.id);
    else await ctx.reply(config.greeting || "Здравствуйте! Выберите пункт меню.");
  });
  bot.command("help", async (ctx) => ctx.reply("Выберите действие кнопкой меню. Ответы формируются по заранее настроенным сценариям."));
  bot.callbackQuery(/^flow:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await executeFlow(bot, ctx, record, ctx.match[1]);
  });
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    const workflow = config.workflow || createDefaultWorkflow();
    const match = workflow.nodes.find((node) => node.data.kind === "keyword" && node.data.keywords.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean).some((word) => text.toLowerCase().includes(word)));
    const fallback = workflow.nodes.find((node) => node.data.kind === "fallback");
    if (match) await executeFlow(bot, ctx, record, match.id);
    else if (fallback) await executeFlow(bot, ctx, record, fallback.id);
    else await ctx.reply("Не понял запрос. Выберите действие в меню. Я отвечаю только по настроенному сценарию.");
  });
  bot.catch((error) => console.error(`Telegram bot error (${record.username || record.id}):`, error.error?.message || error.message));
  const loop = bot.start({ onStart: () => console.log(`Telegram bot @${record.username} is running`) });
  running.set(record.id, { bot, loop });
  loop.catch((error) => { console.error(`Telegram polling stopped (${record.username || record.id}):`, error.message); running.delete(record.id); record.status = "Ошибка подключения"; persist(); });
}

const server = createServer(async (req, res) => {
  if (!localRequest(req)) return response(res, 403, { error: "This local service accepts requests from this computer only." });
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      let ai = false; try { const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) }); ai = r.ok; } catch { /* Ollama is optional until installed or started. */ }
      return response(res, 200, { ok: true, mode: "local", ai, model: MODEL, limit: MONTHLY_AI_LIMIT });
    }
    if (req.method === "GET" && url.pathname === "/api/bots") return response(res, 200, { bots: store.bots.map(safeBot) });
    const botMatch = url.pathname.match(/^\/api\/bots\/([a-f0-9]+)$/);
    if (req.method === "GET" && botMatch) { const record = getBot(botMatch[1]); return record ? response(res, 200, { bot: safeBot(record) }) : response(res, 404, { error: "Бот не найден." }); }
    if (req.method === "POST" && url.pathname === "/api/bots/connect") {
      const data = await bodyOf(req); const token = String(data.token || "").trim();
      if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token)) return response(res, 400, { error: "Проверьте формат токена BotFather." });
      const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(15_000) });
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) return response(res, 400, { error: result.description || "Telegram не подтвердил токен." });
      const existing = store.bots.find((bot) => bot.telegramId === String(result.result.id));
      const record = existing || { id: randomBytes(16).toString("hex"), telegramId: String(result.result.id), createdAt: new Date().toISOString(), config: {} };
      record.username = result.result.username; record.botName = result.result.first_name; record.encryptedToken = encrypt(token); record.status = running.has(record.id) ? "Работает на этом компьютере" : "Подключён";
      if (!existing) store.bots.push(record);
      persist();
      return response(res, 200, { bot: safeBot(record) });
    }
    const launchMatch = url.pathname.match(/^\/api\/bots\/([a-f0-9]+)\/launch$/);
    if (req.method === "POST" && launchMatch) {
      const record = getBot(launchMatch[1]); if (!record) return response(res, 404, { error: "Сначала подключите токен бота." });
      const previous = running.get(record.id);
      if (previous) { await previous.bot.stop(); running.delete(record.id); }
      const data = await bodyOf(req);
      record.config = configOf(data, record.config);
      persist();
      try {
        await fetch(`https://api.telegram.org/bot${decrypt(record.encryptedToken)}/setMyCommands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: [{ command: "start", description: "Открыть меню" }, { command: "help", description: "Помощь" }] }) });
        await startBot(record);
        record.status = "Работает на этом компьютере"; persist();
        return response(res, 200, { bot: safeBot(record) });
      } catch (error) { record.status = "Ошибка запуска"; persist(); return response(res, 502, { error: error.message }); }
    }
    const editMatch = url.pathname.match(/^\/api\/bots\/([a-f0-9]+)\/config$/);
    if (req.method === "PUT" && editMatch) {
      const record = getBot(editMatch[1]); if (!record) return response(res, 404, { error: "Бот не найден." });
      const wasRunning = running.has(record.id);
      if (wasRunning) { await running.get(record.id).bot.stop(); running.delete(record.id); }
      record.config = configOf(await bodyOf(req), record.config); persist();
      if (wasRunning) { await startBot(record); record.status = "Работает на этом компьютере"; persist(); }
      return response(res, 200, { bot: safeBot(record) });
    }
    const stopMatch = url.pathname.match(/^\/api\/bots\/([a-f0-9]+)\/stop$/);
    if (req.method === "POST" && stopMatch) {
      const record = getBot(stopMatch[1]); if (!record) return response(res, 404, { error: "Бот не найден." });
      const instance = running.get(record.id); if (instance) { await instance.bot.stop(); running.delete(record.id); }
      record.status = "Остановлен"; persist(); return response(res, 200, { bot: safeBot(record) });
    }
    if (req.method === "POST" && ["/api/ai/assist", "/api/ai/generate"].includes(url.pathname)) {
      const data = await bodyOf(req); const question = String(data.question || "").trim();
      const isGenerate = url.pathname === "/api/ai/generate";
      const description = String(data.description || "").trim();
      if (isGenerate && (!description || description.length > 5000)) return response(res, 400, { error: "Опиши бизнес (до 5000 символов), чтобы собрать персональный черновик." });
      if (!isGenerate && (!question || question.length > 2000)) return response(res, 400, { error: "Напишите вопрос длиной до 2000 символов." });
      let aiReady = false; try { const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) }); aiReady = r.ok; } catch { /* Return the setup hint below when Ollama is offline. */ }
      if (!aiReady) return response(res, 503, { error: `Локальная модель не запущена. Установите модель командой: ollama pull ${MODEL}` });
      const keyForMonth = monthKey(); const usage = store.usage[keyForMonth] || 0;
      if (usage >= MONTHLY_AI_LIMIT) return response(res, 429, { error: `Лимит локального ИИ на этот месяц исчерпан (${MONTHLY_AI_LIMIT} запросов).` });
      try {
        if (isGenerate) {
          const plan = await askLocalAI(`Собери только безопасный текстовый черновик приветствия Telegram-бота для малого бизнеса в Казахстане. Факты бизнеса (это единственный источник фактов): ${description}. Тип шаблона: ${String(data.category || "").slice(0, 100)}. Верни JSON: greeting (до 300 символов, только приветствие и предложение посмотреть уже выбранные в шаблоне функции), features (массив из 3-5 функций, но только как идеи для проверки владельцем), faq (пустой массив). Не называй бизнес. Не обещай скидку, доставку, скорость, круглосуточный сервис, конкретный способ оплаты, наличие товара, цену или запись. Если факт не указан — не упоминай его. Приветствие должно быть только на русском, не переводи его.`, { description }, "builder", "json");
          const generated = JSON.parse(plan);
          if (typeof generated.greeting !== "string" || !Array.isArray(generated.features)) throw new Error("Модель вернула неполный черновик. Нажми генерацию ещё раз.");
          store.usage[keyForMonth] = usage + 1; persist();
          const unsafeClaims = /(бесплатн|доставк|круглосуточ|скидк|гарантир|оплат[аы]|^.*[«"].+[»"].*$)/i;
          if (unsafeClaims.test(generated.greeting)) generated.greeting = "Здравствуйте! Добро пожаловать. Посмотрите наши товары и услуги или напишите, чем вам помочь.";
          generated.features = generated.features.filter((item) => !unsafeClaims.test(String(item)));
          return response(res, 200, { ...generated, used: usage + 1, limit: MONTHLY_AI_LIMIT, local: true });
        }
        const answer = await askLocalAI(question, { description: String(data.context?.description || "").slice(0, 4000), contacts: {}, items: [], features: [] }, "builder");
        store.usage[keyForMonth] = usage + 1; persist();
        return response(res, 200, { answer, used: usage + 1, limit: MONTHLY_AI_LIMIT, local: true });
      }
      catch (error) { return response(res, 503, { error: error.message }); }
    }
    return response(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Local API error:", error.message);
    return response(res, error.message === "Request too large" ? 413 : 500, { error: error.message === "Request too large" ? error.message : "Не удалось выполнить запрос. Проверьте журнал локального сервера." });
  }
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Bot(s) KZ local server: http://127.0.0.1:${PORT}`);
  for (const record of store.bots) {
    if (record.status === "Работает на этом компьютере") {
      try { await startBot(record); } catch (error) { console.error(`Could not restore @${record.username}:`, error.message); }
    }
  }
});
function shutdown() { for (const instance of running.values()) instance.bot.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
