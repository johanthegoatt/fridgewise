// Fridgewise engine: how long food keeps, and what to eat first.
//
// Everything is worked out in whole days from the day you put the food away.
// Keep times come from published cold-storage guidance (US FoodSafety.gov
// "Cold Food Storage Chart" and the USDA FoodKeeper), using the shorter end
// of each range so the date errs on the safe side. Pure functions, no DOM,
// so the page and `node --test` run the exact same code.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Fridgewise = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY = 86400000; // ms in a day

  // Each food lists how many days it keeps in each place, split by whether
  // the pack is still sealed or already open/cooked. A missing place means
  // "don't keep it there". Numbers are the short end of the published range.
  // group is just for the little icon and the pick list order.
  var FOODS = [
    { id: "leftovers", name: "Cooked leftovers", group: "cooked", safety: true, fridge: { open: 3 }, freezer: { open: 90 } },
    { id: "cooked-meat", name: "Cooked meat or chicken", group: "cooked", safety: true, fridge: { open: 3 }, freezer: { open: 90 } },
    { id: "cooked-rice", name: "Cooked rice or pasta", group: "cooked", safety: true, fridge: { open: 3 }, freezer: { open: 60 } },
    { id: "soup", name: "Soup or stew", group: "cooked", safety: true, fridge: { open: 3 }, freezer: { open: 90 } },

    { id: "raw-chicken", name: "Raw chicken or turkey", group: "raw", safety: true, fridge: { sealed: 1, open: 1 }, freezer: { sealed: 270, open: 270 } },
    { id: "raw-mince", name: "Raw mince", group: "raw", safety: true, fridge: { sealed: 1, open: 1 }, freezer: { sealed: 90, open: 90 } },
    { id: "raw-steak", name: "Raw steak or chops", group: "raw", safety: true, fridge: { sealed: 3, open: 3 }, freezer: { sealed: 120, open: 120 } },
    { id: "raw-fish", name: "Raw fish", group: "raw", safety: true, fridge: { sealed: 1, open: 1 }, freezer: { sealed: 90, open: 90 } },
    { id: "bacon", name: "Bacon", group: "raw", safety: true, fridge: { sealed: 14, open: 7 }, freezer: { sealed: 30, open: 30 } },
    { id: "sausages", name: "Raw sausages", group: "raw", safety: true, fridge: { sealed: 2, open: 2 }, freezer: { sealed: 60, open: 60 } },
    { id: "deli-meat", name: "Sliced deli meat", group: "raw", safety: true, fridge: { sealed: 5, open: 3 }, freezer: { sealed: 60, open: 60 } },

    { id: "milk", name: "Milk", group: "dairy", safety: true, fridge: { sealed: 7, open: 5 }, freezer: { sealed: 90, open: 90 } },
    { id: "yogurt", name: "Yogurt", group: "dairy", safety: true, fridge: { sealed: 14, open: 7 } },
    { id: "hard-cheese", name: "Hard cheese", group: "dairy", fridge: { sealed: 42, open: 28 } },
    { id: "soft-cheese", name: "Soft cheese", group: "dairy", safety: true, fridge: { sealed: 14, open: 7 } },
    { id: "butter", name: "Butter", group: "dairy", fridge: { sealed: 60, open: 30 }, freezer: { sealed: 270, open: 270 } },
    { id: "eggs", name: "Eggs (in shell)", group: "dairy", fridge: { sealed: 21, open: 21 } },

    { id: "berries", name: "Berries", group: "produce", fridge: { open: 3 } },
    { id: "greens", name: "Salad or leafy greens", group: "produce", fridge: { open: 3 } },
    { id: "apples", name: "Apples", group: "produce", fridge: { open: 28 }, pantry: { open: 7 } },
    { id: "carrots", name: "Carrots", group: "produce", fridge: { open: 21 } },
    { id: "tomatoes", name: "Tomatoes", group: "produce", fridge: { open: 5 }, pantry: { open: 3 } },
    { id: "bananas", name: "Bananas", group: "produce", pantry: { open: 4 } },
    { id: "potatoes", name: "Potatoes", group: "produce", pantry: { open: 21 } },

    { id: "bread", name: "Bread", group: "pantry", pantry: { sealed: 5, open: 3 }, freezer: { sealed: 90, open: 90 } },
    { id: "opened-jar", name: "Opened jar or sauce", group: "pantry", fridge: { open: 14 } },
    { id: "juice", name: "Opened juice", group: "pantry", fridge: { open: 8 } },
    { id: "hummus", name: "Hummus or dip", group: "pantry", safety: true, fridge: { sealed: 7, open: 4 } }
  ];

  var PLACES = { fridge: "Fridge", freezer: "Freezer", pantry: "Cupboard" };

  var byId = {};
  FOODS.forEach(function (f) { byId[f.id] = f; });

  // Start of the given day, in local time. Keep times are counted in whole
  // days, so the clock time you added something never matters.
  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function num(x) {
    var n = typeof x === "number" ? x : parseInt(x, 10);
    return isFinite(n) ? n : null;
  }

  // How many days this food keeps in this place, given sealed/open. Falls back
  // from "open" to "sealed" and the other way, so a half-filled entry still
  // gives a sensible answer. Returns null if the food shouldn't go there.
  function keepDays(foodId, place, opened) {
    var f = byId[foodId];
    if (!f || !f[place]) return null;
    var slot = f[place];
    if (opened) return num(slot.open != null ? slot.open : slot.sealed);
    return num(slot.sealed != null ? slot.sealed : slot.open);
  }

  // Which places this food is allowed in. The order follows how each food is
  // written in the table, so its natural home comes first (bread -> cupboard,
  // apples -> fridge), with the first one used as the default on the form.
  function placesFor(foodId) {
    var f = byId[foodId];
    if (!f) return [];
    return Object.keys(f).filter(function (p) { return PLACES[p]; });
  }

  // The day food should be used by: the day it went in, plus its keep days.
  // A "Something else" item carries its own `days`, which wins over the table.
  // A date printed on the pack (packDate) wins over everything: a real use-by
  // or best-before on the label beats any stored-time guess. addedAt, packDate
  // and useBy are all midnight stamps.
  function useBy(item) {
    var by = baseUseBy(item);
    // Opening it later can pull the date in: once a sealed thing is opened it
    // keeps only its open shelf life, even when the pack date is further off
    // (FSA / USDA "once opened, use within N days"). The clock runs from the
    // day you opened it, and the sooner of the two dates wins.
    if (item.openedAt != null) {
      var okd = keepDays(item.food, item.place, true);
      if (okd != null) {
        var oc = startOfDay(item.openedAt) + okd * DAY;
        by = by == null ? oc : Math.min(by, oc);
      }
    }
    // Thawing a frozen item restarts the clock on its fridge life: once it's
    // defrosted it keeps only as long as it would fresh in the fridge, counted
    // from the day you thawed it, whatever date the freezer bag said (USDA /
    // FoodSafety.gov "The Big Thaw": food thawed in the fridge keeps a day or
    // two for mince, poultry and fish, a few days for other cuts). The sooner
    // of the two dates wins, so a long-frozen chicken drops to its fridge life.
    if (item.thawedAt != null) {
      var tkd = thawedKeepDays(item.food);
      if (tkd != null) {
        var tc = startOfDay(item.thawedAt) + tkd * DAY;
        by = by == null ? tc : Math.min(by, tc);
      }
    }
    return by;
  }

  // How long a food keeps in the fridge once thawed: its fridge open shelf
  // life. Only meaningful for a food that can be frozen in the first place.
  function thawedKeepDays(foodId) {
    if (!canFreeze(foodId)) return null;
    return keepDays(foodId, "fridge", true);
  }

  // True when thawing is what pulls the use-by in (so the page can say
  // "thawed, use within N days" rather than trust the freezer date).
  function thawShorten(item) {
    if (!item || item.thawedAt == null) return false;
    var tkd = thawedKeepDays(item.food);
    if (tkd == null) return false;
    var base = baseUseBy(item);
    var tc = startOfDay(item.thawedAt) + tkd * DAY;
    return base == null || tc < base;
  }

  function baseUseBy(item) {
    if (item.packDate != null) {
      var pd = startOfDay(item.packDate);
      if (isFinite(pd)) return pd;
    }
    var days = num(item.days);
    if (days == null) days = keepDays(item.food, item.place, item.opened);
    if (days == null) return null;
    return startOfDay(item.addedAt) + days * DAY;
  }

  // True when opening the item later is what pulls its use-by date in, so the
  // page can say "opened, use within N days" rather than trust the pack date.
  function opensShorten(item) {
    if (!item || item.openedAt == null) return false;
    var okd = keepDays(item.food, item.place, true);
    if (okd == null) return false;
    var base = baseUseBy(item);
    var oc = startOfDay(item.openedAt) + okd * DAY;
    return base == null || oc < base;
  }

  // Short safety line for an item with a date printed on the pack. A use-by is
  // about safety: don't eat it after. A best-before is about quality: it's
  // usually fine after, just not at its best (UK FSA guidance). Returns "" when
  // there's no pack date or the item isn't near/past it.
  function advice(item, now) {
    if (item.packDate == null) return "";
    var d = daysLeft(item, now);
    if (d == null) return "";
    // Use what the user said if they said it, otherwise fall back to what kind
    // of date this food naturally carries (raw meat and dairy are safety dates;
    // hard cheese, eggs and most produce are quality dates).
    var best = item.dateKind != null ? item.dateKind === "best" : dateKind(item.food) === "best";
    if (d < 0) {
      return best
        ? "Past the best-before. Have a look and a smell; it's usually still fine."
        : "Past the use-by. Don't eat it.";
    }
    if (d <= 1) {
      var when = d === 0 ? "today" : "tomorrow";
      return best
        ? "Best before " + when + ". Fine after, just not at its best."
        : "Use by " + when + ". Eat it by then or freeze it.";
    }
    return "";
  }

  // What kind of date a food carries by its nature. A "use" date is about
  // safety: raw meat, fish, cooked leftovers and the softer dairy go off in a
  // way that can make you ill, so you don't eat them after. A "best" date is
  // about quality: hard cheese, eggs, bread and most produce are usually still
  // fine after, just past their best (UK FSA: use-by is safety, best-before is
  // quality). Foods carry safety:true in the table; everything else is quality.
  function dateKind(foodId) {
    var f = byId[foodId];
    return f && f.safety ? "use" : "best";
  }

  // A short safety/quality note for a tracked item near its date, grounded in
  // the food (so it works for Fridgewise's own estimate, not only a typed pack
  // date). Empty when the item is still comfortably in date.
  function kindNote(item, now) {
    if (!item) return "";
    var d = daysLeft(item, now);
    if (d == null) return "";
    var safety = dateKind(item.food) === "use";
    if (d < 0) {
      return safety
        ? "Safety date — don't eat it."
        : "Quality date — have a look and a smell; it's usually still fine.";
    }
    if (d <= 1) {
      return safety
        ? "Safety date — eat it or freeze it now."
        : "Quality date — best soon, but usually fine a little after.";
    }
    return "";
  }

  // Can this food go in the freezer at all? (Some, like salad or a cut tomato,
  // can't be saved that way.)
  function canFreeze(foodId) {
    var f = byId[foodId];
    return !!(f && f.freezer);
  }

  // Roughly how long it keeps once frozen, from the freezer entry.
  function freezerDays(foodId) {
    var f = byId[foodId];
    if (!f || !f.freezer) return null;
    return num(f.freezer.sealed != null ? f.freezer.sealed : f.freezer.open);
  }

  // The last day you can still freeze a fridge or cupboard item to stop the
  // clock. Freezing before the date on the label keeps it safe (UK FSA / USDA),
  // so the freeze-by day is just its use-by. Null if it can't be frozen, is
  // already in the freezer, or has no date.
  function freezeBy(item) {
    if (!item || item.place === "freezer") return null;
    if (!canFreeze(item.food)) return null;
    return useBy(item);
  }

  // A short "use it or freeze it" nudge, shown only when a freezable item is
  // within a couple of days of its date (and not already past). Includes how
  // long it would then keep in the freezer.
  function freezeHint(item, now) {
    if (freezeBy(item) == null) return "";
    var d = daysLeft(item, now);
    if (d == null || d < 0 || d > 2) return "";
    var when = d === 0 ? "today" : d === 1 ? "tomorrow" : "in " + d + " days";
    var fd = freezerDays(item.food), keeps = "";
    if (fd != null) {
      var months = Math.round(fd / 30);
      keeps = " It keeps about " + (fd >= 30 ? months + " month" + (months === 1 ? "" : "s") : fd + " days") + " frozen.";
    }
    return "Freeze it by " + when + " to save it." + keeps;
  }

  // Whole days from now (midnight today) until the use-by day. 0 means today,
  // negative means it's past.
  function daysLeft(item, now) {
    var by = useBy(item);
    if (by == null) return null;
    return Math.round((by - startOfDay(now == null ? Date.now() : now)) / DAY);
  }

  // Four buckets the list is grouped and coloured by.
  function bucket(item, now) {
    var d = daysLeft(item, now);
    if (d == null) return "unknown";
    if (d < 0) return "gone";
    if (d <= 1) return "now";   // today or tomorrow
    if (d <= 3) return "soon";
    return "fresh";
  }

  // Sort a copy of the list so the thing to eat first is on top. Past-date
  // items stay at the very top (deal with them first); unknowns sink.
  function rank(items, now) {
    return items.slice().sort(function (a, b) {
      var da = daysLeft(a, now), db = daysLeft(b, now);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }

  // A short count for the mascot and summary line: how many need eating in the
  // next three days, and how many are already past.
  function summary(items, now) {
    var soon = 0, gone = 0;
    items.forEach(function (it) {
      var b = bucket(it, now);
      if (b === "gone") gone++;
      else if (b === "now" || b === "soon") soon++;
    });
    return { total: items.length, soon: soon, gone: gone };
  }

  // Plain words for "how long left", for the page and screen readers.
  function phrase(item, now) {
    var d = daysLeft(item, now);
    if (d == null) return "No date yet";
    if (d < 0) return d === -1 ? "1 day past" : (-d) + " days past";
    if (d === 0) return "Use today";
    if (d === 1) return "Use by tomorrow";
    return d + " days left";
  }

  return {
    DAY: DAY,
    foods: FOODS,
    places: PLACES,
    food: function (id) { return byId[id] || null; },
    startOfDay: startOfDay,
    keepDays: keepDays,
    placesFor: placesFor,
    canFreeze: canFreeze,
    freezerDays: freezerDays,
    freezeBy: freezeBy,
    freezeHint: freezeHint,
    useBy: useBy,
    opensShorten: opensShorten,
    thawedKeepDays: thawedKeepDays,
    thawShorten: thawShorten,
    advice: advice,
    dateKind: dateKind,
    kindNote: kindNote,
    daysLeft: daysLeft,
    bucket: bucket,
    rank: rank,
    summary: summary,
    phrase: phrase
  };
});
