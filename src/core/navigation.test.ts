import { describe, expect, test } from "vitest";
import { decideNavigation } from "./navigation.js";

describe("decideNavigation", () => {
  test("the panel's own local documents stay in the app", () => {
    expect(decideNavigation("file:///Applications/Claude Launcher.app/dist/renderer/index.html"))
      .toEqual({ allowInApp: true, openExternally: false });
  });

  test("https goes to the OS browser, never in-app", () => {
    expect(decideNavigation("https://code.claude.com/docs"))
      .toEqual({ allowInApp: false, openExternally: true });
  });

  test("http is blocked outright rather than handed to the browser", () => {
    expect(decideNavigation("http://code.claude.com/docs"))
      .toEqual({ allowInApp: false, openExternally: false });
  });

  test("schemes that can execute or read locally are refused both ways", () => {
    for (const url of [
      "javascript:fetch('/etc/passwd')",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "blob:file:///abc",
    ]) {
      expect(decideNavigation(url), url).toEqual({ allowInApp: false, openExternally: false });
    }
  });

  test("a custom scheme is never handed to the OS handler", () => {
    // shell.openExternal on a custom scheme launches whatever app claims it.
    expect(decideNavigation("x-malware://run")).toEqual({ allowInApp: false, openExternally: false });
  });

  test("an https-looking prefix inside another scheme does not qualify", () => {
    expect(decideNavigation("javascript:void('https://ok')"))
      .toEqual({ allowInApp: false, openExternally: false });
  });
});
