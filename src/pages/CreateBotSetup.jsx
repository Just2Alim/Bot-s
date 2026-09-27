import { useNavigate } from "react-router-dom";
import { useCreateBot } from "../context/CreateBotContext.jsx";

export default function CreateBotSetup() {
  const navigate = useNavigate();
  const { services, setServices, contacts, setContacts } = useCreateBot();

  function updateService(index, field, value) {
    setServices((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function addService() {
    setServices((prev) => [...prev, { name: "Новая услуга", price: 0 }]);
  }

  function updateContact(field, value) {
    setContacts((prev) => ({ ...prev, [field]: value }));
  }

  function handleLaunch() {
    navigate("/bots");
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">
        Создать бота / <span className="text-gray-600">Настройка</span>
      </p>

      <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl2 bg-white p-8 shadow-sm">
          <h2 className="font-display text-xl font-bold text-navy-950">
            Услуги и цены
          </h2>

          <div className="mt-4 divide-y divide-gray-100">
            {services.map((service, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <input
                  value={service.name}
                  onChange={(e) => updateService(i, "name", e.target.value)}
                  className="flex-1 bg-transparent text-sm text-navy-950 outline-none"
                />
                <input
                  type="number"
                  value={service.price}
                  onChange={(e) =>
                    updateService(i, "price", Number(e.target.value))
                  }
                  className="w-24 bg-transparent text-right text-sm text-gray-500 outline-none"
                />
                <span className="text-sm text-gray-400">₸</span>
              </div>
            ))}
          </div>

          <button
            onClick={addService}
            className="mt-3 text-sm font-medium text-accent-600 hover:underline"
          >
            + Добавить услугу
          </button>
        </div>

        <div className="rounded-xl2 bg-white p-8 shadow-sm">
          <h2 className="font-display text-xl font-bold text-navy-950">
            Контакты и график
          </h2>

          <div className="mt-4 flex flex-col gap-4">
            <Field
              label="Часы работы"
              value={contacts.hours}
              onChange={(v) => updateContact("hours", v)}
            />
            <Field
              label="Адрес"
              value={contacts.address}
              placeholder="Алматы, ул. Достык 12"
              onChange={(v) => updateContact("address", v)}
            />
            <Field
              label="Telegram-канал"
              value={contacts.channel}
              placeholder="@salon_beauty_bot"
              onChange={(v) => updateContact("channel", v)}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex max-w-4xl justify-between">
        <button
          onClick={() => navigate("/create/structure")}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-navy-950 hover:bg-white"
        >
          Назад
        </button>
        <button
          onClick={handleLaunch}
          className="rounded-lg bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
        >
          Сохранить и запустить
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-navy-950 outline-none ring-1 ring-gray-200 focus:ring-accent-500"
      />
    </label>
  );
}
