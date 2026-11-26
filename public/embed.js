/*
 * Recruit on a university site:
 *   <script src="https://<this app>/embed.js" data-platform="<platform key>" async></script>
 * Optional: data-label (button text), data-color (button colour).
 * The site's origin must be listed under Recruit > Website, or the frame stays blank.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var platform = script.getAttribute("data-platform");
  if (!platform) {
    console.error("Recruit: the embed script needs a data-platform attribute.");
    return;
  }
  var app = new URL(script.src).origin;
  var label = script.getAttribute("data-label") || "Ask admissions";
  var layer = "position:fixed;right:20px;z-index:2147483000;";
  var frame = null;

  var button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    layer +
    "bottom:20px;border:0;border-radius:999px;padding:12px 18px;cursor:pointer;color:#fff;" +
    "font:500 15px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18);background:" +
    (script.getAttribute("data-color") || "#0058cc");

  button.addEventListener("click", function () {
    if (frame) {
      frame.hidden = !frame.hidden;
    } else {
      frame = document.createElement("iframe");
      frame.title = label;
      frame.src = app + "/chat/" + encodeURIComponent(platform) + "?embed=true";
      frame.style.cssText =
        layer +
        "bottom:76px;width:min(400px,calc(100vw - 40px));height:min(640px,calc(100vh - 110px));" +
        "border:1px solid #e5e7eb;border-radius:16px;background:#fff;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.2)";
      document.body.appendChild(frame);
    }
    button.setAttribute("aria-expanded", String(!frame.hidden));
  });
  document.body.appendChild(button);
})();
