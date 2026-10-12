# SECOND SOURCE

A static site for artwork, sound, and audiovisual studies. It runs directly on
GitHub Pages and needs no build step or production dependencies.

## Local development

From the repository root:

```sh
python3 -m http.server 8000
```

Open the local server in your browser. The homepage is the liquid study;
`experiment.html` is the ripple study; `experiments.html` collects both.
`gallery.html` is the image archive. `src001.html` remains a work-in-progress
release page and is not linked from the public navigation.

## Listening and viewing

Both studies load silently. Select **Enter with sound** to play the bundled
Sage Counsel track. Audio is analyzed in the browser; low-frequency energy
gently influences the liquid movement. Volume is applied through a gain node
when Web Audio is available, including on iOS. The sound button pauses and
resumes playback. No audio context or audio download starts before that button
is selected. Playback does not start automatically when following a page link.

**Motion off** shows the original image and stops the rendering loop. Reduced
motion preferences select this view by default; a visitor can explicitly enable
animation. Rendering also pauses while the artwork is offscreen or the tab is
hidden. If WebGL is unavailable, the original artwork remains available.

**Fullscreen** enters browser fullscreen where supported and falls back to a
fullscreen view within the page otherwise. Viewing and sound controls stay
available; use Exit fullscreen or Escape to return. **Info** opens notes about
the study and sound. Information and artwork viewers support keyboard focus
and restore it when closed.

`experience.js` and `experience.css` provide the shared controls. The two
existing renderer scripts retain their different pointer and ripple effects.
`site.js` handles internal-link fades, browser Back navigation, and artwork
viewer focus. Reduced-motion preferences disable the page and gallery fades.

## Validation

The browser suite needs Python Playwright and Chromium (already installed in
the prepared cloud environment). With the local server running:

```sh
python3 tests/browser_smoke.py
```

Use `SITE_BASE_URL` for a different server URL and `CHROMIUM_PATH` for a
different Chromium executable. On a Mac, install the optional test tools into
a virtual environment with `python -m pip install playwright`, then run
`python -m playwright install chromium` and set `CHROMIUM_PATH` to that browser's
executable. These tools are not needed to run or publish the site.

The checks cover opt-in audio, actual audio analysis and shader response,
volume and pause, pointer interaction, motion preferences and rendering pauses,
native and fallback fullscreen, keyboard dialogs, all seven gallery images,
navigation and Back, mobile layouts, and audio/storage/WebGL failure paths.

The image conversion tool is `scripts/optimize_images.py`. Use `--dry-run` to
preview changes before converting any additional PNG or JPEG artwork.
