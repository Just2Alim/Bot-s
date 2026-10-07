import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addEdge, Background, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCreateBot } from "../context/CreateBotContext.jsx";
import { createDefaultWorkflow, nodeKinds } from "../workflow.js";
import { supabase, supabaseSetupError } from "../lib/supabase.js";
import { apiFetch } from "../lib/api.js";

function WorkflowNode({ data, selected }) {
  const kind = nodeKinds[data.kind] || nodeKinds.message;
  return <div className={`w-52 overflow-hidden rounded-xl border bg-white shadow-md ${selected ? "border-accent-500 ring-2 ring-accent-500/20" : kind.color}`}>
    {data.kind !== "start" && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-slate-400" />}
    <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2"><span>{kind.icon}</span><span className="truncate text-xs font-semibold text-slate-800">{data.title || kind.title}</span></div>
    <div className="px-3 py-2 text-[11px] leading-4 text-slate-500">{data.text || data.keywords || kind.title}</div>
    {data.kind !== "fallback" && <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-accent-500" />}
  </div>;
}
const nodeTypes = { workflow: WorkflowNode };

export default function BotFlowEditor() {
  const navigate = useNavigate();
  const { botId: routeBotId } = useParams();
  const editing = Boolean(routeBotId);
  const context = useCreateBot();
  const { botUsername, botName, category, templates, businessName, description, features, items, contacts, greeting, workflow, setField, updateItem, addItem, removeItem, setContact } = context;
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow.edges);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const kinds = useMemo(() => Object.entries(nodeKinds), []);

  useEffect(() => {
    if (!editing) return;
    let alive = true;
    Promise.resolve().then(async () => {
      if (!supabase) throw new Error(supabaseSetupError());
      const { data: authData } = await supabase.auth.getSession();
      const response = await apiFetch(`/api/bots/${routeBotId}`, { headers: { Authorization: `Bearer ${authData.session?.access_token || ""}` } });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Не удалось загрузить бота.");
      return result.bot;
    }).then((bot) => {
      if (!alive) return;
      const config = bot.config || {};
      const templateKey = Object.keys(templates).find((key) => templates[key].label === config.template) || "shop";
      const nextWorkflow = config.workflow || createDefaultWorkflow();
      setField("botId", bot.id); setField("botUsername", bot.username); setField("botName", bot.botName); setField("verified", true); setField("status", bot.status);
      setField("category", templateKey); setField("businessName", config.businessName || ""); setField("description", config.description || "");
      setField("features", config.features || templates[templateKey].features); setField("items", config.items || []);
      setField("contacts", config.contacts || { hours: "", address: "", phone: "", language: "Русский и казахский" });
      setField("greeting", config.greeting || templates[templateKey].greeting); setField("workflow", nextWorkflow);
      setNodes(nextWorkflow.nodes); setEdges(nextWorkflow.edges);
    }).catch((exception) => { if (alive) setError(exception.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [editing, routeBotId, setField, setNodes, setEdges, templates]);

  useEffect(() => { setField("workflow", { nodes, edges }); }, [nodes, edges, setField]);

  const onConnect = useCallback((params) => {
    setEdges((current) => addEdge({ ...params, id: `edge-${crypto.randomUUID()}` }, current));
  }, [setEdges]);

  function addNode(kind) {
    const id = `node-${crypto.randomUUID()}`;
    const metadata = nodeKinds[kind];
    const node = { id, type: "workflow", position: { x: 180 + (nodes.length % 4) * 55, y: 120 + (nodes.length % 5) * 75 }, data: { kind, title: metadata.title, text: ["message", "fallback", "booking", "question", "condition", "delay", "notification", "link", "location"].includes(kind) ? "Настройте текст этого блока…" : "", buttonLabel: metadata.title, keywords: "" } };
    setNodes((current) => [...current, node]); setSelectedId(id);
  }

  function updateSelected(field, value) {
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, [field]: value } } : node));
  }

  async function save() {
    setSaving(true); setError(""); setSaved(false);
      const config = { businessName, template: templates[category]?.label, description, greeting, features, items, contacts, workflow: { nodes, edges } };
    if (!editing) {
      setField("workflow", config.workflow); setSaving(false); navigate("/create/setup"); return;
    }
    try {
      if (!supabase) throw new Error(supabaseSetupError());
      const { data: authData } = await supabase.auth.getSession();
      const response = await apiFetch(`/api/bots/${routeBotId}/config`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.session?.access_token || ""}` }, body: JSON.stringify(config) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить настройки.");
      setField("status", result.bot.status); setSaved(true);
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">Загружаю настройки бота…</div>;

  return <div className="max-w-[1500px]">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-accent-600">{editing ? `Редактор · @${botUsername || "bot"}` : "Визуальный конструктор"}</p><h1 className="mt-1 font-display text-2xl font-bold text-navy-950">{editing ? "Редактирование бота" : "Собери сценарий из блоков"}</h1><p className="mt-1 text-sm text-gray-500">Соедини блоки линиями. ИИ помогает только на этапе создания — бот отвечает клиентам по этим правилам.</p></div>
      <div className="flex gap-2"><button onClick={() => navigate(editing ? "/bots" : "/create/structure")} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Назад</button><button onClick={save} disabled={saving} className="rounded-xl bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Сохраняю…" : editing ? "Сохранить изменения" : "Сохранить сценарий →"}</button></div>
    </div>
    <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-gray-100 bg-white p-2">{kinds.filter(([kind]) => kind !== "start").map(([kind, value]) => <button key={kind} onClick={() => addNode(kind)} className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-800">+ {value.icon} {value.title}</button>)}</div>
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(520px,1fr)_320px]">
      <div className="h-[620px] overflow-hidden rounded-2xl border border-gray-200 bg-slate-50 shadow-sm"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={({ nodes: selected }) => setSelectedId(selected[0]?.id || null)} fitView fitViewOptions={{ padding: 0.2 }} deleteKeyCode={["Backspace", "Delete"]}><Background color="#cbd5e1" gap={22} /><MiniMap pannable zoomable /><Controls /></ReactFlow></div>
      <aside className="max-h-[620px] space-y-4 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        {selectedNode ? <section><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-navy-950">{nodeKinds[selectedNode.data.kind]?.icon} Настройки блока</h2><button onClick={() => { setNodes((current) => current.filter((node) => node.id !== selectedId)); setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId)); setSelectedId(null); }} disabled={selectedNode.data.kind === "start"} className="text-xs text-red-600 disabled:opacity-30">Удалить</button></div><Field label="Название блока" value={selectedNode.data.title || ""} onChange={(value) => updateSelected("title", value)} />{["message", "fallback", "booking", "question", "condition", "delay", "notification", "link", "location"].includes(selectedNode.data.kind) && <Field label="Текст сообщения" multiline value={selectedNode.data.text || ""} onChange={(value) => updateSelected("text", value)} />}{selectedNode.data.kind === "menu" && <p className="mt-3 text-xs leading-5 text-gray-500">Подключи к этому блоку другие узлы. Каждый выход станет кнопкой в меню бота.</p>}{["catalog", "contacts"].includes(selectedNode.data.kind) && <p className="mt-3 text-xs leading-5 text-gray-500">Блок покажет каталог или контакты, которые указаны в настройках бизнеса ниже.</p>}{selectedNode.data.kind === "keyword" && <Field label="Ключевые слова через запятую" value={selectedNode.data.keywords || ""} onChange={(value) => updateSelected("keywords", value)} />}{selectedNode.data.kind !== "start" && <Field label="Текст кнопки" value={selectedNode.data.buttonLabel || ""} onChange={(value) => updateSelected("buttonLabel", value)} />}</section> : <section><h2 className="text-sm font-bold text-navy-950">Как пользоваться схемой</h2><p className="mt-2 text-xs leading-5 text-gray-500">Перетаскивай узлы по полотну. Потяни за кружок справа у блока, чтобы соединить его с кружком слева у следующего. Нажми на блок для его настройки.</p></section>}
        <section className="border-t border-gray-100 pt-4"><h2 className="text-sm font-bold text-navy-950">Данные бизнеса</h2><Field label="Название" value={businessName} onChange={(value) => setField("businessName", value)} /><Field label="Приветствие /start" multiline value={greeting} onChange={(value) => setField("greeting", value)} /><Field label="Адрес" value={contacts.address} onChange={(value) => setContact("address", value)} /><Field label="График" value={contacts.hours} onChange={(value) => setContact("hours", value)} /><Field label="Телефон" value={contacts.phone} onChange={(value) => setContact("phone", value)} /></section>
        <section className="border-t border-gray-100 pt-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-navy-950">Товары / услуги · ₸</h2><button onClick={addItem} className="text-xs font-semibold text-accent-600">+ Добавить</button></div>{items.map((item, index) => <div key={index} className="mt-2 grid grid-cols-[1fr_76px_24px] items-center gap-1"><input aria-label="Название товара" value={item.name} onChange={(event) => updateItem(index, "name", event.target.value)} className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-xs" /><input aria-label="Цена в тенге" type="number" min="0" value={item.price} onChange={(event) => updateItem(index, "price", Number(event.target.value))} className="w-full rounded-lg border border-gray-200 px-2 py-2 text-xs" /><button aria-label="Удалить позицию" onClick={() => removeItem(index)} className="text-lg text-red-500">×</button></div>)}<p className="mt-2 text-[11px] leading-4 text-amber-700">Проверь цены: шаблонные позиции — примеры, а не цены твоей компании.</p></section>
      </aside>
    </div>
    {(error || saved) && <p role={error ? "alert" : "status"} className={`mt-3 rounded-lg p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || "Изменения сохранены. Запущенный бот перезагружен с новым сценарием."}</p>}
    {!editing && <p className="mt-3 text-xs text-gray-400">После сценария добавь реальные позиции и контакты, затем запусти бота.</p>}
    {editing && <p className="mt-3 text-xs text-gray-400">Изменения сразу применятся к запущенному боту. ИИ не отвечает на клиентские сообщения.</p>}
    <p className="sr-only">Шаблон: {templates[category]?.label}; подключённый бот: {botName}</p>
  </div>;
}

function Field({ label, value, onChange, multiline = false }) {
  return <label className="mt-3 block"><span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>{multiline ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-5 text-slate-800 outline-none focus:border-accent-500" /> : <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-accent-500" />}</label>;
}
