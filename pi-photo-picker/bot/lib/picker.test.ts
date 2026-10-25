import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyCatalog, pickFromState } from "./picker.ts";

const photos = [
  { path: "a.jpg", synologyId: 1, created: 10 },
  { path: "b.jpg", synologyId: 2, created: 20 },
  { path: "c.jpg", created: 30 },
];

describe("pickFromState", () => {
  it("picks the first remaining photo when the rng returns 0", () => {
    let state = emptyCatalog();
    const picked: string[] = [];

    for (let step = 0; step < 3; step += 1) {
      const outcome = pickFromState(state, { photos }, () => 0);
      state = outcome.state;
      assert.equal(outcome.result.ok, true);
      if (outcome.result.ok) {
        picked.push(outcome.result.path);
      }
    }

    assert.deepEqual(picked, ["a.jpg", "b.jpg", "c.jpg"]);
    assert.deepEqual(state.shownPaths, ["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("starts a new cycle and skips the photo shown last", () => {
    let state = emptyCatalog();
    for (let step = 0; step < 3; step += 1) {
      state = pickFromState(state, { photos }, () => 0).state;
    }

    const outcome = pickFromState(state, { photos }, () => 0);
    assert.equal(outcome.result.ok, true);
    if (outcome.result.ok) {
      assert.equal(outcome.result.cycleReset, true);
      assert.equal(outcome.result.path, "a.jpg");
      assert.equal(outcome.result.candidateCount, 2);
    }
  });

  it("repeats the only photo once its cycle ends", () => {
    const first = pickFromState(
      emptyCatalog(),
      { photos: [{ path: "only.jpg" }] },
      () => 0,
    );
    const second = pickFromState(
      first.state,
      { photos: [{ path: "only.jpg" }] },
      () => 0,
    );

    assert.equal(second.result.ok, true);
    if (second.result.ok) {
      assert.equal(second.result.cycleReset, true);
      assert.equal(second.result.path, "only.jpg");
    }
  });

  it("resets the cycle when the catalog changes", () => {
    const first = pickFromState(emptyCatalog(), { photos }, () => 0);
    const second = pickFromState(
      first.state,
      { photos: [{ path: "b.jpg" }, { path: "c.jpg" }] },
      () => 0,
    );

    assert.equal(second.result.ok, true);
    if (second.result.ok) {
      assert.equal(second.result.path, "b.jpg");
      assert.equal(second.result.source, "request");
      assert.equal(second.result.cycleReset, false);
    }
    assert.deepEqual(second.state.shownPaths, ["b.jpg"]);
  });

  it("keeps the cycle when the same photos arrive again", () => {
    const first = pickFromState(emptyCatalog(), { photos }, () => 0);
    const second = pickFromState(first.state, { photos }, () => 0);

    assert.equal(second.result.ok, true);
    if (second.result.ok) {
      assert.equal(second.result.path, "b.jpg");
      assert.equal(second.result.remainingAfterPick, 1);
    }
  });

  it("drops blank and duplicate paths", () => {
    const outcome = pickFromState(
      emptyCatalog(),
      {
        photos: [
          { path: "  " },
          { path: "a.jpg", synologyId: 4 },
          { path: "a.jpg", synologyId: 9 },
        ],
      },
      () => 0,
    );

    assert.equal(outcome.result.ok, true);
    if (outcome.result.ok) {
      assert.equal(outcome.result.path, "a.jpg");
      assert.equal(outcome.result.synologyId, 4);
      assert.equal(outcome.result.candidateCount, 1);
    }
  });

  it("uses the stored catalog when no photos are sent", () => {
    const first = pickFromState(emptyCatalog(), { photos }, () => 0);
    const second = pickFromState(first.state, {}, () => 0);

    assert.equal(second.result.ok, true);
    if (second.result.ok) {
      assert.equal(second.result.source, "memory");
      assert.equal(second.result.path, "b.jpg");
    }
  });

  it("reports a missing catalog", () => {
    const outcome = pickFromState(emptyCatalog(), {}, () => 0);
    assert.equal(outcome.result.ok, false);
    if (!outcome.result.ok) {
      assert.match(outcome.result.error, /Kein Bildkatalog/);
    }
  });

  it("clears the shown set when reset is set", () => {
    const first = pickFromState(emptyCatalog(), { photos }, () => 0);
    const second = pickFromState(
      first.state,
      { photos, reset: true },
      () => 0,
    );

    assert.equal(second.result.ok, true);
    if (second.result.ok) {
      assert.equal(second.result.path, "a.jpg");
    }
  });
});
