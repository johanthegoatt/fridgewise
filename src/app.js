// Fridgewise page: build the form, keep the list, and save it in this browser.
// All the real work (keep times, ranking) lives in engine.js so the page and
// the tests agree.
(function () {
  "use strict";
  var FW = window.Fridgewise;
  var KEY = "fridgewise.items.v1";

  var elFood = document.getElementById("food");
  var elPlace = document.getElementById("place");
  var elDate = document.getElementById("date");
  var elOpened = document.getElementById("opened");
  var elOpenWrap = document.getElementById("open-wrap");
  var elCustomWrap = document.getElementById("custom-wrap");
  var elCustom = document.getElementById("custom");
  var elKeeps = document.getElementById("keeps");
  var elPackDate = document.getElementById("pack-date");
  var elPackKind = document.getElementById("pack-kind");
  var form = document.getElementById("form");
  var list = document.getElementById("list");
  var empty = document.getElementById("empty");
  var count = document.getElementById("count");
  var filters = document.getElementById("filters");
  var clearGone = document.getElementById("clear-gone");

  var items = load();
  var filter = "all";

  // ---- build the food picker ----
  var groups = { cooked: "Cooked & leftovers", raw: "Meat & fish", dairy: "Dairy & eggs", produce: "Fruit & veg", pantry: "Bread & cupboard" };
  var order = ["cooked", "raw", "dairy", "produce", "pantry"];
  order.forEach(function (g) {
    var og = document.createElement("optgroup");
    og.label = groups[g];
    FW.foods.filter(function (f) { return f.group === g; }).forEach(function (f) {
      var o = document.createElement("option");
      o.value = f.id; o.textContent = f.name;
      og.appendChild(o);
    });
    elFood.appendChild(og);
  });
  var custom = document.createElement("option");
  custom.value = "custom"; custom.textContent = "Something else…";
  elFood.appendChild(custom);

  function todayStr() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var m = ("0" + (d.getMonth() + 1)).slice(-2), day = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + m + "-" + day;
  }
  elDate.value = todayStr();
  elDate.max = todayStr();

  // ---- react to food choice: fill places, set the opened default ----
  function onFood() {
    var id = elFood.value;
    var isCustom = id === "custom";
    elCustomWrap.classList.toggle("hidden", !isCustom);

    elPlace.innerHTML = "";
    var places = isCustom ? ["fridge", "freezer", "pantry"] : FW.placesFor(id);
    places.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p; o.textContent = FW.places[p];
      elPlace.appendChild(o);
    });
    // Cooked food and open packs start ticked; most raw/sealed does not.
    var f = FW.food(id);
    elOpened.checked = !!(f && f.group === "cooked");
    elOpenWrap.style.display = isCustom ? "none" : "";
    showKeeps();
  }

  // Live "this keeps about N days here" line under the form.
  function showKeeps() {
    var id = elFood.value;
    if (id === "custom") {
      elKeeps.innerHTML = "I'll keep it <strong>7 days</strong> unless you want to change that later.";
      return;
    }
    var place = elPlace.value;
    var days = FW.keepDays(id, place, elOpened.checked);
    if (days == null) { elKeeps.textContent = ""; return; }
    var word = days === 1 ? "about 1 day" : (days < 14 ? "about " + days + " days" : "about " + Math.round(days / 7) + " weeks");
    elKeeps.innerHTML = "In the " + FW.places[place].toLowerCase() + " this keeps <strong>" + word + "</strong>.";
    if (place === "freezer" && window.Frost) Frost.react("freezer");
  }

  elFood.addEventListener("change", onFood);
  elPlace.addEventListener("change", showKeeps);
  elOpened.addEventListener("change", showKeeps);
  elOpened.addEventListener("focus", function () { if (window.Frost) Frost.react("focus:opened"); });
  onFood();

  // ---- add an item ----
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = elFood.value;
    var when = elDate.value ? new Date(elDate.value + "T00:00:00").getTime() : Date.now();
    var item = {
      id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
      food: id,
      place: elPlace.value,
      opened: id === "custom" ? true : elOpened.checked,
      addedAt: when
    };
    if (id === "custom") {
      item.name = (elCustom.value || "").trim() || "Something";
      item.days = 7;
    } else {
      item.name = FW.food(id).name;
    }
    // A date printed on the pack wins over the stored-time guess.
    if (elPackDate && elPackDate.value) {
      item.packDate = new Date(elPackDate.value + "T00:00:00").getTime();
      item.dateKind = elPackKind.value === "best" ? "best" : "use";
    }
    items.push(item);
    save();
    render();
    var soon = FW.bucket(item) === "now" || FW.bucket(item) === "soon" || FW.bucket(item) === "gone";
    if (window.Frost) Frost.react(soon ? "added-soon" : "added");
    // Reset for a quick next add, keeping the date.
    elCustom.value = "";
    if (elPackDate) elPackDate.value = "";
    elFood.value = id === "custom" ? "custom" : elFood.value;
    elFood.focus();
  });

  // ---- example ----
  document.getElementById("example").addEventListener("click", function () {
    var base = FW.startOfDay(Date.now());
    items = [
      ex("leftovers", "fridge", true, base - 2 * FW.DAY),
      ex("milk", "fridge", true, base - 3 * FW.DAY),
      ex("raw-chicken", "fridge", false, base - 0 * FW.DAY),
      ex("berries", "fridge", true, base - 1 * FW.DAY),
      ex("bread", "pantry", false, base - 1 * FW.DAY),
      ex("hard-cheese", "fridge", true, base - 5 * FW.DAY)
    ];
    save();
    render();
    if (window.Frost) Frost.react("example");
  });
  function ex(food, place, opened, addedAt) {
    return { id: "i" + Math.random().toString(36).slice(2, 8), food: food, name: FW.food(food).name, place: place, opened: opened, addedAt: addedAt };
  }

  // ---- filters ----
  filters.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    filter = b.getAttribute("data-place");
    [].forEach.call(filters.children, function (c) { c.classList.toggle("on", c === b); });
    render();
  });

  clearGone.addEventListener("click", function () {
    items = items.filter(function (it) { return FW.bucket(it) !== "gone"; });
    save();
    render();
    if (window.Frost) Frost.react("cleared");
  });

  // ---- render ----
  function render() {
    var shown = items.filter(function (it) { return filter === "all" || it.place === filter; });
    var ranked = FW.rank(shown);

    list.innerHTML = "";
    ranked.forEach(function (it) {
      var b = FW.bucket(it);
      var li = document.createElement("li");
      li.className = "item b-" + b + " i-" + b;
      li.dataset.id = it.id;

      var main = document.createElement("div");
      main.className = "i-main";
      var name = document.createElement("div");
      name.className = "i-name";
      name.textContent = it.name || (FW.food(it.food) ? FW.food(it.food).name : "Food");
      var sub = document.createElement("div");
      sub.className = "i-sub";
      sub.textContent = FW.places[it.place] + (it.opened ? " · open" : "") + (it.packDate ? " · " + (it.dateKind === "best" ? "best-before" : "use-by") + " on pack" : "");
      main.appendChild(name); main.appendChild(sub);

      var tip = FW.advice(it);
      if (tip) {
        var note = document.createElement("div");
        note.className = "i-advice" + (it.dateKind === "best" ? " mild" : "");
        note.textContent = tip;
        main.appendChild(note);
      }

      // Use it or freeze it: a nudge for freezable things close to their date.
      var freeze = FW.freezeHint(it);
      if (freeze) {
        var fnote = document.createElement("div");
        fnote.className = "i-freeze";
        fnote.textContent = freeze;
        main.appendChild(fnote);
      }

      var left = document.createElement("div");
      left.className = "i-left";
      left.textContent = FW.phrase(it);

      var eat = document.createElement("button");
      eat.className = "i-eat"; eat.type = "button"; eat.textContent = "Ate it";
      eat.setAttribute("aria-label", "Mark " + name.textContent + " as eaten");
      eat.addEventListener("click", function () { remove(it.id, "eaten"); });

      var del = document.createElement("button");
      del.className = "i-del"; del.type = "button"; del.innerHTML = "&times;";
      del.setAttribute("aria-label", "Remove " + name.textContent);
      del.addEventListener("click", function () { remove(it.id, null); });

      li.appendChild(main); li.appendChild(left); li.appendChild(eat); li.appendChild(del);
      list.appendChild(li);
    });

    empty.classList.toggle("hidden", items.length > 0);
    list.classList.toggle("hidden", shown.length === 0);

    var s = FW.summary(items);
    var parts = [];
    if (s.gone > 0) parts.push(s.gone + " past date");
    if (s.soon > 0) parts.push(s.soon + " to eat soon");
    count.textContent = s.total === 0 ? "" : (parts.length ? parts.join(" · ") : "all fresh") + " · " + s.total + " in all";
    clearGone.classList.toggle("hidden", s.gone === 0);

    if (window.Frost) Frost.context(s);
  }

  function remove(id, reaction) {
    var li = list.querySelector('[data-id="' + id + '"]');
    function done() {
      items = items.filter(function (it) { return it.id !== id; });
      save();
      render();
      if (reaction && window.Frost) Frost.react(reaction);
    }
    if (li && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      li.classList.add("leaving");
      setTimeout(done, 260);
    } else { done(); }
  }

  // ---- storage ----
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
  }

  render();
})();
