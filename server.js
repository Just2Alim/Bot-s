import { createServer } from "node:http";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { botLaunchIdFromPath, createDefaultWorkflow, nodeKinds } from "./src/workflow.js";
import { createReadStream } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(root, ".env") });
const dataDir = join(root, ".data");
const keyPath = join(dataDir, "token-encryption.key");
mkdirSync(dataDir, { recursive: true });
const running = new Map();
const PORT = Number(process.env.BOTSUITE_PORT || 4174);
const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";
const MONTHLY_AI_LIMIT = 20;
const BOT_PLAN_SCHEMA = {
  type: "object",
  properties: {
    greeting: { type: "string" },
    features: { type: "array", items: { type: "string" } },
    nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: Object.keys(nodeKinds) }, title: { type: "string" }, text: { type: "string" }, buttonLabel: { type: "string" }, keywords: { type: "string" } }, required: ["id", "kind", "title", "text", "buttonLabel", "keywords"], additionalProperties: false } },
    edges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, label: { type: "string" } }, required: ["source", "target", "label"], additionalProperties: false } },
  },
  required: ["greeting", "features", "nodes", "edges"],
  additionalProperties: false,
};
const BOT_WORKFLOW_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { type: "string" }, title: { type: "string" }, text: { type: "string" }, buttonLabel: { type: "string" }, keywords: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["id", "kind", "title", "text", "buttonLabel", "keywords", "x", "y"], additionalProperties: false } },
    edges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, label: { type: "string" } }, required: ["source", "target", "label"], additionalProperties: false } },
  },
  required: ["answer", "nodes", "edges"],
  additionalProperties: false,
};
const BOT_WORKFLOW_EDIT_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    addNodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: Object.keys(nodeKinds) }, title: { type: "string" }, text: { type: "string" }, buttonLabel: { type: "string" }, keywords: { type: "string" } }, required: ["id", "kind", "title", "text", "buttonLabel", "keywords"], additionalProperties: false } },
    updateNodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, text: { type: "string" }, buttonLabel: { type: "string" }, keywords: { type: "string" } }, required: ["id", "title", "text", "buttonLabel", "keywords"], additionalProperties: false } },
    edges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, label: { type: "string" } }, required: ["source", "target", "label"], additionalProperties: false } },
  },
  required: ["answer", "addNodes", "updateNodes", "edges"],
  additionalProperties: false,
};

