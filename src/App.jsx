import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import Overview from "./pages/Overview.jsx";
import CreateBotDescribe from "./pages/CreateBotDescribe.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route element={<AppLayout />}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/create" element={<Navigate to="/create/describe" replace />} />
        <Route path="/create/describe" element={<CreateBotDescribe />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
