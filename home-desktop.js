(() => {
    'use strict';

    const desktopPointer = window.matchMedia('(min-width: 981px) and (pointer: fine)');
    const stage = document.querySelector('[data-experience]');
    if (!stage) return;

    let topLayer = 10;
    for (const windowElement of stage.querySelectorAll('[data-home-window]')) {
        const handle = windowElement.querySelector('[data-home-window-handle]');
        if (!handle) continue;

        const original = {
            left: getComputedStyle(windowElement).left,
            right: getComputedStyle(windowElement).right,
            top: getComputedStyle(windowElement).top,
            bottom: getComputedStyle(windowElement).bottom
        };
        let drag = null;

        const bringForward = () => {
            topLayer += 1;
            windowElement.style.zIndex = String(topLayer);
        };
        const reset = () => {
            Object.assign(windowElement.style, original);
            windowElement.style.zIndex = '';
        };
        const move = (left, top) => {
            const bounds = stage.getBoundingClientRect();
            const maxLeft = Math.max(0, bounds.width - windowElement.offsetWidth);
            const maxTop = Math.max(42, bounds.height - windowElement.offsetHeight);
            windowElement.style.left = `${Math.max(0, Math.min(maxLeft, left))}px`;
            windowElement.style.right = 'auto';
            windowElement.style.top = `${Math.max(0, Math.min(maxTop, top))}px`;
            windowElement.style.bottom = 'auto';
        };

        windowElement.addEventListener('pointerdown', bringForward);
        handle.addEventListener('dblclick', reset);
        handle.addEventListener('pointerdown', event => {
            if (!desktopPointer.matches || event.button !== 0) return;
            const bounds = stage.getBoundingClientRect();
            const rect = windowElement.getBoundingClientRect();
            drag = { x: event.clientX, y: event.clientY, left: rect.left - bounds.left, top: rect.top - bounds.top };
            bringForward();
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!drag) return;
            move(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
        });
        const stop = () => { drag = null; };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
        handle.addEventListener('keydown', event => {
            if (!desktopPointer.matches) return;
            if (event.key === 'Home') { reset(); event.preventDefault(); return; }
            const shifts = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
            if (!shifts[event.key]) return;
            const bounds = stage.getBoundingClientRect();
            const rect = windowElement.getBoundingClientRect();
            move(rect.left - bounds.left + shifts[event.key][0], rect.top - bounds.top + shifts[event.key][1]);
            bringForward();
            event.preventDefault();
        });
    }
})();
