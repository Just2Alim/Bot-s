import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateBotProgress from "../components/CreateBotProgress.jsx";
import { useCreateBot } from "../context/CreateBotContext.jsx";

export default function CreateBotToken() {
  const navigate = useNavigate();
  const { botUsername, setField } = useCreateBot();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    setError("");
    if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token.trim())) { setError("Проверьте формат токена: он содержит двоеточие и длинную буквенно-цифровую часть."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/bots/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось подключить Telegram-бота.");
      setField("botId", data.bot.id); setField("botUsername", data.bot.username); setField("botName", data.bot.botName); setField("verified", true); setField("status", "Подключён"); setToken(""); navigate("/create/describe");
    } catch (exception) { setError(exception instanceof TypeError ? "Локальный сервер не запущен. Закройте приложение и запустите его командой npm run dev." : exception.message); }
    finally { setLoading(false); }
  }
  return <div><CreateBotProgress /><div className="grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_.8fr]"><section className="rounded-2xl bg-white p-7 shadow-sm sm:p-9"><p className="text-xs font-semibold uppercase tracking-wide text-accent-600">Сначала подключим Telegram</p><h1 className="mt-3 font-display text-2xl font-bold text-navy-950 sm:text-3xl">Подключите бота через BotFather</h1><p className="mt-3 text-sm leading-6 text-gray-500">Токен шифруется локально на твоём компьютере и хранится в папке приложения. Он не отправляется в облако или модели ИИ. На этом компьютере он понадобится для круглосуточного получения сообщений.</p><ol className="mt-7 space-y-4">{[<>Открой <a className="font-semibold text-accent-600 hover:underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> и отправь команду <code className="rounded bg-gray-100 px-1.5 py-0.5 text-navy-950">/newbot</code>.</>, <>Задай имя и уникальный username, который заканчивается на <code className="rounded bg-gray-100 px-1.5 py-0.5 text-navy-950">bot</code>.</>, <>Скопируй API-токен и вставь его ниже.</>].map((item, index) => <li key={index} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-xs font-bold text-accent-600">{index + 1}</span><span className="text-sm text-gray-600">{item}</span></li>)}</ol><label className="mt-7 block"><span className="mb-2 block text-sm font-semibold text-navy-950">Токен бота</span><input value={token} onChange={(event) => setToken(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") connect(); }} autoComplete="off" spellCheck="false" placeholder="123456789:AA..." className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm text-navy-950 outline-none focus:border-accent-500" /></label>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm leading-5 text-red-700">{error}</p>}<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center"><button onClick={connect} disabled={loading || !token.trim()} className="rounded-xl bg-navy-950 px-5 py-3 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-50">{loading ? "Проверяем в Telegram…" : "Проверить и продолжить"}</button><span className="text-xs text-gray-400">Токен не сохраняется в браузере</span></div>{botUsername && <p className="mt-4 text-xs text-gray-500">Ранее подключён: @{botUsername}</p>}</section><aside className="h-fit rounded-2xl border border-blue-100 bg-blue-50 p-6"><p className="text-sm font-semibold text-navy-950">🔐 Локальная безопасность</p><p className="mt-2 text-sm leading-6 text-gray-600">Токен сохраняется в зашифрованном виде только на твоём компьютере. Отправляется он только Telegram, для работы бота.</p><div className="mt-5 rounded-xl bg-white/80 p-4"><p className="text-xs font-semibold text-navy-950">Локальная модель ИИ</p><p className="mt-1 text-xs leading-5 text-gray-500">Описание бизнеса и вопросы обрабатываются Ollama на твоём компьютере. Внешний ИИ не используется.</p></div></aside></div></div>;
}
