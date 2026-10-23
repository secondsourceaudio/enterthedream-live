/* SRC skins, movable windows and a small visual index. Audio stays in its player. */
(() => {
    'use strict';
    const space = document.querySelector('.landing-study [data-experience]');
    const player = space?.querySelector('.compact-player');
    const index = space?.querySelector('#src-index');
    if (!player || !index) return;

    const skins = ['graphite', 'chrome', 'cobalt', 'amber'];
    const skinButton = player.querySelector('[data-skin-cycle]');
    const notice = space.querySelector('[data-tools-status]');
    const announce = text => { notice.textContent = text; };
    let savedSkin;
    try { savedSkin = localStorage.getItem('second-source-player-skin'); } catch { /* Optional preference. */ }
    function setSkin(skin) {
        player.dataset.skin = skin;
        const name = skin[0].toUpperCase() + skin.slice(1);
        skinButton.title = `Skin: ${name}. Select next skin.`;
        skinButton.setAttribute('aria-label', `Change player skin. Current skin: ${name}`);
    }
    setSkin(skins.includes(savedSkin) ? savedSkin : skins[0]);
    skinButton.addEventListener('click', () => {
        const skin = skins[(skins.indexOf(player.dataset.skin) + 1) % skins.length];
        setSkin(skin);
        try { localStorage.setItem('second-source-player-skin', skin); } catch { /* Optional preference. */ }
        announce(`SKIN / ${skin.toUpperCase()}`);
    });

    // Keep the space occupied by a detached player, so the artwork and controls
    // stay put. Move the original node; do not recreate audio or its controls.
    const slot = document.createElement('div');
    slot.className = 'src-player-slot';
    player.before(slot);
    slot.append(player);
    const dock = player.querySelector('[data-dock-player]');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const windows = [];
    function movable(element, handle, name, isPlayer = false) {
        let drag = null;
        const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
        const movableHere = () => finePointer.matches && (!element.matches('dialog') || element.open);
        function place(x, y) {
            const box = element.getBoundingClientRect();
            if (!element.classList.contains('src-floating')) {
                if (isPlayer) {
                    slot.style.width = `${box.width}px`;
                    slot.style.height = `${box.height}px`;
                    slot.classList.add('has-floating-player');
                    element.style.width = `${box.width}px`;
                    dock.hidden = false;
                }
                element.classList.add('src-floating');
            }
            const bounds = element.getBoundingClientRect();
            element.style.left = `${clamp(x, 12, innerWidth - bounds.width - 12)}px`;
            element.style.top = `${clamp(y, 12, innerHeight - bounds.height - 12)}px`;
        }
        function end() {
            if (drag && handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
            drag = null;
            element.classList.remove('src-dragging');
        }
        function reset() {
            end();
            element.classList.remove('src-floating');
            element.style.removeProperty('left');
            element.style.removeProperty('top');
            element.style.removeProperty('width');
            if (isPlayer) {
                slot.classList.remove('has-floating-player');
                slot.style.removeProperty('width');
                slot.style.removeProperty('height');
                dock.hidden = true;
            }
        }
        function configure() {
            handle.classList.toggle('src-draggable', finePointer.matches);
            if (finePointer.matches) {
                handle.tabIndex = 0;
                handle.setAttribute('role', 'group');
                handle.setAttribute('aria-label', `${name} position. Drag or use arrow keys to move; Home returns it.`);
                handle.title = 'Drag to move · Double-click or Home to return';
            } else {
                handle.removeAttribute('tabindex');
                handle.removeAttribute('role');
                handle.removeAttribute('aria-label');
                handle.removeAttribute('title');
                reset();
            }
        }
        handle.addEventListener('pointerdown', event => {
            if (!movableHere() || event.button !== 0 || event.pointerType === 'touch' || event.target.closest('button, a, input')) return;
            const box = element.getBoundingClientRect();
            drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false};
            handle.focus({preventScroll: true});
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        });
        handle.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 4) return;
            drag.moved = true;
            element.classList.add('src-dragging');
            place(drag.left + dx, drag.top + dy);
            event.stopPropagation();
        });
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, end);
        handle.addEventListener('dblclick', event => {
            if (event.target.closest('button, a, input')) return;
            reset();
            announce(`${name.toUpperCase()} / RETURNED`);
        });
        handle.addEventListener('keydown', event => {
            if (event.target !== handle || !movableHere() || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'Home') {
                event.preventDefault();
                reset();
                announce(`${name.toUpperCase()} / RETURNED`);
                return;
            }
            const step = event.shiftKey ? 40 : 12;
            const delta = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]}[event.key];
            if (!delta) return;
            event.preventDefault();
            const box = element.getBoundingClientRect();
            place(box.left + delta[0], box.top + delta[1]);
        });
        function fit() {
            if (element.classList.contains('src-floating')) {
                const box = element.getBoundingClientRect();
                place(box.left, box.top);
                if (isPlayer) slot.style.height = `${element.getBoundingClientRect().height}px`;
            }
        }
        if (element.matches('dialog')) element.addEventListener('close', reset);
        configure();
        finePointer.addEventListener('change', configure);
        windows.push({reset, fit, cancel: end});
        return reset;
    }
    const dockPlayer = movable(player, player.querySelector('[data-player-handle]'), 'Player', true);
    dock.addEventListener('click', () => {
        dockPlayer();
        player.querySelector('[data-player-handle]').focus({preventScroll: true});
        announce('PLAYER / DOCKED');
    });
    movable(space.querySelector('#experience-info'), space.querySelector('[data-info-handle]'), 'Info');
    movable(index, index.querySelector('[data-index-handle]'), 'Index');
    window.addEventListener('resize', () => windows.forEach(window => window.fit()));
    window.addEventListener('experience:immersivechange', () => windows.forEach(window => window.reset()));
    window.addEventListener('blur', () => windows.forEach(window => window.cancel()));
    document.addEventListener('visibilitychange', () => { if (document.hidden) windows.forEach(window => window.cancel()); });

    const openIndex = space.querySelector('[data-open-index]');
    openIndex.addEventListener('click', () => index.showModal());
    index.querySelector('[data-close-index]').addEventListener('click', () => index.close());
    index.addEventListener('close', () => openIndex.focus({preventScroll: true}));
    index.addEventListener('click', event => {
        if (event.target !== index) return;
        const box = index.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) index.close();
    });
    const readout = index.querySelector('[data-index-status]');
    for (const link of index.querySelectorAll('[data-map-label]')) {
        link.addEventListener('pointerenter', () => { readout.textContent = link.dataset.mapLabel; });
        link.addEventListener('focus', () => { readout.textContent = link.dataset.mapLabel; });
        link.addEventListener('pointerleave', () => { readout.textContent = 'SELECT A ROUTE'; });
        link.addEventListener('blur', () => { readout.textContent = 'SELECT A ROUTE'; });
    }
    const polarity = index.querySelector('[data-alternate-state]');
    polarity.addEventListener('click', () => {
        const inverted = space.classList.toggle('src-inverted');
        polarity.setAttribute('aria-pressed', String(inverted));
        polarity.setAttribute('aria-label', inverted ? 'Restore artwork colours' : 'Invert artwork colours');
        index.querySelector('[data-polarity-status]').textContent = `POLARITY / ${inverted ? '−' : '+'}`;
        announce(`POLARITY / ${inverted ? 'INVERTED' : 'ORIGINAL'}`);
    });
    for (const element of space.querySelectorAll('[data-src-enhancement]')) element.hidden = false;
})();
