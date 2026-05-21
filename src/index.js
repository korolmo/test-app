import "./styles.css";
import { registerPolygonEditorApp } from "./components/polygon-editor-app";

export function bootstrapApp(root = document) {
  registerPolygonEditorApp();

  const appRoot = root.querySelector("#app");

  if (appRoot && !appRoot.querySelector("polygon-editor-app")) {
    appRoot.appendChild(root.createElement("polygon-editor-app"));
  }
}

bootstrapApp();
