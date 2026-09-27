import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";

export default function App() {
  return (
    <Routes>
      {/* Публичный лендинг — своя шапка, без сайдбара */}
      <Route path="/" element={<Landing />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
