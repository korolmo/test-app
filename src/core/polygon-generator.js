import { getBoundingBox, polygonsOverlap, translatePoints } from "../utils/geometry";

const MIN_VERTEX_COUNT = 3;
const MAX_VERTEX_COUNT = 7;
const MAX_GENERATION_ATTEMPTS = 200;
const MIN_SIZE_FACTOR = 0.08;
const MAX_SIZE_FACTOR = 0.36;

function validateOptions(options) {
  if (options === null || typeof options !== "object") {
    throw new Error("generateRandomPolygon requires an options object.");
  }

  const { width, height, existingPolygons, random, nextId } = options;

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("generateRandomPolygon requires finite positive canvas width and height.");
  }

  if (!Array.isArray(existingPolygons)) {
    throw new Error("generateRandomPolygon requires existingPolygons to be an array.");
  }

  if (random !== undefined && typeof random !== "function") {
    throw new Error("generateRandomPolygon requires random to be a function when provided.");
  }

  if (nextId !== undefined && typeof nextId !== "function") {
    throw new Error("generateRandomPolygon requires nextId to be a function when provided.");
  }
}

function getRandom(random) {
  const value = random();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("generateRandomPolygon random() must return a number in the range [0, 1).");
  }

  return value;
}

function getVertexCount(random) {
  return MIN_VERTEX_COUNT + Math.floor(getRandom(random) * (MAX_VERTEX_COUNT - MIN_VERTEX_COUNT + 1));
}

function createLocalPolygon(vertexCount, random) {
  const step = (Math.PI * 2) / vertexCount;
  const shouldCreateConcavity = vertexCount >= 4 && getRandom(random) > 0.45;
  const concaveIndex = shouldCreateConcavity
    ? 1 + Math.floor(getRandom(random) * (vertexCount - 2))
    : -1;

  const points = Array.from({ length: vertexCount }, (_, index) => {
    const angleJitter = (getRandom(random) - 0.5) * step * 0.35;
    const angle = index * step + angleJitter;
    const radius = 24 + getRandom(random) * 18;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  });

  if (concaveIndex !== -1) {
    const previous = points[(concaveIndex - 1 + vertexCount) % vertexCount];
    const next = points[(concaveIndex + 1) % vertexCount];

    points[concaveIndex] = {
      x: (previous.x + next.x) * 0.35,
      y: (previous.y + next.y) * 0.35
    };
  }

  return points;
}

function getSizeFactor(attempt, random) {
  const attemptProgress = attempt / Math.max(1, MAX_GENERATION_ATTEMPTS - 1);
  const maxFactor = MAX_SIZE_FACTOR - (MAX_SIZE_FACTOR - 0.16) * attemptProgress;
  const minFactor = MIN_SIZE_FACTOR;

  return minFactor + getRandom(random) * Math.max(maxFactor - minFactor, 0);
}

function fitPolygonToCanvas(points, width, height, random, attempt) {
  const sourceBox = getBoundingBox(points);
  const targetWidth = width * getSizeFactor(attempt, random);
  const targetHeight = height * getSizeFactor(attempt, random);
  const scale = Math.min(targetWidth / sourceBox.width, targetHeight / sourceBox.height);

  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const scaledPoints = points.map((point) => ({
    x: point.x * scale,
    y: point.y * scale
  }));
  const box = getBoundingBox(scaledPoints);

  if (box.width > width || box.height > height) {
    return null;
  }

  const availableX = width - box.width;
  const availableY = height - box.height;
  const dx = -box.minX + getRandom(random) * availableX;
  const dy = -box.minY + getRandom(random) * availableY;

  return translatePoints(scaledPoints, dx, dy);
}

function overlapsExistingPolygon(points, existingPolygons) {
  return existingPolygons.some((polygon) => polygonsOverlap(points, polygon.points));
}

function createPolygonName(id) {
  const match = String(id).match(/(\d+)(?!.*\d)/);

  if (match) {
    return `Polygon ${match[1]}`;
  }

  return `Polygon ${id}`;
}

function createPolygonColor(random) {
  const colorValue = Math.floor(getRandom(random) * 0xffffff);

  return `#${colorValue.toString(16).padStart(6, "0")}`;
}

function createDefaultId(existingPolygons) {
  const usedNumericIds = existingPolygons
    .map((polygon) => String(polygon.id).match(/^polygon-(\d+)$/))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10));
  const nextNumber =
    usedNumericIds.length === 0 ? 1 : Math.max(...usedNumericIds) + 1;

  return `polygon-${nextNumber}`;
}

function createNextId(existingPolygons, nextId) {
  if (typeof nextId === "function") {
    return String(nextId());
  }

  return createDefaultId(existingPolygons);
}

export function generateRandomPolygon(options) {
  validateOptions(options);

  const {
    width,
    height,
    existingPolygons,
    random = Math.random,
    nextId
  } = options;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const vertexCount = getVertexCount(random);
    const localPolygon = createLocalPolygon(vertexCount, random);
    const points = fitPolygonToCanvas(localPolygon, width, height, random, attempt);

    if (points === null || overlapsExistingPolygon(points, existingPolygons)) {
      continue;
    }

    const id = createNextId(existingPolygons, nextId);

    return {
      id,
      name: createPolygonName(id),
      color: createPolygonColor(random),
      points
    };
  }

  throw new Error("Unable to generate a valid non-overlapping polygon within the canvas bounds.");
}
