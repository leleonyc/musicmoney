import { createRoot } from "react-dom/client";
import "./index.css";
import "./storage-polyfill.js";
import MusiCash from "./App.jsx";

createRoot(document.getElementById("root")).render(<MusiCash />);
