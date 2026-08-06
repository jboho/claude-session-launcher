/**
 * What to do with a URL the panel tries to open or navigate to. The panel's own documents
 * are local files; anything else is either the docs link in the not-found banner (belongs in
 * the user's browser) or something unexpected (belongs nowhere).
 */
export interface NavigationDecision {
  /** Allow the panel window itself to navigate there. Only its own local files qualify. */
  allowInApp: boolean;
  /** Hand off to the OS browser. Only https — never file:, and never a custom scheme. */
  openExternally: boolean;
}

export function decideNavigation(url: string): NavigationDecision {
  if (url.startsWith("file://")) return { allowInApp: true, openExternally: false };
  return { allowInApp: false, openExternally: url.startsWith("https://") };
}
