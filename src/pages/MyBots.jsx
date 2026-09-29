import { useCreateBot } from "../context/CreateBotContext.jsx";

export default function MyBots() {
  const { contacts } = useCreateBot();
  const handle = contacts.channel || "@your_bot";

  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">
        Мои боты / <span className="text-gray-600">{handle}</span>
      </p>

      <div className="flex items-center gap-3 rounded-xl2 bg-green-50 px-5 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs text-white">
          ✓
        </span>
        <div>
          <p className="text-sm font-semibold text-navy-950">
            Бот готов к работе
          </p>
          <p className="text-xs text-gray-500">{handle} запущен в Telegram</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr_1fr_1.3fr]">
        {}
        <StatCard label="Подписчиков" value={0} />
        <StatCard label="Сообщений" value={0} />
        <StatCard label="Записей" value={0} />

        <div className="rounded-xl2 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-medium text-gray-400">
            Предпросмотр в Telegram
          </p>
          <div className="mb-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-navy-950">
            Здравствуйте! Запишитесь на услугу или посмотрите прайс.
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-navy-950">
            Выберите: Записаться · Услуги и цены · Вопрос мастеру
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button className="rounded-lg bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900">
          Открыть в Telegram
        </button>
        <button className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-navy-950 hover:bg-gray-50">
          Пригласить клиентов
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl2 bg-white p-5 shadow-sm">
      <p className="text-xl font-bold text-navy-950">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{label}</p>
    </div>
  );
}
