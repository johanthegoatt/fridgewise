"use strict";
var test = require("node:test");
var assert = require("node:assert");
var FW = require("../src/engine.js");

var DAY = FW.DAY;
// A fixed "now" so the tests never depend on the real clock.
var NOW = new Date("2026-06-15T09:30:00").getTime();
function daysAgo(n) { return NOW - n * DAY; }

test("keep times come straight from the table", function () {
  // Raw chicken: 1 day in the fridge, 270 in the freezer.
  assert.strictEqual(FW.keepDays("raw-chicken", "fridge", false), 1);
  assert.strictEqual(FW.keepDays("raw-chicken", "freezer", false), 270);
  // Milk keeps longer sealed than open.
  assert.strictEqual(FW.keepDays("milk", "fridge", false), 7);
  assert.strictEqual(FW.keepDays("milk", "fridge", true), 5);
});

test("a place a food can't go gives no time", function () {
  assert.strictEqual(FW.keepDays("milk", "pantry", false), null);
  assert.strictEqual(FW.keepDays("not-a-food", "fridge", false), null);
});

test("open falls back to sealed when only one is listed", function () {
  // Leftovers only list an open time; asking sealed still answers.
  assert.strictEqual(FW.keepDays("leftovers", "fridge", true), 3);
  assert.strictEqual(FW.keepDays("leftovers", "fridge", false), 3);
});

test("placesFor lists only the allowed places, in order", function () {
  assert.deepStrictEqual(FW.placesFor("bread"), ["pantry", "freezer"]);
  assert.deepStrictEqual(FW.placesFor("apples"), ["fridge", "pantry"]);
  assert.deepStrictEqual(FW.placesFor("yogurt"), ["fridge"]);
});

test("the clock time of day never changes the count", function () {
  var morning = { food: "milk", place: "fridge", opened: true, addedAt: new Date("2026-06-15T06:00:00").getTime() };
  var night = { food: "milk", place: "fridge", opened: true, addedAt: new Date("2026-06-15T23:00:00").getTime() };
  assert.strictEqual(FW.daysLeft(morning, NOW), FW.daysLeft(night, NOW));
});

test("daysLeft: added today, open milk has 5 days", function () {
  var it = { food: "milk", place: "fridge", opened: true, addedAt: NOW };
  assert.strictEqual(FW.daysLeft(it, NOW), 5);
});

test("daysLeft goes negative once the use-by day has passed", function () {
  var it = { food: "leftovers", place: "fridge", opened: true, addedAt: daysAgo(5) };
  assert.strictEqual(FW.daysLeft(it, NOW), -2); // 3-day life, added 5 days ago
});

test("buckets split now / soon / fresh / gone", function () {
  function mk(food, place, days) { return { food: food, place: place, opened: true, addedAt: daysAgo(days) }; }
  assert.strictEqual(FW.bucket(mk("leftovers", "fridge", 3), NOW), "now");   // 0 left
  assert.strictEqual(FW.bucket(mk("leftovers", "fridge", 2), NOW), "now");   // 1 left
  assert.strictEqual(FW.bucket(mk("milk", "fridge", 3), NOW), "soon");       // 2 left
  assert.strictEqual(FW.bucket(mk("milk", "fridge", 0), NOW), "fresh");      // 5 left
  assert.strictEqual(FW.bucket(mk("leftovers", "fridge", 10), NOW), "gone");
});

test("rank puts the soonest first and past items at the very top", function () {
  var items = [
    { id: "a", food: "apples", place: "fridge", opened: true, addedAt: NOW },        // 28 left
    { id: "b", food: "milk", place: "fridge", opened: true, addedAt: NOW },          // 5 left
    { id: "c", food: "leftovers", place: "fridge", opened: true, addedAt: daysAgo(5) } // -2 (past)
  ];
  var order = FW.rank(items, NOW).map(function (x) { return x.id; });
  assert.deepStrictEqual(order, ["c", "b", "a"]);
});

test("summary counts what needs eating and what's past", function () {
  var items = [
    { food: "leftovers", place: "fridge", opened: true, addedAt: daysAgo(5) }, // gone
    { food: "milk", place: "fridge", opened: true, addedAt: daysAgo(4) },      // 1 left -> soon(now)
    { food: "apples", place: "fridge", opened: true, addedAt: NOW }            // 28 -> fresh
  ];
  var s = FW.summary(items, NOW);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.gone, 1);
  assert.strictEqual(s.soon, 1);
});

test("phrase reads in plain words", function () {
  function at(days) { return { food: "leftovers", place: "fridge", opened: true, addedAt: daysAgo(days) }; }
  assert.strictEqual(FW.phrase(at(3), NOW), "Use today");
  assert.strictEqual(FW.phrase(at(2), NOW), "Use by tomorrow");
  assert.strictEqual(FW.phrase(at(1), NOW), "2 days left");
  assert.strictEqual(FW.phrase(at(4), NOW), "1 day past");
  assert.strictEqual(FW.phrase(at(5), NOW), "2 days past");
});

test("a custom item uses its own day count", function () {
  var it = { food: "custom", place: "fridge", days: 2, addedAt: NOW };
  assert.strictEqual(FW.daysLeft(it, NOW), 2);
  assert.strictEqual(FW.bucket(it, NOW), "soon");
});

test("freezer buys a lot more time than the fridge", function () {
  var fridge = { food: "raw-chicken", place: "fridge", opened: false, addedAt: NOW };
  var freezer = { food: "raw-chicken", place: "freezer", opened: false, addedAt: NOW };
  assert.strictEqual(FW.daysLeft(fridge, NOW), 1);
  assert.strictEqual(FW.daysLeft(freezer, NOW), 270);
});

// ---- a date printed on the pack wins, and the advice reflects use-by vs best-before ----

function at(iso) { return new Date(iso + "T00:00:00").getTime(); }

test("a pack date overrides the stored-time guess", function () {
  // Milk would compute ~5-7 days, but the pack says the 20th.
  var item = { food: "milk", place: "fridge", opened: false, addedAt: at("2026-06-14"), packDate: at("2026-06-20") };
  assert.strictEqual(FW.useBy(item), FW.startOfDay(at("2026-06-20")));
  assert.strictEqual(FW.daysLeft(item, NOW), 5);
});

test("a use-by in the past says don't eat it", function () {
  var item = { food: "milk", place: "fridge", addedAt: at("2026-06-01"), packDate: at("2026-06-13"), dateKind: "use" };
  assert.match(FW.advice(item, NOW), /Don't eat it/);
});

test("a best-before in the past says it's usually fine", function () {
  var item = { food: "hard-cheese", place: "fridge", addedAt: at("2026-06-01"), packDate: at("2026-06-13"), dateKind: "best" };
  assert.match(FW.advice(item, NOW), /usually still fine/);
});

test("advice is empty when the pack date is still days away", function () {
  var item = { food: "milk", place: "fridge", addedAt: at("2026-06-14"), packDate: at("2026-06-25"), dateKind: "use" };
  assert.strictEqual(FW.advice(item, NOW), "");
});

test("no pack date means no advice line", function () {
  var item = { food: "milk", place: "fridge", addedAt: at("2026-06-14") };
  assert.strictEqual(FW.advice(item, NOW), "");
});
