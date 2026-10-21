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
window.__drawsByCanvas = {};
const originalDraw = WebGLRenderingContext.prototype.drawArrays;
WebGLRenderingContext.prototype.drawArrays = function (...args) {
    window.__drawCalls++;
    const key = this.canvas.id;
    window.__drawsByCanvas[key] = (window.__drawsByCanvas[key] || 0) + 1;
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

    def start_controlled_drip(self):
        # Advance the renderer explicitly, independently of browser input latency.
        self.context.add_init_script("""(() => {
            let experience;
            Object.defineProperty(window, 'SecondSourceExperience', {
                get: () => experience,
                set(value) {
                    experience = value;
                    value.createRenderLoop = (draw, element) => {
                        if (element.id !== 'visual-container') return;
                        let elapsed = 0;
                        window.__stepDrip = frames => {
                            for (let i = 0; i < frames; i++) draw(elapsed += 1000 / 60);
                        };
                        window.__stepDrip(1);
                    };
                }
            });
        })();""")
        self.visit()
        self.page.wait_for_function("window.__stepDrip && document.querySelector('#visual').classList.contains('is-ready')")

    def step_drip(self, frames):
        return self.page.evaluate("""frames => {
            window.__stepDrip(frames);
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            const value = name => gl.getUniform(p, gl.getUniformLocation(p, name));
            return {strength: value('u_holdStrength'), angle: value('u_holdAngle'),
                time: value('u_time'), center: Array.from(value('u_holdCenter')),
                pull: value('u_holdPull'), spin: value('u_holdSpin')};
        }""", frames)

    def check_study(self, path):
        audio_requests = []
        self.page.on("request", lambda request: audio_requests.append(request.url)
                     if "/audio/" in request.url else None)
        self.visit(path)
        self.page.wait_for_function("document.querySelector('#visual').classList.contains('is-ready') && window.__drawCalls > 0")
        self.assertEqual(audio_requests, [], "Sound should not download before consent")
        expect(self.page.locator("[data-sound]")).to_have_attribute("aria-label",
            "Play Sage Counsel")
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

    def test_flower_stays_silent_and_viewing_controls_work_without_a_player(self):
        requests = []
        self.page.on('request', lambda request: requests.append(request.url))
        self.page.add_init_script("""(() => {
            const Native = window.AudioContext;
            window.__audioContextsCreated = 0;
            window.AudioContext = class extends Native {
                constructor(...args) { super(...args); window.__audioContextsCreated++; }
            };
        })();""")
        self.visit('experiment.html')
        expect(self.page.locator('#visual')).to_have_attribute('data-fluid', 'ready')
        expect(self.page.locator('audio, .compact-player, [data-sound], [data-volume], [data-seek]')).to_have_count(0)
        self.page.locator('#visual-container').click()
        self.page.locator('[data-motion-toggle]').click()
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'off')
        self.assertEqual(self.page.locator('#visual-container').evaluate('e => getComputedStyle(e).touchAction'), 'pan-y pinch-zoom')
        self.page.locator('[data-motion-toggle]').click()
        self.page.locator('[data-fluid-reset]').click()
        self.page.locator('[data-info]').click()
        expect(self.page.locator('dialog')).to_be_visible()
        self.assertNotIn('SOUND', self.page.locator('dialog').inner_text())
        self.page.keyboard.press('Escape')
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-label', 'Exit fullscreen viewing mode')
        self.page.locator('[data-fullscreen]').click()
        self.page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))
        self.assertEqual(self.page.evaluate('window.SecondSourceExperience.sampleBass()'), 0)
        self.assertEqual(self.page.evaluate('window.__audioContextsCreated'), 0)
        self.assertFalse(any('/audio/' in url or 'flower-tone.js' in url for url in requests))

    def test_silent_flower_keeps_info_available_without_webgl(self):
        self.page.add_init_script("""(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                return type === 'webgl' ? null : getContext.call(this, type, ...args);
            };
        })();""")
        self.visit('experiment.html')
        expect(self.page.locator('[data-motion-toggle]')).to_be_disabled()
        expect(self.page.locator('#fallback-image')).to_be_visible()
        self.page.locator('[data-info]').click()
        expect(self.page.locator('dialog')).to_be_visible()
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))

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
        self.start_controlled_drip()
        box = self.page.locator('#visual-container').bounding_box()
        x, y = box['x'] + box['width'] * .5, box['y'] + box['height'] * .5
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        self.page.mouse.move(x + 3, y + 2)
        self.step_drip(5)
        def whirl():
            return self.page.evaluate("""() => {
                const gl = document.querySelector('#visual').getContext('webgl');
                const program = gl.getParameter(gl.CURRENT_PROGRAM);
                return ['u_dragging', 'u_whirlEnergy'].map(name => gl.getUniform(program, gl.getUniformLocation(program, name)));
            }""")
        self.assertEqual(whirl(), [0, 0])
        self.assertGreaterEqual(self.drip_uniforms()[0][2], 0)
        self.page.mouse.move(x + 60, y + 30, steps=5)
        self.step_drip(8)
        self.assertTrue(all(value > .4 for value in whirl()))
        self.page.mouse.up()
        self.page.mouse.down()
        self.step_drip(3)
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

    def test_held_vortex_follows_mouse_without_restarting(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .12;
        }""")

        def state():
            return self.page.evaluate("""() => {
                const gl = document.querySelector('#visual').getContext('webgl');
                const p = gl.getParameter(gl.CURRENT_PROGRAM);
                const value = name => gl.getUniform(p, gl.getUniformLocation(p, name));
                return {strength: value('u_holdStrength'), angle: value('u_holdAngle'),
                    center: Array.from(value('u_holdCenter')), spin: value('u_holdSpin'),
                    dragging: value('u_dragging')};
            }""")

        original = previous = state()
        for x, y in [(.8, .5), (.65, .8), (.2, .5), (.5, .2), (1.1, .8), (.5, .5)]:
            self.page.mouse.move(box['x'] + box['width'] * x, box['y'] + box['height'] * y, steps=3)
            self.wait_for_frames(6)
            current = state()
            target = (min(1, max(0, x)), 1 - min(1, max(0, y)))
            previous_distance = sum((previous['center'][i] - target[i]) ** 2 for i in range(2))
            current_distance = sum((current['center'][i] - target[i]) ** 2 for i in range(2))
            self.assertLess(current_distance, previous_distance, 'The existing vortex must follow the held pointer')
            self.assertTrue(all(0 <= value <= 1 for value in current['center']))
            self.assertEqual(current['spin'], original['spin'], 'A started hold must keep its rotational direction')
            self.assertGreater(current['angle'], previous['angle'], 'The accumulated rotation must keep increasing')
            self.assertGreaterEqual(current['strength'], previous['strength'])
            self.assertEqual(current['dragging'], 0, 'A started hold must not switch into a drag')
            previous = current
        self.assertEqual(sum(d[2] >= 0 for d in self.drip_uniforms()), 1)
        self.page.mouse.up()
        released = state()
        self.wait_for_frames(3)
        self.assertGreater(state()['angle'], previous['angle'], 'Releasing after movement should retain the forward coast')
        for x, y in [(.1, .8), (1.1, .8)]:
            self.page.mouse.move(box['x'] + box['width'] * x, box['y'] + box['height'] * y, steps=3)
            self.wait_for_frames(6)
            after = state()
            self.assertEqual(after['center'], released['center'], 'The coasting vortex must stay where it was released')
            self.assertEqual(after['strength'], released['strength'], 'Hovering must not recharge the released vortex')
            self.assertEqual(after['spin'], released['spin'])
            self.assertEqual(after['dragging'], 0)
        self.assertEqual(sum(d[2] >= 0 for d in self.drip_uniforms()), 1)

    def test_following_hold_keeps_its_spin_rate_and_moves_without_jumps(self):
        self.start_controlled_drip()
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()

        step = self.step_drip

        before = step(180)
        previous = step(1)
        speed = (previous['angle'] - before['angle']) / (previous['time'] - before['time'])
        self.assertGreater(speed, 0)
        initial_strength = previous['strength']
        for x, y in [(.85, .5), (.8, .8), (.2, .8), (.2, .2), (.8, .2)]:
            self.page.mouse.move(box['x'] + box['width'] * x, box['y'] + box['height'] * y, steps=12)
            for _ in range(12):
                current = step(1)
                elapsed = current['time'] - previous['time']
                rate = (current['angle'] - previous['angle']) / elapsed
                self.assertAlmostEqual(rate, speed, delta=speed * .03,
                    msg='Moving a held vortex must preserve its current rotation rate')
                travel = sum((a - b) ** 2 for a, b in zip(current['center'], previous['center'])) ** .5
                self.assertLess(travel / elapsed, .7, 'The vortex center must travel smoothly without a burst')
                previous = current
        self.assertGreater(previous['strength'], initial_strength, 'The field should still grow while following')
        self.page.mouse.up()
        self.page.evaluate("window.dispatchEvent(new Event('blur'))")
        # Following immediately after the hold threshold must also begin spinning.
        self.page.mouse.down()
        step(40)
        self.page.mouse.move(box['x'] + box['width'] * .2, box['y'] + box['height'] * .8)
        early_follow = step(30)
        self.assertGreater(early_follow['angle'], .01, 'Starting to follow early must not leave the rotation at zero')
        self.page.mouse.up()

    def test_right_hold_boosts_return_and_releases_outside_artwork(self):
        self.start_controlled_drip()
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        early = self.step_drip(36)
        self.assertGreater(early['angle'], 0, 'Wind-up should now begin within 600 ms')
        grown = self.step_drip(144)
        self.assertGreater(grown['strength'], .4, 'The shorter wind-up must build a substantial field within three seconds')
        self.page.mouse.up()
        before = self.step_drip(90)
        normal = self.step_drip(4)
        normal_speed = (before['angle'] - normal['angle']) / (normal['time'] - before['time'])
        self.assertGreater(normal_speed, 0)
        self.page.evaluate("document.addEventListener('contextmenu', e => window.__rightMenuPrevented = e.defaultPrevented)")
        self.page.mouse.down(button='right')
        self.assertTrue(self.page.evaluate('window.__rightMenuPrevented'), 'The artwork must prevent the native right-click menu')
        boosted = self.step_drip(4)
        boosted_speed = (normal['angle'] - boosted['angle']) / (boosted['time'] - normal['time'])
        self.assertAlmostEqual(boosted_speed, normal_speed * 3, delta=normal_speed * .03)
        self.assertEqual(boosted['center'], normal['center'])
        self.assertEqual(boosted['strength'], normal['strength'])
        self.assertEqual(sum(d[2] >= 0 for d in self.drip_uniforms()), 1, 'Right-click must not create another impact')
        self.page.mouse.move(box['x'] + box['width'] * 1.1, box['y'] + box['height'] * .8)
        self.page.mouse.up(button='right')
        released = self.step_drip(4)
        released_speed = (boosted['angle'] - released['angle']) / (released['time'] - boosted['time'])
        self.assertAlmostEqual(released_speed, normal_speed, delta=normal_speed * .03,
            msg='Releasing right-click outside the artwork must remove the boost')
        self.assertEqual(released['center'], normal['center'])

    def test_right_button_chord_unwinds_and_left_can_resume(self):
        self.start_controlled_drip()
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        held = self.step_drip(180)
        # Native mouse events cover the chord that produces no second pointerdown.
        self.page.mouse.down(button='right')
        self.page.mouse.move(box['x'] + box['width'] * .8, box['y'] + box['height'] * .2)
        reversing = self.step_drip(12)
        self.assertLess(reversing['angle'], held['angle'], 'Right-click should immediately return an existing held vortex')
        self.assertEqual(reversing['strength'], held['strength'])
        self.assertEqual(reversing['center'], held['center'], 'Right-click return must stay at its original position')
        self.page.mouse.up(button='right')
        resumed = self.step_drip(12)
        self.assertGreater(resumed['angle'], reversing['angle'], 'Keeping left held should resume winding after right is released')
        self.assertGreaterEqual(resumed['strength'], held['strength'])
        self.assertNotEqual(resumed['center'], reversing['center'])
        self.assertEqual(resumed['spin'], held['spin'])
        self.assertEqual(sum(d[2] >= 0 for d in self.drip_uniforms()), 1)
        self.page.mouse.down(button='right')
        boosted = self.step_drip(12)
        self.page.mouse.up()
        still_boosted = self.step_drip(4)
        self.assertLess(still_boosted['angle'], boosted['angle'],
            'Releasing left while right is held must not restart the coast or reset the vortex')
        self.assertEqual(still_boosted['strength'], boosted['strength'])
        boost_speed = (boosted['angle'] - still_boosted['angle']) / (still_boosted['time'] - boosted['time'])
        self.page.mouse.up(button='right')
        normal = self.step_drip(4)
        normal_speed = (still_boosted['angle'] - normal['angle']) / (normal['time'] - still_boosted['time'])
        self.assertAlmostEqual(normal_speed * 3, boost_speed, delta=boost_speed * .03)

    def test_mobile_return_button_boosts_and_clears_on_motion_off(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.start_controlled_drip()
        button = self.page.locator('[data-vortex-return]')
        expect(button).to_be_hidden()
        session = self.context.new_cdp_session(self.page)
        session.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 2})
        box = self.page.locator('#visual-container').bounding_box()
        point = {'id': 1, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point]})
        self.step_drip(180)
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        before = self.step_drip(90)
        normal = self.step_drip(4)
        speed = (before['angle'] - normal['angle']) / (normal['time'] - before['time'])
        expect(button).to_be_visible()
        target = button.bounding_box()
        self.assertGreaterEqual(target['height'], 44)
        self.assertGreaterEqual(target['x'], 0)
        self.assertLessEqual(target['x'] + target['width'], 390)
        touch = {'id': 2, 'x': target['x'] + target['width'] / 2, 'y': target['y'] + target['height'] / 2}
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [touch]})
        expect(button).to_have_attribute('aria-pressed', 'true')
        boosted = self.step_drip(4)
        rate = (normal['angle'] - boosted['angle']) / (boosted['time'] - normal['time'])
        self.assertAlmostEqual(rate, speed * 3, delta=speed * .03)
        self.assertEqual(boosted['center'], normal['center'])
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        released = self.step_drip(4)
        rate = (boosted['angle'] - released['angle']) / (released['time'] - boosted['time'])
        self.assertAlmostEqual(rate, speed, delta=speed * .03)
        button.focus()
        self.page.keyboard.down('Space')
        expect(button).to_have_attribute('aria-pressed', 'true')
        self.page.locator('[data-motion-toggle]').evaluate('element => element.click()')
        expect(button).to_be_hidden()
        expect(button).to_have_attribute('aria-pressed', 'false')
        self.page.keyboard.up('Space')
        self.page.locator('[data-motion-toggle]').evaluate('element => element.click()')
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point]})
        self.assertGreater(self.step_drip(90)['angle'], 0, 'Motion off must clear a held return control')
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        self.page.locator('[data-info]').click()
        expect(self.page.locator('.info-project-description')).to_have_text('Music, images and audiovisual experiments.')
        self.assertNotIn('Martin', self.page.locator('#experience-info').inner_text())
        self.assertNotIn('Solli', self.page.locator('#experience-info').inner_text())
        self.assertTrue(self.page.locator('.site-nav a').evaluate_all(
            "links => links.every(link => !/src001|drip-fluid/.test(link.getAttribute('href')))"))

    def test_mobile_return_with_artwork_finger_does_not_start_pinch(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.start_controlled_drip()
        session = self.context.new_cdp_session(self.page)
        session.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 2})
        box = self.page.locator('#visual-container').bounding_box()
        point = {'id': 1, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point]})
        held = self.step_drip(180)
        button = self.page.locator('[data-vortex-return]')
        target = button.bounding_box()
        control = {'id': 2, 'x': target['x'] + target['width'] / 2, 'y': target['y'] + target['height'] / 2}
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point, control]})
        reversing = self.step_drip(12)
        self.assertLess(reversing['angle'], held['angle'])
        self.assertEqual(reversing['strength'], held['strength'], 'The return control must not cancel the artwork gesture as a pinch')
        self.assertEqual(reversing['center'], held['center'])
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [control]})
        resumed = self.step_drip(12)
        self.assertGreater(resumed['angle'], reversing['angle'], 'The artwork finger must resume winding after RETURN is released')
        self.assertGreaterEqual(resumed['strength'], held['strength'])
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

    def check_fluid_study(self, path, source_width, keyboard=False, front=False):
        self.visit(path)
        if front:
            self.page.locator('[data-visual-mode="fluid"]').click()
        canvas_selector = '#fluid-visual' if front else '#visual'
        panel = self.page.locator('#fluid-container' if front else '#visual-container')
        self.page.wait_for_function('selector => document.querySelector(selector).dataset.fluid', arg=canvas_selector)
        expect(self.page.locator(canvas_selector)).to_have_attribute('data-fluid', 'ready')
        if path == 'drip-fluid.html':
            expect(self.page.locator('meta[name="robots"]')).to_have_attribute('content', 'noindex, nofollow')
        self.assertEqual(panel.locator('img').evaluate('image => image.naturalWidth'), source_width)

        def pixels(baseline=False):
            return self.page.evaluate("""({baseline, selector}) => new Promise(resolve => {
                const canvas = document.querySelector(selector);
                const gl = canvas.getContext('webgl');
                const draw = gl.drawArrays;
                gl.drawArrays = function (...args) {
                    draw.apply(this, args);
                    if (gl.getParameter(gl.FRAMEBUFFER_BINDING)) return;
                    gl.drawArrays = draw;
                    const result = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, result);
                    if (baseline) window.__fluidOriginalPixels = result;
                    let difference = 0, count = 0;
                    for (let i = 0; i < result.length; i += 64) {
                        for (let channel = 0; channel < 3; channel++) {
                            difference += Math.abs(result[i + channel] - window.__fluidOriginalPixels[i + channel]);
                            count++;
                        }
                    }
                    resolve(difference / count);
                };
            })""", {'baseline': baseline, 'selector': canvas_selector})

        pixels(baseline=True)
        box = panel.bounding_box()
        self.page.mouse.move(box['x'] + box['width'] * .35, box['y'] + box['height'] * .45)
        self.page.mouse.down()
        self.page.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .6, steps=12)
        self.wait_for_frames(12)
        self.page.mouse.up()
        disturbed = pixels()
        self.assertGreater(disturbed, 1, 'Fluid motion must visibly transport the original artwork')
        control = self.page.locator('[data-fluid-return]').bounding_box()
        self.page.mouse.move(control['x'] + control['width'] / 2, control['y'] + control['height'] / 2)
        self.page.mouse.down()
        self.wait_for_frames(30)
        self.assertLess(pixels(), disturbed * .6, 'RETURN must visibly settle the material toward the original image')
        self.page.mouse.up()
        self.page.locator('[data-fluid-reset]').click()
        self.assertLess(pixels(), .01, 'Reset must recover the exact starting image')
        if keyboard:
            panel.focus()
            self.page.keyboard.press('Space')
            self.wait_for_frames(12)
            self.assertGreater(pixels(), .01, 'Keyboard interaction must move the artwork')
            self.page.locator('[data-fluid-reset]').click()
            self.assertLess(pixels(), .01)
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))

    def test_fluid_study_moves_artwork_and_reset_recovers_the_original(self):
        self.check_fluid_study('drip-fluid.html', 3200)

    def test_front_fluid_moves_artwork_and_resets_exactly(self):
        self.check_fluid_study('index.html', 3200, keyboard=True, front=True)

    def test_ink_blends_source_colours_and_reset_restores_the_image(self):
        # A two-colour source makes real colour mixing distinguishable from UV warping.
        fixture = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><path fill="blue" d="M0 0h1500v3000H0z"/><path fill="yellow" d="M1500 0h1500v3000H1500z"/></svg>'
        self.page.route('**/images/gallery/flower_3.webp', lambda route: route.fulfill(content_type='image/svg+xml', body=fixture))
        self.visit('experiment.html')
        expect(self.page.locator('#visual')).to_have_attribute('data-fluid', 'ready')

        def mixed_pixels():
            return self.page.evaluate("""() => new Promise(resolve => {
                const canvas = document.querySelector('#visual');
                const gl = canvas.getContext('webgl');
                const draw = gl.drawArrays;
                gl.drawArrays = function (...args) {
                    draw.apply(this, args);
                    if (gl.getParameter(gl.FRAMEBUFFER_BINDING)) return;
                    gl.drawArrays = draw;
                    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    let mixed = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        if (pixels[i] > 20 && pixels[i + 2] > 20) mixed++;
                    }
                    resolve(mixed);
                };
            })""")

        original = mixed_pixels()
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .5)
        self.page.mouse.down()
        self.page.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .6, steps=12)
        self.wait_for_frames(30)
        self.page.mouse.up()
        self.assertGreater(mixed_pixels(), original + 200, 'Ink must transport and blend colour into a broad trail')
        self.page.locator('[data-fluid-reset]').click()
        self.assertEqual(mixed_pixels(), original)
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))

    def test_front_modes_keep_audio_playing_and_pause_the_hidden_renderer(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.wait_for_function("document.querySelector('#fluid-visual').dataset.fluid === 'ready'")
        fluid = self.page.locator('[data-visual-mode="fluid"]')
        whirl = self.page.locator('[data-visual-mode="whirl"]')
        expect(whirl).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('#fluid-container')).to_be_hidden()
        before = self.page.evaluate('({...window.__drawsByCanvas})')
        self.wait_for_frames(6)
        counts = self.page.evaluate('window.__drawsByCanvas')
        self.assertGreater(counts['visual'], before['visual'])
        self.assertEqual(counts['fluid-visual'], before['fluid-visual'])

        self.page.locator('[data-sound]').click()
        self.page.wait_for_function("document.querySelector('audio').currentTime > 0")
        started = self.page.evaluate("window.__modeAudio = document.querySelector('audio'); window.__modeAudio.currentTime")
        fluid.click()
        expect(fluid).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('#visual-container')).to_be_hidden()
        expect(self.page.locator('#fluid-container')).to_be_visible()
        stopped_whirl = self.page.evaluate('window.__drawsByCanvas.visual')
        self.page.wait_for_function("before => window.__drawsByCanvas['fluid-visual'] > before + 20", arg=counts['fluid-visual'])
        self.assertEqual(self.page.evaluate('window.__drawsByCanvas.visual'), stopped_whirl)
        self.assertTrue(self.page.evaluate("document.querySelector('audio') === window.__modeAudio && !window.__modeAudio.paused"))
        self.assertGreaterEqual(self.page.locator('audio').evaluate('audio => audio.currentTime'), started)
        expect(self.page.locator('[data-fluid-return]')).to_be_visible()
        expect(self.page.locator('[data-vortex-return]')).to_be_hidden()
        self.page.locator('[data-info]').click()
        expect(self.page.locator('[data-glitch-toggle]')).to_be_hidden()
        expect(self.page.locator('#experience-info [data-mode-controls="fluid"]')).to_contain_text('Drag to move the image')
        self.page.keyboard.press('Escape')

        # Switching with the keyboard preserves focus and clears a held return.
        self.page.locator('[data-fluid-return]').focus()
        self.page.keyboard.down('Space')
        expect(self.page.locator('[data-fluid-return]')).to_have_attribute('aria-pressed', 'true')
        whirl.focus()
        self.page.keyboard.press('Enter')
        self.page.keyboard.up('Space')
        expect(whirl).to_be_focused()
        expect(self.page.locator('[data-fluid-return]')).to_have_attribute('aria-pressed', 'false')
        self.wait_for_frames(3)
        stopped = self.page.evaluate("window.__drawsByCanvas['fluid-visual']")
        self.wait_for_frames(6)
        self.assertEqual(self.page.evaluate("window.__drawsByCanvas['fluid-visual']"), stopped)
        self.assertFalse(self.page.locator('audio').evaluate('audio => audio.paused'))
        self.page.locator('[data-motion-toggle]').click()
        fluid.click()
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'off')
        paused = self.page.evaluate('({...window.__drawsByCanvas})')
        self.wait_for_frames(6)
        self.assertEqual(self.page.evaluate('window.__drawsByCanvas'), paused)
        expect(self.page.locator('[data-fluid-reset]')).to_be_disabled()

    def test_front_fluid_unavailable_keeps_whirl_usable(self):
        self.page.add_init_script("""(() => {
            const extension = WebGLRenderingContext.prototype.getExtension;
            WebGLRenderingContext.prototype.getExtension = function (name) {
                if (this.canvas.id === 'fluid-visual' && /OES_texture_(half_)?float$/.test(name)) return null;
                return extension.call(this, name);
            };
        })();""")
        self.visit()
        expect(self.page.locator('#fluid-visual')).to_have_attribute('data-fluid', 'unavailable')
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'on')
        self.page.locator('[data-visual-mode="fluid"]').click()
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'off')
        expect(self.page.locator('[data-motion-toggle]')).to_be_disabled()
        expect(self.page.locator('#fluid-fallback-image')).to_be_visible()
        self.page.locator('[data-visual-mode="whirl"]').click()
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'on')
        expect(self.page.locator('[data-motion-toggle]')).to_be_enabled()
        before = self.page.evaluate('window.__drawsByCanvas.visual')
        self.page.wait_for_function('before => window.__drawsByCanvas.visual > before', arg=before)

    def test_front_modes_clear_held_whirl_and_switch_with_touch(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.start_controlled_drip()
        session = self.context.new_cdp_session(self.page)
        session.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 2})
        box = self.page.locator('#visual-container').bounding_box()
        point = {'id': 1, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point]})
        self.assertGreater(self.step_drip(150)['strength'], .1)
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

        def tap_mode(mode):
            box = self.page.locator(f'[data-visual-mode="{mode}"]').bounding_box()
            touch = {'id': 2, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
            session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [touch]})
            session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

        tap_mode('fluid')
        expect(self.page.locator('#fluid-container')).to_be_visible()
        expect(self.page.locator('[data-fluid-reset]')).to_be_visible()
        tap_mode('whirl')
        expect(self.page.locator('#visual-container')).to_be_visible()
        fresh = self.step_drip(1)
        self.assertEqual(fresh['strength'], 0)
        self.assertEqual(fresh['angle'], 0)
        expect(self.page.locator('[data-vortex-return]')).to_be_hidden()

    def test_fluid_study_falls_back_to_the_artwork_without_webgl(self):
        self.page.add_init_script("""(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                return type === 'webgl' ? null : getContext.call(this, type, ...args);
            };
        })();""")
        for path, title in [('drip-fluid.html', 'DRIP / FLUID'), ('experiment.html', 'FLOWER')]:
            with self.subTest(path=path):
                self.visit(path)
                expect(self.page.locator('#visual')).to_have_attribute('data-fluid', 'unavailable')
                expect(self.page.locator('[data-motion-toggle]')).to_be_disabled()
                self.assertTrue(self.page.locator('#fallback-image').evaluate('image => image.complete && image.naturalWidth > 0'))
                self.page.locator('[data-info]').click()
                expect(self.page.locator('#info-title')).to_have_text(title)

    def test_press_before_recovery_resumes_the_existing_vortex(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .18;
        }""")

        def state():
            return self.page.evaluate("""() => {
                const gl = document.querySelector('#visual').getContext('webgl');
                const p = gl.getParameter(gl.CURRENT_PROGRAM);
                const value = name => gl.getUniform(p, gl.getUniformLocation(p, name));
                return {angle: value('u_holdAngle'), strength: value('u_holdStrength'), time: value('u_time'),
                    pull: value('u_holdPull'), center: Array.from(value('u_holdCenter')),
                    spin: value('u_holdSpin')};
            }""")

        self.page.mouse.up()
        self.wait_for_frames(4)
        for phase, x, y in [('coast', .75, .25), ('reverse', .25, .75)]:
            if phase == 'reverse':
                angle = state()['angle']
                self.page.wait_for_function("""angle => {
                    const gl = document.querySelector('#visual').getContext('webgl');
                    const p = gl.getParameter(gl.CURRENT_PROGRAM);
                    return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) < angle * .65;
                }""", arg=angle, timeout=20000)
            self.page.mouse.move(box['x'] + box['width'] * x, box['y'] + box['height'] * y)
            before = state()
            self.page.mouse.down()
            self.wait_for_frames(1)
            resumed = state()
            self.assertGreaterEqual(resumed['strength'], before['strength'], 'Re-pressing must preserve the existing field size')
            self.assertAlmostEqual(resumed['angle'], before['angle'], delta=.2,
                msg='Re-pressing must continue from the current rotation instead of resetting it')
            self.assertAlmostEqual(resumed['pull'], before['pull'], delta=.06,
                msg='Re-pressing must not snap the inward pull back to full strength')
            self.assertLess(sum((a - b) ** 2 for a, b in zip(resumed['center'], before['center'])), .01,
                'Re-pressing elsewhere must move the existing center smoothly')
            self.assertEqual(resumed['spin'], before['spin'])
            self.assertEqual(sum(d[2] >= 0 for d in self.drip_uniforms()), 1, 'Resuming must not create a replacement impact')
            self.wait_for_frames(6)
            self.assertGreater(state()['angle'], resumed['angle'], 'The resumed vortex must keep winding up')
            self.page.mouse.up()
            if phase == 'reverse':
                released = state()
                self.page.wait_for_function("""time => {
                    const gl = document.querySelector('#visual').getContext('webgl');
                    const p = gl.getParameter(gl.CURRENT_PROGRAM);
                    return gl.getUniform(p, gl.getUniformLocation(p, 'u_time')) > time + 1.4;
                }""", arg=released['time'])
                self.assertLessEqual(state()['pull'], released['pull'] + .001,
                    'Quickly releasing a resumed vortex must not restore its old inward pull')

    def test_held_vortex_survives_mouse_pointer_capture_loss(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.evaluate("""() => {
            const art = document.querySelector('#visual-container');
            art.addEventListener('pointerdown', event => window.__heldMouseId = event.pointerId, {once:true});
            window.__captureEvents = [];
            art.addEventListener('lostpointercapture', event => window.__captureEvents.push(event.type));
        }""")
        box = self.page.locator('#visual-container').bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        self.page.mouse.move(x + 1, y + 1)
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .12;
        }""")
        self.assertTrue(self.page.evaluate("document.querySelector('#visual-container').hasPointerCapture(window.__heldMouseId)"))
        before = self.hold_uniforms()
        self.page.evaluate("document.querySelector('#visual-container').releasePointerCapture(window.__heldMouseId)")
        self.page.mouse.move(x + box['width'] * .15, y - box['height'] * .1, steps=3)
        self.wait_for_frames(3)
        self.assertTrue(self.page.evaluate("window.__captureEvents.includes('lostpointercapture')"))
        after = self.hold_uniforms()
        self.assertGreaterEqual(after[0], before[0], 'Losing pointer capture while pressed must not erase the vortex')
        self.assertGreater(after[1], before[1], 'The held vortex must keep building after capture loss')
        self.page.mouse.up()

    def test_mouse_hold_releases_outside_artwork_without_pointer_capture(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.evaluate("""() => {
            document.querySelector('#visual-container').setPointerCapture = () => {
                throw new DOMException('Pointer capture unavailable', 'InvalidStateError');
            };
        }""")
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .12;
        }""")
        before = self.hold_uniforms()
        self.page.mouse.move(box['x'] + box['width'] + 25, box['y'] + box['height'] / 2, steps=3)
        self.wait_for_frames(3)
        self.assertGreater(self.hold_uniforms()[1], before[1], 'A held pointer outside the artwork must keep building')
        self.page.mouse.up()
        release_angle = self.hold_uniforms()[1]
        self.page.wait_for_function("""angle => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) < angle * .8;
        }""", arg=release_angle, timeout=20000)

    def test_mouse_cancel_keeps_hold_until_compatibility_mouseup(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.evaluate("document.querySelector('#visual-container').addEventListener('pointerdown', e => window.__heldMouseId=e.pointerId, {once:true})")
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.page.mouse.down()
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) > .12;
        }""")
        before = self.hold_uniforms()
        self.page.evaluate("""() => {
            document.querySelector('#visual-container').dispatchEvent(new PointerEvent('pointercancel', {
                pointerId: window.__heldMouseId, pointerType: 'mouse', buttons: 1, bubbles: true
            }));
        }""")
        self.page.mouse.move(box['x'] + box['width'] * .8, box['y'] + box['height'] * .3, steps=3)
        self.wait_for_frames(3)
        self.assertGreaterEqual(self.hold_uniforms()[0], before[0], 'A mouse cancellation notification must not erase the held vortex')
        self.page.evaluate("window.addEventListener('pointerup', e => e.stopImmediatePropagation(), {capture:true, once:true})")
        release_angle = self.hold_uniforms()[1]
        self.page.mouse.up()
        self.page.wait_for_function("""angle => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) < angle * .8;
        }""", arg=release_angle, timeout=20000)

    def test_drag_from_the_start_keeps_stirring_without_a_hold_vortex(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        box = self.page.locator('#visual-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] * .2, box['y'] + box['height'] * .3)
        self.page.mouse.down()
        self.page.mouse.move(box['x'] + box['width'] * .6, box['y'] + box['height'] * .7, steps=3)
        start = self.page.evaluate("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_time'));
        }""")
        self.page.wait_for_function("""start => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_time')) > start + 1.2;
        }""", arg=start)
        self.assertEqual(self.hold_uniforms(), [0, 0], 'Dragging must not turn into an anchored long press')
        self.page.mouse.move(box['x'] + box['width'] * .8, box['y'] + box['height'] * .4, steps=3)
        self.wait_for_frames(3)
        state = self.page.evaluate("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return {dragging: gl.getUniform(p, gl.getUniformLocation(p, 'u_dragging')),
                pointer: Array.from(gl.getUniform(p, gl.getUniformLocation(p, 'u_pointer')))};
        }""")
        self.assertGreater(state['dragging'], .8)
        self.assertGreater(state['pointer'][0], .65, 'The normal drag should continue following the mouse')
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

        self.assertGreater(self.hold_image_difference(), 1, 'The held vortex must visibly deform the artwork')
        # Observe the actual last frame before release; browser input latency can
        # otherwise make an earlier average underestimate the growing spin rate.
        self.page.evaluate("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            const angle = gl.getUniformLocation(p, 'u_holdAngle');
            const time = gl.getUniformLocation(p, 'u_time');
            const originalDraw = gl.drawArrays;
            let previous = null;
            let speed = 0;
            gl.drawArrays = function (...args) {
                const current = [gl.getUniform(p, angle), gl.getUniform(p, time)];
                if (previous && current[1] > previous[1]) {
                    speed = (current[0] - previous[0]) / (current[1] - previous[1]);
                }
                previous = current;
                return originalDraw.apply(this, args);
            };
            window.addEventListener('pointerup', () => {
                window.__holdReleaseSpeed = speed;
                gl.drawArrays = originalDraw;
            }, {capture: true, once: true});
        }""")
        self.wait_for_frames(8)
        peak = rotation()
        self.page.mouse.up()
        forward_speed = self.page.evaluate("window.__holdReleaseSpeed")
        self.assertGreater(forward_speed, 0)
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
        self.assertAlmostEqual(reverse_speed, forward_speed * .4, delta=forward_speed * .01,
            msg='The reverse should be about 40% of the speed at release')
        self.assertEqual(released[2:], coasting[2:], 'The field must keep its size and center while unwinding')
        self.page.mouse.move(box['x'] + box['width'] * .1, box['y'] + box['height'] * .9, steps=8)
        self.wait_for_frames(8)
        moving = rotation()
        self.assertEqual(moving[3:], released[3:], 'Mouse movement must not move the reversing vortex')
        moving_speed = (released[0] - moving[0]) / (moving[1] - released[1])
        self.assertAlmostEqual(moving_speed, reverse_speed, delta=reverse_speed * .03,
            msg='Hovering must not accelerate the reverse')
        self.page.wait_for_function("""() => {
            const gl = document.querySelector('#visual').getContext('webgl');
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniform(p, gl.getUniformLocation(p, 'u_holdAngle')) === 0 &&
                gl.getUniform(p, gl.getUniformLocation(p, 'u_holdStrength')) === 0;
        }""", timeout=25000)
        self.assertLess(self.hold_image_difference(), .01,
            'The recovered artwork must match the original pixels, not a faded vortex')
        restored = rotation()
        self.page.mouse.move(box['x'] + box['width'] * .9, box['y'] + box['height'] * .5)
        self.wait_for_frames(8)
        self.assertEqual(rotation()[3:], restored[3:], 'Following must stop when the vortex has completely unwound')
        self.assertEqual(self.hold_uniforms(), [0, 0], 'Hovering after recovery must not revive the vortex')

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

    def test_experiments_only_lists_flower_and_preview_is_silent(self):
        audio_requests = []
        self.page.on("request", lambda request: audio_requests.append(request.url) if "/audio/" in request.url else None)
        self.visit("experiments.html")
        expect(self.page.locator('.study-card')).to_have_count(1)
        expect(self.page.locator('.study-card h2')).to_contain_text('FLOWER')
        expect(self.page.locator('.study-card img')).to_have_attribute('src', './images/gallery/thumbs/flower_3.webp')
        self.page.locator('.study-card').hover()
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate('window.__drawCalls'), 0)
        self.assertEqual(audio_requests, [])

    def test_flower_fluid_keyboard_and_reset(self):
        self.check_fluid_study('experiment.html', 3000, keyboard=True)

    def test_flower_fluid_respects_reduced_motion(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.visit("experiment.html")
        expect(self.page.locator('#visual')).to_have_attribute('data-fluid', 'ready')
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'off')
        expect(self.page.locator('[data-fluid-return]')).to_be_disabled()
        expect(self.page.locator('[data-fluid-reset]')).to_be_disabled()
        before = self.page.evaluate('window.__drawCalls')
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate('window.__drawCalls'), before)
        self.page.locator('[data-motion-toggle]').click()
        self.page.wait_for_function('before => window.__drawCalls > before', arg=before)
        expect(self.page.locator('[data-fluid-reset]')).to_be_enabled()

    def test_touch_overview_opens_flower_fluid(self):
        context = self.browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        try:
            page = context.new_page()
            page.goto(BASE_URL + '/experiments.html', wait_until='networkidle')
            card = page.locator('.study-card')
            expect(card.locator('.study-card-detail')).to_contain_text('DRAG TO STIR')
            card.tap()
            page.wait_for_url('**/experiment.html')
            expect(page.locator('#visual')).to_have_attribute('data-fluid', 'ready')
            page.locator('#visual-container').tap()
            expect(page.locator('[data-fluid-reset]')).to_be_visible()
            expect(page.locator('[data-fluid-return]')).to_be_visible()
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

    def test_releases_navigation_shows_only_cover_artist_and_title(self):
        self.visit()
        expect(self.page.locator('.site-nav a')).to_have_text(['RELEASES', 'SOURCES', 'BANDCAMP'])
        self.page.locator('.site-nav').get_by_role('link', name='RELEASES').click()
        self.page.wait_for_url('**/releases.html')
        expect(self.page.locator('h1')).to_have_text('RELEASES')
        expect(self.page.locator('.site-nav [aria-current="page"]')).to_have_text('RELEASES')
        expect(self.page.locator('.release-entry')).to_have_count(1)
        expect(self.page.locator('.release-catalogue')).to_have_text('SRC001')
        expect(self.page.locator('.release-title')).to_have_text('DRIP')
        expect(self.page.locator('.release-artist')).to_have_text('MARTIN SOLLI')
        self.assertTrue(self.page.locator('.release-cover').evaluate('image => image.complete && image.naturalWidth === 3200'))
        expect(self.page.locator('.release-entry a, .release-entry button, .tracklist, a[href*="src001"], [data-artwork-dialog]')).to_have_count(0)
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        self.page.go_back(wait_until='networkidle')
        self.assertNotIn('page-is-leaving', self.page.locator('body').get_attribute('class') or '')

    def test_retired_images_page_redirects_to_releases(self):
        self.visit('gallery.html')
        self.page.wait_for_url('**/releases.html')
        expect(self.page.locator('h1')).to_have_text('RELEASES')
        expect(self.page.locator('.archive, #gallery-viewer, a[href*="gallery.html"]')).to_have_count(0)

    def test_sources_navigation_transitions_and_back(self):
        self.visit()
        self.page.locator('.site-nav').get_by_role('link', name='SOURCES').click()
        self.page.wait_for_url('**/experiments.html')
        expect(self.page.locator('h1')).to_have_text('SOURCES')
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        expect(self.page.locator(".study-card")).to_have_count(1)
        self.page.locator(".study-card").click()
        self.page.wait_for_url("**/experiment.html")
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        self.page.go_back(wait_until="networkidle")
        self.assertNotIn("page-is-leaving", self.page.locator("body").get_attribute("class") or "")

    def test_mobile_layout_and_player_controls(self):
        for width in [320, 390, 768]:
            self.page.set_viewport_size({"width": width, "height": 844})
            for path in ["index.html", "drip-fluid.html", "experiment.html", "experiments.html", "releases.html", "src001.html"]:
                with self.subTest(width=width, path=path):
                    self.visit(path)
                    self.assertLessEqual(self.page.evaluate("document.body.scrollWidth"), width)
                    self.assertTrue(self.page.locator(".site-nav a").evaluate_all(
                        "links => links.every(a => {const r=a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44;})"
                    ))
                    if path in ["index.html", "drip-fluid.html", "experiment.html"]:
                        if path == "index.html":
                            expect(self.page.locator('[data-vortex-return]')).to_be_hidden()
                        if path in ["index.html", "drip-fluid.html"]:
                            seek = self.page.locator("[data-seek]")
                            expect(seek).to_be_visible()
                            seek_box = seek.bounding_box()
                            self.assertGreaterEqual(seek_box["height"], 44)
                            self.assertGreaterEqual(seek_box["x"], 0)
                            self.assertLessEqual(seek_box["x"] + seek_box["width"], width)
                        for control in self.page.locator(".experience-controls button:not([data-vortex-return]):not([hidden])").all():
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
