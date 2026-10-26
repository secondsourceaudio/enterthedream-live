/* Enlarged merchandise previews stay inside the SRC OS interface. */
(() => {
    'use strict';
    const viewer = document.querySelector('[data-merch-viewer]');
    if (!viewer || typeof viewer.showModal !== 'function') return;
    const image = viewer.querySelector('[data-merch-viewer-image]');
    const title = viewer.querySelector('[data-merch-viewer-title]');
    const close = viewer.querySelector('[data-merch-close]');
    let returnFocus = null;

    for (const preview of document.querySelectorAll('[data-merch-preview]')) {
        preview.addEventListener('click', event => {
            event.preventDefault();
            returnFocus = preview;
            const source = preview.querySelector('img');
            image.src = preview.href;
            image.alt = source?.alt || '';
            title.textContent = preview.dataset.title || 'MERCH / MOCKUP';
            viewer.showModal();
            close.focus({preventScroll: true});
        });
    }
    function closeViewer() { viewer.close(); }
    close.addEventListener('click', closeViewer);
    viewer.addEventListener('click', event => {
        if (event.target === viewer) closeViewer();
    });
    viewer.addEventListener('close', () => {
        image.removeAttribute('src');
        if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
    });
})();
