import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCreateBot } from "../context/CreateBotContext.jsx";

export default function MyBots() {
  const { botUsername, botName, status, category, templates, description, features, setField } = useCreateBot();
  const [serverOnline, setServerOnline] = useState(false);
  const [bots, setBots] = useState([]);
  useEffect(() => {
    let active = true;
    fetch("/api/bots").then((response) => response.json()).then((data) => {
      if (!active) return;
      setServerOnline(true);
      setBots(data.bots || []);
      const bot = data.bots?.find((item) => item.username === botUsername);
      if (bot) setField("status", bot.status);
    }).catch(() => { if (active) setServerOnline(false); });
    return () => { active = false; };
  }, [botUsername, setField]);
  const handle = botUsername ? `@${botUsername}` : "Бот не подключён";

  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">
        Мои боты / <span className="text-gray-600">{handle}</span>
      </p>

      <div className={`flex items-center gap-3 rounded-xl2 px-5 py-4 ${status === "Работает на этом компьютере" ? "bg-green-50" : "bg-amber-50"}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${status === "Работает на этом компьютере" ? "bg-green-500" : "bg-amber-500"}`}>
          {status === "Работает на этом компьютере" ? "✓" : "·"}
        </span>
        <div>
          <p className="text-sm font-semibold text-navy-950">
            {status === "Работает на этом компьютере" ? "Бот отвечает в Telegram" : status || "Черновик конструктора"}
          </p>
          <p className="text-xs text-gray-500">{botName ? `${botName} · ${handle}` : "Создайте своего первого бота"}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr_1fr_1.3fr]">
        {}
        <div className="rounded-xl2 bg-white p-5 shadow-sm md:col-span-4">
          <p className="mb-3 text-xs font-medium text-gray-400">
            Предпросмотр в Telegram
          </p>
          <div className="mb-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-navy-950">
            {description || "Расскажите о бизнесе на шаге создания — здесь появится персональное приветствие."}
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-navy-950">
            {templates[category]?.emoji} {templates[category]?.label} · {features.join(" · ")}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        {botUsername && <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="rounded-lg bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900">Открыть @{botUsername} в Telegram</a>}
        {status === "Работает на этом компьютере" && <button onClick={async () => { const bot = (await (await fetch("/api/bots")).json()).bots?.find((item) => item.username === botUsername); if (!bot) return; const response = await fetch(`/api/bots/${bot.id}/stop`, { method: "POST" }); if (response.ok) setField("status", "Остановлен"); }} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-navy-950 hover:bg-gray-50">Остановить бота</button>}
      </div>

      {bots.length > 0 && <section className="mt-6"><h2 className="mb-3 font-display text-lg font-bold text-navy-950">Подключённые боты</h2><div className="grid gap-3 md:grid-cols-2">{bots.map((bot) => <article key={bot.id} className="flex items-center justify-between gap-3 rounded-xl2 border border-gray-100 bg-white p-4 shadow-sm"><div className="min-w-0"><p className="truncate text-sm font-semibold text-navy-950">{bot.botName} <span className="font-normal text-gray-500">@{bot.username}</span></p><p className="mt-1 text-xs text-gray-400">{bot.status}</p></div><Link to={`/bots/${bot.id}/edit`} className="shrink-0 rounded-lg bg-navy-950 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-900">Редактировать</Link></article>)}</div></section>}
      {!serverOnline && <div className="mt-6 rounded-xl2 border border-amber-100 bg-amber-50 p-5"><p className="text-sm font-semibold text-amber-950">Локальный сервер сейчас не отвечает</p><p className="mt-1 text-sm leading-6 text-amber-900">Запусти приложение командой npm run dev, чтобы обслуживать Telegram-сообщения на этом компьютере.</p></div>}
    </div>
  );
}

