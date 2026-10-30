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

// Use it or freeze it.
test("freezable foods are known, non-freezable ones aren't", function () {
  assert.strictEqual(FW.canFreeze("bread"), true);     // bread has a freezer entry
  assert.strictEqual(FW.canFreeze("milk"), true);
  assert.strictEqual(FW.canFreeze("greens"), false);   // salad doesn't freeze
  assert.strictEqual(FW.canFreeze("eggs"), false);
});

test("freeze-by is the item's use-by for a freezable fridge item", function () {
  // Milk opened, 5-day fridge life. You can freeze it right up to the use-by.
  var milk = { food: "milk", place: "fridge", opened: true, addedAt: NOW };
  assert.strictEqual(FW.freezeBy(milk), FW.useBy(milk));
  // Something already in the freezer has nothing to freeze.
  var frozen = { food: "bread", place: "freezer", opened: false, addedAt: NOW };
  assert.strictEqual(FW.freezeBy(frozen), null);
  // Salad can't be frozen, so no freeze-by.
  var salad = { food: "greens", place: "fridge", opened: true, addedAt: NOW };
  assert.strictEqual(FW.freezeBy(salad), null);
});

test("the freeze nudge shows only when a freezable item is close to its date", function () {
  var sausages = { food: "sausages", place: "fridge", opened: false, addedAt: daysAgo(1) }; // 2-day life, 1 left
  var hint = FW.freezeHint(sausages, NOW);
  assert.ok(/Freeze it by tomorrow/.test(hint));
  assert.ok(/frozen/.test(hint));
  // Fresh milk (5 days left) is not nagged about yet.
  var milk = { food: "milk", place: "fridge", opened: true, addedAt: NOW };
  assert.strictEqual(FW.freezeHint(milk, NOW), "");
  // Salad close to its date still gets no freeze nudge (it can't be frozen).
  var salad = { food: "greens", place: "fridge", opened: true, addedAt: daysAgo(2) };
  assert.strictEqual(FW.freezeHint(salad, NOW), "");
});

test("a past-date item is too late to freeze", function () {
  var sausages = { food: "sausages", place: "fridge", opened: false, addedAt: daysAgo(4) };
  assert.strictEqual(FW.freezeHint(sausages, NOW), "");
});

test("opening a sealed item later pulls the use-by in to its open shelf life", function () {
  var DAY = FW.DAY;
  var added = FW.startOfDay(Date.now());
  // Milk sealed keeps 7 days; opened keeps 5. Opened today, it's due in 5 days,
  // sooner than the 7-day sealed date.
  var openedToday = FW.startOfDay(Date.now());
  var item = { food: "milk", place: "fridge", addedAt: added, opened: false, openedAt: openedToday };
  var sealedBy = FW.useBy({ food: "milk", place: "fridge", addedAt: added, opened: false });
  var openedBy = FW.useBy(item);
  assert.ok(openedBy < sealedBy, "opening pulls the date earlier");
  assert.strictEqual(openedBy, openedToday + 5 * DAY);
  assert.strictEqual(FW.opensShorten(item), true);
});

test("opening doesn't push a date out past the pack date", function () {
  var DAY = FW.DAY;
  // Pack use-by is in 2 days; opening today (5-day open life) must not extend it.
  var packDate = FW.startOfDay(Date.now() + 2 * DAY);
  var item = { food: "milk", place: "fridge", addedAt: FW.startOfDay(Date.now()), packDate: packDate, openedAt: FW.startOfDay(Date.now()) };
  assert.strictEqual(FW.useBy(item), packDate);
  assert.strictEqual(FW.opensShorten(item), false);
});

test("an item never opened is unchanged", function () {
  var added = FW.startOfDay(Date.now());
  var item = { food: "hard-cheese", place: "fridge", addedAt: added, opened: false };
  assert.strictEqual(FW.useBy(item), added + 42 * FW.DAY); // sealed hard cheese
  assert.strictEqual(FW.opensShorten(item), false);
});

test("thawing a frozen item restarts the clock on its fridge life", function () {
  var DAY = FW.DAY;
  var added = FW.startOfDay(Date.now() - 30 * DAY); // frozen a month ago
  // Raw chicken: freezer open life 270 days, fridge open life 1 day.
  var item = { food: "raw-chicken", place: "freezer", addedAt: added, thawedAt: FW.startOfDay(Date.now()) };
  assert.strictEqual(FW.useBy(item), FW.startOfDay(Date.now()) + 1 * DAY);
  assert.strictEqual(FW.thawShorten(item), true);
});

test("thawed red-meat cuts keep longer than thawed poultry", function () {
  assert.strictEqual(FW.thawedKeepDays("raw-chicken"), 1); // poultry: a day
  assert.strictEqual(FW.thawedKeepDays("raw-steak"), 3);   // steak/chops: a few days
});

test("thawing is only for foods that can be frozen", function () {
  assert.strictEqual(FW.thawedKeepDays("greens"), null); // salad can't be frozen
});

test("an item that was never thawed is unchanged", function () {
  var added = FW.startOfDay(Date.now());
  var item = { food: "raw-steak", place: "freezer", addedAt: added };
  assert.strictEqual(FW.useBy(item), added + 120 * FW.DAY); // full freezer life
  assert.strictEqual(FW.thawShorten(item), false);
});

// ---- a food knows whether its date is about safety or quality ----

test("dateKind: raw and soft foods are safety dates, hard/dry/produce are quality", function () {
  assert.strictEqual(FW.dateKind("raw-chicken"), "use");
  assert.strictEqual(FW.dateKind("milk"), "use");
  assert.strictEqual(FW.dateKind("soup"), "use");
  assert.strictEqual(FW.dateKind("hard-cheese"), "best");
  assert.strictEqual(FW.dateKind("eggs"), "best");
  assert.strictEqual(FW.dateKind("apples"), "best");
});

test("kindNote labels a tracked item near its own estimated date, no pack date needed", function () {
  // Milk (safety) added 10 days ago is past its ~5-7 day fridge life.
  var milk = { food: "milk", place: "fridge", opened: false, addedAt: at("2026-06-05") };
  assert.ok(FW.daysLeft(milk, NOW) < 0);
  assert.match(FW.kindNote(milk, NOW), /Safety date/);
  assert.match(FW.kindNote(milk, NOW), /don't eat/i);

  // Apples (quality) in the fridge keep 28 days; added 40 days ago they're past.
  var apple = { food: "apples", place: "fridge", opened: true, addedAt: at("2026-05-06") };
  assert.ok(FW.daysLeft(apple, NOW) < 0);
  assert.match(FW.kindNote(apple, NOW), /Quality date/);
  assert.match(FW.kindNote(apple, NOW), /usually still fine/);
});

test("kindNote is empty while an item is comfortably in date", function () {
  var milk = { food: "milk", place: "fridge", opened: false, addedAt: at("2026-06-14") };
  assert.strictEqual(FW.kindNote(milk, NOW), "");
});

test("advice falls back to the food's natural date kind when the user didn't say", function () {
  // Hard cheese is a quality date; with a pack date in the past and no explicit
  // dateKind, advice should read as best-before, not use-by.
  var cheese = { food: "hard-cheese", place: "fridge", addedAt: at("2026-06-01"), packDate: at("2026-06-13") };
  assert.match(FW.advice(cheese, NOW), /usually still fine/);
  // Raw chicken is a safety date, so the same situation reads as use-by.
  var chicken = { food: "raw-chicken", place: "fridge", addedAt: at("2026-06-01"), packDate: at("2026-06-13") };
  assert.match(FW.advice(chicken, NOW), /Don't eat it/);
});
