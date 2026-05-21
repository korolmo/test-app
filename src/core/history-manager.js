function isEditorState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.polygons) &&
    "selectedPolygonId" in value
  );
}

function assertEditorState(value, methodName) {
  if (!isEditorState(value)) {
    throw new Error(`${methodName} requires an editor state object.`);
  }
}

export function createHistoryManager(initialState) {
  assertEditorState(initialState, "createHistoryManager");

  const past = [];
  let current = initialState;
  const future = [];

  return {
    getCurrentState() {
      return current;
    },

    commit(nextState) {
      assertEditorState(nextState, "commit");

      past.push(current);
      current = nextState;
      future.length = 0;

      return current;
    },

    undo() {
      if (past.length === 0) {
        return current;
      }

      future.push(current);
      current = past.pop();

      return current;
    },

    redo() {
      if (future.length === 0) {
        return current;
      }

      past.push(current);
      current = future.pop();

      return current;
    },

    canUndo() {
      return past.length > 0;
    },

    canRedo() {
      return future.length > 0;
    }
  };
}
