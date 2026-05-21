const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
    }

    .panel {
      display: grid;
      gap: 12px;
      padding: 18px;
      border: 1px solid #d7e0ea;
      border-radius: 8px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
    }

    .heading {
      margin: 0;
      font-size: 1rem;
      color: #142033;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .item {
      min-width: 0;
      padding: 12px;
      border-radius: 8px;
      background: #eef4fb;
    }

    .label {
      display: block;
      margin-bottom: 6px;
      color: #617083;
      font-size: 0.84rem;
      font-weight: 600;
    }

    .value {
      display: block;
      color: #152132;
      font-size: 1rem;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    @media (max-width: 720px) {
      .stats {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <aside class="panel" aria-label="Информация о полигонах">
    <h2 class="heading">Состояние</h2>
    <div class="stats">
      <div class="item">
        <span class="label">Количество полигонов</span>
        <span class="value" data-field="count">0</span>
      </div>
      <div class="item">
        <span class="label">Выбранный полигон</span>
        <span class="value" data-field="selected">Ничего не выбрано</span>
      </div>
    </div>
  </aside>
`;

const EMPTY_SELECTION_LABEL = "Ничего не выбрано";

export class PolygonInfoPanel extends HTMLElement {
  constructor() {
    super();

    this._polygonCount = 0;
    this._selectedPolygonName = EMPTY_SELECTION_LABEL;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._render();
  }

  get polygonCount() {
    return this._polygonCount;
  }

  set polygonCount(value) {
    this._polygonCount = Number.isFinite(value) && value >= 0 ? value : 0;
    this._render();
  }

  get selectedPolygonName() {
    return this._selectedPolygonName;
  }

  set selectedPolygonName(value) {
    this._selectedPolygonName =
      typeof value === "string" && value.trim().length > 0 ? value : EMPTY_SELECTION_LABEL;
    this._render();
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }

    this.shadowRoot.querySelector('[data-field="count"]').textContent = String(this._polygonCount);
    this.shadowRoot.querySelector('[data-field="selected"]').textContent =
      this._selectedPolygonName;
  }
}

export function registerPolygonInfoPanel() {
  if (!customElements.get("polygon-info-panel")) {
    customElements.define("polygon-info-panel", PolygonInfoPanel);
  }
}
