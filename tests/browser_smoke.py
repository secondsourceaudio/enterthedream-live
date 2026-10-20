"""Functional checks for the static site; start its HTTP server first.

Run: python3 tests/browser_smoke.py
Requires Python Playwright and Chromium. SITE_BASE_URL and CHROMIUM_PATH
override the local server URL and browser executable.
"""
import os
from pathlib import Path
import unittest

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("SITE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
DRAW_COUNTER = """
window.__drawCalls = 0;
const originalDraw = WebGLRenderingContext.prototype.drawArrays;
WebGLRenderingContext.prototype.drawArrays = function (...args) {
    window.__drawCalls++;
    return originalDraw.apply(this, args);
};
"""


def serve_seekable_audio(page):
    """Model GitHub Pages' byte-range support, absent from Python's dev server."""
    data = (Path(__file__).resolve().parents[1] / "audio/sage-counsel.mp3").read_bytes()

    def respond(route):
        headers = {"Content-Type": "audio/mpeg", "Accept-Ranges": "bytes"}
        requested = route.request.headers.get("range", "")
        if requested.startswith("bytes="):
            first, last = requested[6:].split("-", 1)
            start = int(first) if first else max(0, len(data) - int(last))
            end = min(int(last), len(data) - 1) if first and last else len(data) - 1
            if start >= len(data) or end < start:
                route.fulfill(status=416, headers={**headers, "Content-Range": f"bytes */{len(data)}"}, body=b"")
                return
            headers["Content-Range"] = f"bytes {start}-{end}/{len(data)}"
            route.fulfill(status=206, headers=headers, body=data[start:end + 1])
        else:
            route.fulfill(status=200, headers=headers, body=data)

    page.route("**/audio/sage-counsel.mp3", respond)


class WebsiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
            headless=True,
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1000})
        self.context.add_init_script(DRAW_COUNTER)
        self.page = self.context.new_page()
        self.page.set_default_timeout(10000)
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.on("response", lambda response: self.errors.append(
            f"HTTP {response.status}: {response.url}"
        ) if response.status >= 400 else None)

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [], "Browser or HTTP errors")

    def visit(self, path="index.html"):
        response = self.page.goto(f"{BASE_URL}/{path}", wait_until="networkidle")
        self.assertEqual(response.status, 200)
        self.page.evaluate("document.fonts.ready")

    def wait_for_frames(self, count=8):
        self.page.evaluate("""count => new Promise(resolve => {
            function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
            requestAnimationFrame(next);
        })""", count)

    def check_study(self, path):
        audio_requests = []
        self.page.on("request", lambda request: audio_requests.append(request.url)
                     if "/audio/" in request.url else None)
        self.visit(path)
        self.page.wait_for_function("document.querySelector('#visual').classList.contains('is-ready') && window.__drawCalls > 0")
        self.assertEqual(audio_requests, [], "Sound should not download before consent")
        expect(self.page.locator("[data-sound]")).to_have_attribute("aria-label",
            "Play Sage Counsel" if path == "index.html" else "Enter with sound")
        audio = self.page.locator("audio")
        self.assertTrue(audio.evaluate("a => a.paused"))
        art = self.page.locator("#visual-container")
        art.click()
        self.assertTrue(audio.evaluate("a => a.paused"), "Artwork interaction must stay silent")
        box = art.bounding_box()
        self.page.mouse.move(box["x"] + 100, box["y"] + 100)
        self.page.mouse.down()
        self.page.mouse.move(box["x"] + 160, box["y"] + 130, steps=5)
        self.page.mouse.up()
        self.page.locator("[data-sound]").click()
        self.page.wait_for_function("!document.querySelector('audio').paused && document.querySelector('audio').currentTime > 0")
        expect(self.page.locator("[data-sound]")).to_have_attribute("aria-pressed", "true")
        audio.evaluate("a => { a.currentTime = 30; }")
        self.page.wait_for_function("window.SecondSourceExperience.sampleBass() > 0.01")
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('canvas').getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(program, gl.getUniformLocation(program, 'u_sound')) > 0.01;
        }""")
        self.page.locator("[data-volume]").fill("0.5")
        expect(self.page.locator("[data-volume-output]")).to_have_text("50%")
        expect(self.page.locator("[data-volume]")).to_have_attribute("aria-valuetext", "50 percent")
        self.assertEqual(self.page.evaluate("localStorage.getItem('second-source-volume')"), "0.5")
        if path == "index.html":
            mute = self.page.locator("[data-mute]")
            mute.click()
            self.assertTrue(audio.evaluate("a => a.muted && !a.paused"))
            self.assertEqual(self.page.evaluate("window.SecondSourceExperience.sampleBass()"), 0)
            expect(self.page.locator("[data-volume-output]")).to_have_text("50%")
            expect(mute).to_have_attribute("aria-label", "Unmute")
            mute.click()
            self.assertFalse(audio.evaluate("a => a.muted"))
            expect(self.page.locator("[data-volume]")).to_have_value("0.5")
        self.page.locator("[data-volume]").fill("0")
        self.assertEqual(self.page.evaluate("window.SecondSourceExperience.sampleBass()"), 0)
        self.page.locator("[data-sound]").click()
        self.assertTrue(audio.evaluate("a => a.paused"))
        expect(self.page.locator("[data-sound]")).to_have_attribute("aria-pressed", "false")

    def test_landing_sound_and_actual_audio_reactivity(self):
        self.check_study("index.html")

    def test_timeline_waits_for_play_and_seeks_without_changing_playback(self):
        serve_seekable_audio(self.page)
        audio_requests = []
        self.page.on("request", lambda request: audio_requests.append(request.url)
                     if "/audio/" in request.url else None)
        self.visit()
        seek = self.page.locator("[data-seek]")
        expect(seek).to_be_visible()
        expect(seek).to_be_disabled()
        expect(self.page.locator("[data-current-time]")).to_have_text("0:00")
        expect(self.page.locator("[data-duration]")).to_have_text("--:--")
        self.assertEqual(audio_requests, [], "The timeline must not preload sound")
        self.page.locator("[data-sound]").click()
        expect(seek).to_be_enabled()
        self.page.wait_for_function("document.querySelector('audio').currentTime > 0.1")
        duration = self.page.locator("audio").evaluate("a => a.duration")
        self.assertAlmostEqual(float(seek.get_attribute("max")), duration)
        expect(self.page.locator("[data-duration]")).not_to_have_text("--:--")
        self.page.locator("[data-sound]").click()
        self.assertTrue(self.page.locator("audio").evaluate("a => a.paused"))
        box = seek.bounding_box()
        seek.click(position={"x": box["width"] / 2, "y": box["height"] / 2})
        self.page.wait_for_function("""() => {
            const audio = document.querySelector('audio');
            return !audio.seeking && Math.abs(audio.currentTime - audio.duration / 2) < 2;
        }""")
        self.assertAlmostEqual(self.page.locator("audio").evaluate("a => a.currentTime"), duration / 2, delta=2)
        self.assertTrue(self.page.locator("audio").evaluate("a => a.paused"), "Seeking must keep paused sound paused")
        self.assertIn(" of ", seek.get_attribute("aria-valuetext"))
        seek.focus()
        self.page.keyboard.press("Home")
        self.assertLess(self.page.locator("audio").evaluate("a => a.currentTime"), .2)
        self.page.keyboard.press("ArrowRight")
        self.assertGreater(self.page.locator("audio").evaluate("a => a.currentTime"), 0)
        self.page.locator("[data-sound]").click()
        seek.click(position={"x": box["width"] * .7, "y": box["height"] / 2})
        self.page.wait_for_function("""() => {
            const audio = document.querySelector('audio');
            return !audio.seeking && Math.abs(audio.currentTime - audio.duration * .7) < audio.duration * .03;
        }""")
        self.assertAlmostEqual(self.page.locator("audio").evaluate("a => a.currentTime"), duration * .7, delta=duration * .03)
        self.assertFalse(self.page.locator("audio").evaluate("a => a.paused"))
        seek.focus()
        self.page.keyboard.press("End")
        self.page.wait_for_function("document.querySelector('audio').currentTime < 1")
        self.assertLess(float(seek.input_value()), 1, "The timeline should follow the audio loop")

    def drip_uniforms(self):
        return self.page.evaluate("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            return Array.from({length: 8}, (_, index) =>
                Array.from(gl.getUniform(program, gl.getUniformLocation(program, `u_drips[${index}]`))));
        }""")

    def test_drip_impacts_overlap_and_drag_only_stirs(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        art = self.page.locator('#visual-container')
        box = art.bounding_box()
        art.click(position={'x': box['width'] * .2, 'y': box['height'] * .3})
        art.click(position={'x': box['width'] * .8, 'y': box['height'] * .7})
        self.wait_for_frames(2)
        drops = self.drip_uniforms()
        self.assertAlmostEqual(drops[0][0], .2, places=2)
        self.assertAlmostEqual(drops[0][1], .7, places=2)
        self.assertAlmostEqual(drops[1][0], .8, places=2)
        self.assertAlmostEqual(drops[1][1], .3, places=2)
        self.assertTrue(all(d[2] >= 0 and d[3] == 1 for d in drops[:2]))
        self.page.mouse.move(box['x'] + box['width'] * .25, box['y'] + box['height'] * .5)
        self.page.mouse.down()
        self.wait_for_frames(3)
        self.page.mouse.move(box['x'] + box['width'] * .65, box['y'] + box['height'] * .55, steps=6)
        self.page.mouse.up()
        self.wait_for_frames(3)
        drops = self.drip_uniforms()
        self.assertEqual(sum(d[2] >= 0 for d in drops), 3,
            'The two clicks and initial press create drops; the drag must not add any')
        self.assertTrue(all(d[2] >= 0 and d[3] == 1 for d in drops[:2]))
        energy = self.page.evaluate("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(program, gl.getUniformLocation(program, 'u_whirlEnergy'));
        }""")
        self.assertGreater(energy, .35, 'Dragging should leave a sustained whirl after release')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))

    def test_click_and_small_moves_do_not_start_the_whirl(self):
        self.visit()
        self.page.wait_for_function('window.__drawCalls > 0')
        box = self.page.locator('#visual-container').bounding_box()
        x, y = box['x'] + box['width'] * .5, box['y'] + box['height'] * .5
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        self.page.mouse.move(x + 3, y + 2)
        self.wait_for_frames(5)
        def whirl():
            return self.page.evaluate("""() => {
                const gl = document.querySelector('#visual').getContext('webgl');
                const program = gl.getParameter(gl.CURRENT_PROGRAM);
                return ['u_dragging', 'u_whirlEnergy'].map(name => gl.getUniform(program, gl.getUniformLocation(program, name)));
            }""")
        self.assertEqual(whirl(), [0, 0])
        self.assertGreaterEqual(self.drip_uniforms()[0][2], 0)
        self.page.mouse.move(x + 60, y + 30, steps=5)
        self.wait_for_frames(8)
        self.assertTrue(all(value > .4 for value in whirl()))
        self.page.mouse.up()
        self.page.mouse.down()
        self.wait_for_frames(3)
        self.assertEqual(whirl(), [0, 0], 'A new click must not restart a previous whirl')
        self.page.mouse.up()

    def hold_uniforms(self):
        return self.page.evaluate("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            return ['u_holdStrength', 'u_holdAngle'].map(name =>
                gl.getUniform(program, gl.getUniformLocation(program, name)));
        }""")

    def test_long_press_grows_without_movement_and_coasts_after_release(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .5)
        self.page.mouse.down()
        self.wait_for_frames(2)
        self.assertEqual(self.hold_uniforms(), [0, 0], 'A short tap must stay radial')
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            return gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),
                gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM), 'u_holdStrength')) > .12;
        }""")
        early = self.hold_uniforms()
        self.page.wait_for_function("""early => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > early + .15;
        }""", arg=early[0])
        later = self.hold_uniforms()
        self.assertGreater(later[1], early[1], 'The whirl should keep rotating while stationary')
        self.assertEqual(sum(d[2] >= 0 for d in self.drip_uniforms()), 1, 'Holding must not emit repeated drops')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))
        self.page.mouse.up()
        self.wait_for_frames(3)
        self.assertGreater(self.hold_uniforms()[0], 0, 'The whirl should settle rather than disappear')
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) === 0 &&
                gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) === 0;
        }""", timeout=25000)
        self.page.mouse.down()
        self.wait_for_frames(2)
        self.assertEqual(self.hold_uniforms(), [0, 0], 'A new tap must start fresh')
        self.page.mouse.up()

    def hold_image_difference(self, baseline=False):
        return self.page.evaluate("""baseline => {
            const canvas = document.querySelector('#visual');
            const gl = canvas.getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            const scalars = ['u_time', 'u_motion', 'u_sound', 'u_glitch', 'u_dragging', 'u_whirlEnergy']
                .map(name => { const location = gl.getUniformLocation(p, name);
                    return {location, value: gl.getUniform(p, location)}; });
            const velocity = gl.getUniformLocation(p, 'u_velocity');
            const savedVelocity = gl.getUniform(p, velocity);
            const drips = Array.from({length: 8}, (_, i) => {
                const location = gl.getUniformLocation(p, `u_drips[${i}]`);
                return {location, value: gl.getUniform(p, location)};
            });
            try {
                // Freeze ambient waves and other gestures, leaving the actual held
                // deformation untouched so a shrinking leftover vortex cannot pass.
                for (const {location} of scalars) gl.uniform1f(location, 0);
                gl.uniform2f(velocity, 0, 0);
                for (const {location} of drips) gl.uniform4f(location, .5, .5, -1, 0);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                if (baseline) window.__holdOriginalPixels = pixels;
                let difference = 0, samples = 0;
                for (let i = 0; i < pixels.length; i += 16) {
                    for (let channel = 0; channel < 3; channel++) {
                        difference += Math.abs(pixels[i + channel] - window.__holdOriginalPixels[i + channel]);
                        samples++;
                    }
                }
                return difference / samples;
            } finally {
                for (const {location, value} of scalars) gl.uniform1f(location, value);
                gl.uniform2fv(velocity, savedVelocity);
                for (const {location, value} of drips) gl.uniform4fv(location, value);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }""", baseline)

    def test_long_press_coasts_then_unwinds_to_original_image(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.hold_image_difference(baseline=True)
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .2;
        }""")

        def rotation():
            return self.page.evaluate("""() => {
                const gl = document.querySelector('#visual').getContext('webgl');
                const p = gl.getParameter(gl.CURRENT_PROGRAM);
                return [...['u_holdAngle', 'u_time', 'u_holdStrength'].map(name =>
                    gl.getUniform(p, gl.getUniformLocation(p, name))),
                    ...gl.getUniform(p, gl.getUniformLocation(p, 'u_holdCenter'))];
            }""")

        before = rotation()
        self.wait_for_frames(8)
        peak = rotation()
        forward_speed = (peak[0] - before[0]) / (peak[1] - before[1])
        self.assertGreater(self.hold_image_difference(), 1, 'The held vortex must visibly deform the artwork')
        self.page.mouse.up()
        self.page.wait_for_function("""start => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_time')) > start + .25;
        }""", arg=peak[1])
        coasting = rotation()
        self.assertGreater(coasting[0], peak[0], 'The vortex should keep spinning forward briefly after release')
        self.page.mouse.move(box['x'] + box['width'] * .8, box['y'] + box['height'] * .2)
        self.page.wait_for_function("""angle => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) < angle * .8;
        }""", arg=coasting[0], timeout=25000)
        reversing = rotation()
        self.wait_for_frames(8)
        released = rotation()
        reverse_speed = (reversing[0] - released[0]) / (released[1] - reversing[1])
        self.assertGreater(released[0], 0, 'Release must not snap the image back')
        self.assertGreater(reverse_speed, 0, 'The held whirl should reverse on release')
        self.assertLess(reverse_speed, forward_speed * .6, 'Reversing must be slower than winding up')
        self.assertEqual(released[2:], coasting[2:], 'The field must keep its size and center while unwinding')
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) === 0 &&
                gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) === 0;
        }""", timeout=25000)
        self.assertLess(self.hold_image_difference(), .01,
            'The recovered artwork must match the original pixels, not a faded vortex')

    def test_touch_hold_cancels_for_pinch_and_window_blur(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        session = self.context.new_cdp_session(self.page)
        session.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 2})
        box = self.page.locator('#visual-container').bounding_box()
        points = [{'id': 1, 'x': box['x'] + box['width'] * .4, 'y': box['y'] + box['height'] * .5}]
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': points})
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .08;
        }""")
        points.append({'id': 2, 'x': box['x'] + box['width'] * .6, 'y': points[0]['y']})
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': points})
        self.wait_for_frames(2)
        self.assertEqual(self.hold_uniforms(), [0, 0])
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': points[:1]})
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .08;
        }""")
        self.page.evaluate("window.dispatchEvent(new Event('blur'))")
        self.wait_for_frames(3)
        self.assertEqual(self.hold_uniforms(), [0, 0], 'Losing focus must cancel a held press')
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

    def test_file_preview_embeds_visual_assets_and_handles_mobile_layout(self):
        requests = []
        self.page.on('request', lambda request: requests.append(request.url))
        self.visit('preview.html')
        self.page.wait_for_function('window.__drawCalls > 0')
        self.assertTrue(self.page.locator('#fallback-image').evaluate('e => e.complete && e.naturalWidth > 0'))
        self.assertEqual(self.page.locator('.compact-player').evaluate('e => getComputedStyle(e).display'), 'flex')
        self.assertTrue(self.page.evaluate("document.fonts.check('12px Microgramma')"))
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))
        self.assertTrue(all(url.endswith('/preview.html') or url.startswith('data:') for url in requests), requests)
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
        self.page.locator('[data-info]').click()
        expect(self.page.locator('[data-glitch-toggle]')).to_be_visible()

    def test_drip_keyboard_ripple_pauses_and_ignores_right_click(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        art = self.page.locator('#visual-container')
        art.focus()
        self.page.keyboard.press('Space')
        self.wait_for_frames(2)
        self.assertTrue(self.drip_uniforms()[0][2] >= 0)
        art.click(button='right')
        self.wait_for_frames(2)
        self.assertLess(self.drip_uniforms()[1][2], 0)
        self.page.keyboard.press('Escape')
        self.page.locator('[data-motion-toggle]').click()
        age = self.drip_uniforms()[0][2]
        self.wait_for_frames(10)
        self.assertEqual(self.drip_uniforms()[0][2], age)
        self.page.locator('[data-motion-toggle]').click()
        self.wait_for_frames(2)
        self.assertGreater(self.drip_uniforms()[0][2], age)
        self.assertLess(self.drip_uniforms()[0][2] - age, .15)

    def test_drip_two_finger_zoom_cancels_its_tap(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        session = self.context.new_cdp_session(self.page)
        session.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 2})
        box = self.page.locator('#visual-container').bounding_box()
        x, y, width = box['x'], box['y'] + box['height'] / 2, box['width']
        def touch(kind, points):
            session.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})
        def point(id, fraction):
            return {'id': id, 'x': x + width * fraction, 'y': y}
        touch('touchStart', [point(1, .4)])
        self.wait_for_frames(2)
        self.assertGreaterEqual(self.drip_uniforms()[0][2], 0)
        touch('touchStart', [point(1, .4), point(2, .6)])
        touch('touchMove', [point(1, .3), point(2, .7)])
        self.wait_for_frames(2)
        self.assertLess(self.drip_uniforms()[0][2], 0)
        self.assertAlmostEqual(self.page.locator('#visual-media').evaluate(
            'e => new DOMMatrixReadOnly(getComputedStyle(e).transform).a'), 2, places=1)
        touch('touchEnd', [])
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))

    def test_interference_sound_and_pointer_interaction(self):
        self.check_study("experiment.html")

    def test_static_mode_stops_rendering_and_new_visit_starts_motion(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.locator("[data-motion-toggle]").click()
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")
        before = self.page.evaluate("window.__drawCalls")
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate("window.__drawCalls"), before)
        self.assertEqual(self.page.locator("#visual").evaluate("e => getComputedStyle(e).visibility"), "hidden")
        self.visit("experiment.html")
        expect(self.page.locator("html")).to_have_attribute("data-motion", "on")
        self.page.wait_for_function("window.__drawCalls > 0")

    def test_drip_has_no_visible_label_and_ignores_previous_motion_off(self):
        self.context.add_init_script("localStorage.setItem('second-source-motion', 'off');")
        self.visit()
        expect(self.page.locator("h1")).to_have_text("DRIP")
        self.assertEqual(self.page.locator("h1").evaluate("e => getComputedStyle(e).position"), "absolute")
        expect(self.page.locator(".study-caption, .interaction-cue")).to_have_count(0)
        expect(self.page.locator("html")).to_have_attribute("data-motion", "on")
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.locator("[data-info]").click()
        expect(self.page.locator("#info-title")).to_have_text("DRIP")

    def test_experiments_have_distinct_previews_and_preview_is_silent(self):
        audio_requests = []
        self.page.on("request", lambda request: audio_requests.append(request.url) if "/audio/" in request.url else None)
        self.visit("experiments.html")
        expect(self.page.locator(".study-card h2").first).to_contain_text("DRIP")
        expect(self.page.locator(".study-card h2").nth(1)).to_contain_text("INTERFERENCE")
        images = self.page.locator(".study-card img").evaluate_all("images => images.map(i => i.getAttribute('src'))")
        self.assertNotEqual(images[0], images[1])
        self.assertTrue(images[1].endswith("interference.svg"))
        before = self.page.evaluate("window.__drawCalls")
        self.page.locator(".study-card").nth(1).hover()
        self.page.wait_for_function("before => window.__drawCalls > before + 4", arg=before)
        self.page.mouse.move(5, 5)
        self.wait_for_frames(3)
        after = self.page.evaluate("window.__drawCalls")
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate("window.__drawCalls"), after)
        self.assertEqual(audio_requests, [])

    def test_interference_keyboard_and_reset(self):
        self.visit("experiment.html")
        self.page.wait_for_function("window.__drawCalls > 0")
        stage = self.page.locator("#visual-container")
        def pointer():
            return self.page.evaluate("""() => {
                const gl=document.querySelector('#visual').getContext('webgl');
                return Array.from(gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM), gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),'u_pointer')));
            }""")
        before = pointer()
        stage.focus()
        self.page.keyboard.press("ArrowLeft")
        self.wait_for_frames(12)
        self.assertLess(pointer()[0], before[0])
        self.page.keyboard.press("Space")
        self.page.locator("[data-reset-field]").click()
        self.wait_for_frames()
        self.assertAlmostEqual(pointer()[0], .67, places=3)
        self.assertAlmostEqual(pointer()[1], .52, places=3)
        time = self.page.evaluate("""() => {
            document.querySelector('[data-reset-field]').click();
            return new Promise(resolve => requestAnimationFrame(() => {
                const gl=document.querySelector('#visual').getContext('webgl');
                resolve(gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM), gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),'u_time')));
            }));
        }""")
        self.assertLess(time, .15)
        self.assertEqual(self.page.locator("audio source").get_attribute("src"), "./audio/tone-field.mp3")

    def test_field_preview_respects_reduced_motion(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.visit("experiments.html")
        self.page.locator(".study-card").nth(1).hover()
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate("window.__drawCalls"), 0)
        self.assertEqual(self.page.locator(".field-preview-canvas").evaluate("e => getComputedStyle(e).visibility"), "hidden")

    def test_touch_devices_get_an_appropriate_preview_instruction(self):
        context = self.browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        try:
            page=context.new_page()
            page.goto(BASE_URL+'/experiments.html',wait_until='networkidle')
            expect(page.locator('.preview-touch')).to_be_visible()
            expect(page.locator('.preview-desktop')).not_to_be_visible()
            page.locator('.study-card').nth(1).tap()
            page.wait_for_url('**/experiment.html')
            page.locator('#visual-container').tap()
            expect(page.locator('[data-reset-field]')).to_be_visible()
        finally:
            context.close()

    def test_drip_motion_starts_on_and_keeps_the_visitors_toggle_choice(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.visit()
        expect(self.page.locator("html")).to_have_attribute("data-motion", "on")
        self.page.wait_for_function("window.__drawCalls > 0")
        self.assertEqual(self.page.locator("main").evaluate("e => getComputedStyle(e).animationName"), "none")
        self.page.locator('[data-motion-toggle]').click()
        self.page.emulate_media(reduced_motion="no-preference")
        self.page.emulate_media(reduced_motion="reduce")
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")
        self.visit('experiment.html')
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")

    def test_src_glitch_is_hidden_opt_in_changes_pixels_and_resets_on_reload(self):
        self.visit()
        self.page.wait_for_function('window.__drawCalls > 0')
        toggle = self.page.locator('[data-glitch-toggle]')
        expect(toggle).not_to_be_visible()
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.glitchEnabled'))
        self.page.locator('[data-info]').click()
        toggle.click()
        expect(toggle).to_have_attribute('aria-pressed', 'true')
        self.page.keyboard.press('Escape')
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(program, gl.getUniformLocation(program, 'u_glitch')) > .95;
        }""")
        result = self.page.evaluate("""() => {
            const canvas = document.querySelector('#visual');
            const gl = canvas.getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            const location = gl.getUniformLocation(program, 'u_glitch');
            const previous = gl.getUniform(program, location);
            const read = level => {
                gl.uniform1f(location, level);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                return pixels;
            };
            const normal = read(0), broken = read(1), restored = read(0);
            let changed = 0, samples = 0, restoredDifference = 0, difference = 0;
            for (let i = 0; i < normal.length; i += 64) {
                samples++;
                const delta = Math.abs(normal[i] - broken[i]) + Math.abs(normal[i+1] - broken[i+1]) + Math.abs(normal[i+2] - broken[i+2]);
                if (delta > 6) changed++;
                difference += delta;
                restoredDifference += Math.abs(normal[i] - restored[i]);
            }
            gl.uniform1f(location, previous);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            return {fraction: changed / samples, restoredDifference, mean: difference / (samples * 3)};
        }""")
        self.assertGreater(result['fraction'], .05)
        self.assertGreater(result['mean'], .5)
        self.assertLess(result['mean'], 35, 'Glitch should preserve the original artwork and palette')
        self.assertEqual(result['restoredDifference'], 0)
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))
        self.page.locator('[data-motion-toggle]').click()
        draws = self.page.evaluate('window.__drawCalls')
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate('window.__drawCalls'), draws)
        self.page.locator('[data-motion-toggle]').click()
        self.page.locator('[data-info]').click()
        toggle.click()
        expect(toggle).to_have_attribute('aria-pressed', 'false')
        self.page.keyboard.press('Escape')
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(program, gl.getUniformLocation(program, 'u_glitch')) < .05;
        }""")
        self.page.locator('[data-info]').click()
        toggle.click()
        self.visit()
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.glitchEnabled'))
        expect(toggle).to_have_attribute('aria-pressed', 'false')

    def test_fullscreen_and_information_keep_controls_accessible(self):
        self.visit()
        button = self.page.locator("[data-fullscreen]")
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        self.assertTrue(self.page.evaluate("document.fullscreenElement === document.querySelector('[data-experience]')"))
        self.assertTrue(self.page.locator("header").evaluate("e => e.inert"))
        self.page.locator("[data-info]").click()
        expect(self.page.locator("dialog")).to_be_visible()
        self.page.keyboard.press("Escape")
        expect(self.page.locator("dialog")).not_to_be_visible()
        expect(button).to_have_attribute("aria-pressed", "true")
        button.click()
        expect(button).to_have_attribute("aria-pressed", "false")
        self.assertFalse(self.page.locator("header").evaluate("e => e.inert"))

    def test_fullscreen_fallback_escape_and_focus(self):
        self.visit()
        self.page.locator("[data-experience]").evaluate("e => { e.requestFullscreen = () => Promise.reject(new Error('Unavailable')); }")
        button = self.page.locator("[data-fullscreen]")
        button.click()
        expect(self.page.locator("[data-experience]")).to_have_class("listening-space is-immersive")
        self.assertIsNone(self.page.evaluate("document.fullscreenElement"))
        self.page.keyboard.press("Escape")
        expect(button).to_have_attribute("aria-pressed", "false")
        expect(button).to_be_focused()

    def test_information_dialog_restores_keyboard_focus(self):
        self.visit()
        button = self.page.locator("[data-info]")
        button.click()
        close = self.page.locator("[data-close-info]")
        expect(close).to_be_focused()
        self.page.keyboard.press("Tab")
        self.assertTrue(self.page.evaluate("document.querySelector('dialog').contains(document.activeElement) || document.activeElement === document.body"))
        self.page.keyboard.press("Escape")
        expect(button).to_be_focused()

    def test_gallery_images_viewer_and_focus(self):
        self.visit("gallery.html")
        buttons = self.page.locator(".archive-image-button")
        self.assertEqual(buttons.count(), 7)
        self.assertEqual(buttons.first.inner_text(), "")
        self.assertTrue(buttons.evaluate_all("buttons => buttons.every(b => b.getBoundingClientRect().height > 100)"))
        buttons.first.focus()
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#viewer-close")).to_be_focused()
        for index in range(7):
            expect(self.page.locator("#viewer-count")).to_have_text(f"{index + 1:02d} / 07")
            self.page.wait_for_function("document.querySelector('#viewer-image').complete && document.querySelector('#viewer-image').naturalWidth > 0")
            if index < 6:
                self.page.keyboard.press("ArrowRight")
        self.page.keyboard.press("ArrowLeft")
        expect(self.page.locator("#viewer-count")).to_have_text("06 / 07")
        self.page.locator("#viewer-next").focus()
        self.page.keyboard.press("Tab")
        expect(self.page.locator("#viewer-close")).to_be_focused()
        self.page.keyboard.press("Escape")
        expect(buttons.first).to_be_focused()

    def test_release_artwork_viewer(self):
        self.visit("src001.html")
        opener = self.page.locator("#artwork-open")
        opener.click()
        expect(self.page.locator("#viewer-close")).to_be_focused()
        self.page.keyboard.press("Escape")
        expect(opener).to_be_focused()

    def test_experiments_navigation_transitions_and_back(self):
        # Workshop pages remain available by direct URL, outside public navigation.
        self.visit("experiments.html")
        expect(self.page.locator(".study-card")).to_have_count(2)
        self.assertEqual(self.page.locator("body").get_attribute("class"), None)
        self.page.locator(".study-card").nth(1).click()
        self.page.wait_for_url("**/experiment.html")
        self.page.go_back(wait_until="networkidle")
        self.assertNotIn("page-is-leaving", self.page.locator("body").get_attribute("class") or "")

    def test_mobile_layout_and_player_controls(self):
        for width in [320, 390, 768]:
            self.page.set_viewport_size({"width": width, "height": 844})
            for path in ["index.html", "experiment.html", "experiments.html", "gallery.html", "src001.html"]:
                with self.subTest(width=width, path=path):
                    self.visit(path)
                    self.assertLessEqual(self.page.evaluate("document.body.scrollWidth"), width)
                    self.assertTrue(self.page.locator(".site-nav a").evaluate_all(
                        "links => links.every(a => {const r=a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44;})"
                    ))
                    if path in ["index.html", "experiment.html"]:
                        if path == "index.html":
                            seek = self.page.locator("[data-seek]")
                            expect(seek).to_be_visible()
                            seek_box = seek.bounding_box()
                            self.assertGreaterEqual(seek_box["height"], 44)
                            self.assertGreaterEqual(seek_box["x"], 0)
                            self.assertLessEqual(seek_box["x"] + seek_box["width"], width)
                        for control in self.page.locator(".experience-controls button").all():
                            expect(control).to_be_visible()
                            box = control.bounding_box()
                            self.assertGreaterEqual(box["height"], 44)
                            self.assertGreaterEqual(box["x"], 0)
                            self.assertLessEqual(box["x"] + box["width"], width)

    def test_audio_failure_can_retry(self):
        self.page.route("**/audio/**", lambda route: route.abort())
        self.visit()
        self.page.locator("[data-sound]").click()
        expect(self.page.locator("[data-status]")).to_contain_text("could not")
        expect(self.page.locator("[data-sound]")).to_be_enabled()
        self.page.unroute("**/audio/**")
        self.page.locator("[data-sound]").click()
        self.page.wait_for_function("!document.querySelector('audio').paused && document.querySelector('audio').currentTime > 0")

    def test_short_mobile_screen_can_scroll_to_controls(self):
        self.page.set_viewport_size({"width": 320, "height": 568})
        self.visit("experiment.html")
        self.assertEqual(self.page.locator("html").evaluate("e => getComputedStyle(e).overflowY"), "auto")
        self.page.mouse.wheel(0, 1000)
        self.page.wait_for_function("scrollY > 0")
        self.page.locator("[data-info]").click()
        expect(self.page.locator("dialog")).to_be_visible()

    def test_storage_unavailable_does_not_break_controls(self):
        self.context.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Blocked');}});")
        self.visit()
        self.page.locator("[data-volume]").fill("0.6")
        expect(self.page.locator("[data-volume-output]")).to_have_text("60%")
        self.page.locator("[data-motion-toggle]").click()
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")

    def test_webgl_unavailable_keeps_artwork_and_information(self):
        self.context.add_init_script("""
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            return type === 'webgl' ? null : original.call(this, type, ...args);
        };
        """)
        self.visit()
        self.page.wait_for_function("document.querySelector('#fallback-image').naturalWidth > 0")
        expect(self.page.locator("[data-motion-toggle]")).to_be_disabled()
        self.page.locator("[data-info]").click()
        expect(self.page.locator("dialog")).to_be_visible()

    def test_offscreen_artwork_stops_and_resumes_rendering(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.locator("#visual-container").evaluate("e => { e.style.marginTop = '3000px'; }")
        self.wait_for_frames(3)
        before = self.page.evaluate("window.__drawCalls")
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate("window.__drawCalls"), before)
        self.page.locator("#visual-container").evaluate("e => { e.style.marginTop = ''; }")
        self.page.wait_for_function("before => window.__drawCalls > before", arg=before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
