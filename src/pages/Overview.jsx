import { Link } from "react-router-dom";

export default function Overview() {
  return (
    <div className="rounded-xl2 bg-white p-10 shadow-sm">
      <h1 className="font-display text-2xl font-bold text-navy-950">
        Обзор
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        Здесь появится сводка по вашим ботам, когда будет к чему её
        показывать. Начните с создания первого бота.
      </p>
      <Link
        to="/create/describe"
        className="mt-6 inline-block rounded-lg bg-navy-950 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
      >
        Создать бота
      </Link>
    </div>
  );
}
