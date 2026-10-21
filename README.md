# SECOND SOURCE

A static site for artwork, sound, and audiovisual studies. It runs directly on
GitHub Pages and needs no build step or production dependencies.

## Local development

From the repository root:

```sh
python3 -m http.server 8000
```

Open the local server in your browser. The homepage is DRIP, with a WHIRL / FLUID
switch. **SOURCES** in the top navigation opens `experiments.html`, which lists
only FLOWER. `experiment.html` is the public, silent FLOWER fluid source,
using the pink gallery photograph.
`gallery.html` is the image archive. `src001.html` remains a work-in-progress
release page and is not linked from the public navigation. Its cover is a static
image without a link or artwork viewer. The unlisted
`drip-fluid.html` page provides the same DRIP fluid mode on a separate URL. It also
requests that search engines do not index it.

Audio seeking requires a server with HTTP byte-range support, as provided by
GitHub Pages. Python's basic local server supports playback but not seeking.

`preview.html` embeds the homepage artwork, font, styles and scripts for file
viewers that cannot load relative assets. Play streams the existing public track
from GitHub. Rebuild it after homepage changes with `python3 scripts/build_preview.py`.

## Listening and viewing

The homepage starts in **WHIRL**. Select **FLUID** to use the fluid study with the
same DRIP artwork. Switching stays on the page and keeps the audio, playback
position, volume, fullscreen and motion choice. Only the selected renderer runs;
switching clears held gestures and returns the newly selected image to its
starting composition. A mode that cannot render shows the static artwork while
the other mode remains available. The mode is not remembered between visits.

The studies load silently. Select **Play** to play the bundled Sage Counsel
track on DRIP or enable the live sine instrument on FLOWER.
Audio is analyzed in the browser; low-frequency energy gently influences the
artwork. Volume is applied through a gain node
when Web Audio is available, including on iOS. The sound button pauses and
resumes playback. No audio context or audio download starts before that button
is selected. Playback does not start automatically when following a page link.

**Motion off** shows the static artwork and stops the rendering loop. Motion
starts enabled on each DRIP visit, including with reduced-motion preferences.
Other study pages follow reduced-motion preferences. A visitor can explicitly enable animation or turn it off
for the current visit. Volume is remembered; the motion toggle is not. Rendering
also pauses while the artwork is offscreen or the tab is
hidden. If WebGL is unavailable, the original artwork remains available.

**Fullscreen** enters browser fullscreen where supported and falls back to a
fullscreen view within the page otherwise. Viewing and sound controls stay
available; use Exit fullscreen or Escape to return. **Info** opens notes about
the study and sound. Information and artwork viewers support keyboard focus
and restore it when closed.

