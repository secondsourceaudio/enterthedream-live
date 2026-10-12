/* INTERFERENCE — two wave sources, no photographic texture. */
(() => {
    "use strict";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function mount(container) {
        const canvas = container.querySelector("canvas");
        const preview = container.hasAttribute("data-field-preview");
        const controller = preview ? null : window.SecondSourceExperience;
        const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
        if (!gl) {
            canvas.hidden = true;
            if (controller) controller.useStaticArtwork();
            return;
        }

        const derivatives = Boolean(gl.getExtension("OES_standard_derivatives"));
        const vertexSource = `
            attribute vec2 a_position;
            varying vec2 v_uv;
            void main() {
                v_uv = a_position * .5 + .5;
                gl_Position = vec4(a_position, 0., 1.);
            }
        `;
        const fragmentSource = `
            ${derivatives ? "#extension GL_OES_standard_derivatives : enable" : ""}
            precision highp float;
            varying vec2 v_uv;
            uniform vec2 u_resolution;
            uniform vec2 u_pointer;
            uniform float u_time;
            uniform float u_sound;
            uniform float u_pulseAge;
            void main() {
                float aspect = u_resolution.x / u_resolution.y;
                vec2 p = (v_uv - .5) * vec2(aspect, 1.);
                vec2 left = vec2(-.28, .015 * sin(u_time * .16));
                vec2 right = (u_pointer - .5) * vec2(aspect, 1.);
                float a = length(p - left);
                float b = length(p - right);
                float frequency = 23. + u_sound * 3.;
                float field = sin(a * frequency - u_time * .65)
                            + sin(b * frequency + u_time * .38);
                if (u_pulseAge >= 0.) {
                    float front = u_pulseAge * .24;
                    field += sin(b * 36. - u_pulseAge * 6.)
                        * exp(-abs(b - front) * 12.)
                        * exp(-u_pulseAge * .6) * .65;
                }
                float level = field * 3.;
                float distanceToLine = abs(fract(level + .5) - .5);
                float aa = ${derivatives ? "max(fwidth(level), .002)" : "4. / u_resolution.y"};
                float lines = 1. - smoothstep(.009, .009 + aa, distanceToLine);
                float vignette = 1. - smoothstep(.32, .7, length(v_uv - .5));
                vec3 ink = mix(vec3(.42, .49, .53), vec3(.78, .85, .87), .5 + .5 * sin(field * .8));
                vec3 color = vec3(.027, .035, .043) + ink * lines * vignette * .78;
                float marker = 1. - smoothstep(.003, .005, min(a, b));
                color = mix(color, vec3(.88, .94, .92), marker * .7);
                gl_FragColor = vec4(color, 1.);
            }
        `;

        let program;
        let uniforms;
        let ready = false;
        let x = .67, y = .52, targetX = x, targetY = y;
        let pulseStarted = -1;
        let sound = 0;
        let lastElapsed = 0;
        let timeOffset = 0;
        let dragging = false;
        let previewFrame = 0;
        let previewActive = false;
        let previewVisible = true;
        let lastPreviewTime = null;
        let previewElapsed = 0;

        function shader(type, source) {
            const result = gl.createShader(type);
            gl.shaderSource(result, source);
            gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
                gl.deleteShader(result);
                return null;
            }
            return result;
        }
        function setup() {
            const vertex = shader(gl.VERTEX_SHADER, vertexSource);
            const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
            if (!vertex || !fragment) return false;
            program = gl.createProgram();
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
            gl.useProgram(program);
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, "a_position");
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            uniforms = Object.fromEntries(["resolution", "pointer", "time", "sound", "pulseAge"]
                .map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
            ready = true;
            return true;
        }

        function draw(elapsed) {
            if (!ready) return;
            lastElapsed = elapsed;
            const ratio = Math.min(devicePixelRatio || 1, preview ? 1.25 : 2);
            const width = Math.max(1, Math.round(container.clientWidth * ratio));
            const height = Math.max(1, Math.round(container.clientHeight * ratio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                gl.viewport(0, 0, width, height);
            }
            x += (targetX - x) * .1;
            y += (targetY - y) * .1;
            sound += ((controller ? controller.sampleBass() : 0) - sound) * .08;
            gl.uniform2f(uniforms.resolution, width, height);
            gl.uniform2f(uniforms.pointer, x, y);
            gl.uniform1f(uniforms.time, (elapsed - timeOffset) / 1000);
            gl.uniform1f(uniforms.sound, sound);
            gl.uniform1f(uniforms.pulseAge, pulseStarted < 0 ? -1 : Math.min((performance.now() - pulseStarted) / 1000, 12));
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            canvas.classList.add("is-ready");
        }
        const enabled = () => preview ? !reducedMotion.matches : controller.motionEnabled;
        function point(event) {
            const rect = container.getBoundingClientRect();
            targetX = Math.max(.08, Math.min(.92, (event.clientX - rect.left) / rect.width));
            targetY = Math.max(.08, Math.min(.92, 1 - (event.clientY - rect.top) / rect.height));
        }
        container.addEventListener("pointerdown", event => {
            if (!enabled()) return;
            point(event);
            pulseStarted = performance.now();
            dragging = true;
            if (!preview) {
                container.focus({ preventScroll: true });
                container.setPointerCapture(event.pointerId);
            }
        });
        container.addEventListener("pointermove", event => {
            if (enabled() && (dragging || preview)) point(event);
        });
        for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
            container.addEventListener(eventName, () => { dragging = false; });
        }
        container.addEventListener("keydown", event => {
            if (preview || !enabled() || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) return;
            event.preventDefault();
            if (event.key === "ArrowLeft") targetX = Math.max(.08, targetX - .035);
            if (event.key === "ArrowRight") targetX = Math.min(.92, targetX + .035);
            if (event.key === "ArrowUp") targetY = Math.min(.92, targetY + .035);
            if (event.key === "ArrowDown") targetY = Math.max(.08, targetY - .035);
            if (event.key === " ") pulseStarted = performance.now();
        });
        document.querySelector("[data-reset-field]")?.addEventListener("click", () => {
            x = targetX = .67;
            y = targetY = .52;
            pulseStarted = -1;
            timeOffset = lastElapsed;
            if (ready && enabled()) draw(lastElapsed);
        });

        function previewTick(now) {
            previewFrame = 0;
            if (!previewActive || !previewVisible || reducedMotion.matches || document.hidden) return;
            if (lastPreviewTime !== null) previewElapsed += Math.min(now - lastPreviewTime, 64);
            lastPreviewTime = now;
            draw(previewElapsed);
            previewFrame = requestAnimationFrame(previewTick);
        }
        function reconcilePreview() {
            cancelAnimationFrame(previewFrame);
            previewFrame = 0;
            lastPreviewTime = null;
            if (previewActive && previewVisible && !reducedMotion.matches && !document.hidden) {
                previewFrame = requestAnimationFrame(previewTick);
            }
        }
        canvas.addEventListener("webglcontextlost", event => {
            event.preventDefault();
            ready = false;
            canvas.classList.remove("is-ready");
        });
        canvas.addEventListener("webglcontextrestored", () => {
            if (setup() && preview && !reducedMotion.matches) draw(previewElapsed);
        });
        if (!setup()) {
            canvas.hidden = true;
            if (controller) controller.useStaticArtwork();
            return;
        }
        if (preview) {
            if (!reducedMotion.matches) draw(0);
            const card = container.closest(".study-card");
            card.addEventListener("mouseenter", () => { previewActive = true; reconcilePreview(); });
            card.addEventListener("mouseleave", () => { previewActive = false; reconcilePreview(); });
            card.addEventListener("focusin", () => { previewActive = true; reconcilePreview(); });
            card.addEventListener("focusout", event => {
                if (!card.contains(event.relatedTarget)) { previewActive = false; reconcilePreview(); }
            });
            const observer = new IntersectionObserver(entries => {
                previewVisible = entries[0].isIntersecting;
                reconcilePreview();
            });
            observer.observe(container);
            document.addEventListener("visibilitychange", reconcilePreview);
            reducedMotion.addEventListener("change", () => {
                canvas.classList.toggle("is-ready", !reducedMotion.matches);
                if (!reducedMotion.matches) draw(previewElapsed);
                reconcilePreview();
            });
            window.addEventListener("resize", () => {
                if (!reducedMotion.matches) draw(previewElapsed);
            });
        } else {
            controller.createRenderLoop(draw, container);
        }
    }

    document.querySelectorAll("[data-field-surface]").forEach(mount);
})();
