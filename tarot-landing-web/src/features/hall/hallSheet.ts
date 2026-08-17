/* hall.css carries global rules — html,body{overflow:hidden}, the body
   background, a bare h1 — so it must not stay live once the hall leaves the
   screen or it restyles every other page. Each hall screen switches it on when
   it mounts and off when it unmounts.

   This lives in one place because it has to be symmetric. When it did not, the
   entry hall disabled the sheet on its way out and the reading room mounted
   with no styling at all: the room rendered as bare text on black. Nothing in
   the stylesheet itself is modified — only whether the browser applies it. */
export function setHallSheetEnabled(on: boolean) {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = (sheet as CSSStyleSheet).cssRules; } catch { continue; }
    for (const r of Array.from(rules)) {
      if ((r as CSSStyleRule).selectorText === ".orbfix") {
        (sheet as CSSStyleSheet).disabled = !on;
        return;
      }
    }
  }
}
