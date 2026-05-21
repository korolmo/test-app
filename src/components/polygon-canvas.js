import {
  clampTranslationToBounds,
  isPointInPolygon,
  polygonsOverlap,
  translatePoints
} from "../utils/geometry";

const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const NORMAL_OUTLINE_WIDTH = 1.5;
const SELECTED_OUTLINE_WIDTH = 3;
const DRAG_SEARCH_STEPS = 18;
const APPEAR_ANIMATION_DURATION = 800;

const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
    }

    canvas {
      display: block;
      width: 100%;
      height: auto;
      background: #ffffff;
    }
  </style>
  <canvas part="canvas"></canvas>
`;

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function normalizeHexColor(color) {
  if (typeof color !== "string") {
    return null;
  }

  const trimmedColor = color.trim();
  const shortHexMatch = /^#([\da-f]{3})$/i.exec(trimmedColor);

  if (shortHexMatch) {
    return shortHexMatch[1]
      .split("")
      .map((character) => character + character)
      .join("");
  }

  const fullHexMatch = /^#([\da-f]{6})$/i.exec(trimmedColor);

  if (fullHexMatch) {
    return fullHexMatch[1];
  }

  return null;
}

function getOutlineColor(fillColor, isSelected) {
  const normalizedHex = normalizeHexColor(fillColor);

  if (!normalizedHex) {
    return isSelected ? "#1d4ed8" : "#111827";
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  if (isSelected) {
    if (luminance < 0.5) {
      return `rgb(${clampByte(red + 110)}, ${clampByte(green + 110)}, ${clampByte(blue + 110)})`;
    }

    return `rgb(${clampByte(red - 110)}, ${clampByte(green - 110)}, ${clampByte(blue - 110)})`;
  }

  return luminance > 0.6 ? "#111827" : "#f8fafc";
}

function getEventPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function findTopmostPolygon(polygons, point) {
  for (let index = polygons.length - 1; index >= 0; index -= 1) {
    if (isPointInPolygon(point, polygons[index].points)) {
      return polygons[index];
    }
  }

  return null;
}

function resolveDragTranslation(points, dx, dy, canvasWidth, canvasHeight, otherPolygons) {
  const clampedTranslation = clampTranslationToBounds(points, dx, dy, canvasWidth, canvasHeight);
  const targetPoints = translatePoints(points, clampedTranslation.dx, clampedTranslation.dy);

  if (!otherPolygons.some((polygon) => polygonsOverlap(targetPoints, polygon.points))) {
    return clampedTranslation;
  }

  let bestTranslation = { dx: 0, dy: 0 };
  let minimum = 0;
  let maximum = 1;

  for (let step = 0; step < DRAG_SEARCH_STEPS; step += 1) {
    const ratio = (minimum + maximum) / 2;
    const candidateTranslation = {
      dx: clampedTranslation.dx * ratio,
      dy: clampedTranslation.dy * ratio
    };
    const candidatePoints = translatePoints(
      points,
      candidateTranslation.dx,
      candidateTranslation.dy
    );
    const overlaps = otherPolygons.some((polygon) =>
      polygonsOverlap(candidatePoints, polygon.points)
    );

    if (overlaps) {
      maximum = ratio;
    } else {
      minimum = ratio;
      bestTranslation = candidateTranslation;
    }
  }

  return bestTranslation;
}

export class PolygonCanvas extends HTMLElement {
  constructor() {
    super();

    this._polygons = [];
    this._selectedPolygonId = null;
    this._canvasWidth = DEFAULT_CANVAS_WIDTH;
    this._canvasHeight = DEFAULT_CANVAS_HEIGHT;
    this._dragState = null;
    this._suppressClick = false;
    this._isListening = false;
    this._animatedPolygonId = null;
    this._animationStartTime = 0;
    this._animationFrameId = null;

    this._handleClick = this._handleClick.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._animateAppearance = this._animateAppearance.bind(this);
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    this._canvas = this.shadowRoot.querySelector("canvas");
    this._context = this._canvas.getContext("2d");
    this._attachCanvasListeners();
    this._render();
  }

  disconnectedCallback() {
    this._detachCanvasListeners();
    this._removeDragListeners();
    this._stopAppearanceAnimation();
  }

  get polygons() {
    return this._polygons;
  }

  set polygons(value) {
    this._polygons = Array.isArray(value) ? value : [];
    this._render();
  }

  get selectedPolygonId() {
    return this._selectedPolygonId;
  }

  set selectedPolygonId(value) {
    this._selectedPolygonId = typeof value === "string" ? value : null;
    this._render();
  }

  get canvasWidth() {
    return this._canvasWidth;
  }

  set canvasWidth(value) {
    this._canvasWidth = Number.isFinite(value) && value >= 0 ? value : DEFAULT_CANVAS_WIDTH;
    this._render();
  }

  get canvasHeight() {
    return this._canvasHeight;
  }

  set canvasHeight(value) {
    this._canvasHeight = Number.isFinite(value) && value >= 0 ? value : DEFAULT_CANVAS_HEIGHT;
    this._render();
  }

  get animatedPolygonId() {
    return this._animatedPolygonId;
  }

  set animatedPolygonId(value) {
    this._animatedPolygonId = typeof value === "string" ? value : null;

    if (this._animatedPolygonId) {
      this._animationStartTime = performance.now();
      this._startAppearanceAnimation();
    } else {
      this._stopAppearanceAnimation();
    }

    this._render();
  }

  _dispatch(name, detail) {
    this.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
        detail
      })
    );
  }

  _getRenderedPolygons() {
    if (!this._dragState) {
      return this._polygons;
    }

    return this._polygons.map((polygon) =>
      polygon.id === this._dragState.polygonId
        ? {
            ...polygon,
            points: this._dragState.currentPoints
          }
        : polygon
    );
  }

  _render() {
    if (!this._canvas || !this._context) {
      return;
    }

    this._canvas.width = this._canvasWidth;
    this._canvas.height = this._canvasHeight;
    this._context.clearRect(0, 0, this._canvasWidth, this._canvasHeight);

    for (const polygon of this._getRenderedPolygons()) {
      this._drawPolygon(polygon, polygon.id === this._selectedPolygonId);
    }
  }

  _drawPolygon(polygon, isSelected) {
    const context = this._context;
    const [firstPoint, ...remainingPoints] = polygon.points;
    const appearanceProgress = this._getAppearanceProgress(polygon.id);

    context.beginPath();
    context.moveTo(firstPoint.x, firstPoint.y);

    for (const point of remainingPoints) {
      context.lineTo(point.x, point.y);
    }

    context.closePath();
    context.fillStyle = polygon.color;
    context.fill();
    context.strokeStyle = getOutlineColor(polygon.color, isSelected);
    context.lineWidth = isSelected ? SELECTED_OUTLINE_WIDTH : NORMAL_OUTLINE_WIDTH;
    context.stroke();

    if (appearanceProgress !== null) {
      const pulse = 1 - appearanceProgress;
      const haloAlpha = Math.max(0, 0.28 * pulse);

      context.strokeStyle = `rgba(59, 130, 246, ${haloAlpha.toFixed(3)})`;
      context.lineWidth = 6 + pulse * 10;
      context.stroke();
    }
  }

  _handleClick(event) {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }

    const point = getEventPoint(event, this._canvas);
    const polygon = findTopmostPolygon(this._getRenderedPolygons(), point);

    this._dispatch("polygon-select", {
      polygonId: polygon ? polygon.id : null
    });
  }

  _handleMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    this._suppressClick = false;

    const point = getEventPoint(event, this._canvas);
    const polygon = this._polygons.find(
      (candidate) =>
        candidate.id === this._selectedPolygonId && isPointInPolygon(point, candidate.points)
    );

    if (!polygon) {
      return;
    }

    this._dragState = {
      polygonId: polygon.id,
      startCursor: point,
      startPoints: polygon.points,
      currentPoints: polygon.points,
      didMove: false
    };

    window.addEventListener("mousemove", this._handleMouseMove);
    window.addEventListener("mouseup", this._handleMouseUp);
  }

  _handleMouseMove(event) {
    if (!this._dragState) {
      return;
    }

    const point = getEventPoint(event, this._canvas);
    const requestedDx = point.x - this._dragState.startCursor.x;
    const requestedDy = point.y - this._dragState.startCursor.y;
    const otherPolygons = this._polygons.filter(
      (polygon) => polygon.id !== this._dragState.polygonId
    );
    const translation = resolveDragTranslation(
      this._dragState.startPoints,
      requestedDx,
      requestedDy,
      this._canvasWidth,
      this._canvasHeight,
      otherPolygons
    );
    const nextPoints = translatePoints(
      this._dragState.startPoints,
      translation.dx,
      translation.dy
    );

    this._dragState.currentPoints = nextPoints;
    this._dragState.didMove =
      this._dragState.didMove || Math.abs(translation.dx) > 0 || Math.abs(translation.dy) > 0;
    this._render();
  }

  _handleMouseUp() {
    if (!this._dragState) {
      return;
    }

    const completedDrag = this._dragState;

    this._dragState = null;
    this._removeDragListeners();
    this._render();

    if (completedDrag.didMove) {
      this._suppressClick = true;
      this._dispatch("polygon-drag-end", {
        polygonId: completedDrag.polygonId,
        points: completedDrag.currentPoints
      });
    }
  }

  _removeDragListeners() {
    window.removeEventListener("mousemove", this._handleMouseMove);
    window.removeEventListener("mouseup", this._handleMouseUp);
  }

  _attachCanvasListeners() {
    if (!this._canvas || this._isListening) {
      return;
    }

    this._canvas.addEventListener("click", this._handleClick);
    this._canvas.addEventListener("mousedown", this._handleMouseDown);
    this._isListening = true;
  }

  _detachCanvasListeners() {
    if (!this._canvas || !this._isListening) {
      return;
    }

    this._canvas.removeEventListener("click", this._handleClick);
    this._canvas.removeEventListener("mousedown", this._handleMouseDown);
    this._isListening = false;
  }

  _getAppearanceProgress(polygonId) {
    if (polygonId !== this._animatedPolygonId) {
      return null;
    }

    const elapsed = performance.now() - this._animationStartTime;
    const progress = elapsed / APPEAR_ANIMATION_DURATION;

    return Math.max(0, Math.min(1, progress));
  }

  _startAppearanceAnimation() {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
    }

    this._animationFrameId = requestAnimationFrame(this._animateAppearance);
  }

  _stopAppearanceAnimation() {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  _animateAppearance() {
    if (!this._animatedPolygonId) {
      this._animationFrameId = null;
      return;
    }

    if (performance.now() - this._animationStartTime >= APPEAR_ANIMATION_DURATION) {
      this._animationFrameId = null;
      this._render();
      return;
    }

    this._render();
    this._animationFrameId = requestAnimationFrame(this._animateAppearance);
  }
}

export function registerPolygonCanvas() {
  if (!customElements.get("polygon-canvas")) {
    customElements.define("polygon-canvas", PolygonCanvas);
  }
}
