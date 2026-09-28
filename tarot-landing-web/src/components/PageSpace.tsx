/* One screen of height for a page that has not drawn yet. Under the public
   layout it stands in while a page's own file loads, and while "/" sends a
   guest on to the readers list, so the footer stays below the fold instead of
   being drawn at the top and pushed down when the page lands (ROUND35 rank 16:
   the footer's jump was the layout shift on "/"). */
export default function PageSpace() {
  return <div aria-hidden="true" className="min-h-screen" />;
}
