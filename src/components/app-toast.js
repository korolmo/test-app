const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
      pointer-events: none;
    }

    .toast {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      max-width: min(100%, 360px);
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(22, 32, 42, 0.94);
      color: #ffffff;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.26);
      opacity: 0;
      transform: translateY(10px);
      transition:
        opacity 180ms ease,
        transform 180ms ease;
      overflow-wrap: anywhere;
    }

    .toast[data-open="true"] {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
  <div class="toast" role="status" aria-live="polite" data-open="false"></div>
`;

const AUTO_HIDE_MS = 2200;

export class AppToast extends HTMLElement {
  constructor() {
    super();

    this._message = "";
    this._open = false;
    this._hideTimer = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._render();
  }

  disconnectedCallback() {
    this._clearHideTimer();
  }

  get message() {
    return this._message;
  }

  set message(value) {
    this._message = typeof value === "string" ? value : "";
    this._render();
  }

  get open() {
    return this._open;
  }

  set open(value) {
    this._open = Boolean(value);
    this._render();

    if (this._open) {
      this._scheduleHide();
    } else {
      this._clearHideTimer();
    }
  }

  show(message) {
    this.message = message;
    this.open = true;
  }

  hide() {
    this.open = false;
  }

  _scheduleHide() {
    this._clearHideTimer();
    this._hideTimer = window.setTimeout(() => {
      this.hide();
    }, AUTO_HIDE_MS);
  }

  _clearHideTimer() {
    if (this._hideTimer !== null) {
      window.clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }

    const toast = this.shadowRoot.querySelector(".toast");

    toast.textContent = this._message;
    toast.dataset.open = this._open ? "true" : "false";
    toast.hidden = !this._message;
  }
}

export function registerAppToast() {
  if (!customElements.get("app-toast")) {
    customElements.define("app-toast", AppToast);
  }
}
