import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { registrujServiceWorker } from "./lib/push";
import { javljajNeuhvaceneGreske } from "./lib/greske";

registrujServiceWorker();
javljajNeuhvaceneGreske();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);