function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPoint(point) {
  return (
    isPlainObject(point) &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

function isValidPolygon(polygon) {
  return (
    isPlainObject(polygon) &&
    isNonEmptyString(polygon.id) &&
    typeof polygon.name === "string" &&
    typeof polygon.color === "string" &&
    Array.isArray(polygon.points) &&
    polygon.points.every(isValidPoint)
  );
}

function assertEditorState(state, methodName) {
  if (
    !isPlainObject(state) ||
    !Array.isArray(state.polygons) ||
    !("selectedPolygonId" in state)
  ) {
    throw new Error(`${methodName} requires an editor state object.`);
  }
}

function assertValidPolygon(polygon) {
  if (!isValidPolygon(polygon)) {
    throw new Error(
      "addPolygon requires a polygon with a unique non-empty string id."
    );
  }
}

function assertExistingPolygonId(polygons, polygonId, methodName) {
  if (!polygons.some((polygon) => polygon.id === polygonId)) {
    throw new Error(`${methodName} requires an existing polygon id.`);
  }
}

function assertValidPoints(points) {
  if (!Array.isArray(points) || !points.every(isValidPoint)) {
    throw new Error(
      "updatePolygonPoints requires an array of points with finite x and y coordinates."
    );
  }
}

function assertValidColor(color) {
  if (!isNonEmptyString(color)) {
    throw new Error("updatePolygonColor requires a non-empty color string.");
  }
}

export function createEditorState() {
  return {
    polygons: [],
    selectedPolygonId: null
  };
}

export function addPolygon(state, polygon) {
  assertEditorState(state, "addPolygon");
  assertValidPolygon(polygon);

  if (state.polygons.some((existingPolygon) => existingPolygon.id === polygon.id)) {
    throw new Error(
      "addPolygon requires a polygon with a unique non-empty string id."
    );
  }

  return {
    polygons: [...state.polygons, polygon],
    selectedPolygonId: polygon.id
  };
}

export function selectPolygon(state, polygonId) {
  assertEditorState(state, "selectPolygon");

  if (polygonId === null) {
    if (state.selectedPolygonId === null) {
      return state;
    }

    return {
      polygons: state.polygons,
      selectedPolygonId: null
    };
  }

  if (!isNonEmptyString(polygonId) || !state.polygons.some((polygon) => polygon.id === polygonId)) {
    throw new Error("selectPolygon requires an existing polygon id or null.");
  }

  if (state.selectedPolygonId === polygonId) {
    return state;
  }

  return {
    polygons: state.polygons,
    selectedPolygonId: polygonId
  };
}

export function updatePolygonPoints(state, polygonId, points) {
  assertEditorState(state, "updatePolygonPoints");
  assertExistingPolygonId(state.polygons, polygonId, "updatePolygonPoints");
  assertValidPoints(points);

  return {
    polygons: state.polygons.map((polygon) =>
      polygon.id === polygonId
        ? {
            ...polygon,
            points
          }
        : polygon
    ),
    selectedPolygonId: state.selectedPolygonId
  };
}

export function updatePolygonColor(state, polygonId, color) {
  assertEditorState(state, "updatePolygonColor");
  assertExistingPolygonId(state.polygons, polygonId, "updatePolygonColor");
  assertValidColor(color);

  return {
    polygons: state.polygons.map((polygon) =>
      polygon.id === polygonId
        ? {
            ...polygon,
            color
          }
        : polygon
    ),
    selectedPolygonId: state.selectedPolygonId
  };
}

export function removeSelectedPolygon(state) {
  assertEditorState(state, "removeSelectedPolygon");

  if (state.selectedPolygonId === null) {
    return state;
  }

  return {
    polygons: state.polygons.filter(
      (polygon) => polygon.id !== state.selectedPolygonId
    ),
    selectedPolygonId: null
  };
}

export function removeAllPolygons(state) {
  assertEditorState(state, "removeAllPolygons");

  if (state.polygons.length === 0 && state.selectedPolygonId === null) {
    return state;
  }

  return createEditorState();
}
