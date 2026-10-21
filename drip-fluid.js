/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Fluid kernels adapted from PavelDoGreat/WebGL-Fluid-Simulation.
// This study transports image coordinates, keeping DRIP's original artwork
// and palette instead of adding coloured dye. No external scripts or services.
(() => {
    'use strict';
    const canvas = document.querySelector('#visual');
    const container = document.querySelector('#visual-container');
    const image = document.querySelector('#fallback-image');
    const experience = window.SecondSourceExperience;
    const resetButton = document.querySelector('[data-fluid-reset]');
    const returnButton = document.querySelector('[data-fluid-return]');
    if (!canvas || !container || !image || !experience) return;

    let running = true;
    function fallback() {
        running = false;
        canvas.classList.remove('is-ready');
        canvas.dataset.fluid = 'unavailable';
        resetButton.disabled = returnButton.disabled = true;
        experience.useStaticArtwork();
    }

    let gl;
    try {
        gl = canvas.getContext('webgl', {alpha: false, depth: false, stencil: false,
            antialias: false, preserveDrawingBuffer: false});
    } catch (error) {}
    if (!gl) { fallback(); return; }

    try {
        const half = gl.getExtension('OES_texture_half_float');
        const floating = gl.getExtension('OES_texture_float');
        gl.getExtension('EXT_color_buffer_half_float');
        gl.getExtension('WEBGL_color_buffer_float');
        const candidates = [];
        if (half) candidates.push({type: half.HALF_FLOAT_OES,
            linear: !!gl.getExtension('OES_texture_half_float_linear')});
        if (floating) candidates.push({type: gl.FLOAT,
            linear: !!gl.getExtension('OES_texture_float_linear')});
        const format = candidates.find(candidate => {
            const texture = gl.createTexture();
            const framebuffer = gl.createFramebuffer();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, candidate.type, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            const supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.deleteFramebuffer(framebuffer);
            gl.deleteTexture(texture);
            return supported;
        });
        if (!format) { fallback(); return; }

        const mobile = matchMedia('(any-pointer: coarse), (max-width: 750px)').matches;
        const simulationSize = mobile ? 96 : 128;
        const mapSize = mobile ? 384 : 512;
        const pointers = new Map();
        const returnPointers = new Set();
        let returnKey = false;
        let rightHeld = false;
        let hover = null;
        let hoverForce = null;
        let previousTime = null;
        const returning = () => rightHeld || returnKey || returnPointers.size > 0;
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

        function shader(type, source) {
            const result = gl.createShader(type);
            gl.shaderSource(result, source);
            gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(result));
            }
            return result;
        }
        const vertex = shader(gl.VERTEX_SHADER, `
            attribute vec2 a_position;
            varying vec2 vUv;
            void main() {
                vUv = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `);
        const prefix = `${format.linear ? '' : '#define MANUAL_FILTERING\n'}
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            uniform vec2 u_texel;
            vec4 fieldSample(sampler2D field, vec2 uv, vec2 texel) {
            #ifdef MANUAL_FILTERING
                vec2 st = uv / texel - 0.5;
                vec2 base = floor(st);
                vec2 f = fract(st);
                vec4 a = texture2D(field, (base + vec2(0.5, 0.5)) * texel);
                vec4 b = texture2D(field, (base + vec2(1.5, 0.5)) * texel);
                vec4 c = texture2D(field, (base + vec2(0.5, 1.5)) * texel);
                vec4 d = texture2D(field, (base + vec2(1.5, 1.5)) * texel);
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            #else
                return texture2D(field, uv);
            #endif
            }
        `;
        function program(source) {
            const fragment = shader(gl.FRAGMENT_SHADER, prefix + source);
            const handle = gl.createProgram();
            gl.attachShader(handle, vertex);
            gl.attachShader(handle, fragment);
            gl.bindAttribLocation(handle, 0, 'a_position');
            gl.linkProgram(handle);
            gl.deleteShader(fragment);
            if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
            const locations = Object.create(null);
            return {handle, uniform(name) {
                if (!(name in locations)) locations[name] = gl.getUniformLocation(handle, name);
                return locations[name];
            }};
        }

        const scale = program(`
            uniform sampler2D u_source;
            uniform float u_scale;
            void main() { gl_FragColor = texture2D(u_source, vUv) * u_scale; }
        `);
        const splat = program(`
            uniform sampler2D u_velocity;
            uniform vec2 u_point;
            uniform vec2 u_force;
            uniform float u_swirl;
            void main() {
                vec2 p = vUv - u_point;
                float influence = exp(-dot(p, p) / 0.0024);
                vec2 force = (u_force + vec2(-p.y, p.x) * u_swirl) * influence;
                vec2 velocity = texture2D(u_velocity, vUv).xy + force;
                gl_FragColor = vec4(clamp(velocity, -350.0, 350.0), 0.0, 1.0);
            }
        `);
        const curl = program(`
            uniform sampler2D u_velocity;
            void main() {
                float L = texture2D(u_velocity, vUv - vec2(u_texel.x, 0.0)).y;
                float R = texture2D(u_velocity, vUv + vec2(u_texel.x, 0.0)).y;
                float T = texture2D(u_velocity, vUv + vec2(0.0, u_texel.y)).x;
                float B = texture2D(u_velocity, vUv - vec2(0.0, u_texel.y)).x;
                gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
            }
        `);
        const vorticity = program(`
            uniform sampler2D u_velocity;
            uniform sampler2D u_curl;
            uniform float u_dt;
            uniform float u_curlStrength;
            void main() {
                float L = texture2D(u_curl, vUv - vec2(u_texel.x, 0.0)).x;
                float R = texture2D(u_curl, vUv + vec2(u_texel.x, 0.0)).x;
                float T = texture2D(u_curl, vUv + vec2(0.0, u_texel.y)).x;
                float B = texture2D(u_curl, vUv - vec2(0.0, u_texel.y)).x;
                float C = texture2D(u_curl, vUv).x;
                vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
                force /= length(force) + 0.0001;
                force *= u_curlStrength * C;
                force.y *= -1.0;
                vec2 velocity = texture2D(u_velocity, vUv).xy + force * u_dt;
                gl_FragColor = vec4(clamp(velocity, -350.0, 350.0), 0.0, 1.0);
            }
        `);
        const divergence = program(`
            uniform sampler2D u_velocity;
            void main() {
                vec2 C = texture2D(u_velocity, vUv).xy;
                float L = texture2D(u_velocity, vUv - vec2(u_texel.x, 0.0)).x;
                float R = texture2D(u_velocity, vUv + vec2(u_texel.x, 0.0)).x;
                float T = texture2D(u_velocity, vUv + vec2(0.0, u_texel.y)).y;
                float B = texture2D(u_velocity, vUv - vec2(0.0, u_texel.y)).y;
                if (vUv.x < u_texel.x) L = -C.x;
                if (vUv.x > 1.0 - u_texel.x) R = -C.x;
                if (vUv.y < u_texel.y) B = -C.y;
                if (vUv.y > 1.0 - u_texel.y) T = -C.y;
                gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
            }
        `);
        const pressureSolve = program(`
            uniform sampler2D u_pressure;
            uniform sampler2D u_divergence;
            void main() {
                float L = texture2D(u_pressure, vUv - vec2(u_texel.x, 0.0)).x;
                float R = texture2D(u_pressure, vUv + vec2(u_texel.x, 0.0)).x;
                float T = texture2D(u_pressure, vUv + vec2(0.0, u_texel.y)).x;
                float B = texture2D(u_pressure, vUv - vec2(0.0, u_texel.y)).x;
                float value = (L + R + T + B - texture2D(u_divergence, vUv).x) * 0.25;
                gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
            }
        `);
        const gradientSubtract = program(`
            uniform sampler2D u_pressure;
            uniform sampler2D u_velocity;
            void main() {
                float L = texture2D(u_pressure, vUv - vec2(u_texel.x, 0.0)).x;
                float R = texture2D(u_pressure, vUv + vec2(u_texel.x, 0.0)).x;
                float T = texture2D(u_pressure, vUv + vec2(0.0, u_texel.y)).x;
                float B = texture2D(u_pressure, vUv - vec2(0.0, u_texel.y)).x;
                vec2 velocity = texture2D(u_velocity, vUv).xy - vec2(R - L, T - B);
                gl_FragColor = vec4(velocity, 0.0, 1.0);
            }
        `);
        const advectVelocity = program(`
            uniform sampler2D u_velocity;
            uniform float u_dt;
            uniform float u_decay;
            void main() {
                vec2 coord = vUv - u_dt * fieldSample(u_velocity, vUv, u_texel).xy * u_texel;
                vec2 velocity = fieldSample(u_velocity, coord, u_texel).xy * exp(-u_decay * u_dt);
                gl_FragColor = vec4(velocity, 0.0, 1.0);
            }
        `);
        const advectImage = program(`
            uniform sampler2D u_velocity;
            uniform sampler2D u_map;
            uniform vec2 u_mapTexel;
            uniform float u_dt;
            uniform float u_restore;
            void main() {
                vec2 coord = vUv - u_dt * fieldSample(u_velocity, vUv, u_texel).xy * u_texel;
                vec2 offset = fieldSample(u_map, coord, u_mapTexel).xy + coord - vUv;
                float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
                offset *= exp(-u_restore * u_dt) * smoothstep(0.0, 0.025, edge);
                gl_FragColor = vec4(clamp(offset, -0.4, 0.4), 0.0, 1.0);
            }
        `);
        const display = program(`
            uniform sampler2D u_map;
            uniform sampler2D u_artwork;
            uniform vec2 u_mapTexel;
            void main() {
                vec2 offset = fieldSample(u_map, vUv, u_mapTexel).xy;
                vec2 uv = clamp(vUv + offset, 0.001, 0.999);
                gl_FragColor = vec4(texture2D(u_artwork, uv).rgb, 1.0);
            }
        `);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        gl.disable(gl.BLEND);
        const targets = [];
        function target(size) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            const filter = format.linear ? gl.LINEAR : gl.NEAREST;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, format.type, null);
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Fluid buffer unavailable');
            const value = {texture, framebuffer, size};
            targets.push(value);
            return value;
        }
        function pair(size) {
            return {read: target(size), write: target(size), swap() {
                const value = this.read; this.read = this.write; this.write = value;
            }};
        }
        const velocity = pair(simulationSize);
        const pressure = pair(simulationSize);
        const imageMap = pair(mapSize);
        const curlField = target(simulationSize);
        const divergenceField = target(simulationSize);
        const artwork = gl.createTexture();

        function draw(effect, destination, textures = {}, values = {}) {
            gl.useProgram(effect.handle);
            gl.uniform2f(effect.uniform('u_texel'), 1 / simulationSize, 1 / simulationSize);
            gl.uniform2f(effect.uniform('u_mapTexel'), 1 / mapSize, 1 / mapSize);
            let unit = 0;
            for (const name in textures) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, textures[name]);
                gl.uniform1i(effect.uniform(name), unit++);
            }
            for (const name in values) {
                const value = values[name];
                if (Array.isArray(value)) gl.uniform2f(effect.uniform(name), value[0], value[1]);
                else gl.uniform1f(effect.uniform(name), value);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, destination ? destination.framebuffer : null);
            gl.viewport(0, 0, destination ? destination.size : canvas.width,
                destination ? destination.size : canvas.height);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        function clearFields() {
            gl.clearColor(0, 0, 0, 0);
            for (const value of targets) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, value.framebuffer);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        }
        function resize() {
            const ratio = Math.min(devicePixelRatio || 1, 1.75);
            const width = Math.max(1, Math.floor(container.clientWidth * ratio));
            const height = Math.max(1, Math.floor(container.clientHeight * ratio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width; canvas.height = height;
            }
        }
        function inject(pointer, forceX, forceY, swirl) {
            draw(splat, velocity.write, {u_velocity: velocity.read.texture},
                {u_point: [pointer.x, pointer.y], u_force: [forceX, forceY], u_swirl: swirl});
            velocity.swap();
        }
        function point(event) {
            const rect = container.getBoundingClientRect();
            return {x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
                y: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1)};
        }
        function updateReturn() {
            returnButton.setAttribute('aria-pressed', String(returning()));
        }
        function clearInput() {
            pointers.clear(); returnPointers.clear();
            rightHeld = returnKey = false;
            hover = hoverForce = null;
            updateReturn();
        }

        container.addEventListener('pointerdown', event => {
            if (!experience.motionEnabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            if (pointers.size >= 3) return;
            const location = point(event);
            pointers.set(event.pointerId, {...location, dx: 0, dy: 0, age: 0, type: event.pointerType});
            try { container.setPointerCapture(event.pointerId); } catch (error) {}
            inject(location, 0, 0, 700);
        });
        window.addEventListener('pointermove', event => {
            if (!experience.motionEnabled) return;
            const tracked = pointers.get(event.pointerId);
            if (tracked) {
                if (tracked.type === 'mouse' && !(event.buttons & 1)) { pointers.delete(event.pointerId); return; }
                const next = point(event);
                tracked.dx += next.x - tracked.x; tracked.dy += next.y - tracked.y;
                tracked.x = next.x; tracked.y = next.y;
            } else if (event.pointerType === 'mouse' && container.contains(event.target) && !event.buttons) {
                const next = point(event);
                if (hover) hoverForce = {...next, dx: next.x - hover.x, dy: next.y - hover.y};
                hover = next;
            }
        });
        container.addEventListener('pointerleave', () => { hover = null; });
        const releasePointer = event => {
            pointers.delete(event.pointerId); returnPointers.delete(event.pointerId); updateReturn();
        };
        window.addEventListener('pointerup', releasePointer);
        window.addEventListener('pointercancel', releasePointer);
        container.addEventListener('lostpointercapture', releasePointer);
        container.addEventListener('mousedown', event => {
            if (event.button === 2 && experience.motionEnabled) { event.preventDefault(); rightHeld = true; updateReturn(); }
        });
        for (const type of ['mouseup', 'mousemove']) window.addEventListener(type, event => {
            if (!(event.buttons & 2)) rightHeld = false;
            if (!(event.buttons & 1)) for (const [id, value] of pointers) {
                if (value.type === 'mouse') pointers.delete(id);
            }
            updateReturn();
        });
        container.addEventListener('contextmenu', event => event.preventDefault());
        container.addEventListener('dragstart', event => event.preventDefault());
        container.addEventListener('keydown', event => {
            if (event.target !== container || event.repeat || !experience.motionEnabled) return;
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault(); inject({x: .5, y: .5}, 0, 0, 900);
            }
        });
        returnButton.addEventListener('pointerdown', event => {
            if (!experience.motionEnabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault(); returnPointers.add(event.pointerId);
            try { returnButton.setPointerCapture(event.pointerId); } catch (error) {}
            updateReturn();
        });
        returnButton.addEventListener('lostpointercapture', releasePointer);
        returnButton.addEventListener('keydown', event => {
            if ((event.key === ' ' || event.key === 'Enter') && experience.motionEnabled) {
                event.preventDefault(); returnKey = true; updateReturn();
            }
        });
        returnButton.addEventListener('keyup', event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); returnKey = false; updateReturn(); }
        });
        returnButton.addEventListener('blur', () => { returnKey = false; updateReturn(); });
        returnButton.addEventListener('contextmenu', event => event.preventDefault());
        window.addEventListener('blur', clearInput);
        window.addEventListener('pagehide', clearInput);
        document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
        window.addEventListener('experience:motionchange', () => {
            if (!experience.motionEnabled) { clearInput(); if (running) clearFields(); }
            resetButton.disabled = returnButton.disabled = !experience.motionEnabled;
        });
        resetButton.addEventListener('click', () => { clearInput(); clearFields(); });
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); clearInput(); fallback(); });

        function render(elapsed) {
            if (!running) return;
            resize();
            const dt = previousTime === null ? 0 : clamp((elapsed - previousTime) / 1000, 0, 1 / 30);
            previousTime = elapsed;
            const returningNow = returning();
            if (dt > 0) {
                const bass = experience.sampleBass();
                if (hoverForce && !returningNow) inject(hoverForce,
                    clamp(hoverForce.dx * 450, -90, 90), clamp(hoverForce.dy * 450, -90, 90), 0);
                hoverForce = null;
                for (const pointer of pointers.values()) {
                    if (!returningNow) {
                        pointer.age += dt;
                        inject(pointer, clamp(pointer.dx * 1800, -180, 180), clamp(pointer.dy * 1800, -180, 180),
                            dt * 4500 * (1 + Math.min(pointer.age, 4) * .6));
                    }
                    pointer.dx = pointer.dy = 0;
                }
                draw(curl, curlField, {u_velocity: velocity.read.texture});
                draw(vorticity, velocity.write, {u_velocity: velocity.read.texture, u_curl: curlField.texture},
                    {u_dt: dt, u_curlStrength: returningNow ? 0 : 18 + bass * 8});
                velocity.swap();
                draw(divergence, divergenceField, {u_velocity: velocity.read.texture});
                draw(scale, pressure.write, {u_source: pressure.read.texture}, {u_scale: .8});
                pressure.swap();
                for (let i = 0; i < 12; i++) {
                    draw(pressureSolve, pressure.write, {u_pressure: pressure.read.texture, u_divergence: divergenceField.texture});
                    pressure.swap();
                }
                draw(gradientSubtract, velocity.write, {u_velocity: velocity.read.texture, u_pressure: pressure.read.texture});
                velocity.swap();
                draw(advectVelocity, velocity.write, {u_velocity: velocity.read.texture},
                    {u_dt: dt, u_decay: returningNow ? 14 : 1.2});
                velocity.swap();
                draw(advectImage, imageMap.write, {u_velocity: velocity.read.texture, u_map: imageMap.read.texture},
                    {u_dt: dt, u_restore: returningNow ? 5 : pointers.size ? .025 : .22});
                imageMap.swap();
            }
            draw(display, null, {u_map: imageMap.read.texture, u_artwork: artwork});
        }

        function loadArtwork() {
            if (!running || !image.naturalWidth) { fallback(); return; }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, artwork);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            clearFields();
            render(0);
            canvas.classList.add('is-ready');
            canvas.dataset.fluid = 'ready';
            experience.createRenderLoop(render, container);
        }
        if (image.complete) loadArtwork();
        else { image.addEventListener('load', loadArtwork, {once: true}); image.addEventListener('error', fallback, {once: true}); }
    } catch (error) {
        console.warn('DRIP fluid study unavailable:', error.message);
        fallback();
    }
})();
