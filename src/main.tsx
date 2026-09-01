import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Widget from "./Widget";
import { ErrorBoundary } from "./components/ErrorBoundary";

const params = new URLSearchParams(window.location.search);
const isWidget = params.get("widget") === "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{isWidget ? <Widget /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
