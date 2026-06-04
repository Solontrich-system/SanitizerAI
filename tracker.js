/* ============================================================
   SanitizerAI — tracker.js  (Supabase edition)
   Add ONE line before </body> in index.html:
     <script src="tracker.js"></script>
   Visitor-specific data stays local. Only anonymous
   visit counts + page/device/browser/country go to Supabase.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://crzsvychxplwailuchsj.supabase.co";
  var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyenN2eWNoeHBsd2FpbHVjaHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTYwMDYsImV4cCI6MjA5NjE3MjAwNn0.nXg3bCxBXd59246UzHYHJR5qS0KmWGi579LRU254CXY";

  // ── Helpers ──────────────────────────────────────────────
  function detectDevice() {
    var ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
    if (/iPad|Tablet/i.test(ua)) return "tablet";
    return "desktop";
  }

  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/Edg\//i.test(ua))        return "Edge";
    if (/OPR|Opera/i.test(ua))    return "Opera";
    if (/Chrome/i.test(ua))       return "Chrome";
    if (/Firefox/i.test(ua))      return "Firefox";
    if (/Safari/i.test(ua))       return "Safari";
    return "Other";
  }

  function detectCountry() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      var map = {
        "Africa/Johannesburg":"ZA","Africa/Cape_Town":"ZA",
        "America/New_York":"US","America/Chicago":"US",
        "America/Los_Angeles":"US","America/Denver":"US",
        "Europe/London":"GB","Europe/Paris":"FR",
        "Europe/Berlin":"DE","Europe/Amsterdam":"NL",
        "Asia/Singapore":"SG","Africa/Accra":"GH",
        "Australia/Sydney":"AU","Asia/Tokyo":"JP",
        "Asia/Dubai":"AE","America/Sao_Paulo":"BR"
      };
      return map[tz] || tz.split("/")[0] || "Unknown";
    } catch (e) { return "Unknown"; }
  }

  // Session ID — new per browser tab, not stored anywhere permanent
  function sessionId() {
    try {
      var sid = sessionStorage.getItem("sai_sid");
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("sai_sid", sid);
      }
      return sid;
    } catch(e) {
      return Math.random().toString(36).slice(2);
    }
  }

  // ── Send to Supabase ──────────────────────────────────────
  function track(page) {
    var payload = {
      page:       page,
      referrer:   document.referrer
                    ? (new URL(document.referrer).hostname || "direct")
                    : "direct",
      device:     detectDevice(),
      browser:    detectBrowser(),
      country:    detectCountry(),
      session_id: sessionId()
    };

    fetch(SUPABASE_URL + "/rest/v1/page_views", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Prefer":        "return=minimal"
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function() {});  // silent fail — never break the main site
  }

  // ── Track initial page load ───────────────────────────────
  var currentPage = location.pathname + (location.hash || "");
  track(currentPage);

  // ── Track in-app tab switches (SPA nav) ───────────────────
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-target]");
    if (!btn) return;
    var target = btn.dataset.target;
    if (target) track("#" + target);
  });

})();
