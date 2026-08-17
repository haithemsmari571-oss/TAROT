/* The hall stylesheet is no longer toggled, and must not be.

   It used to be switched off on unmount because hall.css carried global rules
   that would otherwise restyle the whole site. Those rules are now scoped to
   html[data-hall] (styles/hall.css), so they cannot escape a hall screen and
   there is nothing to switch off.

   Toggling is also unsafe now. setHallSheetEnabled located the sheet by looking
   for a rule whose selector is ".orbfix" — and since the room and the dialogs
   import hall.css, that is the MAIN stylesheet. Disabling it would strip the
   CSS from every page on the site. This is kept as a no-op so no caller can
   reintroduce that behaviour by accident. */
export function setHallSheetEnabled(_on: boolean): void {
  /* intentionally does nothing — scoping replaced it */
}
