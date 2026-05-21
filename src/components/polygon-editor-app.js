import {
  addPolygon,
  createEditorState,
  removeAllPolygons,
  removeSelectedPolygon,
  selectPolygon,
  updatePolygonColor,
  updatePolygonPoints
} from "../core/editor-state";
import { createHistoryManager } from "../core/history-manager";
import { generateRandomPolygon } from "../core/polygon-generator";
import { parseSceneJson, serializeScene } from "../core/scene-io";
import { registerAppToast } from "./app-toast";
import { registerPolygonCanvas } from "./polygon-canvas";
import { registerPolygonInfoPanel } from "./polygon-info-panel";
import { registerPolygonToolbar } from "./polygon-toolbar";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const NEW_POLYGON_ANIMATION_MS = 800;

const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
      min-height: 100vh;
      padding: 24px;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.95), rgba(238, 243, 248, 0) 38%),
        linear-gradient(180deg, #eef3f8 0%, #e6edf6 100%);
    }

    .shell {
      display: grid;
      gap: 18px;
      min-height: calc(100vh - 48px);
      max-width: 1280px;
      margin: 0 auto;
    }

    .surface {
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid rgba(209, 219, 231, 0.9);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
      backdrop-filter: blur(10px);
    }

    .toolbar-surface {
      padding: 18px 20px;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 18px;
      align-items: start;
    }

    .canvas-surface {
      position: relative;
      padding: 18px;
      min-height: 420px;
      overflow: hidden;
    }

    .canvas-frame {
      width: min(100%, ${CANVAS_WIDTH}px);
      margin: 0 auto;
      border-radius: 8px;
      overflow: hidden;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.98));
      border: 1px solid #d8e1eb;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
    }

    polygon-canvas {
      display: block;
    }

    .panel-column {
      display: grid;
      gap: 18px;
      align-self: stretch;
    }

    .toast-layer {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 20;
    }

    @media (max-width: 980px) {
      .workspace {
        grid-template-columns: 1fr;
      }

      .panel-column {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      :host {
        padding: 16px;
      }

      .shell {
        min-height: calc(100vh - 32px);
      }

      .toolbar-surface,
      .canvas-surface {
        padding: 14px;
      }

      .toast-layer {
        right: 16px;
        left: 16px;
        bottom: 16px;
      }
    }
  </style>
  <section class="shell">
    <header class="surface toolbar-surface">
      <polygon-toolbar></polygon-toolbar>
    </header>
    <section class="workspace">
      <main class="surface canvas-surface" aria-label="Рабочая область редактора полигонов">
        <div class="canvas-frame">
          <polygon-canvas></polygon-canvas>
        </div>
      </main>
      <aside class="panel-column">
        <polygon-info-panel></polygon-info-panel>
      </aside>
    </section>
    <div class="toast-layer">
      <app-toast></app-toast>
    </div>
  </section>
`;

function getSelectedPolygon(state) {
  return state.polygons.find((polygon) => polygon.id === state.selectedPolygonId) ?? null;
}

function hasPrimaryModifier(event) {
  return (event.ctrlKey || event.metaKey) && !(event.ctrlKey && event.metaKey);
}

function isEditableTarget(target) {
  if (!(target instanceof Node)) {
    return false;
  }

  const element = target instanceof Element ? target : target.parentElement;

  if (!element) {
    return false;
  }

  if (element.closest("input, textarea, select, [contenteditable]")) {
    return true;
  }

  return element.isContentEditable;
}

function isEditableNodeInPath(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.matches("input, textarea, select, [contenteditable]")) {
    return true;
  }

  return node.isContentEditable;
}

function shouldHandleGlobalShortcut(event, app) {
  if (!app.isConnected || event.defaultPrevented || event.repeat) {
    return false;
  }

  if (isEditableTarget(event.target)) {
    return false;
  }

  if (typeof event.composedPath === "function" && event.composedPath().some(isEditableNodeInPath)) {
    return false;
  }

  if (PolygonEditorApp.activeInstance === app) {
    return true;
  }

  const connectedApps = Array.from(document.querySelectorAll("polygon-editor-app"));

  return connectedApps.length === 1 && connectedApps[0] === app;
}

function isRedoShortcut(event) {
  if (!hasPrimaryModifier(event)) {
    return false;
  }

  const key = event.key.toLowerCase();

  return key === "y" || (key === "z" && event.shiftKey);
}

function isUndoShortcut(event) {
  return hasPrimaryModifier(event) && !event.shiftKey && event.key.toLowerCase() === "z";
}

export class PolygonEditorApp extends HTMLElement {
  static activeInstance = null;

  constructor() {
    super();

    const initialState = createEditorState();

    this._state = initialState;
    this._history = createHistoryManager(initialState);
    this._selectedPolygonId = initialState.selectedPolygonId;
    this._appearanceTimer = null;
    this._previewColor = null;

    this._handleToolbarCommand = this._handleToolbarCommand.bind(this);
    this._handlePolygonSelect = this._handlePolygonSelect.bind(this);
    this._handlePolygonDragEnd = this._handlePolygonDragEnd.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleActivate = this._handleActivate.bind(this);
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      registerPolygonToolbar();
      registerPolygonInfoPanel();
      registerAppToast();
      registerPolygonCanvas();

      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._toolbar = this.shadowRoot.querySelector("polygon-toolbar");
    this._canvas = this.shadowRoot.querySelector("polygon-canvas");
    this._infoPanel = this.shadowRoot.querySelector("polygon-info-panel");
    this._toast = this.shadowRoot.querySelector("app-toast");

    this._toolbar.addEventListener("toolbar-command", this._handleToolbarCommand);
    this._canvas.addEventListener("polygon-select", this._handlePolygonSelect);
    this._canvas.addEventListener("polygon-drag-end", this._handlePolygonDragEnd);
    this.shadowRoot.addEventListener("pointerdown", this._handleActivate);
    this.shadowRoot.addEventListener("focusin", this._handleActivate);
    window.addEventListener("keydown", this._handleKeyDown);

    PolygonEditorApp.activeInstance = this;
    this._syncView();
  }

  disconnectedCallback() {
    if (this._toolbar) {
      this._toolbar.removeEventListener("toolbar-command", this._handleToolbarCommand);
    }

    if (this._canvas) {
      this._canvas.removeEventListener("polygon-select", this._handlePolygonSelect);
      this._canvas.removeEventListener("polygon-drag-end", this._handlePolygonDragEnd);
    }

    if (this.shadowRoot) {
      this.shadowRoot.removeEventListener("pointerdown", this._handleActivate);
      this.shadowRoot.removeEventListener("focusin", this._handleActivate);
    }

    if (PolygonEditorApp.activeInstance === this) {
      PolygonEditorApp.activeInstance = null;
    }

    window.removeEventListener("keydown", this._handleKeyDown);
    this._clearAppearanceTimer();
  }

  _handleToolbarCommand(event) {
    const { command, color, json } = event.detail;

    switch (command) {
      case "generate":
        this._generatePolygon();
        break;
      case "preview-selected-color":
        this._previewSelectedPolygonColor(color);
        break;
      case "change-selected-color":
        this._changeSelectedPolygonColor(color);
        break;
      case "delete-selected":
        this._deleteSelectedPolygon();
        break;
      case "delete-all":
        this._deleteAllPolygons();
        break;
      case "export-scene":
        this.exportScene();
        break;
      case "import-scene":
        this.importScene(json);
        break;
      case "undo":
        this._undo();
        break;
      case "redo":
        this._redo();
        break;
      default:
        break;
    }
  }

  _handlePolygonSelect(event) {
    this._previewColor = null;
    const nextState = selectPolygon(this._getViewState(), event.detail.polygonId ?? null);

    this._applyState(nextState);
  }

  _handlePolygonDragEnd(event) {
    const { polygonId, points } = event.detail;
    const nextState = updatePolygonPoints(this._getViewState(), polygonId, points);

    this._commitState(nextState);
  }

  _handleKeyDown(event) {
    if (!shouldHandleGlobalShortcut(event, this)) {
      return;
    }

    if (isUndoShortcut(event)) {
      event.preventDefault();
      this._undo();
      return;
    }

    if (isRedoShortcut(event)) {
      event.preventDefault();
      this._redo();
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      this._deleteSelectedPolygon();
    }
  }

  _handleActivate() {
    PolygonEditorApp.activeInstance = this;
  }

  _generatePolygon() {
    const currentState = this._getViewState();
    const polygon = generateRandomPolygon({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      existingPolygons: currentState.polygons
    });
    const nextState = addPolygon(currentState, polygon);

    this._commitState(nextState);
    this._playAppearanceAnimation(polygon.id);
  }

  _previewSelectedPolygonColor(color) {
    const currentState = this._getViewState();

    if (currentState.selectedPolygonId === null || typeof color !== "string") {
      return;
    }

    this._previewColor = color;
    this._syncView();
  }

  _changeSelectedPolygonColor(color) {
    const currentState = this._getViewState();

    if (currentState.selectedPolygonId === null || typeof color !== "string") {
      return;
    }

    const nextState = updatePolygonColor(currentState, currentState.selectedPolygonId, color);

    this._previewColor = null;
    this._commitState(nextState);
  }

  _deleteSelectedPolygon() {
    const currentState = this._getViewState();

    if (currentState.selectedPolygonId === null) {
      this._toast.show("Полигон не выбран.");
      return;
    }

    const nextState = removeSelectedPolygon(currentState);

    this._commitState(nextState);
  }

  _deleteAllPolygons() {
    this._previewColor = null;
    const nextState = removeAllPolygons(this._getViewState());

    this._commitState(nextState);
  }

  _undo() {
    if (!this._history.canUndo()) {
      return;
    }

    this._state = this._history.undo();
    this._selectedPolygonId = this._state.selectedPolygonId;
    this._previewColor = null;
    this._canvas.animatedPolygonId = null;
    this._syncView();
  }

  _redo() {
    if (!this._history.canRedo()) {
      return;
    }

    this._state = this._history.redo();
    this._selectedPolygonId = this._state.selectedPolygonId;
    this._previewColor = null;
    this._canvas.animatedPolygonId = null;
    this._syncView();
  }

  _commitState(nextState) {
    const currentState = this._getViewState();

    if (nextState === currentState) {
      return;
    }

    this._state = this._history.commit(nextState);
    this._selectedPolygonId = this._state.selectedPolygonId;
    this._previewColor = null;
    this._syncView();
  }

  _applyState(nextState) {
    const currentState = this._getViewState();

    if (nextState === currentState) {
      return;
    }

    this._state = nextState;
    this._selectedPolygonId = nextState.selectedPolygonId;
    this._syncView();
  }

  _getViewState() {
    return this._state;
  }

  _buildViewState() {
    const historyState = this._history.getCurrentState();
    const hasSelectedPolygon = historyState.polygons.some(
      (polygon) => polygon.id === this._selectedPolygonId
    );
    const selectedPolygonId = hasSelectedPolygon ? this._selectedPolygonId : null;
    const polygons =
      selectedPolygonId !== null && this._previewColor
        ? historyState.polygons.map((polygon) =>
            polygon.id === selectedPolygonId
              ? {
                  ...polygon,
                  color: this._previewColor
                }
              : polygon
          )
        : historyState.polygons;

    return {
      polygons,
      selectedPolygonId
    };
  }

  _playAppearanceAnimation(polygonId) {
    this._clearAppearanceTimer();
    this._canvas.animatedPolygonId = polygonId;
    this._appearanceTimer = window.setTimeout(() => {
      if (this._canvas) {
        this._canvas.animatedPolygonId = null;
      }

      this._appearanceTimer = null;
    }, NEW_POLYGON_ANIMATION_MS);
  }

  _clearAppearanceTimer() {
    if (this._appearanceTimer !== null) {
      window.clearTimeout(this._appearanceTimer);
      this._appearanceTimer = null;
    }
  }

  _syncView() {
    if (!this.shadowRoot) {
      return;
    }

    this._state = this._buildViewState();

    const selectedPolygon = getSelectedPolygon(this._state);

    this._canvas.canvasWidth = CANVAS_WIDTH;
    this._canvas.canvasHeight = CANVAS_HEIGHT;
    this._canvas.polygons = this._state.polygons;
    this._canvas.selectedPolygonId = this._state.selectedPolygonId;

    this._infoPanel.polygonCount = this._state.polygons.length;
    this._infoPanel.selectedPolygonName = selectedPolygon ? selectedPolygon.name : null;

    this._toolbar.canDeleteAll = this._state.polygons.length > 0;
    this._toolbar.canUndo = this._history.canUndo();
    this._toolbar.canRedo = this._history.canRedo();
    this._toolbar.canChangeColor = selectedPolygon !== null;
    this._toolbar.selectedPolygonColor = selectedPolygon ? selectedPolygon.color : "#4f46e5";
  }

  exportScene() {
    const filename = "scene.json";
    const json = serializeScene(this._getViewState());

    this.dispatchEvent(
      new CustomEvent("scene-export", {
        bubbles: true,
        composed: true,
        detail: {
          filename,
          json
        }
      })
    );

    if (
      typeof Blob !== "function" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return json;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    return json;
  }

  importScene(json) {
    try {
      const nextState = parseSceneJson(json);

      this._previewColor = null;
      this._canvas.animatedPolygonId = null;
      this._commitState(nextState);
      return true;
    } catch (error) {
      this._toast.show("Импортировать сцену не удалось.");
      return false;
    }
  }
}

export function registerPolygonEditorApp() {
  if (!customElements.get("polygon-editor-app")) {
    customElements.define("polygon-editor-app", PolygonEditorApp);
  }
}
