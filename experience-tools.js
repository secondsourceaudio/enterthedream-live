/* Share links to a visual mode and playback position. */
(() => {
    'use strict';
    const experience = window.SecondSourceExperience;
    const space = document.querySelector('[data-experience]');
    if (!experience || !space) return;
    const share = space.querySelector('[data-copy-link]');
    const notice = space.querySelector('[data-tools-status]');
    const announce = message => { notice.textContent = message; };

    function shareURL() {
        const url = new URL(document.querySelector('link[rel="canonical"]').href);
        if (experience.visualMode) url.searchParams.set('mode', experience.visualMode);
        const time = Math.floor(experience.shareTime * 100) / 100;
        if (time > 0) url.searchParams.set('t', String(time));
        return url.href;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'experience-info share-dialog';
    dialog.setAttribute('aria-labelledby', 'share-title');
    dialog.innerHTML = '<div class="info-heading"><h2 id="share-title">SHARE</h2>' +
        '<button class="experience-button" type="button" data-close-share aria-label="Close sharing">CLOSE</button></div>' +
        '<label class="share-label" for="share-url">Copy this link</label>' +
        '<input id="share-url" class="share-url" type="url" readonly spellcheck="false">' +
        (space.querySelector('audio') ? '<p>Mode and track position are included. Playback starts after pressing play.</p>'
            : '<p>Share this source.</p>');
    const linkInput = dialog.querySelector('input');
    dialog.querySelector('[data-close-share]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => share.focus({preventScroll: true}));
    linkInput.addEventListener('focus', () => linkInput.select());

    share.addEventListener('click', async () => {
        const url = shareURL();
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(url);
            announce('Link copied.');
        } catch {
            linkInput.value = url;
            if (!dialog.isConnected) space.append(dialog);
            dialog.showModal();
            linkInput.focus();
            linkInput.select();
        }
    });

    if (space.querySelector('audio') && experience.shareTime > 0) {
        const seconds = Math.floor(experience.shareTime);
        announce(`Ready at ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}. Press play to start.`);
    }
})();
