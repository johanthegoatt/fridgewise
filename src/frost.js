// Frost, the little fridge who keeps an eye on your food. Frost watches your
// pointer (or the box you're typing in on a phone), gives a tip when tapped,
// looks worried when something needs eating today, cheers when the list is all
// fresh, and snows a little if you tap five times fast. Everything Frost says
// goes through the bubble's live region, so screen readers hear it too.
(function () {
  "use strict";
  var btn = document.getElementById("frost");
  var bubble = document.getElementById("frost-bubble");
  var dock = document.getElementById("frost-dock");
  var hide = document.getElementById("frost-hide");
  if (!btn) {
    window.Frost = { context: function () {}, react: function () {}, say: function () {} };
    return;
  }

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "sleepy", tipKey = "empty";
  var flashing = false, flashTimer = null, bubbleTimer = null, tapTimes = [], tipIndex = {};
  var greeted = false, cheered = false;

  var TIPS = {
    empty: [
      "Hi, I'm Frost! Add what you bought or cooked and I'll line it up by what to eat first.",
      "No idea how long something keeps? Pick it from the list and I'll fill in the days for you.",
      "Tap Try an example to see how the list works."
    ],
    some: [
      "The ones with a red edge want eating today. Work down from the top.",
      "Put leftovers in the freezer and I'll give you months instead of days.",
      "Tick 'pack is open' when you've opened or cooked something. It never keeps as long after that."
    ],
    worried: [
      "Something's up today. The top of the list is the one to cook or eat first.",
      "If it's already a day or two past, give it a good look and smell before you trust it.",
      "Can't eat it today? Many things go in the freezer and wait for you."
    ],
    fresh: [
      "Nice, nothing's close to turning. I'll shout when something gets near.",
      "Everything's got a few days. Good shop!"
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms || 7000);
  }

  function flash(m, ms) {
    setMood(m);
    flashing = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; setMood(baseMood); }, ms || 1400);
  }

  function play(cls) {
    if (still.matches) return;
    btn.classList.remove("hop", "wobble");
    void btn.offsetWidth;
    btn.classList.add(cls);
  }
  btn.addEventListener("animationend", function () { btn.classList.remove("hop", "wobble"); });

  // Called by the app whenever the list changes. s is the engine summary.
  function context(s) {
    var had = cheered;
    if (!s || s.total === 0) { tipKey = "empty"; baseMood = "sleepy"; cheered = false; }
    else if (s.gone > 0 || s.soon > 0) { tipKey = "worried"; baseMood = "worried"; cheered = false; }
    else { tipKey = "fresh"; baseMood = "happy"; }

    if (!flashing) setMood(baseMood);

    if (tipKey === "fresh" && !had && s && s.total > 0) {
      cheered = true;
      play("hop");
      flash("party", 1500);
      say("All fresh, nothing to rush. I'll keep watch.");
    }
    if (!greeted) {
      greeted = true;
      setTimeout(function () {
        if (!bubble.textContent && baseMood === "sleepy") say(TIPS.empty[0], 9000);
      }, 900);
    }
  }

  function nextTip() {
    var list = TIPS[tipKey] || TIPS.some;
    var i = tipIndex[tipKey] || 0;
    tipIndex[tipKey] = (i + 1) % list.length;
    return list[i];
  }

  btn.addEventListener("click", function () {
    if (dock.classList.contains("tucked")) {
      dock.classList.remove("tucked");
      remember(false);
      say("I'm back! Tap me any time for a tip.");
      play("hop");
      return;
    }
    var now = Date.now();
    tapTimes = tapTimes.filter(function (t) { return now - t < 1600; });
    tapTimes.push(now);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      play("wobble");
      flash("party", 1200);
      snow(14);
      say("Brr! You shook some frost loose.");
      return;
    }
    play("hop");
    if (baseMood === "sleepy") flash("happy", 1500);
    say(nextTip());
  });

  hide.addEventListener("click", function () {
    dock.classList.add("tucked");
    bubble.textContent = "";
    remember(true);
  });

  function remember(tucked) {
    try { localStorage.setItem("fridgewise.frostTucked", tucked ? "1" : ""); } catch (e) {}
  }
  try { if (localStorage.getItem("fridgewise.frostTucked")) dock.classList.add("tucked"); } catch (e) {}

  // Eyes follow the pointer, a few pixels at most.
  var pupils = btn.querySelectorAll(".f-pupil");
  var target = null, frame = 0;
  function look() {
    frame = 0;
    if (!target) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.33;
    var dx = target.x - cx, dy = target.y - cy;
    var d = Math.hypot(dx, dy) || 1;
    var reach = Math.min(1, d / 200);
    var x = (dx / d) * 3 * reach, y = (dy / d) * 3 * reach;
    pupils.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; });
  }
  window.addEventListener("pointermove", function (ev) {
    target = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });
  document.addEventListener("focusin", function (ev) {
    var r = ev.target.getBoundingClientRect && ev.target.getBoundingClientRect();
    if (!r || ev.target === btn) return;
    target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (!frame) frame = requestAnimationFrame(look);
  });

  (function blink() {
    setTimeout(function () {
      if (baseMood !== "sleepy" && !document.hidden) {
        btn.classList.add("blink");
        setTimeout(function () { btn.classList.remove("blink"); }, 140);
      }
      blink();
    }, 2600 + Math.random() * 3800);
  })();

  // A few snowflakes drift down from Frost.
  function snow(n) {
    if (still.matches) return;
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "flake";
      s.textContent = "❄";
      s.style.left = r.left + r.width * (0.2 + Math.random() * 0.6) + "px";
      s.style.top = r.top + "px";
      s.style.fontSize = (10 + Math.random() * 10) + "px";
      document.body.appendChild(s);
      var dx = (Math.random() - 0.5) * 120, dy = 120 + Math.random() * 180;
      var a = s.animate([
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: "translate(" + dx + "px," + dy + "px) rotate(220deg)", opacity: 0 }
      ], { duration: 1400 + Math.random() * 800, easing: "ease-in" });
      a.onfinish = (function (node) { return function () { node.remove(); }; })(s);
    }
  }

  var lastFocus = "";
  function react(what) {
    var k = String(what);
    if (k.indexOf("focus:") === 0) {
      if (k === lastFocus) return;
      lastFocus = k;
      if (k === "focus:opened") say("Tick this once a pack is open or the food is cooked. It won't keep as long then.", 5000);
      return;
    }
    switch (k) {
      case "example": play("hop"); say("Here's a fridge mid-week. See how the red ones sit at the top?"); break;
      case "added": play("hop"); if (baseMood !== "worried") flash("happy", 1200); say("On the list. I've slotted it in by when to eat it."); break;
      case "added-soon": play("hop"); flash("worried", 1500); say("Added, and that one's close. I've put it near the top."); break;
      case "eaten": play("hop"); flash("party", 1200); snow(5); say("Nice, one less to worry about."); break;
      case "freezer": say("Good call. The freezer stops the clock for weeks."); break;
      case "cleared": say("Cleared the past-date ones. Fresh start."); break;
    }
  }

  window.Frost = { react: react, context: context, say: say };
})();
