import { describe, expect, it } from "vitest";
import { examplesSheet } from "../src/examples";

describe("examples sheet", () => {
  const { values, formulas, notes } = examplesSheet();

  it("has a rectangular grid with a header", () => {
    const width = values[0].length;
    expect(values.every((row) => row.length === width)).toBe(true);
    expect(notes[0]).toHaveLength(width);
    expect(values[0][0]).toBe("Message");
  });

  it("points every formula at exactly the example rows", () => {
    const last = values.length;
    for (const { cell, formula } of formulas) {
      expect(cell).toMatch(/^[C-H]2$/);
      expect(formula).toMatch(new RegExp(`^=JEV_[A-Z]+\\(A2:[AB]${last},`));
    }
  });

  it("only uses functions the add-on defines", () => {
    for (const { formula } of formulas) {
      expect(["JEV_IF", "JEV_PROB", "JEV_CHOICE", "JEV_SCORE"]).toContain(formula.match(/^=(\w+)\(/)![1]);
    }
  });
});
