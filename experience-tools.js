/* Local frame exports and links to a visual mode and playback position. */
(() => {
    'use strict';
    const experience = window.SecondSourceExperience;
    const space = document.querySelector('[data-experience]');
    if (!experience || !space) return;
    const save = space.querySelector('[data-save-frame]');
    const share = space.querySelector('[data-copy-link]');
    const notice = space.querySelector('[data-tools-status]');
    const title = space.querySelector('h1').textContent.trim();
    const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
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

    save.addEventListener('click', async () => {
        save.disabled = true;
        announce('Saving frame…');
        try {
            const canvas = experience.captureFrame();
            const blob = await new Promise((resolve, reject) => canvas.toBlob(
                value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png'));
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const mode = experience.visualMode || 'fluid';
            link.href = url;
            link.download = `second-source-${filename}-${mode}-${Date.now()}.png`;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            announce('Frame saved.');
        } catch {
            announce('Frame could not be saved. Please try again once the artwork is ready.');
        } finally {
            save.disabled = false;
        }
    });
    if (space.querySelector('audio') && experience.shareTime > 0) {
        const seconds = Math.floor(experience.shareTime);
        announce(`Ready at ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}. Press play to start.`);
    }
})();