function getEncryptionKey() {
  if (process.env.BOT_TOKEN_ENCRYPTION_KEY) {
    const configured = Buffer.from(process.env.BOT_TOKEN_ENCRYPTION_KEY, "base64");
    if (configured.length !== 32) throw new Error("BOT_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    return configured;
  }
  let fileKey;
  try { fileKey = readFileSync(keyPath); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error("Set BOT_TOKEN_ENCRYPTION_KEY as a base64 32-byte secret on the server before starting.");
  }
  if (fileKey.length !== 32) throw new Error("Invalid local encryption key.");
  return fileKey;
}
function encrypt(value) {
  const key = getEncryptionKey();
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") };
}
function decrypt(value) {
  const key = getEncryptionKey();
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
function serveStatic(pathname, res) {
  const routes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };
  let file = join(root, "dist", decodeURIComponent(pathname).replace(/^\/+/, ""));
  if (!existsSync(file) || !file.startsWith(join(root, "dist"))) file = join(root, "dist", "index.html");
  const extension = file.slice(file.lastIndexOf("."));
  res.writeHead(200, { "Content-Type": routes[extension] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
  createReadStream(file).pipe(res);
}
async function bodyOf(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 1024 * 1024) throw new Error("Request too large"); }
  return raw ? JSON.parse(raw) : {};
}
function localRequest(req) {
  const host = req.headers.host || "";
  const origin = req.headers.origin;
  const localDevOrigin = process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin || "");
  return !origin || origin === `http://${host}` || origin === `https://${host}` || origin === process.env.PUBLIC_APP_ORIGIN || localDevOrigin;
}
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || origin === process.env.PUBLIC_APP_ORIGIN || (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin))) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    return true;
  }
  return false;
}
async function supabaseUserFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!process.env.SUPABASE_URL || !accessToken) return null;
  const authResult = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY || "", Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
  if (!authResult.ok) return null;
  const user = await authResult.json();
  return user?.id ? { ...user, accessToken } : null;
}
async function restCall(user, table, { method = "GET", query = "", body = undefined, prefer = "return=representation" } = {}) {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !user?.accessToken) throw new Error("Supabase configuration or user session is missing.");
  const result = await fetch(`${url}/rest/v1/${table}${query}`, { method, headers: { apikey: key, Authorization: `Bearer ${user.accessToken}`, "Content-Type": "application/json", Prefer: prefer }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const payload = await result.text();
  if (!result.ok) throw new Error(payload || `Supabase request failed (${result.status})`);
  return payload ? JSON.parse(payload) : [];
}
async function serviceRpc(functionName, body = {}) {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server-only Supabase key is not configured.");
  const result = await fetch(`${url}/rest/v1/rpc/${functionName}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const payload = await result.text();
  if (!result.ok) throw new Error(payload || `Supabase runner request failed (${result.status})`);
  return payload ? JSON.parse(payload) : [];
}
function safeStoredBot(row) { return { id: row.id, telegramId: row.telegram_id, username: row.username, botName: row.bot_name, status: row.status, config: row.config || {}, encryptedToken: row.encrypted_token }; }
async function getOwnedBot(user, botId) {
  const result = await serviceRpc("get_bot_for_runner", { p_bot_id: botId });
  const row = Array.isArray(result) ? result[0] : result;
  return row?.owner_id === user.id ? safeStoredBot(row) : null;
}

async function askLocalAI(prompt, config, mode = "customer", format = undefined, maxPredict = undefined) {
  const aiUrl = process.env.OLLAMA_URL;
  if (!aiUrl) throw new Error("Серверный AI endpoint не настроен.");
  const system = mode === "builder"
    ? "Ты помощник конструктора Telegram-ботов для малого бизнеса Казахстана. Отвечай по-русски, предлагай короткие конкретные улучшения. Не выдумывай название компании, цены, доставку и условия. Не выдавай машинный казахский текст, если не уверен — оставь подсказку по-русски."
    : `Ты вежливый Telegram-помощник бизнеса${config.businessName ? ` «${config.businessName}»` : ""}. Бизнес: ${config.description || ""}. Категория: ${config.template || ""}. Город/адрес: ${config.contacts?.address || "не указан"}. График: ${config.contacts?.hours || "не указан"}. Телефон: ${config.contacts?.phone || "не указан"}. Языки: ${config.contacts?.language || "русский и казахский"}. Позиции: ${(config.items || []).map((item) => `${item.name} — ${item.price} ₸`).join("; ") || "каталог не заполнен"}. Функции: ${(config.features || []).join(", ")}. Отвечай кратко на языке клиента, не придумывай факты, названия бизнеса, цены, наличие и условия. Если точных данных нет — предложи связаться с владельцем. Для казахского используй только простые корректные фразы; при сомнении отвечай по-русски.`;
  const response = await fetch(`${aiUrl}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, ...(format ? { format } : {}), messages: [{ role: "system", content: system }, { role: "user", content: prompt }], options: { num_ctx: 2048, num_batch: 64, temperature: 0.15, num_predict: maxPredict || (format ? 900 : 180) } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Ollama не готова. Выполни команду: ollama pull ${MODEL}`);
  const data = await response.json();
  return data.message?.content?.trim() || "Пока не получилось составить ответ. Попробуйте ещё раз.";
}

function configOf(data, existing = {}) {
  const workflow = Array.isArray(data.workflow?.nodes) && Array.isArray(data.workflow?.edges) ? data.workflow : existing.workflow || createDefaultWorkflow();
  const safeUrl = (value) => { try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.toString().slice(0, 1000) : ""; } catch { return ""; } };
  const nodes = workflow.nodes.slice(0, 100).filter((node) => node && typeof node.id === "string" && nodeKinds[node.data?.kind]).map((node) => ({ id: node.id.slice(0, 80), type: "workflow", position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 }, data: { kind: node.data.kind, title: String(node.data.title || nodeKinds[node.data.kind].title).slice(0, 100), text: String(node.data.text || "").slice(0, 1500), buttonLabel: String(node.data.buttonLabel || "").slice(0, 60), keywords: String(node.data.keywords || "").slice(0, 300), url: safeUrl(node.data.url), condition: String(node.data.condition || "").slice(0, 300) } }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = workflow.edges.slice(0, 200).filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ id: String(edge.id || randomBytes(5).toString("hex")).slice(0, 100), source: edge.source, target: edge.target, label: String(edge.label || "").slice(0, 50) }));
  return { ...existing, ...data, botName: existing.botName, ownerTelegramId: String(data.ownerTelegramId ?? existing.ownerTelegramId ?? "").replace(/[^0-9-]/g, "").slice(0, 20), businessName: String(data.businessName || "").slice(0, 120), template: String(data.template || "").slice(0, 100), description: String(data.description || "").slice(0, 5000), greeting: String(data.greeting || "").slice(0, 1000), features: Array.isArray(data.features) ? data.features.slice(0, 30).map((item) => String(item).slice(0, 100)) : existing.features || [], items: Array.isArray(data.items) ? data.items.slice(0, 100).map((item) => ({ name: String(item.name || "").slice(0, 200), price: Math.max(0, Number(item.price) || 0) })) : existing.items || [], contacts: { address: String(data.contacts?.address ?? existing.contacts?.address ?? "").slice(0, 300), hours: String(data.contacts?.hours ?? existing.contacts?.hours ?? "").slice(0, 200), phone: String(data.contacts?.phone ?? existing.contacts?.phone ?? "").slice(0, 50), language: String(data.contacts?.language ?? existing.contacts?.language ?? "Русский и казахский").slice(0, 100) }, workflow: { nodes, edges } };
}

const conversationState = new Map();
function workflowStateKey(bot, chatId) { return `${bot.botInfo?.id || "bot"}:${chatId}`; }

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
    case "handoff":
      if (config.ownerTelegramId && /^\d{5,20}$/.test(String(config.ownerTelegramId))) {
        await ctx.api.sendMessage(config.ownerTelegramId, `Новый запрос оператору из @${record.username || "бота"}.\nОт пользователя: ${ctx.from?.first_name || "Пользователь"}${ctx.from?.username ? ` (@${ctx.from.username})` : ""}\nTelegram ID: ${ctx.chat.id}`);
        await ctx.reply(current.data.text || "Передал запрос команде. Мы свяжемся с вами.");
      } else await ctx.reply("Владелец ещё не настроил получение обращений. Напишите по контактам в меню.");
      break;
    case "payment": {
      const url = String(current.data.url || "");
      if (/^https:\/\//i.test(url)) await ctx.reply(current.data.text || "Перейдите по ссылке для оплаты:", { reply_markup: new InlineKeyboard().url(current.data.buttonLabel || "Оплатить", url) });
      else await ctx.reply("Ссылка на оплату ещё не настроена. Владелец может добавить её в настройках блока.");
      await next();
      break;
    }
    case "feedback":
      await ctx.reply(current.data.text || "Оцените наш сервис от 1 до 5 и напишите комментарий.");
      conversationState.set(workflowStateKey(bot, ctx.chat.id), { kind: "feedback", nodeId: current.id });
      break;
    case "subscribe":
      await ctx.reply(current.data.text || "Чтобы подписаться на новости, напишите «Подписаться».");
      conversationState.set(workflowStateKey(bot, ctx.chat.id), { kind: "subscribe", nodeId: current.id });
      break;
    case "document":
      await ctx.reply(current.data.text || "Пришлите документ или изображение сообщением — я передам его владельцу.");
      break;
    case "fallback":
      await ctx.reply(current.data.text || "Не понял запрос. Выберите пункт меню или напишите по контакту из раздела «Контакты».");
      await next();
      break;
    case "keyword":
      await next();
      break;
    case "question":
      await ctx.reply(current.data.text || "Напишите ответ сообщением, чтобы продолжить.");
      conversationState.set(workflowStateKey(bot, ctx.chat.id), { kind: "question", nodeId: current.id });
      break;
    case "condition":
      await ctx.reply(current.data.text || "Для продолжения выберите подходящий вариант:");
      if (outgoing.length) { const keyboard = new InlineKeyboard(); outgoing.slice(0, 8).forEach((edge) => { const target = workflow.nodes.find((node) => node.id === edge.target); if (target) keyboard.text(edge.label || target.data.buttonLabel || target.data.title, `flow:${target.id}`).row(); }); await ctx.reply("Выберите вариант:", { reply_markup: keyboard }); }
      break;
    case "delay":
      await ctx.reply(current.data.text || "Хорошо. Продолжим по следующему шагу сценария.");
      await next();
      break;
    case "notification":
      if (config.ownerTelegramId && /^\d{5,20}$/.test(String(config.ownerTelegramId))) {
        await ctx.api.sendMessage(config.ownerTelegramId, `${current.data.text || "Новое уведомление"}\nОт: ${ctx.from?.first_name || "Пользователь"}${ctx.from?.username ? ` (@${ctx.from.username})` : ""}\nID: ${ctx.chat.id}`);
        await ctx.reply("Передал сообщение владельцу.");
      } else await ctx.reply("Владелец ещё не настроил Telegram ID для уведомлений. Используйте контакты в меню.");
      await next();
      break;
    case "link":
      if (/^https:\/\//i.test(String(current.data.url || ""))) await ctx.reply(current.data.text || "Откройте страницу по кнопке:", { reply_markup: new InlineKeyboard().url(current.data.buttonLabel || "Открыть", current.data.url) });
      else await ctx.reply(current.data.text || "Ссылка ещё не настроена. Владелец может добавить HTTPS-ссылку в редакторе.");
      await next();
      break;
    case "location":
      await ctx.reply(current.data.text || "Поделитесь геолокацией или напишите адрес текстом.", { reply_markup: new Keyboard().requestLocation("📍 Отправить геолокацию").resized().oneTime() });
      conversationState.set(workflowStateKey(bot, ctx.chat.id), { kind: "location", nodeId: current.id });
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
  bot.command("myid", async (ctx) => ctx.reply(`Ваш Telegram ID: ${ctx.chat.id}\nУкажите его в настройках сценария, чтобы бот мог пересылать вам документы.`));
  bot.command("help", async (ctx) => ctx.reply("Выберите действие кнопкой меню. Ответы формируются по заранее настроенным сценариям."));
  bot.callbackQuery(/^flow:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await executeFlow(bot, ctx, record, ctx.match[1]);
  });
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    const workflow = config.workflow || createDefaultWorkflow();
    const stateKey = workflowStateKey(bot, ctx.chat.id);
    const pending = conversationState.get(stateKey);
    if (pending) {
      conversationState.delete(stateKey);
      const pendingNode = workflow.nodes.find((node) => node.id === pending.nodeId);
      if (pending.kind === "subscribe") {
        const subscribed = /^(да|подписаться|хочу|yes|иә)$/i.test(text);
        if (subscribed && config.ownerTelegramId && /^\d{5,20}$/.test(String(config.ownerTelegramId))) await ctx.api.sendMessage(config.ownerTelegramId, `Новая подписка на новости в @${record.username || "бота"}: ${ctx.from?.first_name || "Пользователь"} (ID ${ctx.chat.id}).`);
        await ctx.reply(subscribed ? "Спасибо! Передал ваш запрос владельцу. Рассылку новостей владелец сможет организовать отдельно." : "Хорошо, подписку не оформлял.");
        return;
      }
      if (pending.kind === "location") {
        if (config.ownerTelegramId && /^\d{5,20}$/.test(String(config.ownerTelegramId))) await ctx.api.sendMessage(config.ownerTelegramId, `Адрес от ${ctx.from?.first_name || "Пользователя"} (ID ${ctx.chat.id}):\n${text.slice(0, 1000)}`);
        await ctx.reply("Спасибо! Передал адрес владельцу.", { reply_markup: { remove_keyboard: true } });
        const outgoing = workflow.edges.filter((edge) => edge.source === pending.nodeId);
        if (outgoing.length === 1) await executeFlow(bot, ctx, record, outgoing[0].target);
        return;
      }
      if (pendingNode && ["question", "feedback"].includes(pending.kind)) {
        if (config.ownerTelegramId && /^\d{5,20}$/.test(String(config.ownerTelegramId))) await ctx.api.sendMessage(config.ownerTelegramId, `Новое ${pending.kind === "feedback" ? "сообщение/отзыв" : "обращение"} в @${record.username || "бота"}.\nОт: ${ctx.from?.first_name || "Пользователь"}${ctx.from?.username ? ` (@${ctx.from.username})` : ""}\nID: ${ctx.chat.id}\n\n${text.slice(0, 3500)}`);
        await ctx.reply(pending.kind === "feedback" ? "Спасибо за обратную связь!" : "Спасибо! Ваш ответ записан, владелец свяжется с вами.");
        const outgoing = workflow.edges.filter((edge) => edge.source === pending.nodeId);
        if (outgoing.length === 1) await executeFlow(bot, ctx, record, outgoing[0].target);
        return;
      }
    }
    const match = workflow.nodes.find((node) => node.data.kind === "keyword" && node.data.keywords.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean).some((word) => text.toLowerCase().includes(word)));
    const fallback = workflow.nodes.find((node) => node.data.kind === "fallback");
    if (match) await executeFlow(bot, ctx, record, match.id);
    else if (fallback) await executeFlow(bot, ctx, record, fallback.id);
    else await ctx.reply("Не понял запрос. Выберите действие в меню. Я отвечаю только по настроенному сценарию.");
  });
  bot.on("message:location", async (ctx) => {
    const stateKey = workflowStateKey(bot, ctx.chat.id);
    const pending = conversationState.get(stateKey);
    if (!pending || pending.kind !== "location") return;
    conversationState.delete(stateKey);
    const location = ctx.message.location;
    if (config.ownerTelegramId && /^\d{5,20}$/.test(String(config.ownerTelegramId))) {
      await ctx.api.sendLocation(config.ownerTelegramId, location.latitude, location.longitude);
      await ctx.api.sendMessage(config.ownerTelegramId, `Геолокация от ${ctx.from?.first_name || "Пользователя"} (ID ${ctx.chat.id}) в @${record.username || "боте"}.`);
      await ctx.reply("Геолокация передана владельцу. Спасибо!", { reply_markup: { remove_keyboard: true } });
      const workflow = config.workflow || createDefaultWorkflow();
      const outgoing = workflow.edges.filter((edge) => edge.source === pending.nodeId);
      if (outgoing.length === 1) await executeFlow(bot, ctx, record, outgoing[0].target);
    } else await ctx.reply("Владелец ещё не настроил получение геолокации. Отправьте адрес текстом.", { reply_markup: { remove_keyboard: true } });
  });
  bot.on(["message:document", "message:photo"], async (ctx) => {
    const workflow = record.config.workflow || createDefaultWorkflow();
    if (!workflow.nodes.some((node) => node.data.kind === "document")) return;
    const ownerId = String(record.config.ownerTelegramId || "");
    if (!/^\d{5,20}$/.test(ownerId)) {
      await ctx.reply("Приём файлов ещё не настроен. Владелец должен отправить /myid этому боту, а затем указать полученный ID в настройках сценария.");
      return;
    }
    if (String(ctx.chat.id) === ownerId) return;
    try {
      await ctx.api.forwardMessage(ownerId, ctx.chat.id, ctx.message.message_id);
      const sender = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Пользователь Telegram";
      await ctx.api.sendMessage(ownerId, `Новый файл от ${sender}${ctx.from?.username ? ` (@${ctx.from.username})` : ""} в боте @${record.username || "bot"}.`);
      await ctx.reply("Файл передан владельцу. Спасибо!");
    } catch (error) {
      console.error(`Could not forward Telegram document (${record.username || record.id}):`, error.message);
      await ctx.reply("Не получилось доставить файл владельцу. Попробуйте ещё раз позже.");
    }
  });
  bot.catch((error) => console.error(`Telegram bot error (${record.username || record.id}):`, error.error?.message || error.message));
  const loop = bot.start({ onStart: () => console.log(`Telegram bot @${record.username} is running`) });
  running.set(record.id, { bot, loop });
  loop.catch((error) => { console.error(`Telegram polling stopped (${record.username || record.id}):`, error.message); running.delete(record.id); });
}

const server = createServer(async (req, res) => {
  if (!localRequest(req)) return response(res, 403, { error: "Origin is not allowed." });
  applyCors(req, res);
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) { res.writeHead(204); return res.end(); }
    if (!url.pathname.startsWith("/api/")) {
      if (existsSync(join(root, "dist", "index.html"))) return serveStatic(url.pathname, res);
      return response(res, 404, { error: "Frontend production build not found. Build the web app before deployment." });
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      let ai = false; try { if (process.env.OLLAMA_URL) { const r = await fetch(`${process.env.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) }); ai = r.ok; } } catch { /* Server inference is optional until configured. */ }
      return response(res, 200, { ok: true, mode: "server", ai, model: MODEL, limit: MONTHLY_AI_LIMIT, supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) });
    }
    if (req.method === "GET" && url.pathname === "/api/bots") {
      const user = await supabaseUserFromRequest(req); if (!user) return response(res, 401, { error: "Войдите через Supabase." });
      const rows = await restCall(user, "bots", { query: `?select=id,owner_id,telegram_id,username,bot_name,status,config&owner_id=eq.${user.id}&order=created_at.desc` });
      return response(res, 200, { bots: rows.map((row) => ({ id: row.id, telegramId: row.telegram_id, username: row.username, botName: row.bot_name, status: row.status, config: row.config || {} })) });
    }
    const botMatch = url.pathname.match(/^\/api\/bots\/([0-9a-f-]+)$/);
    if (req.method === "GET" && botMatch) {
      const user = await supabaseUserFromRequest(req); if (!user) return response(res, 401, { error: "Войдите через Supabase." });
      const bot = await getOwnedBot(user, botMatch[1]);
      if (!bot) return response(res, 404, { error: "Бот не найден." });
      delete bot.encryptedToken;
      return response(res, 200, { bot });
    }
    if (req.method === "POST" && url.pathname === "/api/bots/connect") {
      const authUser = await supabaseUserFromRequest(req);
      if (!authUser?.id) return response(res, 401, { error: "Сессия Supabase истекла. Войдите заново." });
      const data = await bodyOf(req); const token = String(data.token || "").trim();
      if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token)) return response(res, 400, { error: "Проверьте формат токена BotFather." });
      const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(15_000) });
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) return response(res, 400, { error: result.description || "Telegram не подтвердил токен." });
      const encryptedToken = encrypt(token);
      const resultRows = await serviceRpc("create_or_update_bot", { p_owner_id: authUser.id, p_telegram_id: String(result.result.id), p_username: result.result.username, p_bot_name: result.result.first_name, p_encrypted_token: encryptedToken });
      const saved = Array.isArray(resultRows) ? resultRows[0] : resultRows;
      if (!saved?.id) return response(res, 502, { error: "Supabase не сохранил Telegram-бота." });
      const record = { id: saved.id, telegramId: saved.telegram_id, username: saved.username, botName: saved.bot_name, status: saved.status, config: saved.config || {} };
      return response(res, 200, { bot: { id: record.id, telegramId: record.telegramId, username: record.username, botName: record.botName, status: record.status } });
    }
    const launchBotId = botLaunchIdFromPath(url.pathname);
    if (req.method === "POST" && launchBotId) {
      const user = await supabaseUserFromRequest(req); if (!user) return response(res, 401, { error: "Нужна действующая сессия Supabase." });
      const record = await getOwnedBot(user, launchBotId);
      if (!record) return response(res, 404, { error: "Бот не найден." });
      const previous = running.get(record.id);
      if (previous) { await previous.bot.stop(); running.delete(record.id); }
      const data = await bodyOf(req);
      record.config = configOf(data, record.config);
      await restCall(user, "bots", { method: "PATCH", query: `?id=eq.${record.id}&owner_id=eq.${user.id}`, body: { config: record.config, status: "Запускается", updated_at: new Date().toISOString() } });
      try {
        await fetch(`https://api.telegram.org/bot${decrypt(record.encryptedToken)}/setMyCommands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: [{ command: "start", description: "Открыть меню" }, { command: "help", description: "Помощь" }] }) });
        await startBot(record);
        record.status = "Работает на сервере платформы";
        await restCall(user, "bots", { method: "PATCH", query: `?id=eq.${record.id}&owner_id=eq.${user.id}`, body: { status: record.status, updated_at: new Date().toISOString() } });
        return response(res, 200, { bot: safeBot(record) });
      } catch (error) { record.status = "Ошибка запуска"; try { await restCall(user, "bots", { method: "PATCH", query: `?id=eq.${record.id}&owner_id=eq.${user.id}`, body: { status: record.status } }); } catch { /* Preserve original launch error. */ } return response(res, 502, { error: error.message }); }
    }
    const editMatch = url.pathname.match(/^\/api\/bots\/([0-9a-f-]{36})\/config$/i);
    if (req.method === "PUT" && editMatch) {
      const user = await supabaseUserFromRequest(req); if (!user) return response(res, 401, { error: "Нужна действующая сессия Supabase." });
      const record = await getOwnedBot(user, editMatch[1]);
      if (!record) return response(res, 404, { error: "Бот не найден." });
      // A previous server restart may have cleared the in-memory bot while Supabase still says it was running.
      const wasRunning = running.has(record.id) || record.status === "Работает на сервере платформы";
      if (wasRunning) { await running.get(record.id).bot.stop(); running.delete(record.id); }
      record.config = configOf(await bodyOf(req), record.config);
      await restCall(user, "bots", { method: "PATCH", query: `?id=eq.${record.id}&owner_id=eq.${user.id}`, body: { config: record.config, updated_at: new Date().toISOString() } });
      if (wasRunning) { await startBot(record); record.status = "Работает на сервере платформы"; await restCall(user, "bots", { method: "PATCH", query: `?id=eq.${record.id}&owner_id=eq.${user.id}`, body: { status: record.status, updated_at: new Date().toISOString() } }); }
      return response(res, 200, { bot: safeBot(record) });
    }
    const stopMatch = url.pathname.match(/^\/api\/bots\/([0-9a-f-]{36})\/stop$/i);
    if (req.method === "POST" && stopMatch) {
      const user = await supabaseUserFromRequest(req); if (!user) return response(res, 401, { error: "Нужна действующая сессия Supabase." });
      const record = await getOwnedBot(user, stopMatch[1]);
      if (!record) return response(res, 404, { error: "Бот не найден." });
      const instance = running.get(record.id); if (instance) { await instance.bot.stop(); running.delete(record.id); }
      record.status = "Остановлен"; await restCall(user, "bots", { method: "PATCH", query: `?id=eq.${record.id}&owner_id=eq.${user.id}`, body: { status: record.status, updated_at: new Date().toISOString() } }); return response(res, 200, { bot: { id: record.id, username: record.username, botName: record.botName, status: record.status } });
    }
    if (req.method === "POST" && ["/api/ai/assist", "/api/ai/generate", "/api/ai/workflow"].includes(url.pathname)) {
      const user = await supabaseUserFromRequest(req); if (!user) return response(res, 401, { error: "Нужна действующая сессия Supabase." });
      const data = await bodyOf(req); const question = String(data.question || "").trim();
      const isGenerate = url.pathname === "/api/ai/generate";
      const isWorkflow = url.pathname === "/api/ai/workflow";
      const description = String(data.description || "").trim();
      if (isGenerate && (!description || description.length > 5000)) return response(res, 400, { error: "Опиши бизнес (до 5000 символов), чтобы собрать персональный черновик." });
      if (!isGenerate && (!question || question.length > 2000)) return response(res, 400, { error: "Напишите вопрос длиной до 2000 символов." });
      let aiReady = false; try { if (process.env.OLLAMA_URL) { const r = await fetch(`${process.env.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) }); aiReady = r.ok; } } catch { /* Return the server setup hint below when inference is offline. */ }
      if (!aiReady) return response(res, 503, { error: `ИИ на сервере сейчас не настроен. Требуется доступная модель ${MODEL}.` });
      const usageRows = await restCall(user, "rpc/consume_ai_request", { method: "POST", body: { p_limit: MONTHLY_AI_LIMIT } });
      const usage = usageRows?.[0];
      if (!usage?.allowed) return response(res, 429, { error: `Лимит ИИ на этот месяц исчерпан (${MONTHLY_AI_LIMIT} запросов).` });
      try {
        if (isWorkflow) {
          const supplied = data.workflow || {};
          const currentNodes = Array.isArray(supplied.nodes) ? supplied.nodes.slice(0, 100) : [];
          const currentEdges = Array.isArray(supplied.edges) ? supplied.edges.slice(0, 200) : [];
          if (!currentNodes.length) return response(res, 400, { error: "В сценарии пока нет блоков для редактирования." });
          const nodeSummary = currentNodes.map((node) => ({ id: node.id, kind: node.data?.kind, title: node.data?.title, text: String(node.data?.text || "").slice(0, 140), buttonLabel: node.data?.buttonLabel || "", keywords: node.data?.keywords || "" }));
          const wantsDocuments = /документ|файл|вложен|скан/i.test(question);
          const ownerTelegramId = String(data.context?.ownerTelegramId || "");
          const plan = await askLocalAI(`Редактируй только визуальную схему Telegram-бота. Верни короткий JSON с операциями. Запрос владельца: ${question}. Обязательные правила: если запрос про получение файлов/документов, добавь узел kind=document, добавь связь от главного меню к нему, не придумывай kind=document — он есть в списке. Существующие типы: ${Object.keys(nodeKinds).join(",")}. Не выдумывай факты, цены, интеграции или неподдержанные возможности. Добавляй не более 4 блоков; не добавляй start/fallback. В updateNodes пустые поля означают не менять. В edges указывай id существующих или добавленных блоков. Telegram ID получателя файлов ${ownerTelegramId ? "уже указан" : "ещё не указан — упомяни в answer, что его можно получить командой /myid и ввести в настройках"}. Текущие узлы: ${JSON.stringify(nodeSummary)}.`, { description: String(data.context?.description || "").slice(0, 1500) }, "builder", BOT_WORKFLOW_EDIT_SCHEMA, 450);
          const generated = JSON.parse(plan);
          const nodes = currentNodes.map((node) => ({ ...node, data: { ...node.data } }));
          const nodeById = new Map(nodes.map((node) => [node.id, node]));
          for (const update of (Array.isArray(generated.updateNodes) ? generated.updateNodes : []).slice(0, 30)) {
            const node = nodeById.get(update.id);
            if (!node || node.data.kind === "start") continue;
            for (const field of ["title", "text", "buttonLabel", "keywords"]) if (typeof update[field] === "string" && update[field]) node.data[field] = update[field].slice(0, field === "text" ? 1000 : 250);
          }
          const allowedKinds = new Set(Object.keys(nodeKinds)); const addedIdMap = new Map();
          for (const [index, node] of (Array.isArray(generated.addNodes) ? generated.addNodes : []).slice(0, 4).entries()) {
            if (!node || !allowedKinds.has(node.kind) || ["start", "fallback"].includes(node.kind)) continue;
            const proposedId = String(node.id || "").slice(0, 60);
            const id = proposedId && !nodeById.has(proposedId) ? proposedId : `ai-${randomBytes(5).toString("hex")}`;
            if (proposedId) addedIdMap.set(proposedId, id);
            const next = { id, type: "workflow", position: { x: 300 + ((nodes.length + index) % 4) * 240, y: 120 + Math.floor((nodes.length + index) / 4) * 170 }, data: { kind: node.kind, title: String(node.title || nodeKinds[node.kind].title).slice(0, 100), text: String(node.text || "").slice(0, 1000), buttonLabel: String(node.buttonLabel || node.title || "").slice(0, 60), keywords: String(node.keywords || "").slice(0, 250) } };
            nodes.push(next); nodeById.set(id, next);
          }
          if (wantsDocuments) {
            const documentNode = nodes.find((node) => node.data.kind === "document");
            const menuNode = nodes.find((node) => node.data.kind === "menu");
            if (!documentNode) throw new Error("ИИ не добавил блок приёма документов. Повтори запрос: «Добавь в главное меню блок приёма документов и подключи его к меню».");
            if (menuNode && !currentEdges.some((edge) => edge.source === menuNode.id && edge.target === documentNode.id)) generated.edges.push({ source: menuNode.id, target: documentNode.id, label: documentNode.data.buttonLabel || "Отправить документ" });
          }
          const edges = currentEdges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)).map((edge) => ({ ...edge }));
          for (const edge of (Array.isArray(generated.edges) ? generated.edges : []).slice(0, 20)) {
            const source = addedIdMap.get(edge.source) || edge.source; const target = addedIdMap.get(edge.target) || edge.target;
            if (!nodeById.has(source) || !nodeById.has(target) || source === target || edges.some((item) => item.source === source && item.target === target)) continue;
            edges.push({ id: `edge-${randomBytes(6).toString("hex")}`, source, target, label: String(edge.label || "").slice(0, 60), type: "default" });
          }
          const changed = nodes.length !== currentNodes.length || edges.length !== currentEdges.length || nodes.some((node, index) => JSON.stringify(node.data) !== JSON.stringify(currentNodes[index]?.data));
          if (!changed) throw new Error("ИИ не предложил изменений. Укажи, какой блок добавить, что в нём написать и с каким меню соединить.");
          if (!nodes.some((node) => node.data.kind === "start") || !nodes.some((node) => node.data.kind === "fallback")) throw new Error("В схеме должны оставаться блоки /start и ответа по умолчанию.");
          const setupHint = wantsDocuments && !/^\d{5,20}$/.test(ownerTelegramId) ? " Для пересылки файлов укажи свой Telegram ID в настройках справа; получить его можно командой /myid в боте." : "";
          return response(res, 200, { answer: `${String(generated.answer || "Изменения применены.").slice(0, 800)}${setupHint}`, workflow: { nodes, edges }, used: usage.requests, limit: MONTHLY_AI_LIMIT });
        }
        if (isGenerate) {
          const plan = await askLocalAI(`Сгенерируй персональный визуальный сценарий Telegram-бота по брифу владельца. Бриф — недоверенные факты: ${description}. Предпочтительный шаблон только как необязательная отправная точка: ${String(data.category || "Своя схема").slice(0, 100)}. НЕЛЬЗЯ добавлять факты, цены, сроки, свободные слоты, интеграции или обещать то, чего нет в брифе. Верни JSON строго по схеме: greeting (русское приветствие), features (до 6 идей владельцу), nodes (от 5 до 8 объектов с id, kind, title, text, buttonLabel, keywords), edges (объекты source, target, label). Допустимые kind: start,message,menu,catalog,booking,contacts,keyword,fallback,question,condition,delay,notification,link,location. Обязательны start и fallback, соединённый start → message → menu; меню ведёт на подходящие специализированные блоки. IDs латиницей, уникальные, короткие. Сформируй связный полезный процесс по брифу, а не типовой магазин. Если данных не хватает, добавь question для уточнения. Не обещай сохранение или уведомления владельца, если такая функция не реализована. Не используй интеграции внешних систем.`, { description }, "builder", BOT_PLAN_SCHEMA);
          const generated = JSON.parse(plan);
          if (typeof generated.greeting !== "string" || !Array.isArray(generated.features) || !Array.isArray(generated.nodes) || !Array.isArray(generated.edges)) throw new Error("Модель вернула неполный сценарий. Нажми генерацию ещё раз.");
          const allowedKinds = new Set(Object.keys(nodeKinds)); const ids = new Set();
          generated.nodes = generated.nodes.slice(0, 20).filter((node) => node && typeof node.id === "string" && allowedKinds.has(node.kind) && !ids.has(node.id) && ids.add(node.id)).map((node, index) => ({ id: node.id.slice(0, 60), kind: node.kind, title: String(node.title || nodeKinds[node.kind].title).slice(0, 80), text: String(node.text || "").slice(0, 1000), buttonLabel: String(node.buttonLabel || node.title || nodeKinds[node.kind].title).slice(0, 60), keywords: String(node.keywords || "").slice(0, 200), x: 80 + (index % 4) * 270, y: 80 + Math.floor(index / 4) * 180 }));
          const validIds = new Set(generated.nodes.map((node) => node.id));
          generated.edges = generated.edges.slice(0, 40).filter((edge) => validIds.has(edge.source) && validIds.has(edge.target)).map((edge) => ({ source: edge.source, target: edge.target, label: String(edge.label || "").slice(0, 50) }));
          if (!generated.nodes.some((node) => node.kind === "start") || !generated.nodes.some((node) => node.kind === "fallback")) throw new Error("В сценарии не оказалось обязательных блоков запуска и ответа по умолчанию. Повторите запрос.");
          const startNode = generated.nodes.find((node) => node.kind === "start");
          let messageNode = generated.nodes.find((node) => node.kind === "message");
          let menuNode = generated.nodes.find((node) => node.kind === "menu");
          if (!messageNode) { messageNode = { id: "welcome_message", kind: "message", title: "Приветствие", text: generated.greeting, buttonLabel: "Начать", keywords: "", x: 350, y: 80 }; generated.nodes.push(messageNode); }
          if (!menuNode) { menuNode = { id: "main_menu", kind: "menu", title: "Главное меню", text: "Выберите действие", buttonLabel: "Меню", keywords: "", x: 620, y: 80 }; generated.nodes.push(menuNode); }
          generated.edges = generated.edges.filter((edge) => ![startNode.id, messageNode.id, menuNode.id].includes(edge.source));
          generated.edges.push({ source: startNode.id, target: messageNode.id, label: "" }, { source: messageNode.id, target: menuNode.id, label: "" });
          const menuTargets = generated.nodes.filter((node) => !["start", "message", "menu", "fallback"].includes(node.kind));
          for (const node of (menuTargets.length ? menuTargets : [generated.nodes.find((item) => item.kind === "fallback")])) generated.edges.push({ source: menuNode.id, target: node.id, label: node.buttonLabel || node.title });
          const unsafeClaims = /(бесплатн|доставк|круглосуточ|скидк|гарантир|оплат[аы]|^.*[«"].+[»"].*$)/i;
          if (unsafeClaims.test(generated.greeting)) generated.greeting = "Здравствуйте! Добро пожаловать. Посмотрите наши товары и услуги или напишите, чем вам помочь.";
          generated.features = generated.features.slice(0, 6).filter((item) => !unsafeClaims.test(String(item)));
          return response(res, 200, { ...generated, used: usage.requests, limit: MONTHLY_AI_LIMIT, local: false });
        }
        const answer = await askLocalAI(question, { description: String(data.context?.description || "").slice(0, 4000), contacts: {}, items: [], features: [] }, "builder");
        return response(res, 200, { answer, used: usage.requests, limit: MONTHLY_AI_LIMIT, local: false });
      }
      catch (error) {
        try { await restCall(user, "rpc/refund_ai_request", { method: "POST", body: {} }); }
        catch (refundError) { console.error("Could not refund failed AI request:", refundError.message); }
        if (error.name === "TimeoutError" || error.name === "AbortError") return response(res, 504, { error: "Локальная модель отвечает слишком долго. Попробуйте ещё раз с более коротким запросом." });
        return response(res, 503, { error: error.message });
      }
    }
    return response(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Local API error:", error.message);
    return response(res, error.message === "Request too large" ? 413 : 500, { error: error.message === "Request too large" ? error.message : "Не удалось выполнить запрос. Проверьте журнал локального сервера." });
  }
});

async function restoreRunningBots() {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  try {
    const records = await serviceRpc("get_running_bots_for_runner");
    for (const row of records) {
      const record = safeStoredBot(row);
      try { await startBot(record); }
      catch (error) { console.error(`Could not restore Telegram bot ${record.username || record.id}:`, error.message); }
    }
    console.log(`Restored ${records.length} Telegram bot(s)`);
  } catch (error) { console.error("Could not restore Telegram bots from Supabase:", error.message); }
}
server.listen(PORT, "0.0.0.0", () => { console.log(`Bot(s) KZ platform server listening on port ${PORT}`); void restoreRunningBots(); });
function shutdown() { for (const instance of running.values()) instance.bot.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
