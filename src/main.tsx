import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Widget from "./Widget";

const params = new URLSearchParams(window.location.search);
const isWidget = params.get("widget") === "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isWidget ? <Widget /> : <App />}</React.StrictMode>,
);
