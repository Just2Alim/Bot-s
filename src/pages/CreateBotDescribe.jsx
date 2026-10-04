import { useNavigate } from "react-router-dom";
import { useCreateBot } from "../context/CreateBotContext.jsx";

const categories = [
  { key: "beauty", label: "Салон красоты" },
  { key: "cafe", label: "Кафе" },
  { key: "manicure", label: "Мастер маникюра" },
  { key: "courses", label: "Курсы" },
];

const placeholderByCategory = {
  beauty: "У меня салон красоты. Нужен бот для записи клиентов, показа услуг и напоминаний.",
  cafe: "У меня кафе. Нужен бот для брони столиков и показа меню.",
  manicure: "Я мастер маникюра. Нужен бот для записи и показа портфолио работ.",
  courses: "У меня онлайн-курсы. Нужен бот для записи на пробный урок и ответов на вопросы.",
};

export default function CreateBotDescribe() {
  const navigate = useNavigate();
  const { category, setCategory, description, setDescription } = useCreateBot();

  function selectCategory(key) {
    setCategory(key);
    setDescription(placeholderByCategory[key]);
  }

  function handleSubmit() {
    if (!description.trim()) return;
    navigate("/create/structure");
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">
        Создать бота / <span className="text-gray-600">Описание бизнеса</span>
      </p>

      <div className="max-w-2xl rounded-xl2 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Расскажите о бизнесе
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Опишите обычным текстом, что должен делать бот
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => selectCategory(c.key)}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                category === c.key
                  ? "bg-accent-500 text-white"
                  : "bg-accent-500/10 text-accent-600 hover:bg-accent-500/20",
              ].join(" ")}
            >
              {c.label}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Опишите ваш бизнес и что должен уметь бот..."
          className="mt-5 w-full resize-none rounded-lg bg-gray-50 px-4 py-3 text-sm text-navy-950 outline-none ring-1 ring-gray-200 focus:ring-accent-500"
        />

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!description.trim()}
            className="rounded-lg bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Сгенерировать бота
          </button>
        </div>
      </div>
    </div>
  );
}
