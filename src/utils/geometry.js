const GEOMETRY_TOLERANCE = 1e-9;

function formatCount(count) {
  if (count === 1) {
    return "one";
  }

  if (count === 3) {
    return "three";
  }

  return String(count);
}

function getCoordinateScale(...points) {
  return Math.max(
    1,
    ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)])
  );
}

function getPointTolerance(...points) {
  return GEOMETRY_TOLERANCE * getCoordinateScale(...points);
}

function createPointListError(functionName, minimumLength, label = "point") {
  return new Error(
    `${functionName} requires at least ${formatCount(minimumLength)} ${label}${minimumLength === 1 ? "" : "s"} with finite x and y coordinates.`
  );
}

function validatePointList(points, minimumLength, functionName, label = "point") {
  if (!Array.isArray(points) || points.length < minimumLength) {
    throw createPointListError(functionName, minimumLength, label);
  }

  for (const point of points) {
    if (
      point === null ||
      typeof point !== "object" ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      throw createPointListError(functionName, minimumLength, label);
    }
  }
}

function validateFiniteNumber(value, functionName, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${functionName} requires a finite ${label}.`);
  }
}

function isPointOnSegment(point, start, end) {
  const crossProduct =
    (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
  const tolerance = getPointTolerance(point, start, end);

  if (Math.abs(crossProduct) > tolerance * Math.max(1, segmentLength)) {
    return false;
  }

  const minX = Math.min(start.x, end.x) - tolerance;
  const maxX = Math.max(start.x, end.x) + tolerance;
  const minY = Math.min(start.y, end.y) - tolerance;
  const maxY = Math.max(start.y, end.y) + tolerance;

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function getEdges(points) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function getOrientation(a, b, c) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const tolerance = getPointTolerance(a, b, c);
  const scale = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));

  if (Math.abs(value) <= tolerance * scale) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function segmentsIntersect(startA, endA, startB, endB) {
  const orientation1 = getOrientation(startA, endA, startB);
  const orientation2 = getOrientation(startA, endA, endB);
  const orientation3 = getOrientation(startB, endB, startA);
  const orientation4 = getOrientation(startB, endB, endA);

  if (orientation1 !== orientation2 && orientation3 !== orientation4) {
    return true;
  }

  if (orientation1 === 0 && isPointOnSegment(startB, startA, endA)) {
    return true;
  }

  if (orientation2 === 0 && isPointOnSegment(endB, startA, endA)) {
    return true;
  }

  if (orientation3 === 0 && isPointOnSegment(startA, startB, endB)) {
    return true;
  }

  if (orientation4 === 0 && isPointOnSegment(endA, startB, endB)) {
    return true;
  }

  return false;
}

export function getBoundingBox(points) {
  validatePointList(points, 1, "getBoundingBox");

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function translatePoints(points, dx, dy) {
  validatePointList(points, 1, "translatePoints");
  validateFiniteNumber(dx, "translatePoints", "dx");
  validateFiniteNumber(dy, "translatePoints", "dy");

  return points.map((point) => ({
    x: point.x + dx,
    y: point.y + dy
  }));
}

export function clampTranslationToBounds(points, dx, dy, width, height) {
  validatePointList(points, 1, "clampTranslationToBounds");
  validateFiniteNumber(dx, "clampTranslationToBounds", "dx");
  validateFiniteNumber(dy, "clampTranslationToBounds", "dy");

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    throw new Error(
      "clampTranslationToBounds requires finite non-negative canvas width and height."
    );
  }

  const box = getBoundingBox(points);
  const minDx = -box.minX;
  const maxDx = width - box.maxX;
  const minDy = -box.minY;
  const maxDy = height - box.maxY;

  return {
    dx: Math.min(Math.max(dx, minDx), maxDx),
    dy: Math.min(Math.max(dy, minDy), maxDy)
  };
}

export function isPointInPolygon(point, points) {
  validatePointList([point], 1, "isPointInPolygon", "point");
  validatePointList(points, 3, "isPointInPolygon");

  let isInside = false;

  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index];
    const previousPoint = points[previous];

    if (isPointOnSegment(point, previousPoint, currentPoint)) {
      return true;
    }

    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

export function polygonsOverlap(pointsA, pointsB) {
  try {
    validatePointList(pointsA, 3, "polygonsOverlap");
    validatePointList(pointsB, 3, "polygonsOverlap");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        "polygonsOverlap requires each polygon to have at least three points with finite x and y coordinates."
      );
    }

    throw error;
  }

  const edgesA = getEdges(pointsA);
  const edgesB = getEdges(pointsB);

  for (const [startA, endA] of edgesA) {
    for (const [startB, endB] of edgesB) {
      if (segmentsIntersect(startA, endA, startB, endB)) {
        return true;
      }
    }
  }

  return isPointInPolygon(pointsA[0], pointsB) || isPointInPolygon(pointsB[0], pointsA);
}
