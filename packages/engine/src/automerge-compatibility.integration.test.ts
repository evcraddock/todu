import * as Automerge from "@automerge/automerge";
import { describe, expect, it } from "vitest";

interface LegacyDocument {
  title: string;
  description: string;
  tasks: { id: string; status: string }[];
}

// **Compatibility fixture:** Saved by Automerge 3.3.2, before the core upgrade.
const legacySnapshot = Buffer.from(
  "hW9KgxZQVnAAuQIBEAAAAAAAAAAAAAAAAAAAAAEByDgG2/Yyif8kJZBkJTMXSxTMGF6otPaf8Xl/9tweyswGAQIDAhMDIwZAAlYCDAEFAg4REBMZFSghAyMDNARCDlYNV0GAAQN/AH8Bf8QAf97Sj9YGfwB/BwADwQAAAAMiAX8CCwMCJgsyBjMABCEAAAIKAAADCgAAAQUAAAN+AAQgAX1cACcJAQACflA0CQF+Qz8EAX0LZGVzY3JpcHRpb24FdGFza3MFdGl0bGUALn4CaWQGc3RhdHVzABHEAADEAAEDLgIRfQQCBCIBfwALAQIEEQEDACEWfkYACxYCABEWT3JpZ2luYWwgZGVzY3JpcHRpb24KU2Vjb25kIGxpbmUg8J+UkkxlZ2FjeSB0YXNrdGFzay1sZWdhY3lhY3RpdmXEAAAA",
  "base64",
);

const legacyContent: LegacyDocument = {
  title: "Legacy task",
  description: "Original description\nSecond line 🔒",
  tasks: [{ id: "task-legacy", status: "active" }],
};

describe("Automerge core upgrade compatibility", () => {
  it("loads a pre-upgrade snapshot and preserves Unicode text and nested task data", () => {
    const loaded = Automerge.load<LegacyDocument>(legacySnapshot);
    try {
      expect(Automerge.toJS(loaded)).toEqual(legacyContent);
      const reopened = Automerge.load<LegacyDocument>(Automerge.save(loaded));
      try {
        expect(Automerge.toJS(reopened)).toEqual(legacyContent);
      } finally {
        Automerge.free(reopened);
      }
    } finally {
      Automerge.free(loaded);
    }
  });

  it("merges concurrent edits to a legacy snapshot and persists both changes", () => {
    const left = Automerge.change(Automerge.load<LegacyDocument>(legacySnapshot), (doc) => {
      doc.title = "Updated title";
    });
    const right = Automerge.change(Automerge.load<LegacyDocument>(legacySnapshot), (doc) => {
      doc.tasks[0].status = "done";
    });
    const merged = Automerge.merge(left, right);
    const reopened = Automerge.load<LegacyDocument>(Automerge.save(merged));
    try {
      expect(Automerge.toJS(reopened)).toEqual({
        ...legacyContent,
        title: "Updated title",
        tasks: [{ id: "task-legacy", status: "done" }],
      });
    } finally {
      Automerge.free(reopened);
      Automerge.free(merged);
      Automerge.free(right);
    }
  });
});
