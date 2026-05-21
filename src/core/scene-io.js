function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPoint(point) {
  return isPlainObject(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function normalizePolygon(polygon, seenIds) {
  if (!isPlainObject(polygon)) {
    throw new Error("Некорректный формат полигона.");
  }

  if (!isNonEmptyString(polygon.id) || seenIds.has(polygon.id)) {
    throw new Error("Идентификаторы полигонов должны быть уникальными.");
  }

  if (typeof polygon.name !== "string" || typeof polygon.color !== "string") {
    throw new Error("У полигона отсутствуют обязательные поля.");
  }

  if (!Array.isArray(polygon.points) || polygon.points.length < 3 || !polygon.points.every(isValidPoint)) {
    throw new Error("У полигона некорректные координаты.");
  }

  seenIds.add(polygon.id);

  return {
    id: polygon.id,
    name: polygon.name,
    color: polygon.color,
    points: polygon.points.map((point) => ({
      x: point.x,
      y: point.y
    }))
  };
}

export function serializeScene(state) {
  return JSON.stringify(
    {
      polygons: Array.isArray(state?.polygons)
        ? state.polygons.map((polygon) => ({
            id: polygon.id,
            name: polygon.name,
            color: polygon.color,
            points: polygon.points.map((point) => ({
              x: point.x,
              y: point.y
            }))
          }))
        : [],
      selectedPolygonId:
        typeof state?.selectedPolygonId === "string" ? state.selectedPolygonId : null
    },
    null,
    2
  );
}

export function parseSceneJson(json) {
  let parsed;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("JSON не удалось разобрать.");
  }

  if (!isPlainObject(parsed) || !Array.isArray(parsed.polygons)) {
    throw new Error("Файл сцены имеет неверную структуру.");
  }

  const seenIds = new Set();
  const polygons = parsed.polygons.map((polygon) => normalizePolygon(polygon, seenIds));
  const selectedPolygonId =
    parsed.selectedPolygonId === null || typeof parsed.selectedPolygonId === "string"
      ? parsed.selectedPolygonId
      : null;

  if (selectedPolygonId !== null && !seenIds.has(selectedPolygonId)) {
    throw new Error("Выбранный полигон в сцене не найден.");
  }

  return {
    polygons,
    selectedPolygonId
  };
}
