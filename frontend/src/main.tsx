import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { completeGoogle } from './accounts/google';

void completeGoogle().then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
));
