"""Functional checks for the static site; start its HTTP server first.

Run: python3 tests/browser_smoke.py
Requires Python Playwright and Chromium. SITE_BASE_URL and CHROMIUM_PATH
override the local server URL and browser executable.
"""
import os
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
        expect(self.page.locator("[data-sound]")).to_have_attribute("aria-label", "Enter with sound")
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
        self.page.locator("[data-volume]").fill("0")
        self.assertEqual(self.page.evaluate("window.SecondSourceExperience.sampleBass()"), 0)
        self.page.locator("[data-sound]").click()
        self.assertTrue(audio.evaluate("a => a.paused"))
        expect(self.page.locator("[data-sound]")).to_have_attribute("aria-pressed", "false")

    def test_landing_sound_and_actual_audio_reactivity(self):
        self.check_study("index.html")

    def test_ripple_sound_and_pointer_interaction(self):
        self.check_study("experiment.html")

    def test_static_mode_stops_rendering_and_persists(self):
        self.visit()
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.locator("[data-motion-toggle]").click()
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")
        before = self.page.evaluate("window.__drawCalls")
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate("window.__drawCalls"), before)
        self.assertEqual(self.page.locator("#visual").evaluate("e => getComputedStyle(e).visibility"), "hidden")
        self.visit("experiment.html")
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")
        self.assertEqual(self.page.evaluate("window.__drawCalls"), 0)
        self.page.locator("[data-motion-toggle]").click()
        self.page.wait_for_function("window.__drawCalls > 0")

    def test_reduced_motion_is_static_by_default_and_updates(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.visit()
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")
        self.wait_for_frames()
        self.assertEqual(self.page.evaluate("window.__drawCalls"), 0)
        self.assertEqual(self.page.locator("main").evaluate("e => getComputedStyle(e).animationName"), "none")
        self.page.emulate_media(reduced_motion="no-preference")
        self.page.wait_for_function("window.__drawCalls > 0")
        self.page.emulate_media(reduced_motion="reduce")
        expect(self.page.locator("html")).to_have_attribute("data-motion", "off")

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
        self.visit()
        self.page.get_by_role("link", name="EXPERIMENTS", exact=True).click()
        self.page.wait_for_url("**/experiments.html")
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
