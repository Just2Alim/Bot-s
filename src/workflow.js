export const nodeKinds = {
  start: { title: "Старт /start", icon: "▶", color: "border-green-300" },
  message: { title: "Сообщение", icon: "💬", color: "border-blue-300" },
  menu: { title: "Меню кнопок", icon: "☷", color: "border-violet-300" },
  catalog: { title: "Каталог", icon: "🛍️", color: "border-amber-300" },
  booking: { title: "Заявка / запись", icon: "📝", color: "border-pink-300" },
  question: { title: "Спросить / собрать данные", icon: "❓", color: "border-orange-300" },
  condition: { title: "Проверка условия", icon: "◇", color: "border-fuchsia-300" },
  delay: { title: "Пауза и ожидание", icon: "◷", color: "border-sky-300" },
  notification: { title: "Уведомить владельца", icon: "🔔", color: "border-rose-300" },
  link: { title: "Открыть ссылку", icon: "↗", color: "border-teal-300" },
  location: { title: "Запросить геолокацию", icon: "⌖", color: "border-lime-300" },
  contacts: { title: "Контакты", icon: "📍", color: "border-cyan-300" },
  keyword: { title: "Ключевые слова", icon: "⌕", color: "border-indigo-300" },
  fallback: { title: "Ответ по умолчанию", icon: "↩", color: "border-gray-300" },
};

export function botLaunchIdFromPath(pathname) {
  return pathname.match(/^\/api\/bots\/([0-9a-f-]{36})\/launch$/i)?.[1] || null;
}

export function createDefaultWorkflow() {
  const nodes = [
    { id: "start", type: "workflow", position: { x: 50, y: 210 }, data: { kind: "start", title: "Новый пользователь" } },
    { id: "welcome", type: "workflow", position: { x: 310, y: 210 }, data: { kind: "message", title: "Приветствие", text: "Здравствуйте! Добро пожаловать. Выберите действие в меню." } },
    { id: "menu", type: "workflow", position: { x: 575, y: 210 }, data: { kind: "menu", title: "Главное меню" } },
    { id: "catalog", type: "workflow", position: { x: 890, y: 25 }, data: { kind: "catalog", title: "Каталог и цены", buttonLabel: "🛍️ Каталог и цены" } },
    { id: "booking", type: "workflow", position: { x: 890, y: 210 }, data: { kind: "booking", title: "Оставить заявку", buttonLabel: "📝 Оставить заявку", text: "Чтобы оставить заявку, свяжитесь с нами по контактам из меню." } },
    { id: "contacts", type: "workflow", position: { x: 890, y: 395 }, data: { kind: "contacts", title: "Контакты", buttonLabel: "📍 Контакты" } },
    { id: "question", type: "workflow", position: { x: 1190, y: 210 }, data: { kind: "question", title: "Собрать заявку", text: "Что вас интересует? Напишите детали, и мы свяжемся с вами.", buttonLabel: "Оставить заявку" } },
    { id: "fallback", type: "workflow", position: { x: 575, y: 455 }, data: { kind: "fallback", title: "Не понял сообщение", text: "Выберите пункт меню или свяжитесь с нами по указанным контактам." } },
  ];
  const edges = [
    { id: "e-start-welcome", source: "start", target: "welcome", animated: true },
    { id: "e-welcome-menu", source: "welcome", target: "menu", animated: true },
    { id: "e-menu-catalog", source: "menu", target: "catalog", label: "Каталог" },
    { id: "e-menu-booking", source: "menu", target: "booking", label: "Заявка" },
    { id: "e-menu-contacts", source: "menu", target: "contacts", label: "Контакты" },
  ];
  return { nodes, edges };
}
