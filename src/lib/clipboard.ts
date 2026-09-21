/**
 * Put text on the clipboard, and say whether it got there.
 *
 * navigator.clipboard only exists in a secure context, so on the dev server
 * reached over the LAN (http, `astro dev --host`) it is undefined; the old
 * textarea-and-execCommand route still works there. When both fail - a browser
 * that refuses without a permission prompt - the caller shows the link for the
 * reader to copy by hand, rather than claiming it was copied.
 *
 * Call this straight from the click, before any await: Safari only allows a
 * clipboard write while the click's user activation is fresh.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older route.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