`experience.js` and `experience.css` provide the shared controls. The DRIP
renderer retains its reflective artwork and pointer effects.
DRIP uses damped ripple crests and troughs for clicks or taps.
Dragging adds no repeated drops or fine ripple bands; it creates a
broader, stronger whirl that follows stirring around the initial touch and
coasts after release. Up to eight click impacts can overlap independently.
A stationary press begins building a separate whirlpool after 450 ms.
Once started, it follows the held pointer smoothly while preserving its
accumulated strength, rotation and spin direction. Its last visible position
stays fixed during the forward coast and reverse after release.
Following is speed-limited to avoid sudden sweeps through the twisted image.
The spin rate stays constant during movement; the field keeps growing, and
stationary buildup eases the rotation toward a faster pace.
Temporary mouse capture loss does not cancel it; release is tracked across the
window, including outside the artwork and through compatibility mouse events.
Dragging from the start remains a separate stirring gesture.
Its reach and rotation increase over the next five seconds, then keep turning
while held. Releasing lets it coast forward for 0.75 seconds, then smoothly reverse
at roughly 40% of its forward speed. Holding right-click on the artwork skips
the coast and boosts the return by 3×, including while left-click is held.
Releasing right-click restores the normal return speed, or resumes winding up
if left-click is still held. Mouse release outside the artwork, blur and motion
off clear the boost. Right-click creates no impact or browser context menu.
On touch devices and narrow screens, **RETURN** appears while the whirlpool is
active. Hold it for the same 3× return boost; it also works with one finger still
on the artwork. Releasing the button resumes winding if the artwork is held.
Its center and reach stay fixed as
the rotation and inward pull return completely to zero, restoring the original
artwork rather than shrinking the vortex away. Pressing again before recovery
resumes the current rotation, size and inward pull without a new impact or a
reset. Holding then builds it up again, with smooth following while held.
A new press after recovery starts fresh. Pinch, loss of focus or turning motion
off clears the held gesture.
The motion settles using elapsed time,
and ripples pause with the motion toggle. Space or Enter on the focused artwork
also creates a ripple. Pinch gestures zoom instead of creating a second impact.
The original compact play/pause, mute and volume player sits beneath DRIP;
it includes a seekable timeline with elapsed time and duration. Metadata and
audio still load only when Play is selected. Seeking with touch, mouse or the
keyboard preserves the current playing or paused state.
DRIP's INFO panel also contains SRC_GLITCH, an opt-in modifier with folded
refraction, occasional small horizontal tears and light channel separation
that preserves the artwork's blue palette.
It starts off on each visit, responds to drag and optional audio, and pauses
with the motion toggle. Turning it off eases back to the original artwork.
Project information stays inside INFO: one short description and a Bandcamp
link, without a personal creator credit.
FLOWER uses the shared fluid renderer with the gallery's `flower_3.webp` image
and an ink material that transports and diffuses its original colours.
`site.js` handles internal-link fades, browser Back navigation, and artwork
viewer focus. Reduced-motion preferences disable the page and gallery fades.

## Fluid studies

The homepage's FLUID mode and `drip-fluid.html` use an oil material: momentum
diffusion, a broad drag footprint, slower force response and low vorticity make
the original DRIP image stretch and coast together. Image coordinates move
through the velocity field, preserving the artwork's detail and blue palette.
Drag to push the image, hold to stir, or
press Space or Enter on the artwork for a central vortex. Holding right-click
or **RETURN** settles the image faster; **RESET** restores it immediately.
`experiment.html` uses an ink material: the photograph's colours are advected and
diffused into soft trails and clouds, with finer, more turbulent stirring.
An activity mask keeps untouched areas sharp and fades back to the original
photograph. Reset reseeds the colour field and restores the exact original image.
FLOWER is silent and has no audio player. Motion off, hidden tabs, static
artwork fallback, fullscreen and information controls work as on the homepage.
The DRIP player keeps its optional track and seek bar. A narrow feather around
the artwork blends its edges into the page, fixed to the frame during zoom.

The fluid kernels in `drip-fluid.js` are adapted from
[Pavel Dobryakov's WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
under the MIT license, retained at the top of that file. Both studies run
locally in the browser and load no third-party scripts. WHIRL keeps its existing
renderer.

Set `data-fluid-material="oil"` or `"ink"` on the fluid container to choose its
behaviour. Both materials use elapsed time and scale input to the simulation
resolution. Oil uses an implicit velocity-diffusion solve; ink carries RGB colour
and an activity mask instead of the oil material's coordinate displacement map.

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
They also check touch RETURN without triggering pinch, fluid image transport,
exact restoration of the original image after RESET, mode switching during
playback, inactive renderers pausing, and independent mode fallback.
FLOWER checks confirm that interaction stays silent and its viewing controls
work without an audio player, including the static fallback.

The image conversion tool is `scripts/optimize_images.py`. Use `--dry-run` to
preview changes before converting any additional PNG or JPEG artwork.

## Local studio revision

SOURCES presents only FLOWER with the pink photograph and its ink simulation.
The index uses a static, silent image preview.
Reduced motion shows the original photograph
on FLOWER until motion is enabled. The homepage artwork has no visible title or
instruction overlay.

INTERFERENCE and its vector fallback have been removed. SOURCES and FLOWER are
public; the release draft and the standalone DRIP fluid URL remain unlisted.
