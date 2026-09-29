import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateBot } from "../context/CreateBotContext.jsx";

export default function CreateBotStructure() {
  const navigate = useNavigate();
  const { description, features, toggleFeature } = useCreateBot();

  useEffect(() => {
    if (!description.trim()) {
      navigate("/create/describe", { replace: true });
    }
  }, [description, navigate]);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">
        Создать бота / <span className="text-gray-600">Структура</span>
      </p>

      <div className="max-w-2xl rounded-xl2 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Структура бота готова
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Включите или выключите функции перед настройкой
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(features).map(([key, feature]) => (
            <label
              key={key}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
            >
              <span>
                <span className="block text-sm font-medium text-navy-950">
                  {feature.label}
                </span>
                <span className="block text-xs text-gray-400">
                  {feature.hint}
                </span>
              </span>
              <input
                type="checkbox"
                checked={feature.enabled}
                onChange={() => toggleFeature(key)}
                className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-gray-300 transition-colors checked:bg-accent-500 relative before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
              />
            </label>
          ))}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => navigate("/create/describe")}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-navy-950 hover:bg-gray-50"
          >
            Назад
          </button>
          <button
            onClick={() => navigate("/create/setup")}
            className="rounded-lg bg-navy-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
          >
            Настроить бота
          </button>
        </div>
      </div>
    </div>
  );
}
