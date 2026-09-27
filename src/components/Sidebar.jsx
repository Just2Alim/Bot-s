import { NavLink, useLocation } from "react-router-dom";
import Logo from "./Logo.jsx";

const links = [
  { to: "/overview", label: "Обзор" },
  { to: "/create/describe", label: "Создать бота", matchPrefix: "/create" },
  { to: "/bots", label: "Мои боты" },
  { to: "/settings", label: "Настройки" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-white px-4 py-6">
      <div className="px-2">
        <Logo />
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => {
              const active =
                isActive || (link.matchPrefix && location.pathname.startsWith(link.matchPrefix));
              return [
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-500/10 text-accent-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-navy-950",
              ].join(" ");
            }}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
