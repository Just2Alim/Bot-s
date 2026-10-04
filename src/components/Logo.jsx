import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-lg bg-navy-950" />
      <span className="font-display text-lg font-bold text-navy-950">
       <Link to="/">Bot(s) KZ</Link>
      </span>
    </div>
  );
}
