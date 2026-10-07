import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateBotProgress from "../components/CreateBotProgress.jsx";
import { useCreateBot } from "../context/CreateBotContext.jsx";

const prompts = ["Какой у вас город или район?", "Кто ваши клиенты и что чаще всего спрашивают?", "Как оформить заказ или записаться?", "Какие условия оплаты и доставки?" ];

export default function CreateBotDescribe() {
  const navigate = useNavigate();
  const { category, description, setField, templates, chooseTemplate, botUsername, verified, applyAiPlan } = useCreateBot();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);

  async function generatePlan() {
    setLoading(true); setError(""); setPlan(null);
    try {
      const response = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, category: templates[category]?.label }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не получилось собрать черновик. Попробуйте ещё раз.");
      setPlan(data);
    } catch (exception) { setError(exception.message); }
    finally { setLoading(false); }
  }

  async function askAssistant() {
    if (!question.trim()) return;
    setLoading(true); setError(""); setAnswer("");
    try {
      const response = await fetch("/api/ai/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, context: { description, template: templates[category]?.label } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось получить подсказку. Попробуйте ещё раз.");
      setAnswer(`${data.answer || "Не удалось сформировать ответ."}\n\nЛокальный ИИ: ${data.used}/${data.limit} запросов в этом месяце`);
    } catch (exception) { setError(exception.message); }
    finally { setLoading(false); }
  }

  return <div>
    <CreateBotProgress />
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_330px]">
      <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">✓ @{botUsername || "ваш бот"} {verified && "подключён"}</div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Выберите готовый сценарий</h1>
        <p className="mt-2 text-sm text-gray-500">Шаблон подойдёт для старта, а ниже его можно персонализировать под ваш бизнес.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">{Object.entries(templates).map(([key, template]) => <button key={key} onClick={() => chooseTemplate(key)} className={`rounded-xl border p-4 text-left transition ${category === key ? "border-accent-500 bg-accent-500/5 ring-2 ring-accent-500/10" : "border-gray-200 hover:border-gray-300"}`}><span className="text-2xl">{template.emoji}</span><span className="mt-3 block text-sm font-semibold text-navy-950">{template.label}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{template.features.slice(0, 3).join(" · ")}</span></button>)}</div>
        <label className="mt-7 block"><span className="text-sm font-semibold text-navy-950">Расскажите о своём бизнесе</span><span className="mt-1 block text-xs text-gray-400">Добавьте название, город, особенности и то, как клиенты совершают заказ.</span><textarea value={description} onChange={(event) => setField("description", event.target.value)} rows={6} placeholder="Например: кофейня в Астане, рядом с Байтереком…" className="mt-3 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-navy-950 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/10" /></label>
        <div className="mt-5 flex justify-between"><button onClick={() => navigate("/create/token")} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-navy-950 hover:bg-gray-50">Назад</button><button onClick={() => navigate("/create/structure")} disabled={!description.trim()} className="rounded-xl bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-40">Продолжить →</button></div>
      </section>
      <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">✦</span><div><p className="text-sm font-semibold text-navy-950">ИИ-помощник · на этом ПК</p><p className="text-xs text-gray-400">Модель Ollama, 20 генераций в месяц</p></div></div><button onClick={generatePlan} disabled={!description.trim() || loading} className="mt-5 w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-40">{loading ? "Собираю персональный сценарий…" : "✦ Собрать черновик бота с ИИ"}</button>{plan && <div className="mt-4 rounded-xl bg-violet-50 p-4"><p className="text-xs font-semibold text-navy-950">Приветствие для проверки</p><p className="mt-1 text-xs leading-5 text-gray-700">{plan.greeting}</p><p className="mt-3 text-xs font-semibold text-navy-950">Идеи функций · не добавлены автоматически</p><ul className="mt-1 list-inside list-disc text-xs leading-5 text-gray-700">{plan.features.map((feature, index) => <li key={index}>{feature}</li>)}</ul><button onClick={() => { applyAiPlan(plan); setAnswer(`Приветствие перенесено в настройки шага 4. Проверь его перед запуском. ${plan.used}/${plan.limit} запросов ИИ использовано в этом месяце.`); }} className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-xs font-semibold text-violet-800">Взять приветствие в настройки</button></div>}<p className="mt-4 text-xs font-medium text-gray-500">Или спроси ИИ</p><div className="mt-2 flex flex-wrap gap-2">{prompts.map((item) => <button key={item} onClick={() => { setQuestion(item); setAnswer(""); }} className="rounded-full bg-gray-50 px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-accent-500/10 hover:text-accent-600">{item}</button>)}</div><label className="mt-4 block"><span className="sr-only">Спросить ИИ-помощника</span><textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Спросите, как улучшить описание…" className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-5 outline-none focus:border-accent-500" /></label><button onClick={askAssistant} disabled={!question.trim() || loading} className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-xs font-semibold text-navy-950 hover:bg-gray-50 disabled:opacity-40">Спросить помощника</button>{error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">{error}</p>}{answer && <p className="mt-3 rounded-lg bg-violet-50 p-3 text-xs leading-5 text-navy-950">{answer}</p>}<div className="mt-4 border-t border-gray-100 pt-4"><p className="text-xs leading-5 text-gray-400">ИИ-идеи — только подсказки. Функции выбираешь по своему шаблону; цены и условия указывай сам.</p></div></aside>
    </div>
  </div>;
}
