const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }

    .title-group {
      min-width: 180px;
    }

    .eyebrow {
      display: block;
      margin-bottom: 4px;
      color: #5f6b7a;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .title {
      margin: 0;
      font-size: 1.4rem;
      line-height: 1.2;
      color: #142033;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }

    .tool-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 0 12px;
      border: 1px solid #d7e0ea;
      border-radius: 8px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }

    .tool-label {
      color: #5f6b7a;
      font-size: 0.84rem;
      font-weight: 600;
      white-space: nowrap;
    }

    input[type="color"] {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
    }

    input[type="color"]:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    input[type="color"]::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    input[type="color"]::-webkit-color-swatch {
      border: 1px solid rgba(95, 107, 122, 0.24);
      border-radius: 8px;
    }

    button {
      border: 1px solid #cfd8e3;
      background: linear-gradient(180deg, #ffffff 0%, #f6f8fb 100%);
      color: #152132;
      border-radius: 8px;
      min-height: 40px;
      padding: 0 14px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition:
        transform 120ms ease,
        box-shadow 120ms ease,
        border-color 120ms ease,
        background 120ms ease;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: #9fb4ce;
      box-shadow: 0 8px 18px rgba(56, 88, 138, 0.12);
      background: linear-gradient(180deg, #ffffff 0%, #eef4ff 100%);
    }

    button:focus-visible {
      outline: 3px solid rgba(59, 130, 246, 0.25);
      outline-offset: 2px;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
    }

    .primary {
      border-color: #2563eb;
      background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
      color: #ffffff;
    }

    .primary:hover:not(:disabled) {
      border-color: #1d4ed8;
      background: linear-gradient(180deg, #4b8df6 0%, #1d4ed8 100%);
    }

    .danger {
      color: #8a1c1c;
    }

    @media (max-width: 720px) {
      .toolbar,
      .actions {
        align-items: stretch;
      }

      .actions {
        width: 100%;
      }

      button {
        flex: 1 1 140px;
      }
    }
  </style>
  <section class="toolbar">
    <div class="title-group">
      <span class="eyebrow">Редактор</span>
      <h1 class="title">Редактор полигонов</h1>
    </div>
    <div class="actions" role="toolbar" aria-label="Действия с полигонами">
      <label class="tool-group" aria-label="Цвет выбранного полигона">
        <span class="tool-label">Цвет</span>
        <input type="color" value="#4f46e5" />
      </label>
      <button class="primary" type="button" data-command="generate">◇ Сгенерировать полигон</button>
      <button type="button" data-command="delete-selected">⌫ Удалить выбранный</button>
      <button class="danger" type="button" data-command="delete-all">✕ Удалить все</button>
      <button type="button" data-command="export-scene">⇩ Экспорт JSON</button>
      <button type="button" data-command="import-scene">⇧ Импорт JSON</button>
      <button type="button" data-command="undo">↶ Отменить</button>
      <button type="button" data-command="redo">↷ Повторить</button>
      <input type="file" accept="application/json,.json" hidden />
    </div>
  </section>
`;

const COMMAND_TO_PROPERTY = {
  "delete-all": "canDeleteAll",
  undo: "canUndo",
  redo: "canRedo"
};

export class PolygonToolbar extends HTMLElement {
  constructor() {
    super();

    this._canDeleteAll = false;
    this._canUndo = false;
    this._canRedo = false;
    this._canChangeColor = false;
    this._selectedPolygonColor = "#4f46e5";

    this._handleClick = this._handleClick.bind(this);
    this._handleColorInput = this._handleColorInput.bind(this);
    this._handleColorCommit = this._handleColorCommit.bind(this);
    this._handleFileChange = this._handleFileChange.bind(this);
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this.shadowRoot.addEventListener("click", this._handleClick);
    this.shadowRoot.addEventListener("input", this._handleColorInput);
    this.shadowRoot.addEventListener("change", this._handleColorCommit);
    this._render();
  }

  disconnectedCallback() {
    if (this.shadowRoot) {
      this.shadowRoot.removeEventListener("click", this._handleClick);
      this.shadowRoot.removeEventListener("input", this._handleColorInput);
      this.shadowRoot.removeEventListener("change", this._handleColorCommit);
    }
  }

  get canDeleteAll() {
    return this._canDeleteAll;
  }

  set canDeleteAll(value) {
    this._canDeleteAll = Boolean(value);
    this._render();
  }

  get canUndo() {
    return this._canUndo;
  }

  set canUndo(value) {
    this._canUndo = Boolean(value);
    this._render();
  }

  get canRedo() {
    return this._canRedo;
  }

  set canRedo(value) {
    this._canRedo = Boolean(value);
    this._render();
  }

  get canChangeColor() {
    return this._canChangeColor;
  }

  set canChangeColor(value) {
    this._canChangeColor = Boolean(value);
    this._render();
  }

  get selectedPolygonColor() {
    return this._selectedPolygonColor;
  }

  set selectedPolygonColor(value) {
    this._selectedPolygonColor =
      typeof value === "string" && value.trim().length > 0 ? value : "#4f46e5";
    this._render();
  }

  _handleClick(event) {
    const button = event.target.closest("button[data-command]");

    if (!button || button.disabled) {
      return;
    }

    if (button.dataset.command === "import-scene") {
      const input = this.shadowRoot.querySelector('input[type="file"]');

      if (input) {
        input.value = "";
        input.addEventListener("change", this._handleFileChange, { once: true });
        input.click();
      }

      return;
    }

    this.dispatchEvent(
      new CustomEvent("toolbar-command", {
        bubbles: true,
        composed: true,
        detail: {
          command: button.dataset.command
        }
      })
    );
  }

  _handleColorInput(event) {
    const input = event.target.closest('input[type="color"]');

    if (!input || input.disabled) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("toolbar-command", {
        bubbles: true,
        composed: true,
        detail: {
          command: "preview-selected-color",
          color: input.value
        }
      })
    );
  }

  _handleColorCommit(event) {
    const input = event.target.closest('input[type="color"]');

    if (!input || input.disabled) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("toolbar-command", {
        bubbles: true,
        composed: true,
        detail: {
          command: "change-selected-color",
          color: input.value
        }
      })
    );
  }

  async _handleFileChange(event) {
    const [file] = Array.from(event.target.files ?? []);

    if (!file) {
      return;
    }

    try {
      const json = typeof file.text === "function" ? await file.text() : await this._readFile(file);

      this.dispatchEvent(
        new CustomEvent("toolbar-command", {
          bubbles: true,
          composed: true,
          detail: {
            command: "import-scene",
            json
          }
        })
      );
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent("toolbar-command", {
          bubbles: true,
          composed: true,
          detail: {
            command: "import-scene",
            json: ""
          }
        })
      );
    }
  }

  _readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener("load", () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
      });
      reader.addEventListener("error", () => {
        reject(reader.error ?? new Error("Не удалось прочитать файл."));
      });
      reader.readAsText(file);
    });
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }

    for (const [command, propertyName] of Object.entries(COMMAND_TO_PROPERTY)) {
      const button = this.shadowRoot.querySelector(`[data-command="${command}"]`);

      if (button) {
        button.disabled = !this[propertyName];
      }
    }

    const colorInput = this.shadowRoot.querySelector('input[type="color"]');

    if (colorInput) {
      colorInput.disabled = !this._canChangeColor;
      colorInput.value = this._selectedPolygonColor;
    }
  }
}

export function registerPolygonToolbar() {
  if (!customElements.get("polygon-toolbar")) {
    customElements.define("polygon-toolbar", PolygonToolbar);
  }
}
