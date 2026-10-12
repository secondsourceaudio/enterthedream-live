/* Page transitions and keyboard-safe artwork viewers. */
(() => {
    "use strict";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let navigating = false;
    document.addEventListener("click", event => {
        const link = event.target.closest("a[href]");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
        const destination = new URL(link.href, location.href);
        if (destination.origin !== location.origin || !/^https?:$/.test(destination.protocol)) return;
        if (destination.pathname === location.pathname && destination.search === location.search) return;
        if (reducedMotion.matches) return;
        event.preventDefault();
        if (navigating) return;
        navigating = true;
        document.body.classList.add("page-is-leaving");
        window.setTimeout(() => location.assign(destination.href), 240);
    });
    window.addEventListener("pageshow", () => {
        navigating = false;
        document.body.classList.remove("page-is-leaving");
    });

    for (const viewer of document.querySelectorAll("[data-artwork-dialog]")) {
        let returnFocus = null;
        const background = new Map();
        const isOpen = () => viewer.getAttribute("aria-hidden") === "false";
        new MutationObserver(() => {
            if (isOpen()) {
                returnFocus = document.activeElement;
                for (const element of document.body.children) {
                    if (element === viewer || element.tagName === "SCRIPT") continue;
                    background.set(element, element.inert);
                    element.inert = true;
                }
                viewer.querySelector("button").focus({ preventScroll: true });
            } else {
                for (const [element, wasInert] of background) element.inert = wasInert;
                background.clear();
                if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
            }
        }).observe(viewer, { attributes: true, attributeFilter: ["aria-hidden"] });
        viewer.addEventListener("keydown", event => {
            if (event.key !== "Tab" || !isOpen()) return;
            const controls = [...viewer.querySelectorAll("button, a[href], input")]
                .filter(element => element.getClientRects().length && !element.disabled);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
    }
})();
