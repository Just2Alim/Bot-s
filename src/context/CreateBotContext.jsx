import { createContext, useContext, useState } from "react";

const defaultFeatures = {
  booking: { label: "Запись клиентов", hint: "Онлайн-календарь", enabled: true },
  catalog: { label: "Каталог услуг", hint: "Список и цены", enabled: true },
  reminders: { label: "Напоминания", hint: "За день до визита", enabled: true },
  faq: { label: "Частые вопросы", hint: "Автоответы", enabled: true },
  payments: { label: "Оплата онлайн", hint: "Приём предоплаты", enabled: false },
  reviews: { label: "Отзывы клиентов", hint: "После визита", enabled: false },
};

const CreateBotContext = createContext(null);

export function CreateBotProvider({ children }) {
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState(defaultFeatures);
  const [services, setServices] = useState([
    { name: "Стрижка", price: 5000 },
    { name: "Маникюр", price: 4000 },
    { name: "Окрашивание", price: 12000 },
  ]);
  const [contacts, setContacts] = useState({
    hours: "Пн–Сб, 10:00–20:00",
    address: "",
    channel: "",
  });

  function toggleFeature(key) {
    setFeatures((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  }

  const value = {
    category,
    setCategory,
    description,
    setDescription,
    features,
    toggleFeature,
    services,
    setServices,
    contacts,
    setContacts,
  };

  return (
    <CreateBotContext.Provider value={value}>
      {children}
    </CreateBotContext.Provider>
  );
}

export function useCreateBot() {
  const ctx = useContext(CreateBotContext);
  if (!ctx) {
    throw new Error("useCreateBot must be used inside <CreateBotProvider>");
  }
  return ctx;
}
