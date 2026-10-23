/* Keep the original audio session while navigating the three public text pages.
 * Each URL remains a complete static page for direct visits and search engines.
 * Nothing resumes from storage, another tab, a reload, or a new visit.
 */
(() => {
    'use strict';
    if (!/^https?:$/.test(location.protocol) || location.pathname !== '/') return;
    const home = document.querySelector('main.landing-experiment');
    const space = home?.querySelector('[data-experience]');
    const audio = space?.querySelector('audio');
    const player = space?.querySelector('.compact-player');
    if (!audio || !player) return;
    const playerSlot = player.parentElement;
    const sound = player.querySelector('[data-sound]');
    const paths = new Set(['/', '/releases/', '/merch/', '/about/']);
    const metadataSelector = 'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[type="application/ld+json"]';
    const normalPath = path => path === '/index.html' ? '/' : path;
    const views = new Map();
    const styles = new Map([...document.querySelectorAll('link[rel="stylesheet"]')].map(link => [link.href, Promise.resolve()]));
    let enabled = false;
    let dismissed = false;
    let current = '/';
    let sequence = 0;
    let pending = null;
    const storage = document.createElement('div');
    storage.className = 'src-home-storage';
    storage.hidden = true;
    storage.inert = true;
    document.body.append(storage);

    const corner = document.createElement('aside');
    corner.className = 'src-corner-player';
    corner.dataset.cornerPlayer = '';
    corner.setAttribute('aria-label', 'Music player');
    corner.hidden = true;
    corner.innerHTML = '<div data-nosnippet><div class="src-corner-summary">' +
        '<button class="src-corner-button" type="button" data-corner-play></button>' +
        '<a class="src-corner-track" href="/" title="Return to artwork"><span class="src-corner-artist"></span><span class="src-corner-title"></span></a>' +
        '<button class="src-corner-button" type="button" data-corner-expand aria-expanded="false" aria-controls="src-corner-detail" aria-label="Expand player" title="Expand player"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 10 5-5 5 5-1.5 1.5L8 8l-3.5 3.5Z"/></svg></button>' +
        '<button class="src-corner-button" type="button" data-corner-close aria-label="Stop music and close player" title="Stop music and close player"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 3 4 4 4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4-4-4Z"/></svg></button>' +
        '</div><div id="src-corner-detail" class="src-corner-detail" hidden></div></div>';
    document.body.append(corner);
    const detail = corner.querySelector('.src-corner-detail');
    const play = corner.querySelector('[data-corner-play]');
    const expand = corner.querySelector('[data-corner-expand]');

    function updateMini() {
        const title = audio.dataset.trackTitle || player.querySelector('.player-track-name').textContent;
        corner.querySelector('.src-corner-title').textContent = title;
        corner.querySelector('.src-corner-artist').textContent = player.querySelector('.player-artist').textContent;
        play.setAttribute('aria-label', sound.disabled ? 'Loading sound' : `${audio.paused ? 'Play' : 'Pause'} ${title}`);
        play.title = play.getAttribute('aria-label');
        play.disabled = sound.disabled;
        play.innerHTML = audio.paused
            ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3 13 8 5 13Z"/></svg>'
            : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>';
        corner.hidden = current === '/' || dismissed;
        document.body.classList.toggle('has-continuous-player', !corner.hidden);
    }
    function collapse() {
        detail.hidden = true;
        expand.setAttribute('aria-expanded', 'false');
        expand.setAttribute('aria-label', 'Expand player');
        expand.title = 'Expand player';
        expand.querySelector('svg').style.transform = '';
    }
    play.addEventListener('click', () => sound.click());
    expand.addEventListener('click', () => {
        const open = detail.hidden;
        detail.hidden = !open;
        expand.setAttribute('aria-expanded', String(open));
        expand.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} player`);
        expand.title = expand.getAttribute('aria-label');
        expand.querySelector('svg').style.transform = open ? 'rotate(180deg)' : '';
    });
    corner.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !detail.hidden) {
            event.preventDefault();
            collapse();
            expand.focus();
        }
    });
    corner.querySelector('[data-corner-close]').addEventListener('click', () => {
        dismissed = true;
        audio.pause();
        collapse();
        updateMini();
        document.querySelector('body > main')?.focus({preventScroll: true});
    });

    function snapshot(doc, main) {
        return {
            main,
            header: doc.querySelector('.site-header').cloneNode(true),
            footer: doc.querySelector('.legal-footer').cloneNode(true),
            metadata: [...doc.head.querySelectorAll(metadataSelector)].map(node => node.cloneNode(true)),
            title: doc.title,
            bodyClass: doc.body.className,
            htmlClass: doc.documentElement.className,
            lang: doc.documentElement.lang,
            styles: [...doc.head.querySelectorAll('link[rel="stylesheet"]')].map(link => new URL(link.getAttribute('href'), location.origin).href)
        };
    }
    views.set('/', snapshot(document, home));
    function loadStyle(href) {
        if (styles.has(href)) return styles.get(href);
        const promise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = () => { link.remove(); styles.delete(href); reject(new Error('Styles unavailable')); };
            document.head.append(link);
        });
        styles.set(href, promise);
        return promise;
    }
    async function getView(url, signal) {
        const path = normalPath(url.pathname);
        if (views.has(path)) return views.get(path);
        const response = await fetch(url.href, {signal});
        if (!response.ok) throw new Error('Page unavailable');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const main = doc.querySelector('main');
        const canonical = doc.querySelector('link[rel="canonical"]');
        if (!main || !doc.querySelector('.site-header') || !doc.querySelector('.legal-footer') ||
            !canonical || new URL(canonical.href).pathname !== path) throw new Error('Unexpected page');
        for (const script of main.querySelectorAll('script')) script.remove();
        const view = snapshot(doc, document.importNode(main, true));
        await Promise.all(view.styles.map(loadStyle));
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        views.set(path, view);
        return view;
    }
    function mount(view, path) {
        for (const dialog of home.querySelectorAll('dialog[open]')) dialog.close();
        window.dispatchEvent(new Event('src:beforepagechange'));
        collapse();
        if (path === '/') playerSlot.append(player);
        else detail.append(player);
        const oldMain = document.querySelector('body > main');
        oldMain?.removeAttribute('aria-busy');
        if (oldMain === home) storage.append(home);
        else oldMain?.remove();
        const header = document.querySelector('body > .site-header');
        const footer = document.querySelector('body > .legal-footer');
        header.replaceWith(view.header.cloneNode(true));
        footer.replaceWith(view.footer.cloneNode(true));
        view.main.dataset.sessionPage = '';
        document.querySelector('body > .legal-footer').before(view.main);
        document.body.className = view.bodyClass;
        document.documentElement.className = view.htmlClass;
        document.documentElement.lang = view.lang;
        document.title = view.title;
        for (const node of document.head.querySelectorAll(metadataSelector)) node.remove();
        for (const node of view.metadata) document.head.append(node.cloneNode(true));
        current = path;
        updateMini();
        window.dispatchEvent(new Event('src:playerdockchange'));
        window.dispatchEvent(new Event('site:pagechange'));
        window.dispatchEvent(new Event('resize'));
    }
    async function navigate(url, pop = false, scroll = 0) {
        const request = ++sequence;
        pending?.abort();
        const controller = new AbortController();
        pending = controller;
        if (!pop) history.replaceState({...history.state, srcScroll: scrollY}, '');
        document.body.classList.add('src-route-loading');
        document.querySelector('body > main')?.setAttribute('aria-busy', 'true');
        try {
            const view = await getView(url, controller.signal);
            if (request !== sequence) return;
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (space.classList.contains('is-immersive')) space.querySelector('[data-fullscreen]').click();
            if (request !== sequence) return;
            const path = normalPath(url.pathname);
            mount(view, path);
            if (!pop) history.pushState({srcSession: true, srcScroll: 0}, '', path);
            window.scrollTo(0, pop ? scroll : 0);
            view.main.focus({preventScroll: true});
        } catch (error) {
            if (error.name !== 'AbortError' && request === sequence) location.assign(url.href);
        } finally {
            if (request === sequence) {
                document.body.classList.remove('src-route-loading');
                document.querySelector('body > main')?.removeAttribute('aria-busy');
            }
        }
    }
    audio.addEventListener('play', () => {
        if (!enabled) {
            enabled = true;
            history.replaceState({...history.state, srcSession: true, srcScroll: scrollY}, '');
            history.scrollRestoration = 'manual';
        }
        dismissed = false;
        updateMini();
    });
    for (const event of ['pause', 'playing', 'loadedmetadata', 'error']) audio.addEventListener(event, updateMini);
    new MutationObserver(updateMini).observe(sound, {attributes: true, attributeFilter: ['disabled', 'aria-label']});
    document.addEventListener('click', event => {
        if (!enabled || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const link = event.target.closest('a[href]');
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.search || url.hash || !paths.has(normalPath(url.pathname))) return;
        if (normalPath(url.pathname) === current) return;
        event.preventDefault();
        navigate(url);
    }, true);
    window.addEventListener('popstate', event => {
        if (!enabled) return;
        const url = new URL(location.href);
        if (!event.state?.srcSession || url.search || url.hash || !paths.has(normalPath(url.pathname))) {
            location.reload();
            return;
        }
        navigate(url, true, event.state.srcScroll || 0);
    });
    let scrollTimer = 0;
    window.addEventListener('scroll', () => {
        if (!enabled || scrollTimer) return;
        scrollTimer = setTimeout(() => {
            scrollTimer = 0;
            if (normalPath(location.pathname) === current && !document.body.classList.contains('src-route-loading')) {
                history.replaceState({...history.state, srcScroll: scrollY}, '');
            }
        }, 500);
    }, {passive: true});
    window.addEventListener('pageshow', updateMini);
    updateMini();
})();
