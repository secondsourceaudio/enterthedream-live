"""Functional checks for the static site; start its HTTP server first.

Run: python3 tests/browser_smoke.py
Requires Python Playwright and Chromium. SITE_BASE_URL and CHROMIUM_PATH
override the local server URL and browser executable.
"""
import os
from pathlib import Path
import unittest
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("SITE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
PAGE_ROUTES = {
    'index.html': '',
    'releases.html': 'releases/',
    'merch.html': 'merch/',
    'experiments.html': 'sources/',
    'experiment.html': 'sources/flower/',
    'src001.html': 'src001/',
    'drip-fluid.html': 'drip-fluid/',
}
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


def serve_seekable_audio(page, filename="sage-counsel.mp3", source=None):
    """Model GitHub Pages' byte-range support, absent from Python's dev server."""
    data = (Path(__file__).resolve().parents[1] / "audio" / (source or filename)).read_bytes()

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

    page.route("**/audio/" + filename, respond)


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
        response = self.page.goto(f"{BASE_URL}/{PAGE_ROUTES.get(path, path)}", wait_until="networkidle")
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
        expect(self.page.locator('#experience-info')).to_be_visible()
        self.assertNotIn('SOUND', self.page.locator('#experience-info').inner_text())
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
        expect(self.page.locator('#experience-info')).to_be_visible()
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
        button.scroll_into_view_if_needed()
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
        self.page.locator('#visual-container').scroll_into_view_if_needed()
        box = self.page.locator('#visual-container').bounding_box()
        point = {'id': 1, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
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
        self.page.locator('[data-fluid-return]').scroll_into_view_if_needed()
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
        self.page.route('**/images/gallery/flower_4.webp', lambda route: route.fulfill(content_type='image/svg+xml', body=fixture))
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
        expect(self.page.locator('meta[name="robots"]')).to_have_attribute('content', 'noindex, nofollow')
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
        self.page.keyboard.press('Escape')
        self.page.locator('[data-open-index]').click()
        expect(self.page.locator('.src-map-flower')).to_have_attribute('href', 'https://www.enterthedream.org/sources/flower/')
        self.assertTrue(self.page.locator('.src-image-map img').get_attribute('src').startswith('data:'))

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
        expect(self.page.locator("h1")).to_have_text("Second Source")
        self.assertEqual(self.page.locator("h1").evaluate("e => getComputedStyle(e).position"), "absolute")
        expect(self.page.locator(".study-caption, .interaction-cue")).to_have_count(0)
        expect(self.page.locator("html")).to_have_attribute("data-motion", "on")
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.locator("[data-info]").click()
        expect(self.page.locator("#info-title")).to_have_text("DRIP")

    def test_sources_player_is_silent_until_play_and_flower_remains_available(self):
        audio_requests = []
        self.page.on("request", lambda request: audio_requests.append(request.url) if "/audio/" in request.url else None)
        self.visit("experiments.html")
        self.page.wait_for_url('**/sources/')
        expect(self.page.locator('[data-room]')).to_have_attribute('data-scene', 'city')
        expect(self.page.locator('[data-room-play-label]')).to_have_text('PLAY')
        self.wait_for_frames()
        self.assertEqual(audio_requests, [])
        self.visit('sources/flower/')
        expect(self.page.locator('#visual')).to_have_attribute('data-fluid', 'ready')
        expect(self.page.locator('audio')).to_have_count(0)
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

    def test_touch_homepage_index_opens_flower_fluid(self):
        context = self.browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        try:
            page = context.new_page()
            page.goto(BASE_URL + '/', wait_until='networkidle')
            page.locator('[data-open-index]').tap()
            page.locator('.src-map-flower').tap()
            page.wait_for_url('**/sources/flower/')
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

    def test_player_shortcuts_respect_focus_modifiers_and_the_off_switch(self):
        self.visit()
        audio = self.page.locator('audio')
        fullscreen = self.page.locator('[data-fullscreen]')
        self.assertTrue(audio.evaluate('a => a.paused'))
        self.page.keyboard.press('f')
        expect(fullscreen).to_have_attribute('aria-pressed', 'true')
        self.assertTrue(audio.evaluate('a => a.paused'))
        self.page.keyboard.press('f')
        expect(fullscreen).to_have_attribute('aria-pressed', 'false')
        self.page.keyboard.press('p')
        self.page.wait_for_function('!document.querySelector("audio").paused && document.querySelector("audio").currentTime > .1')
        self.page.keyboard.press('m')
        self.assertTrue(audio.evaluate('a => a.muted && !a.paused'))
        self.page.keyboard.press('m')
        self.assertFalse(audio.evaluate('a => a.muted'))
        self.page.evaluate('''() => {
            document.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', repeat: true, bubbles: true}));
            for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
                document.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', [modifier]: true, bubbles: true}));
            }
        }''')
        self.assertFalse(audio.evaluate('a => a.paused'))
        self.page.locator('.site-logo').focus()
        self.page.keyboard.press('p')
        self.assertFalse(audio.evaluate('a => a.paused'))
        self.page.evaluate('''() => {
            const input = document.createElement('input');
            input.id = 'typing-check';
            document.querySelector('[data-experience]').append(input);
            input.focus();
        }''')
        self.page.keyboard.type('pmf')
        expect(self.page.locator('#typing-check')).to_have_value('pmf')
        self.assertFalse(audio.evaluate('a => a.paused || a.muted'))
        expect(fullscreen).to_have_attribute('aria-pressed', 'false')
        self.page.locator('#typing-check').evaluate('e => e.remove()')
        self.page.locator('[data-volume]').focus()
        self.page.keyboard.press('f')
        expect(fullscreen).to_have_attribute('aria-pressed', 'false')
        self.page.locator('[data-info]').click()
        self.page.keyboard.press('p')
        self.page.keyboard.press('m')
        self.page.keyboard.press('f')
        self.assertFalse(audio.evaluate('a => a.paused || a.muted'))
        expect(fullscreen).to_have_attribute('aria-pressed', 'false')
        self.page.locator('[data-shortcuts-toggle]').click()
        self.page.keyboard.press('Escape')
        self.page.keyboard.press('p')
        self.assertFalse(audio.evaluate('a => a.paused'))
        self.page.reload(wait_until='networkidle')
        self.page.keyboard.press('p')
        self.assertTrue(audio.evaluate('a => a.paused'))
        expect(self.page.locator('[data-sound]')).not_to_have_attribute('aria-keyshortcuts', 'P')
        self.page.locator('[data-info]').click()
        expect(self.page.locator('[data-shortcuts-toggle]')).to_have_attribute('aria-pressed', 'false')
        self.page.locator('[data-shortcuts-toggle]').click()
        self.page.keyboard.press('Escape')
        self.page.keyboard.press('p')
        self.page.wait_for_function('!document.querySelector("audio").paused')
        expect(self.page.locator('[data-sound]')).to_be_enabled()
        self.page.keyboard.press('p')
        self.assertTrue(audio.evaluate('a => a.paused'))
        self.page.keyboard.press('p')
        self.page.wait_for_function('!document.querySelector("audio").paused')
        audio.evaluate('a => { window.__shortcutAudio = a; }')
        self.page.locator('.site-nav').get_by_role('link', name='MERCH', exact=True).click()
        self.page.wait_for_url('**/merch/')
        expect(self.page.locator('[data-corner-player]')).to_be_visible()
        # The listening session continues, but artwork shortcuts stay on its page.
        for key in ['p', 'm', 'f']:
            self.page.keyboard.press(key)
        self.assertTrue(audio.evaluate('a => a === window.__shortcutAudio && !a.paused && !a.muted'))
        self.assertFalse(self.page.evaluate('document.fullscreenElement !== null'))
        self.page.go_back(wait_until='networkidle')
        self.page.wait_for_url(BASE_URL + '/')
        self.assertTrue(audio.evaluate('a => a === window.__shortcutAudio && !a.paused'))
        self.page.reload(wait_until='networkidle')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))

    def test_flower_shortcuts_keep_it_silent(self):
        self.visit('experiment.html')
        self.page.keyboard.press('p')
        self.page.keyboard.press('m')
        expect(self.page.locator('audio, [data-sound], [data-mute]')).to_have_count(0)
        self.page.keyboard.press('f')
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.page.keyboard.press('f')
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'false')
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))

    def test_fullscreen_and_information_keep_controls_accessible(self):
        self.visit()
        button = self.page.locator("[data-fullscreen]")
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        self.assertTrue(self.page.evaluate("document.fullscreenElement === document.querySelector('[data-experience]')"))
        self.assertTrue(self.page.locator("header").evaluate("e => e.inert"))
        self.page.locator("[data-info]").click()
        expect(self.page.locator("#experience-info")).to_be_visible()
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#experience-info")).not_to_be_visible()
        expect(button).to_have_attribute("aria-pressed", "true")
        button.click()
        expect(button).to_have_attribute("aria-pressed", "false")
        self.assertFalse(self.page.locator("header").evaluate("e => e.inert"))

    def start_controlled_fluid(self, path='index.html'):
        self.page.set_viewport_size({'width': 900, 'height': 700})
        self.page.add_init_script("""(() => {
            let seed = 42;
            Math.random = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            let experience;
            Object.defineProperty(window, 'SecondSourceExperience', {
                get: () => experience,
                set(value) {
                    experience = value;
                    value.createRenderLoop = (draw, element) => {
                        if (element.id !== 'fluid-container' && document.querySelector('#fluid-container')) return;
                        let elapsed = 0;
                        window.__stepFluid = frames => {
                            for (let i = 0; i < frames; i++) draw(elapsed += 1000 / 60);
                        };
                    };
                }
            });
        })();""")
        self.visit(path)
        self.page.wait_for_function("typeof window.__stepFluid === 'function'")

    def fluid_frame_difference(self, frames=1, baseline=False, live=False):
        return self.page.evaluate("""({frames, baseline, live}) => new Promise(resolve => {
            const canvas = document.querySelector('#fluid-visual') || document.querySelector('#visual');
            const gl = canvas.getContext('webgl');
            const read = () => {
                const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                if (baseline) window.__visualizerBaseline = pixels;
                let difference = 0, count = 0;
                for (let i = 0; i < pixels.length; i += 64) {
                    for (let channel = 0; channel < 3; channel++) {
                        difference += Math.abs(pixels[i + channel] - window.__visualizerBaseline[i + channel]);
                        count++;
                    }
                }
                resolve(difference / count);
            };
            if (live) {
                const draw = gl.drawArrays;
                gl.drawArrays = function (...args) {
                    draw.apply(this, args);
                    if (gl.getParameter(gl.FRAMEBUFFER_BINDING)) return;
                    gl.drawArrays = draw;
                    read();
                };
            } else {
                window.__stepFluid(frames);
                read();
            }
        })""", {'frames': frames, 'baseline': baseline, 'live': live})

    def test_visualizer_reacts_to_audio_and_return_still_settles(self):
        serve_seekable_audio(self.page)
        self.start_controlled_fluid()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.fluid_frame_difference(baseline=True)
        self.assertLess(self.fluid_frame_difference(120), .01, 'VISUALIZER must wait for audible playback')
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('[data-fluid-reset]').click()
        self.page.evaluate("window.SecondSourceExperience.sampleAudio = () => ({active: true, bass: .8, mid: .15, treble: .1, beat: .6, level: .4})")
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('[data-visual-mode="visualizer"]')).to_have_attribute('aria-pressed', 'true')
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.visualizerEnabled'))
        self.assertTrue(self.page.evaluate("""() => {
            const frame = document.querySelector('#fluid-container').getBoundingClientRect();
            const media = document.querySelector('#fluid-container .visual-media').getBoundingClientRect();
            const dock = document.querySelector('[data-visualizer-dock]').getBoundingClientRect();
            return Math.abs(frame.width - frame.height) < 1 &&
                frame.left >= 0 && frame.top >= 0 && frame.right <= innerWidth && frame.bottom <= innerHeight &&
                Math.abs(media.width - frame.width) < 1 && Math.abs(media.height - frame.height) < 1 &&
                Math.abs(frame.left + frame.width / 2 - innerWidth / 2) < 1 &&
                dock.top >= frame.bottom && dock.bottom <= innerHeight;
        }"""))
        self.fluid_frame_difference(baseline=True)
        disturbed = self.fluid_frame_difference(120)
        self.assertGreater(disturbed, .5, 'Fullscreen must stir the artwork without any pointer input')
        control = self.page.locator('[data-fluid-return]')
        control.focus()
        self.page.keyboard.down('Space')
        self.assertLess(self.fluid_frame_difference(90), disturbed * .3, 'RETURN must suppress automatic currents and settle the image')
        self.page.keyboard.up('Space')
        self.page.locator('[data-motion-toggle]').click()
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.visualizerEnabled'))
        self.fluid_frame_difference(baseline=True)
        self.assertLess(self.fluid_frame_difference(120), .01)
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-visual-mode="visualizer"]')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('[data-motion-toggle]').click()
        self.page.locator('[data-visual-mode="fluid"]').click()
        self.fluid_frame_difference(baseline=True)
        self.assertLess(self.fluid_frame_difference(120), .01, 'Manual FLUID must stay manual even when the track has energy')
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))

    def test_visualizer_controls_hide_and_reappear_without_starting_audio(self):
        self.start_controlled_fluid()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.fluid_frame_difference(baseline=True)
        self.assertLess(self.fluid_frame_difference(120), .01)
        self.page.mouse.move(10, 10)
        self.page.wait_for_function("document.querySelector('[data-experience]').classList.contains('visualizer-idle')")
        self.assertEqual(self.page.locator('[data-visualizer-dock]').evaluate('node => getComputedStyle(node).pointerEvents'), 'none')
        self.page.keyboard.press('Tab')
        self.assertFalse(self.page.locator('[data-experience]').evaluate("node => node.classList.contains('visualizer-idle')"))
        self.assertTrue(self.page.locator('audio').evaluate('audio => audio.paused'))
        self.page.locator('[data-fullscreen]').click()

    def test_mobile_fullscreen_visualizer_stays_large_when_controls_hide_and_return(self):
        cases = [(320, 568, True), (375, 667, True), (390, 844, False), (844, 390, True)]
        for width, height, fallback in cases:
            with self.subTest(width=width, height=height, fallback=fallback):
                context = self.browser.new_context(
                    viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
                try:
                    page = context.new_page()
                    page.on('pageerror', lambda error: self.errors.append(str(error)))
                    playing = width == 375
                    if playing:
                        serve_seekable_audio(page)
                    page.goto(BASE_URL + '/', wait_until='networkidle')
                    page.evaluate('document.fonts.ready')
                    if playing:
                        page.locator('[data-sound]').tap()
                        page.wait_for_function('!document.querySelector("audio").paused && document.querySelector("audio").currentTime > .1')
                    if fallback:
                        page.locator('[data-experience]').evaluate('e => { e.requestFullscreen = undefined; }')
                    page.locator('[data-visual-mode="visualizer"]').tap()
                    art = page.locator('#fluid-container')
                    normal_width = art.bounding_box()['width']
                    page.locator('[data-fullscreen]').tap()
                    expect(page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
                    self.assertEqual(page.locator('[data-visualizer-dock]').evaluate('e => getComputedStyle(e).pointerEvents'), 'none')
                    page.wait_for_function('''normal => {
                        const r = document.querySelector('#fluid-container').getBoundingClientRect();
                        return r.width >= normal && r.width <= Math.min(innerWidth, innerHeight) + 1;
                    }''', arg=normal_width)
                    full = art.bounding_box()
                    self.assertAlmostEqual(full['width'], full['height'], delta=1)
                    self.assertAlmostEqual(full['x'] + full['width'] / 2, width / 2, delta=1)
                    self.assertAlmostEqual(full['y'] + full['height'] / 2, height / 2, delta=1)
                    self.assertGreaterEqual(full['x'], 0)
                    self.assertGreaterEqual(full['y'], 0)
                    page.wait_for_function('getComputedStyle(document.querySelector("[data-visualizer-dock]")).opacity === "0"', timeout=2000)
                    self.assertAlmostEqual(art.bounding_box()['width'], full['width'], delta=1)
                    self.assertEqual(page.locator('audio').evaluate('a => a.paused'), not playing)
                    if width == 320:
                        page.set_viewport_size({'width': height, 'height': width})
                        page.wait_for_function('''() => {
                            const r = document.querySelector('#fluid-container').getBoundingClientRect();
                            return Math.abs(r.width - Math.min(innerWidth, innerHeight)) < 1 && r.y >= 0;
                        }''')
                        width, height = height, width
                        full = art.bounding_box()
                        self.assertAlmostEqual(full['x'] + full['width'] / 2, width / 2, delta=1)
                        self.assertAlmostEqual(full['y'] + full['height'] / 2, height / 2, delta=1)
                    page.touchscreen.tap(width / 2, height / 2)
                    page.wait_for_function('getComputedStyle(document.querySelector("[data-visualizer-dock]")).opacity === "1"')
                    self.assertAlmostEqual(art.bounding_box()['width'], full['width'], delta=1)
                    self.assertEqual(page.locator('audio').evaluate('a => a.paused'), not playing)
                    dock = page.locator('[data-visualizer-dock]')
                    expect(dock.locator('button:visible')).to_have_count(2)
                    self.assertLessEqual(dock.bounding_box()['width'], 120)
                    self.assertLessEqual(dock.bounding_box()['height'], 64)
                    for selector in ['.player-titlebar', '.player-display', '.player-timeline', '[data-volume]', '[data-info]', '[data-copy-link]']:
                        expect(page.locator(selector)).not_to_be_visible()
                    for selector in ['[data-sound]', '[data-fullscreen]']:
                        box = page.locator(selector).bounding_box()
                        self.assertGreaterEqual(box['width'], 44)
                        self.assertGreaterEqual(box['height'], 44)
                    if playing:
                        page.locator('[data-sound]').tap()
                        page.wait_for_function('document.querySelector("audio").paused')
                        expect(page.locator('[data-play-symbol]')).to_have_attribute('data-state', 'play')
                        page.locator('[data-sound]').tap()
                        page.wait_for_function('!document.querySelector("audio").paused')
                        expect(page.locator('[data-play-symbol]')).to_have_attribute('data-state', 'pause')
                    page.locator('[data-fullscreen]').tap()
                    expect(page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'false')
                    self.assertFalse(page.locator('.site-header').evaluate('e => e.inert'))
                    expect(page.locator('.player-display')).to_be_visible()
                    expect(page.locator('.player-timeline')).to_be_visible()
                    if width == 568:
                        page.locator('[data-fullscreen]').tap()
                        self.assertEqual(page.locator('[data-visualizer-dock]').evaluate('e => getComputedStyle(e).pointerEvents'), 'none')
                        page.keyboard.press('Tab')
                        page.wait_for_function('getComputedStyle(document.querySelector("[data-visualizer-dock]")).opacity === "1"')
                        page.keyboard.press('Escape')
                        expect(page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'false')
                finally:
                    context.close()

    def test_visualizer_preserves_playback_and_respects_explicit_motion_toggle(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function("document.querySelector('audio').currentTime > .1")
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.visualizerEnabled'))
        self.page.emulate_media(reduced_motion='reduce')
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.visualizerEnabled'))
        self.page.locator('[data-motion-toggle]').click()
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.visualizerEnabled'))
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'false')
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))

    def test_visualizer_is_automatic_with_reduced_motion_and_ignores_mouse_stirring(self):
        serve_seekable_audio(self.page)
        self.page.emulate_media(reduced_motion='reduce')
        self.start_controlled_fluid()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.visualizerEnabled'))
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('[data-fluid-reset]').click()
        self.fluid_frame_difference(baseline=True)
        box = self.page.locator('#fluid-container').bounding_box()
        self.page.mouse.move(box['x'] + box['width'] * .3, box['y'] + box['height'] * .4)
        self.page.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .6, steps=12)
        self.page.mouse.down()
        self.page.mouse.move(box['x'] + box['width'] * .4, box['y'] + box['height'] * .3, steps=12)
        self.assertLess(self.fluid_frame_difference(30), .01, 'Mouse hover and drag must not stir VISUALIZER during its reset rest')
        self.assertGreater(self.fluid_frame_difference(180), .5, 'Random currents must resume by themselves even while the mouse is held')
        self.page.mouse.up()

    def test_visualizer_real_playback_moves_without_input_and_freezes_when_inaudible(self):
        serve_seekable_audio(self.page)
        self.page.emulate_media(reduced_motion='reduce')
        self.page.set_viewport_size({'width': 900, 'height': 700})
        self.page.add_init_script("""(() => {
            let seed = 42;
            Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        })();""")
        self.visit()
        self.page.locator('[data-visual-mode="visualizer"]').click()

        def difference_over_frames(count):
            self.fluid_frame_difference(baseline=True, live=True)
            self.wait_for_frames(count)
            return self.fluid_frame_difference(live=True)

        self.assertLess(difference_over_frames(30), .01, 'No movement before Play')
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('audio').evaluate('audio => { audio.currentTime = 30; }')
        self.page.wait_for_function('document.querySelector("audio").currentTime >= 30 && window.SecondSourceExperience.soundAudible')
        self.assertGreater(difference_over_frames(90), .5, 'Real music must animate without mouse input')
        self.page.locator('[data-sound]').click()
        self.assertLess(difference_over_frames(30), .01, 'Pause must freeze the entire effect, including beat accents')
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.assertGreater(difference_over_frames(60), .1, 'Playback must resume the animation')
        self.page.locator('[data-mute]').click()
        self.assertLess(difference_over_frames(30), .01, 'Mute must freeze the image')
        self.page.locator('[data-mute]').click()
        self.assertGreater(difference_over_frames(60), .1, 'Unmute must resume the animation')
        self.page.locator('[data-volume]').fill('0')
        self.assertLess(difference_over_frames(30), .01, 'Zero volume must freeze the image')
        self.page.locator('[data-volume]').fill('0.35')
        self.assertGreater(difference_over_frames(60), .1, 'Restoring volume must resume the animation')

    def test_visualizer_analyser_distinguishes_bass_mid_treble_and_bass_hits(self):
        serve_seekable_audio(self.page)
        self.page.add_init_script("""(() => {
            const Native = window.AudioContext;
            window.AudioContext = class extends Native {
                createMediaElementSource() {
                    const oscillator = this.createOscillator();
                    const level = this.createGain();
                    oscillator.frequency.value = 80;
                    level.gain.value = .15;
                    oscillator.connect(level);
                    oscillator.start();
                    window.__analysisTone = oscillator;
                    window.__analysisLevel = level;
                    return level;
                }
            };
        })();""")
        self.visit()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.sampleAudio().bass > .15')
        low = self.page.evaluate('window.SecondSourceExperience.sampleAudio()')
        self.assertGreater(low['bass'], low['mid'] + .1)
        dominant = """(() => {
            const levels = Array.from(document.querySelectorAll('.spectrum-band'), band => Number(band.style.getPropertyValue('--level')));
            return levels.indexOf(Math.max(...levels));
        })()"""
        self.page.wait_for_function(f'{dominant} >= 0 && {dominant} < 7')
        self.page.evaluate('window.__analysisTone.frequency.value = 1000')
        self.page.wait_for_function('window.SecondSourceExperience.sampleAudio().mid > window.SecondSourceExperience.sampleAudio().bass + .05')
        self.page.evaluate('window.__analysisTone.frequency.value = 6000')
        self.page.wait_for_function('window.SecondSourceExperience.sampleAudio().treble > window.SecondSourceExperience.sampleAudio().mid + .03')
        self.page.wait_for_function(f'{dominant} > 13')
        self.page.evaluate('window.__analysisLevel.gain.value = 0')
        self.page.wait_for_function('window.SecondSourceExperience.sampleAudio().level < .01')
        self.page.evaluate('window.__analysisTone.frequency.value = 80; window.__analysisLevel.gain.value = .35')
        self.page.wait_for_function('window.SecondSourceExperience.sampleAudio().beat > .2')
        self.page.locator('[data-mute]').click()
        self.assertFalse(self.page.evaluate('window.SecondSourceExperience.sampleAudio().active'))
        self.assertEqual(self.page.evaluate('window.SecondSourceExperience.sampleBass()'), 0)

    def test_visualizer_kick_drips_expand_and_fade_without_distorting_the_fluid_map(self):
        serve_seekable_audio(self.page)
        self.start_controlled_fluid()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.evaluate("""() => {
            window.__music = {active: true, bass: .5, mid: .1, treble: .1, beat: 0, beatId: 0, level: .3};
            window.SecondSourceExperience.sampleAudio = () => window.__music;
            window.__stepFluid(60);
            window.__music.beatId = 1;
            window.__music.beat = 1;
            window.__stepFluid(1);
        }""")

        def ripple_impact(frames):
            # Compare two draws of the same fluid field, with/without its transient
            # drip overlay. This isolates the expanding ring from background flow.
            return self.page.evaluate("""frames => {
                window.__stepFluid(frames);
                const canvas = document.querySelector('#fluid-visual');
                const gl = canvas.getContext('webgl'), program = gl.getParameter(gl.CURRENT_PROGRAM);
                const drips = new Float32Array(32);
                for (let i = 0; i < 8; i++) drips.set(gl.getUniform(program, gl.getUniformLocation(program, `u_drips[${i}]`)), i * 4);
                const active = new Uint8Array(canvas.width * canvas.height * 4), quiet = new Uint8Array(active.length);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, active);
                const hidden = drips.slice();
                for (let i = 2; i < hidden.length; i += 4) hidden[i] = -1;
                const uniform = gl.getUniformLocation(program, 'u_drips[0]');
                gl.uniform4fv(uniform, hidden);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, quiet);
                gl.uniform4fv(uniform, drips);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                let sum = 0, radial = 0, samples = 0;
                for (let i = 0; i < active.length; i += 16) {
                    const delta = Math.abs(active[i] - quiet[i]) + Math.abs(active[i + 1] - quiet[i + 1]) + Math.abs(active[i + 2] - quiet[i + 2]);
                    const pixel = i / 4, x = (pixel % canvas.width + .5) / canvas.width, y = (Math.floor(pixel / canvas.width) + .5) / canvas.height;
                    sum += delta;
                    radial += delta * Math.hypot(x - drips[0], y - drips[1]);
                    samples += 3;
                }
                return {difference: sum / samples, radius: radial / Math.max(1, sum)};
            }""", frames)

        early = ripple_impact(15)
        later = ripple_impact(30)
        self.assertGreater(early['difference'], .03, 'A kick must create a visible drip')
        self.assertGreater(later['radius'], early['radius'] + .08, 'The ring must expand outward like a homepage click')
        self.assertLess(ripple_impact(200)['difference'], .01, 'Expired rings must leave no lasting displacement')

    def test_visualizer_limits_drips_to_two_bars_and_freezes_on_pause(self):
        serve_seekable_audio(self.page)
        self.start_controlled_fluid()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.evaluate("""() => {
            window.__music = {active: true, bass: .5, mid: .1, treble: .1, beat: 0, beatId: 0, level: .3};
            window.__musicPosition = 30;
            Object.defineProperty(window.SecondSourceExperience, 'playbackTime', {get: () => window.__musicPosition});
            window.SecondSourceExperience.sampleAudio = () => window.__music;
        }""")

        def drips_after(frames):
            return self.page.evaluate("""frames => {
                window.__stepFluid(frames);
                const gl = document.querySelector('#fluid-visual').getContext('webgl'), program = gl.getParameter(gl.CURRENT_PROGRAM);
                return Array.from({length: 8}, (_, i) => Array.from(gl.getUniform(program, gl.getUniformLocation(program, `u_drips[${i}]`))))
                    .filter(drip => drip[2] >= 0 && drip[2] < 3.8 && drip[3] > 0);
            }""", frames)

        self.assertEqual(drips_after(60), [])
        self.page.evaluate('window.__music.beatId = 1; window.__music.beat = .8')
        first = drips_after(15)
        self.assertEqual(len(first), 1, 'A held beat envelope must emit only one drop')
        self.page.evaluate('window.__musicPosition = 30.5; window.__music.beatId = 2; window.__music.beat = .7')
        self.assertEqual(len(drips_after(1)), 1, 'Closely spaced kicks must leave the existing ring alone')
        self.assertEqual(len(drips_after(90)), 1, 'Advancing fluid frames must not advance the musical clock or queue a hit')
        self.page.evaluate('window.__musicPosition = 32; window.__music.beatId = 3')
        self.assertEqual(len(drips_after(1)), 1, 'Two seconds is still shorter than a 4/4 bar at 114 BPM')
        self.page.evaluate('window.__musicPosition = 32.106; window.__music.beatId = 4')
        self.assertEqual(len(drips_after(1)), 1, 'A full bar must still be too soon for another drop')
        self.page.evaluate('window.__musicPosition = 34.210; window.__music.beatId = 5')
        self.assertEqual(len(drips_after(1)), 1, 'A kick just before the end of two bars must be skipped')
        self.page.evaluate('window.__musicPosition = 34.212; window.__music.beatId = 6')
        overlapping = drips_after(1)
        self.assertEqual(len(overlapping), 2)
        self.assertEqual(overlapping[0][:2], first[0][:2], 'The next kick must not relocate an existing ring')
        self.assertGreater(overlapping[0][2], first[0][2])
        self.assertEqual(overlapping[1][2], 0)
        self.page.locator('[data-sound]').click()
        self.fluid_frame_difference(baseline=True)
        self.assertLess(self.fluid_frame_difference(30), .01)
        self.assertEqual(drips_after(30), overlapping, 'Pausing must freeze all ring ages')
        self.page.locator('[data-fluid-reset]').click()
        self.assertEqual(drips_after(1), [])

    def test_player_spectrum_follows_real_audio_and_stops_when_silent(self):
        serve_seekable_audio(self.page)
        self.visit()
        expect(self.page.locator('.spectrum-band')).to_have_count(20)
        expect(self.page.locator('[data-player-state]')).to_have_text('STOPPED')
        levels = "Array.from(document.querySelectorAll('.spectrum-band'), band => Number(band.style.getPropertyValue('--level')))"
        self.assertTrue(self.page.evaluate(f'({levels}).every(value => value === 0)'))
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function(f'({levels}).some(value => value > .05)')
        expect(self.page.locator('[data-player-state]')).to_have_text('PLAYING')
        expect(self.page.locator('[data-play-symbol]')).to_have_attribute('data-state', 'pause')
        self.page.locator('[data-mute]').click()
        expect(self.page.locator('[data-player-state]')).to_have_text('MUTED')
        self.assertTrue(self.page.evaluate(f'({levels}).every(value => value === 0)'))
        self.page.locator('[data-mute]').click()
        self.page.wait_for_function(f'({levels}).some(value => value > .05)')
        self.page.locator('[data-motion-toggle]').click()
        self.assertTrue(self.page.evaluate(f'({levels}).every(value => value === 0)'))
        self.assertTrue(self.page.evaluate('window.SecondSourceExperience.soundPlaying'))
        self.page.locator('[data-motion-toggle]').click()
        self.page.wait_for_function(f'({levels}).some(value => value > .05)')
        self.page.locator('[data-volume]').fill('0')
        self.assertTrue(self.page.evaluate(f'({levels}).every(value => value === 0)'))
        self.page.locator('[data-volume]').fill('0.35')
        self.page.wait_for_function(f'({levels}).some(value => value > .05)')
        self.page.locator('[data-sound]').click()
        expect(self.page.locator('[data-player-state]')).to_have_text('PAUSED')
        expect(self.page.locator('[data-play-symbol]')).to_have_attribute('data-state', 'play')
        self.assertTrue(self.page.evaluate(f'({levels}).every(value => value === 0)'))

    def test_visualizer_detects_repeated_bass_hits_in_the_actual_loud_master(self):
        serve_seekable_audio(self.page)
        self.page.set_viewport_size({'width': 900, 'height': 700})
        self.visit()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('audio').evaluate('audio => { audio.currentTime = 45; }')
        self.page.wait_for_function('document.querySelector("audio").currentTime >= 46.5')
        result = self.page.evaluate("""() => new Promise(resolve => {
            let previous = 0, hits = 0, maxActive = 0;
            const dropsSeen = new Set();
            const timer = setInterval(() => {
                const beat = window.SecondSourceExperience.sampleAudio().beat;
                if (beat > previous + .15) hits++;
                previous = beat;
                const gl = document.querySelector('#fluid-visual').getContext('webgl'), program = gl.getParameter(gl.CURRENT_PROGRAM);
                let active = 0;
                for (let i = 0; i < 8; i++) {
                    const drip = gl.getUniform(program, gl.getUniformLocation(program, `u_drips[${i}]`));
                    if (drip && drip[2] >= 0 && drip[2] < 3.8 && drip[3] > 0) { active++; dropsSeen.add(i); }
                }
                maxActive = Math.max(maxActive, active);
            }, 30);
            setTimeout(() => { clearInterval(timer); resolve({hits, maxActive, dropsSeen: dropsSeen.size}); }, 5500);
        })""")
        self.assertGreaterEqual(result['hits'], 2, 'Bass detection must keep finding attacks after startup, even in this loud master')
        self.assertGreaterEqual(result['dropsSeen'], 2, 'Real music must keep creating new drips after startup')
        self.assertGreaterEqual(result['maxActive'], 1, 'Detected bass hits must produce visible rings in the renderer')

    def test_fullscreen_fallback_escape_and_focus(self):
        self.visit()
        self.page.locator("[data-experience]").evaluate("e => { e.requestFullscreen = () => Promise.reject(new Error('Unavailable')); }")
        button = self.page.locator("[data-fullscreen]")
        button.click()
        self.page.wait_for_function("document.querySelector('[data-experience]').classList.contains('is-immersive')")
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
        self.assertTrue(self.page.evaluate("document.querySelector('#experience-info').contains(document.activeElement) || document.activeElement === document.body"))
        self.page.keyboard.press("Escape")
        expect(button).to_be_focused()

    def test_about_contact_navigation_and_social_previews_work_without_javascript(self):
        context = self.browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
        try:
            page = context.new_page()
            for route in ['', 'releases/', 'sources/', 'merch/', 'sources/flower/', 'about/']:
                with self.subTest(route=route):
                    page.goto(BASE_URL + '/' + route, wait_until='networkidle')
                    canonical = page.locator('link[rel="canonical"]').get_attribute('href')
                    expect(page.locator('meta[property="og:url"]')).to_have_attribute('content', canonical)
                    image = page.locator('meta[property="og:image"]').get_attribute('content')
                    self.assertTrue(image.startswith('https://www.enterthedream.org/images/share/'))
                    response = page.request.get(BASE_URL + urlsplit(image).path)
                    self.assertEqual(response.status, 200)
                    self.assertTrue(response.body().startswith(b'\x89PNG\r\n\x1a\n'))
                    expect(page.locator('meta[name="twitter:card"]')).to_have_attribute('content', 'summary_large_image')
                    self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'), 390)
                    link = page.locator('.site-nav').get_by_role('link', name='ABOUT / CONTACT', exact=True)
                    expect(link).to_have_attribute('href', '/about/')
                    expect(page.locator('.legal-footer details')).to_have_count(0)
                    link.click()
                    page.wait_for_url('**/about/')
                    expect(page.locator('h1')).to_have_text('ABOUT / CONTACT')
                    expect(page.locator('.site-nav [aria-current="page"]')).to_have_text('ABOUT / CONTACT')
                    about = page.locator('.about-page')
                    expect(about.locator('.about-copy p').first).to_have_text(
                        'Second Source is an independent outlet for audio and visual experimentation, based in Oslo, Norway.')
                    expect(about).to_contain_text('without being limited to a particular genre or medium.')
                    expect(about.locator('.about-contact').get_by_role('link')).to_have_attribute('href', 'mailto:secondsourceaudio@gmail.com')
                    expect(about.locator('.about-contact').get_by_role('link')).to_be_visible()
                    expect(about.get_by_role('img', name='Second Source', exact=True)).to_be_visible()
                    self.assertTrue(about.locator('img').evaluate('image => image.complete && image.naturalWidth > 0'))
        finally:
            context.close()

    def test_ai_training_rules_keep_search_crawlers_and_public_pages_accessible(self):
        response = self.page.request.get(BASE_URL+'/robots.txt')
        self.assertEqual(response.status, 200)
        rules = response.text()
        parser = RobotFileParser()
        parser.parse(rules.splitlines())
        for crawler in ['GPTBot','ClaudeBot','Google-Extended','CCBot','Bytespider','Meta-ExternalAgent','Applebot-Extended']:
            for path in ['/','/audio/dream-scenario.mp3','/images/drip_cover_front_2.webp']:
                self.assertFalse(parser.can_fetch(crawler,BASE_URL+path), (crawler,path))
        for crawler in ['Googlebot','Googlebot-Image','Bingbot','OAI-SearchBot','Claude-SearchBot']:
            for path in ['/','/about/','/releases/','/sources/','/merch/','/sitemap.xml']:
                self.assertTrue(parser.can_fetch(crawler,BASE_URL+path), (crawler,path))
        self.assertIn('https://www.enterthedream.org/sitemap.xml',parser.site_maps())
        context = self.browser.new_context(java_script_enabled=False, viewport={'width':390,'height':844})
        try:
            page = context.new_page()
            page.goto(BASE_URL+'/about/',wait_until='networkidle')
            page.locator('.copyright-policy').click()
            page.wait_for_url('**/rights/')
            expect(page.locator('h1')).to_have_text('Copyright & AI usage')
            expect(page.locator('.rights-copy')).to_contain_text('© 2026 Second Source and the respective rightsholders. All rights reserved.')
            expect(page.locator('.rights-copy')).to_contain_text('prior authorization from the relevant rightsholder.')
            expect(page.locator('.rights-copy')).to_contain_text('Article 4(3) of Directive (EU) 2019/790.')
            self.assertLessEqual(page.evaluate('document.body.scrollWidth'),390)
        finally:
            context.close()

    def test_about_navigation_and_back_keep_the_homepage_usable(self):
        self.visit()
        self.page.locator('.site-nav').get_by_role('link', name='ABOUT / CONTACT', exact=True).click()
        self.page.wait_for_url('**/about/')
        expect(self.page.locator('.about-logo')).to_be_visible()
        expect(self.page.locator('audio')).to_have_count(0)
        self.page.go_back(wait_until='networkidle')
        self.assertNotIn('page-is-leaving', self.page.locator('body').get_attribute('class') or '')
        expect(self.page.locator('[data-sound]')).to_be_enabled()
        self.assertTrue(self.page.locator('audio').evaluate('audio => audio.paused'))

    def test_shared_visualizer_link_restores_mode_and_position_only_after_play(self):
        serve_seekable_audio(self.page)
        audio_requests = []
        self.page.on('request', lambda request: audio_requests.append(request.url) if '/audio/' in request.url else None)
        self.page.goto(BASE_URL + '/?mode=visualizer&t=61.25', wait_until='networkidle')
        expect(self.page.locator('[data-save-frame]')).to_have_count(0)
        expect(self.page.locator('[data-visual-mode="visualizer"]')).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('[data-current-time]')).to_have_text('1:01')
        expect(self.page.locator('[data-tools-status]')).to_contain_text('Press play to start.')
        self.assertEqual(audio_requests, [])
        self.assertTrue(self.page.locator('audio').evaluate('audio => audio.paused'))
        expect(self.page.locator('[data-copy-link]')).to_have_count(0)
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('document.querySelector("audio").currentTime >= 61.25 && window.SecondSourceExperience.soundAudible')
        self.assertLess(self.page.locator('audio').evaluate('audio => audio.currentTime'), 65)
        self.page.locator('[data-sound]').click()
        self.assertTrue(self.page.locator('audio').evaluate('audio => audio.paused'))
        self.page.goto(BASE_URL + '/?mode=invalid&t=NaN', wait_until='networkidle')
        expect(self.page.locator('[data-visual-mode="whirl"]')).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('[data-current-time]')).to_have_text('0:00')

    def test_copy_link_has_a_keyboard_safe_fallback_when_clipboard_is_blocked(self):
        self.context.add_init_script("Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => Promise.reject(new Error('Blocked'))}})")
        self.page.goto(BASE_URL + '/drip-fluid/?t=30', wait_until='networkidle')
        self.page.locator('[data-experience]').evaluate("space => { space.requestFullscreen = () => Promise.reject(new Error('Unavailable')); }")
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('[data-copy-link]').click()
        dialog = self.page.locator('.share-dialog')
        expect(dialog).to_be_visible()
        field = dialog.locator('input')
        expect(field).to_have_value('https://www.enterthedream.org/drip-fluid/?t=30')
        expect(field).to_be_focused()
        self.assertEqual(field.evaluate('input => input.selectionEnd - input.selectionStart'), len(field.input_value()))
        dialog.get_by_role('button', name='Close sharing').focus()
        self.page.keyboard.press('p')
        self.assertTrue(self.page.locator('audio').evaluate('audio => audio.paused'))
        self.page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        expect(self.page.locator('[data-copy-link]')).to_be_focused()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'false')

    def test_clean_merch_route_shows_original_mockups_and_full_size_images(self):
        self.visit()
        self.page.locator('.site-nav').get_by_role('link', name='MERCH', exact=True).click()
        self.page.wait_for_url('**/merch/')
        expect(self.page.locator('.merch-product-status')).to_have_text(['MOCKUP', 'MOCKUP'])
        expect(self.page.locator('.merch-mockup-notice')).to_contain_text('Design mockups only.')
        for image, height in zip(self.page.locator('.merch-product-image').all(), [569, 450]):
            image.scroll_into_view_if_needed()
            image.evaluate('image => image.decode()')
            self.assertEqual(image.evaluate('image => [image.naturalWidth, image.naturalHeight]'), [1536, height])
            box = image.bounding_box()
            self.assertAlmostEqual(box['width'] / box['height'], 1536 / height, delta=.01)
        preview = self.page.locator('.merch-product-preview').first
        preview.click()
        viewer = self.page.locator('[data-merch-viewer]')
        expect(viewer).to_be_visible()
        self.assertTrue(viewer.locator('[data-merch-viewer-image]').get_attribute('src').endswith('/images/merch/second-source-tshirt.webp'))
        viewer.locator('[data-merch-close]').click()
        expect(viewer).not_to_be_visible()
        expect(preview).to_be_focused()

    def test_legacy_page_urls_redirect_without_losing_query_or_fragment(self):
        for legacy, route, title in [
            ('merch.html', '/merch/', 'MERCH'),
            ('releases.html', '/releases/', 'RELEASES'),
            ('experiments.html', '/sources/', 'SOURCES'),
            ('experiment.html', '/sources/flower/', 'FLOWER'),
            ('gallery.html', '/releases/', 'RELEASES'),
        ]:
            with self.subTest(legacy=legacy):
                self.page.goto(f'{BASE_URL}/{legacy}?from=bookmark#main-content', wait_until='networkidle')
                expect(self.page).to_have_url(f'{BASE_URL}{route}?from=bookmark#main-content')
                expect(self.page.locator('h1')).to_have_text(title)
                self.assertTrue(self.page.locator('.site-nav a').evaluate_all(
                    "links => links.every(link => !link.getAttribute('href').includes('.html'))"))
        self.page.goto(BASE_URL + '/index.html?from=bookmark#main-content', wait_until='networkidle')
        expect(self.page).to_have_url(BASE_URL + '/?from=bookmark#main-content')

    def test_legacy_merch_redirect_also_works_without_javascript(self):
        context = self.browser.new_context(java_script_enabled=False)
        try:
            page = context.new_page()
            page.goto(BASE_URL + '/merch.html', wait_until='networkidle')
            page.wait_for_url('**/merch/')
            expect(page.locator('h1')).to_have_text('MERCH')
            expect(page.locator('.merch-product-image')).to_have_count(2)
        finally:
            context.close()

    def test_releases_navigation_shows_release_information(self):
        self.visit()
        expect(self.page.locator('.site-nav a')).to_have_text(['RELEASES', 'SOURCES', 'MERCH', 'ABOUT / CONTACT', 'BANDCAMP'])
        self.page.locator('.site-nav').get_by_role('link', name='RELEASES').click()
        self.page.wait_for_url('**/releases/')
        expect(self.page.locator('h1')).to_have_text('RELEASES')
        expect(self.page.locator('.site-nav [aria-current="page"]')).to_have_text('RELEASES')
        expect(self.page.locator('.release-entry')).to_have_count(1)
        expect(self.page.locator('.release-catalogue')).to_have_text('SECOND SOURCE / SRC001')
        expect(self.page.locator('.release-title')).to_have_text('DRIP')
        expect(self.page.locator('.release-artist')).to_have_text('MARTIN SOLLI')
        expect(self.page.locator('.release-availability')).to_have_text('SPRING 2027 / Vinyl & Digital')
        expect(self.page.locator('.release-side')).to_have_count(2)
        expect(self.page.locator('.release-tracks li')).to_have_count(10)
        expect(self.page.locator('.release-credit-list > div')).to_have_count(5)
        expect(self.page.locator('.release-credit-list')).to_contain_text('ADDITIONAL SYNTH & BASS (TRACKS 3 & 10)')
        expect(self.page.locator('.release-credit-list')).to_contain_text('Einar Bersvendsen')
        self.assertTrue(self.page.locator('.release-cover').evaluate('image => image.complete && image.naturalWidth === 3200'))
        expect(self.page.locator('.release-entry a, .release-entry button, a[href*="src001"], [data-artwork-dialog]')).to_have_count(0)
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        self.page.go_back(wait_until='networkidle')
        self.assertNotIn('page-is-leaving', self.page.locator('body').get_attribute('class') or '')

    def test_retired_images_page_redirects_to_releases(self):
        self.visit('gallery.html')
        self.page.wait_for_url('**/releases/')
        expect(self.page.locator('h1')).to_have_text('RELEASES')
        expect(self.page.locator('.archive, #gallery-viewer, a[href*="gallery.html"]')).to_have_count(0)

    def test_sources_are_public_and_flower_keeps_its_direct_link(self):
        self.visit('experiments.html')
        self.page.wait_for_url('**/sources/')
        expect(self.page.locator('.site-nav a[href="/sources/"]')).to_have_count(1)
        expect(self.page.locator('.site-nav [aria-current="page"]')).to_have_text('SOURCES')
        expect(self.page.locator('h1')).to_have_text('SOURCES')
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        self.visit('sources/flower/')
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        expect(self.page.locator('#visual')).to_have_attribute('data-fluid', 'ready')

    def test_mobile_layout_and_player_controls(self):
        for width in [320, 390, 768]:
            self.page.set_viewport_size({"width": width, "height": 844})
            for path in ["index.html", "drip-fluid.html", "experiment.html", "experiments.html", "releases.html", "merch.html", "src001.html", "about/"]:
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
        expect(self.page.locator("#experience-info")).to_be_visible()

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
        expect(self.page.locator("#experience-info")).to_be_visible()

    def test_src_skins_preserve_audio_and_remember_the_selected_skin(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.evaluate('window.__srcAudio = document.querySelector("audio")')
        self.page.locator('[data-volume]').fill('0.42')
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        started = self.page.locator('audio').evaluate('a => a.currentTime')
        player = self.page.locator('.compact-player')
        colours = set()
        for skin in ['chrome', 'cobalt', 'amber', 'graphite']:
            self.page.locator('[data-skin-cycle]').click()
            expect(player).to_have_attribute('data-skin', skin)
            colours.add(player.locator('.player-display').evaluate('e => getComputedStyle(e).backgroundColor'))
            self.assertTrue(self.page.evaluate('document.querySelector("audio") === window.__srcAudio && !window.__srcAudio.paused'))
            expect(self.page.locator('[data-volume-output]')).to_have_text('42%')
        self.assertEqual(len(colours), 4)
        self.assertGreaterEqual(self.page.locator('audio').evaluate('a => a.currentTime'), started)
        self.page.locator('[data-skin-cycle]').click()
        self.page.locator('[data-skin-cycle]').click()
        self.page.reload(wait_until='networkidle')
        expect(player).to_have_attribute('data-skin', 'cobalt')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))

    def test_src_windows_move_with_pointer_and_keyboard_and_dock_for_fullscreen(self):
        self.visit()
        handle = self.page.locator('[data-player-handle]')
        handle.scroll_into_view_if_needed()
        player = self.page.locator('.compact-player')
        controls = self.page.locator('.experience-controls').bounding_box()
        before = player.bounding_box()
        target = handle.bounding_box()
        self.page.mouse.move(target['x'] + 20, target['y'] + 10)
        self.page.mouse.down()
        self.page.mouse.move(target['x'] + 130, target['y'] - 100, steps=8)
        self.page.mouse.up()
        self.assertIn('src-floating', player.get_attribute('class'))
        after = player.bounding_box()
        self.assertGreater(after['x'], before['x'] + 50)
        self.assertLess(after['y'], before['y'] - 50)
        self.assertAlmostEqual(self.page.locator('.experience-controls').bounding_box()['y'], controls['y'], delta=1)
        self.page.mouse.move(10, 10)
        self.assertEqual(player.bounding_box(), after)
        self.page.set_viewport_size({'width': 500, 'height': 600})
        self.page.wait_for_function('''() => {
            const r = document.querySelector('.compact-player').getBoundingClientRect();
            return r.left >= 12 && r.right <= innerWidth - 12 && r.top >= 12 && r.bottom <= innerHeight - 12;
        }''')
        self.page.set_viewport_size({'width': 1440, 'height': 1000})
        handle.focus()
        self.page.keyboard.press('Home')
        self.assertNotIn('src-floating', player.get_attribute('class'))
        self.page.keyboard.press('ArrowLeft')
        self.assertIn('src-floating', player.get_attribute('class'))
        self.page.locator('[data-dock-player]').click()
        expect(handle).to_be_focused()
        self.assertNotIn('src-floating', player.get_attribute('class'))
        self.page.keyboard.press('ArrowUp')
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.assertNotIn('src-floating', player.get_attribute('class'))
        self.page.locator('[data-info]').click()
        info = self.page.locator('#experience-info')
        heading = self.page.locator('[data-info-handle]')
        box = heading.bounding_box()
        original = info.bounding_box()
        self.page.mouse.move(box['x'] + 15, box['y'] + 15)
        self.page.mouse.down()
        self.page.mouse.move(box['x'] + 70, box['y'] + 40, steps=5)
        self.page.mouse.up()
        self.assertGreater(info.bounding_box()['x'], original['x'] + 30)
        self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-info]')).to_be_focused()
        self.page.locator('[data-fullscreen]').click()

    def test_src_image_map_and_ascii_polarity_work_without_starting_audio(self):
        self.visit()
        self.page.locator('[data-open-index]').click()
        dialog = self.page.locator('#src-index')
        expect(dialog).to_be_visible()
        expect(self.page.locator('[data-close-index]')).to_be_focused()
        self.page.wait_for_function('document.querySelector(".src-image-map img").naturalWidth > 0')
        links = dialog.locator('.src-map-node')
        self.assertEqual(links.evaluate_all('links => links.map(a => a.getAttribute("href"))'),
                         ['/releases/', '/merch/', '/about/', '/sources/flower/'])
        self.page.locator('[data-alternate-state]').click()
        expect(self.page.locator('[data-alternate-state]')).to_have_attribute('aria-pressed', 'true')
        self.assertIn('invert(1)', self.page.locator('#visual-media').evaluate('e => getComputedStyle(e).filter'))
        self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-open-index]')).to_be_focused()
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused && a.currentTime === 0'))
        self.page.locator('[data-open-index]').click()
        self.page.locator('[data-alternate-state]').click()
        expect(self.page.locator('[data-alternate-state]')).to_have_attribute('aria-pressed', 'false')
        self.page.locator('.src-map-flower').click()
        self.page.wait_for_url('**/sources/flower/')
        expect(self.page.locator('audio')).to_have_count(0)

    def test_src_controls_fit_touch_screens_without_draggable_headers(self):
        context = self.browser.new_context(viewport={'width': 320, 'height': 740}, is_mobile=True, has_touch=True)
        try:
            page = context.new_page()
            page.goto(BASE_URL + '/', wait_until='networkidle')
            expect(page.locator('[data-player-handle]')).not_to_have_attribute('tabindex', '0')
            page.locator('[data-skin-cycle]').tap()
            expect(page.locator('.compact-player')).to_have_attribute('data-skin', 'chrome')
            self.assertTrue(page.locator('.player-controls button, .player-controls input, .volume-percent').evaluate_all(
                'elements => elements.every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })'))
            page.locator('[data-open-index]').tap()
            expect(page.locator('#src-index')).to_be_visible()
            self.assertTrue(page.locator('.src-map-node').evaluate_all(
                'links => links.every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44; })'))
            page.locator('[data-close-index]').tap()
            expect(page.locator('#src-index')).not_to_be_visible()
        finally:
            context.close()

    def test_continuous_player_keeps_one_audio_session_and_respects_pause_and_close(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.evaluate('''() => {
            window.__persistentAudio = document.querySelector('audio');
            window.__audioPauses = 0;
            window.__persistentAudio.addEventListener('pause', () => window.__audioPauses++);
        }''')
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('audio').evaluate('audio => { audio.currentTime = 30; }')
        self.page.wait_for_function('document.querySelector("audio").currentTime >= 30')
        self.page.locator('.site-nav a[href="/releases/"]').click()
        self.page.wait_for_url('**/releases/')
        expect(self.page.get_by_role('heading', name='RELEASES', exact=True)).to_be_visible()
        expect(self.page.locator('[data-corner-player]')).to_be_visible()
        self.assertTrue(self.page.evaluate('document.querySelector("audio") === window.__persistentAudio && !window.__persistentAudio.paused && window.__persistentAudio.currentTime >= 30'))
        self.assertEqual(self.page.evaluate('window.__audioPauses'), 0)
        self.assertEqual(self.page.locator('link[rel="canonical"]').get_attribute('href'), 'https://www.enterthedream.org/releases/')
        self.page.locator('[data-corner-play]').click()
        self.page.wait_for_function('document.querySelector("audio").paused')
        self.page.locator('.site-nav a[href="/merch/"]').click()
        self.page.wait_for_url('**/merch/')
        expect(self.page.get_by_role('heading', name='MERCH', exact=True)).to_be_visible()
        self.assertTrue(self.page.evaluate('window.__persistentAudio.paused'))
        self.page.locator('[data-corner-play]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('[data-corner-close]').click()
        expect(self.page.locator('[data-corner-player]')).not_to_be_visible()
        self.assertTrue(self.page.evaluate('window.__persistentAudio.paused'))
        self.page.locator('.site-nav a[href="/about/"]').click()
        self.page.wait_for_url('**/about/')
        expect(self.page.get_by_role('heading', name='ABOUT / CONTACT', exact=True)).to_be_visible()
        expect(self.page.locator('[data-corner-player]')).not_to_be_visible()
        self.assertTrue(self.page.evaluate('window.__persistentAudio.paused'))
        self.page.locator('.site-logo').click()
        self.page.wait_for_url(BASE_URL + '/')
        expect(self.page.locator('.compact-player')).to_be_visible()
        self.assertTrue(self.page.evaluate('document.querySelector("audio") === window.__persistentAudio && window.__persistentAudio.paused'))

    def test_continuous_player_returns_to_visualizer_and_supports_browser_history(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.locator('[data-visual-mode="visualizer"]').click()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.evaluate('window.__persistentAudio = document.querySelector("audio")')
        self.page.locator('.site-nav a[href="/about/"]').click()
        self.page.wait_for_url('**/about/')
        self.wait_for_frames(6)
        draws = self.page.evaluate('window.__drawCalls')
        self.wait_for_frames(6)
        self.assertEqual(self.page.evaluate('window.__drawCalls'), draws, 'The hidden artwork must stop rendering while music continues')
        self.page.locator('[data-corner-expand]').click()
        expect(self.page.locator('[data-volume]')).to_be_visible()
        self.page.locator('[data-volume]').fill('0.25')
        expect(self.page.locator('[data-volume-output]')).to_have_text('25%')
        self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-corner-expand]')).to_be_focused()
        expect(self.page.locator('#src-corner-detail')).not_to_be_visible()
        self.page.go_back()
        self.page.wait_for_url(BASE_URL + '/')
        expect(self.page.locator('[data-visual-mode="visualizer"]')).to_have_attribute('aria-pressed', 'true')
        self.assertTrue(self.page.evaluate('document.querySelector("audio") === window.__persistentAudio && !window.__persistentAudio.paused'))
        self.page.wait_for_function('before => window.__drawCalls > before', arg=draws)
        self.assertEqual(self.page.title(), 'Second Source Audio — Independent Record Label, Oslo')
        self.page.go_forward()
        self.page.wait_for_url('**/about/')
        expect(self.page.locator('.about-logo')).to_be_visible()
        self.assertEqual(self.page.title(), 'About & Contact — Second Source Audio')
        self.assertTrue(self.page.evaluate('document.querySelector("audio") === window.__persistentAudio && !window.__persistentAudio.paused'))
        self.page.reload(wait_until='networkidle')
        expect(self.page.locator('audio, [data-corner-player]')).to_have_count(0)

    def test_continuous_player_visits_rights_without_interrupting_audio(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        audio = self.page.locator('audio').element_handle()
        self.page.locator('.copyright-policy').click()
        self.page.wait_for_url('**/rights/')
        expect(self.page.locator('.rights-copy')).to_contain_text('Article 4(3)')
        expect(self.page.locator('meta[name="robots"]')).to_have_attribute('content','noindex, follow')
        self.assertTrue(audio.evaluate('a => a === document.querySelector("audio") && !a.paused'))
        self.page.locator('.site-logo').click()
        self.page.wait_for_url(BASE_URL + '/')
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        self.assertTrue(audio.evaluate('a => a === document.querySelector("audio") && !a.paused'))

    def test_continuous_player_falls_back_to_a_real_page_when_soft_navigation_fails(self):
        serve_seekable_audio(self.page)
        self.visit()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.evaluate('window.__persistentProof = true')
        def respond(route):
            if route.request.resource_type == 'fetch':
                route.fulfill(status=200, content_type='text/html', body='<html><title>Unexpected page</title></html>')
            else:
                route.continue_()
        self.page.route('**/merch/', respond)
        self.page.locator('.site-nav a[href="/merch/"]').click()
        self.page.wait_for_url('**/merch/')
        expect(self.page.get_by_role('heading', name='MERCH', exact=True)).to_be_visible()
        self.assertFalse(self.page.evaluate('!!window.__persistentProof'))
        expect(self.page.locator('audio')).to_have_count(0)

    def test_continuous_player_fits_mobile_and_can_leave_fullscreen_from_index(self):
        serve_seekable_audio(self.page)
        self.page.set_viewport_size({'width': 320, 'height': 740})
        self.visit()
        self.page.locator('[data-sound]').click()
        self.page.wait_for_function('window.SecondSourceExperience.soundAudible')
        self.page.locator('[data-fullscreen]').click()
        expect(self.page.locator('[data-fullscreen]')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('[data-open-index]').click()
        self.page.locator('.src-map-about').click()
        self.page.wait_for_url('**/about/')
        self.assertIsNone(self.page.evaluate('document.fullscreenElement'))
        self.assertFalse(self.page.locator('.site-header').evaluate('e => e.inert'))
        corner = self.page.locator('[data-corner-player]')
        box = corner.bounding_box()
        self.assertGreaterEqual(box['x'], 0)
        self.assertLessEqual(box['x'] + box['width'], 320)
        self.assertLessEqual(box['y'] + box['height'], 740)
        self.page.locator('[data-corner-expand]').click()
        expect(self.page.locator('[data-skin-cycle]')).to_be_visible()
        self.assertTrue(corner.evaluate('e => e.scrollWidth <= e.clientWidth'))
        self.page.locator('[data-corner-close]').click()
        expect(corner).not_to_be_visible()
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))

    def test_continuous_player_touch_controls_keep_new_visits_silent(self):
        context = self.browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        try:
            page = context.new_page()
            serve_seekable_audio(page)
            audio_requests = []
            page.on('request', lambda request: audio_requests.append(request.url) if '/audio/' in request.url else None)
            page.goto(BASE_URL + '/', wait_until='networkidle')
            self.assertTrue(page.locator('audio').evaluate('a => a.paused'))
            self.assertEqual(audio_requests, [])
            expect(page.locator('[data-corner-player]')).not_to_be_visible()
            page.locator('[data-sound]').tap()
            page.wait_for_function('window.SecondSourceExperience.soundAudible')
            page.locator('.site-nav a[href="/about/"]').tap()
            page.wait_for_url('**/about/')
            expect(page.locator('[data-corner-player]')).to_be_visible()
            page.locator('[data-corner-expand]').tap()
            page.locator('[data-mute]').tap()
            self.assertTrue(page.locator('audio').evaluate('a => a.muted'))
            page.locator('[data-corner-close]').tap()
            self.assertTrue(page.locator('audio').evaluate('a => a.paused'))
            page.locator('.site-logo').tap()
            page.wait_for_url(BASE_URL + '/')
            self.assertTrue(page.locator('audio').evaluate('a => a.paused'))
            expect(page.locator('[data-player-handle]')).not_to_have_attribute('tabindex', '0')
        finally:
            context.close()

    def test_public_sources_navigation_and_old_room_links_do_not_autoplay(self):
        requests=[]
        self.page.on('request',lambda request: requests.append(request.url) if '/audio/' in request.url else None)
        self.visit()
        self.page.locator('.site-nav').get_by_role('link',name='SOURCES',exact=True).click()
        self.page.wait_for_url('**/sources/')
        expect(self.page.locator('h1')).to_have_text('SOURCES')
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        expect(self.page.locator('link[rel="canonical"]')).to_have_attribute('href','https://www.enterthedream.org/sources/')
        expect(self.page.locator('meta[property="og:url"]')).to_have_attribute('content','https://www.enterthedream.org/sources/')
        expect(self.page.get_by_role('button',name='SOURCE 1 / DUSK',exact=True)).to_be_visible()
        expect(self.page.get_by_role('button',name='SOURCE 2 / NIGHT',exact=True)).to_have_attribute('aria-pressed','true')
        expect(self.page.locator('[data-room-source]')).to_have_text('SOURCE 2 / NIGHT')
        sitemap=self.page.request.get(BASE_URL+'/sitemap.xml')
        self.assertIn('<loc>https://www.enterthedream.org/sources/</loc>',sitemap.text())
        self.page.goto(BASE_URL+'/room/?source=night#player',wait_until='networkidle')
        self.page.wait_for_url('**/sources/?source=night#player')
        self.assertEqual(requests,[])
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused && !a.currentSrc'))

    def test_listening_room_renders_silently_and_can_pause_its_scene(self):
        requests = []
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.page.on('request', lambda request: requests.append(request.url) if '/audio/' in request.url else None)
        self.visit('sources/')
        expect(self.page.locator('#room-scene')).to_have_attribute('data-render-state', 'ready')
        self.assertEqual(requests, [])
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))
        expect(self.page.locator('[data-room-play-label]')).to_have_text('PLAY')
        expect(self.page.locator('input[type=file]')).to_have_count(0)
        self.assertEqual(self.page.locator('canvas').evaluate('c => c.getContext("webgl").getError()'), 0)
        self.assertTrue(self.page.locator('canvas').evaluate('c => c.width <= 800 && c.height <= 600'))
        expect(self.page.locator('meta[name="robots"]')).to_have_count(0)
        expect(self.page.locator('.site-nav [aria-current="page"]')).to_have_text('SOURCES')
        expect(self.page.locator('.site-nav a[href="/room/"]')).to_have_count(0)
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .2')
        expect(self.page.locator('[data-room-play-label]')).to_have_text('PAUSE')
        self.page.get_by_role('button', name='MOTION ON', exact=True).click()
        self.wait_for_frames(4)
        before = self.page.evaluate("window.__drawsByCanvas['room-scene']")
        self.wait_for_frames(12)
        self.assertEqual(self.page.evaluate("window.__drawsByCanvas['room-scene']"), before)
        self.assertFalse(self.page.locator('audio').evaluate('a => a.paused'))
        self.page.get_by_role('button', name='MOTION OFF', exact=True).click()
        self.page.wait_for_function("before => window.__drawsByCanvas['room-scene'] > before", arg=before)
        self.page.locator('.room-frame').evaluate('e => {e.style.marginTop = "3000px";}')
        self.wait_for_frames(4)
        before = self.page.evaluate("window.__drawsByCanvas['room-scene']")
        self.wait_for_frames(8)
        self.assertEqual(self.page.evaluate("window.__drawsByCanvas['room-scene']"), before)
        self.page.locator('.room-frame').evaluate('e => {e.style.marginTop = "";}')
        self.page.wait_for_function("before => window.__drawsByCanvas['room-scene'] > before", arg=before)
        self.page.get_by_role('button', name='Pause music', exact=True).click()
        self.wait_for_frames(4)
        before = self.page.evaluate("window.__drawsByCanvas['room-scene']")
        self.wait_for_frames(8)
        self.assertEqual(self.page.evaluate("window.__drawsByCanvas['room-scene']"), before)

    def test_listening_room_scene_choices_keep_the_track_and_reuse_the_renderer(self):
        self.context.add_init_script("""(() => {
            window.__roomPrograms = 0;
            const original = WebGLRenderingContext.prototype.createProgram;
            WebGLRenderingContext.prototype.createProgram = function(...args) {
                window.__roomPrograms++;
                return original.apply(this, args);
            };
        })();""")
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.visit('sources/')
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .2')
        self.page.locator('[data-room-seek]').fill('25')
        self.page.wait_for_function('document.querySelector("audio").currentTime >= 24')
        source = self.page.locator('audio').evaluate('a => a.currentSrc')
        self.page.locator('[data-room-scene=shore]').click()
        expect(self.page.locator('[data-room]')).to_have_attribute('data-scene', 'shore')
        expect(self.page.locator('[data-room-source]')).to_have_text('SOURCE 1 / DUSK')
        expect(self.page.locator('.room-song-scene')).to_have_text('SOURCE 1 / DUSK')
        expect(self.page.locator('canvas')).to_have_attribute('data-render-state', 'ready')
        self.assertEqual(self.page.locator('canvas').evaluate('c => c.getContext("webgl").getError()'), 0)
        self.page.locator('[data-room-scene=city]').click()
        self.page.locator('[data-room-scene=shore]').click()
        programs = self.page.evaluate('window.__roomPrograms')
        self.page.locator('[data-room-song=dream-scenario]').click()
        expect(self.page.locator('[data-room]')).to_have_attribute('data-scene', 'shore')
        expect(self.page.locator('[data-room-source]')).to_have_text('SOURCE 1 / DUSK')
        expect(self.page.locator('.room-song-scene')).to_have_text('SOURCE 1 / DUSK')
        self.assertGreater(self.page.locator('audio').evaluate('a => a.currentTime'), 24)
        self.assertEqual(self.page.locator('audio').evaluate('a => a.currentSrc'), source)
        for _ in range(3):
            self.page.locator('[data-room-scene=shore]').click()
            self.page.locator('[data-room-scene=city]').click()
        self.assertEqual(self.page.evaluate('window.__roomPrograms'), programs)
        self.assertEqual(self.page.locator('canvas').evaluate('c => c.getContext("webgl").getError()'), 0)
        self.page.get_by_role('button', name='Pause music', exact=True).click()
        paused_time = self.page.locator('audio').evaluate('a => a.currentTime')
        self.page.locator('[data-room-scene=shore]').click()
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused'))
        self.assertAlmostEqual(self.page.locator('audio').evaluate('a => a.currentTime'), paused_time, delta=.1)

    def test_listening_room_plays_uploaded_tracks_and_advances_at_the_end(self):
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        serve_seekable_audio(self.page, 'src_player_ambient_tape_1_192.mp3', source='dream-scenario.mp3')
        requests = []
        self.page.on('request', lambda request: requests.append(request.url) if '/audio/' in request.url else None)
        self.visit('sources/')
        expect(self.page.locator('[data-room-song]')).to_have_count(2)
        expect(self.page.locator('[data-room-song=sage-counsel]')).to_have_count(0)
        expect(self.page.locator('[data-room-song=ambient-tape-1]')).to_contain_text('Ambient Tape 1')
        expect(self.page.locator('[data-room-track]')).to_have_text('Martin Solli — Dream Scenario')
        expect(self.page.locator('[data-room]')).to_have_attribute('data-scene', 'city')
        self.assertEqual(requests, [])
        self.page.locator('[data-room-song=dream-scenario]').click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .2')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.currentSrc.endsWith("/audio/dream-scenario.mp3")'))
        duration = self.page.locator('audio').evaluate('a => a.duration')
        self.assertGreater(duration, 282)
        self.assertLess(duration, 284)
        self.page.locator('[data-room-seek]').fill('40')
        self.page.wait_for_function('document.querySelector("audio").currentTime >= 40')
        self.page.get_by_role('button', name='Pause music', exact=True).click()
        self.page.locator('[data-room-song=dream-scenario]').click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > 40.1')
        self.page.locator('audio').evaluate('a => {a.currentTime=a.duration-.15;}')
        self.page.wait_for_function('document.querySelector("[data-room-song=ambient-tape-1]").getAttribute("aria-pressed") === "true" && document.querySelector("audio").currentTime > .1')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.currentSrc.endsWith("/audio/src_player_ambient_tape_1_192.mp3") && !a.paused'))
        expect(self.page.locator('[data-room-track]')).to_have_text('Second Source — Ambient Tape 1')
        expect(self.page.locator('[data-room-source]')).to_have_text('SOURCE 1 / DUSK')
        self.page.reload(wait_until='networkidle')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused && !a.currentSrc'))
        expect(self.page.locator('[data-room-play-label]')).to_have_text('PLAY')

    def test_listening_room_player_controls_keep_the_session_and_skin_preference(self):
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.visit('sources/')
        expect(self.page.locator('[data-room-state]')).to_have_text('STOPPED')
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .2')
        expect(self.page.locator('[data-room-state]')).to_have_text('PLAYING')
        expect(self.page.locator('[data-room-pause]')).to_be_visible()
        expect(self.page.locator('[data-room-start]')).not_to_be_visible()
        source = self.page.locator('audio').evaluate('a => a.currentSrc')
        self.page.locator('[data-room-volume]').fill('0.22')
        self.page.wait_for_function('document.querySelector("audio").volume === .22')
        expect(self.page.locator('[data-room-volume-output]')).to_have_text('22%')
        self.page.get_by_role('button', name='Mute music', exact=True).click()
        self.assertTrue(self.page.locator('audio').evaluate('a => a.muted'))
        expect(self.page.locator('[data-room-muted]')).to_be_visible()
        self.page.locator('[data-room-volume]').fill('0.3')
        self.page.wait_for_function('!document.querySelector("audio").muted')
        self.page.locator('[data-room-playlist-toggle]').click()
        expect(self.page.locator('.room-playlist')).not_to_be_visible()
        self.page.locator('[data-room-playlist-toggle]').click()
        expect(self.page.locator('.room-playlist')).to_be_visible()
        self.page.locator('[data-room-skin]').click()
        expect(self.page.locator('.room-dock')).to_have_attribute('data-skin', 'chrome')
        self.assertEqual(self.page.locator('audio').evaluate('a => a.currentSrc'), source)
        self.assertFalse(self.page.locator('audio').evaluate('a => a.paused'))
        self.page.locator('[data-room-repeat]').click()
        self.assertTrue(self.page.locator('audio').evaluate('a => a.loop'))
        self.page.locator('audio').evaluate('a => {a.currentTime=a.duration-.15;}')
        self.page.wait_for_function('a => a.currentTime < 2 && !a.paused', arg=self.page.locator('audio').element_handle())
        self.page.locator('[data-room-repeat]').click()
        self.assertFalse(self.page.locator('audio').evaluate('a => a.loop'))
        self.page.get_by_role('button', name='Stop music', exact=True).click()
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused && a.currentTime === 0'))
        expect(self.page.locator('[data-room-state]')).to_have_text('STOPPED')
        expect(self.page.locator('[data-room-song=dream-scenario]')).to_have_attribute('aria-pressed', 'true')
        self.page.reload(wait_until='networkidle')
        expect(self.page.locator('.room-dock')).to_have_attribute('data-skin', 'chrome')
        self.assertTrue(self.page.locator('audio').evaluate('a => a.paused && !a.currentSrc'))

    def test_listening_room_spectrum_tracks_audio_and_stops_when_silent_or_hidden(self):
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.visit('sources/')
        bars = "[...document.querySelectorAll('.room-spectrum-band')].map(b => Number(b.style.getPropertyValue('--level')))"
        active = '() => '+bars+'.some(level => level > .05)'
        quiet = '() => '+bars+'.every(level => level === 0)'
        expect(self.page.locator('.room-spectrum-band')).to_have_count(20)
        self.assertTrue(self.page.evaluate(quiet))
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .2')
        self.page.locator('audio').evaluate('a => {a.currentTime=45;}')
        self.page.wait_for_function(active)
        self.page.get_by_role('button', name='Pause music', exact=True).click()
        self.page.wait_for_function(quiet)
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function(active)
        self.page.get_by_role('button', name='Mute music', exact=True).click()
        self.page.wait_for_function(quiet)
        self.assertFalse(self.page.locator('audio').evaluate('a => a.paused'))
        self.page.get_by_role('button', name='Unmute music', exact=True).click()
        self.page.wait_for_function(active)
        self.page.locator('[data-room-volume]').fill('0')
        self.page.wait_for_function(quiet)
        self.page.locator('[data-room-volume]').fill('0.35')
        self.page.wait_for_function(active)
        self.page.locator('[data-room]').evaluate('e => {e.requestFullscreen=undefined;}')
        self.page.locator('[data-room-fullscreen]').click()
        self.page.wait_for_function(quiet)
        expect(self.page.locator('[data-room-spectrum]')).not_to_be_visible()
        self.page.keyboard.press('Escape')
        self.page.locator('[data-room-spectrum]').scroll_into_view_if_needed()
        self.page.wait_for_function(active)
        self.page.emulate_media(reduced_motion='reduce')
        self.page.wait_for_function(quiet)
        self.assertFalse(self.page.locator('audio').evaluate('a => a.paused'))

    def test_listening_room_without_webaudio_still_plays_the_recording(self):
        self.context.add_init_script('window.AudioContext=undefined; window.webkitAudioContext=undefined;')
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.visit('sources/')
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .2')
        self.assertTrue(self.page.evaluate("[...document.querySelectorAll('.room-spectrum-band')].every(b => Number(b.style.getPropertyValue('--level')) === 0)"))

    def test_listening_room_city_moves_forward_and_loops_without_a_jump(self):
        self.visit('sources/')
        result = self.page.evaluate("""() => {
            const canvas=document.querySelector('canvas'), gl=canvas.getContext('webgl');
            const world=window.SecondSourceRoomScenes.create('city',canvas,document.querySelector('.room-frame'));
            function snapshot(seconds) {
                world.draw(seconds);
                const pixels=new Uint8Array(canvas.width*canvas.height*4);
                gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                return pixels;
            }
            function difference(a,b) {
                let total=0;
                for (let i=0;i<a.length;i++) total+=Math.abs(a[i]-b[i]);
                return total/a.length;
            }
            const first=snapshot(0), later=snapshot(30), seam=snapshot(179.999), loop=snapshot(180);
            return {
                changed:difference(first,later),
                seam:difference(first,seam),
                loop:difference(first,loop),
                error:gl.getError()
            };
        }""")
        self.assertGreater(result['changed'], 1)
        self.assertLess(result['seam'], .5)
        self.assertEqual(result['loop'], 0)
        self.assertEqual(result['error'], 0)

    def test_listening_room_respects_reduced_motion(self):
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.page.emulate_media(reduced_motion='reduce')
        self.visit('sources/')
        expect(self.page.locator('#room-scene')).to_have_attribute('data-render-state', 'ready')
        expect(self.page.get_by_role('button', name='MOTION OFF', exact=True)).to_be_visible()
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .1')
        self.wait_for_frames(4)
        before = self.page.evaluate("window.__drawsByCanvas['room-scene']")
        self.wait_for_frames(8)
        self.assertEqual(self.page.evaluate("window.__drawsByCanvas['room-scene']"), before)
        self.page.get_by_role('button', name='MOTION OFF', exact=True).click()
        self.page.wait_for_function("before => window.__drawsByCanvas['room-scene'] > before", arg=before)

    def test_listening_room_touch_fullscreen_keeps_the_player_minimized(self):
        context = self.browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        try:
            page = context.new_page()
            page.on('pageerror', lambda error: self.errors.append(str(error)))
            serve_seekable_audio(page, 'dream-scenario.mp3')
            page.goto(BASE_URL + '/sources/', wait_until='networkidle')
            page.get_by_role('button', name='Play music', exact=True).tap()
            page.wait_for_function('document.querySelector("audio").currentTime > .2')
            source = page.locator('audio').evaluate('a => a.currentSrc')
            page.locator('[data-room]').evaluate('e => {e.requestFullscreen = undefined;}')
            page.locator('[data-room-fullscreen]').tap()
            expect(page.locator('[data-room-fullscreen]')).to_have_attribute('aria-pressed', 'true')
            page.wait_for_function('getComputedStyle(document.querySelector(".room-dock")).opacity === "0"')
            self.assertTrue(page.locator('.site-header').evaluate('e => e.inert'))
            box = page.locator('.room-frame').bounding_box()
            self.assertAlmostEqual(box['width'], 390, delta=1)
            self.assertAlmostEqual(box['height'], 844, delta=1)
            page.touchscreen.tap(195, 422)
            page.wait_for_function('getComputedStyle(document.querySelector(".room-dock")).opacity === "1"')
            expect(page.locator('.room-controls button:visible')).to_have_count(2)
            expect(page.locator('[data-room-play-label]')).not_to_be_visible()
            expect(page.locator('.room-playlist')).not_to_be_visible()
            expect(page.locator('.room-scenes')).not_to_be_visible()
            self.assertLessEqual(page.locator('.room-dock').bounding_box()['width'], 120)
            self.assertLessEqual(page.locator('.room-dock').bounding_box()['height'], 64)
            page.get_by_role('button', name='Pause music', exact=True).tap()
            self.assertTrue(page.locator('audio').evaluate('a => a.paused'))
            page.get_by_role('button', name='Play music', exact=True).tap()
            page.wait_for_function('!document.querySelector("audio").paused')
            page.locator('[data-room-fullscreen]').tap()
            expect(page.locator('[data-room-fullscreen]')).to_have_attribute('aria-pressed', 'false')
            self.assertFalse(page.locator('.site-header').evaluate('e => e.inert'))
            expect(page.locator('[data-room-seek]')).to_be_visible()
            self.assertEqual(page.locator('audio').evaluate('a => a.currentSrc'), source)
            self.assertLessEqual(page.evaluate('document.body.scrollWidth'), 390)
        finally:
            context.close()

    def test_listening_room_webgl_fallback_keeps_music_and_scene_choices_available(self):
        serve_seekable_audio(self.page, 'dream-scenario.mp3')
        self.context.add_init_script('''(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                if (type === 'webgl' || type === 'webgl2') return null;
                return original.call(this, type, ...args);
            };
        })();''')
        self.visit('sources/')
        expect(self.page.locator('#room-scene')).to_have_attribute('data-render-state', 'fallback')
        expect(self.page.locator('.room-fallback-city')).to_be_visible()
        self.page.get_by_role('button', name='Play music', exact=True).click()
        self.page.wait_for_function('document.querySelector("audio").currentTime > .1')
        expect(self.page.locator('[data-room-motion]')).to_be_disabled()
        self.page.locator('[data-room-scene=shore]').click()
        expect(self.page.locator('.room-fallback').first).to_be_visible()
        self.page.locator('[data-room-scene=city]').click()
        expect(self.page.locator('.room-fallback-city')).to_be_visible()
        self.assertFalse(self.page.locator('audio').evaluate('a => a.paused'))

    def test_listening_room_without_javascript_shows_a_still_scene(self):
        context = self.browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
        try:
            page = context.new_page()
            page.goto(BASE_URL + '/sources/', wait_until='networkidle')
            expect(page.locator('.room-fallback-city')).to_be_visible()
            expect(page.locator('.room-dock')).not_to_be_visible()
            expect(page.locator('[data-room-still]')).to_be_visible()
            expect(page.locator('[data-room-still]')).to_contain_text('still scene')
            self.assertLessEqual(page.evaluate('document.body.scrollWidth'), 390)
        finally:
            context.close()

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
