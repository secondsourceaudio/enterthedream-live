/* =========================================
   SECOND SOURCE
   TEMPORARY LANDING EXPERIMENT
========================================= */


const canvas = document.getElementById("visual");

const container = document.getElementById("visual-container");

const visualMedia = document.getElementById("visual-media");

const fallbackImage = document.getElementById("fallback-image");


/* =========================================
   HELPERS
========================================= */

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}


/* =========================================
   ARTWORK ZOOM
========================================= */

let viewScale = 1;

let viewX = 0;
let viewY = 0;


const viewPointers = new Map();


let pinchStartDistance = 0;
let pinchStartScale = 1;

let pinchStartX = 0;
let pinchStartY = 0;

let pinchStartViewX = 0;
let pinchStartViewY = 0;


let panStartX = 0;
let panStartY = 0;

let panOriginalX = 0;
let panOriginalY = 0;

let panning = false;


/* =========================================
   DRAG DETECTION
========================================= */

let dragPointerId = null;

let dragOriginX = 0;
let dragOriginY = 0;

let dragHasStarted = false;


const dragThreshold = 6;


/* =========================================
   LIMIT PAN
========================================= */

function limitViewPan() {

    if (viewScale <= 1) {

        viewScale = 1;

        viewX = 0;
        viewY = 0;

        return;
    }

    const maxX = container.clientWidth * (viewScale - 1) / 2;
    const maxY = container.clientHeight * (viewScale - 1) / 2;

    viewX = clamp(viewX, -maxX, maxX);
    viewY = clamp(viewY, -maxY, maxY);
}


/* =========================================
   APPLY ZOOM
========================================= */

function updateViewTransform() {

    limitViewPan();

    visualMedia.style.transform =
        "translate3d(" + viewX + "px, " + viewY + "px, 0) " +
        "scale(" + viewScale + ")";
}


/* =========================================
   PINCH HELPERS
========================================= */

function viewPointerDistance() {

    const points = Array.from(viewPointers.values());

    return Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y
    );
}


function viewPointerMidpoint() {

    const points = Array.from(viewPointers.values());

    return {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
    };
}


/* =========================================
   PREVENT BROWSER DOUBLE CLICK ZOOM
========================================= */

container.addEventListener("dblclick", function (event) {
    event.preventDefault();
});


/* =========================================
   WEBGL
========================================= */

const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: true
});


if (!gl) {
    canvas.style.display = "none";
    window.SecondSourceExperience.useStaticArtwork();
}


if (gl) {

    /* =========================================
       SHADERS
    ========================================== */

    const vertexShaderSource = `

        attribute vec2 a_position;

        varying vec2 v_uv;

        void main() {

            v_uv = a_position * 0.5 + 0.5;

            gl_Position = vec4(a_position, 0.0, 1.0);
        }

    `;


    const fragmentShaderSource = `

        /* High precision where available, so the waves
           don't shimmer as u_time keeps growing. */
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif


        varying vec2 v_uv;


        uniform sampler2D u_texture;

        uniform vec2 u_pointer;

        uniform vec2 u_velocity;

        uniform float u_time;

        uniform float u_motion;
        uniform float u_sound;
        uniform float u_glitch;

        uniform float u_dragging;

        uniform float u_whirlEnergy;

        uniform float u_whirlSpin;

        uniform float u_holdStrength;
        uniform float u_holdAngle;
        uniform float u_holdPull;
        uniform vec2 u_holdCenter;
        uniform float u_holdSpin;

        /* Crops the texture like CSS object-fit: cover,
           so the canvas matches the <img> underneath. */
        uniform vec2 u_coverScale;
        uniform float u_aspect;


        /* Eight click impacts. Dragging never emits extra drops. */
        uniform vec4 u_drips[8];


        vec2 coverUV(vec2 p) {

            return (p - 0.5) * u_coverScale + 0.5;
        }


        mat2 rotate2D(float angle) {

            float s = sin(angle);
            float c = cos(angle);

            return mat2(
                c, -s,
                s,  c
            );
        }

        float fragmentNoise(vec2 p) {
            vec3 value = fract(vec3(p.xyx) * 0.1031);
            value += dot(value, value.yzx + 33.33);
            return fract((value.x + value.y) * value.z);
        }

        vec2 mirrorUV(vec2 p) {
            return 1.0 - abs(mod(p, 2.0) - 1.0);
        }


        void main() {

            vec2 baseUV = v_uv;

            vec2 uv = baseUV;

            /* A restrained response to the actual low-frequency audio energy. */
            vec2 audioCenter = baseUV - vec2(0.5);
            float audioRadius = length(audioCenter);
            uv += normalize(audioCenter + vec2(0.0001))
                * sin(audioRadius * 28.0 - u_time * 2.0)
                * u_sound * 0.010
                * (1.0 - smoothstep(0.0, 0.8, audioRadius));


            /* =================================
               1. CONSTANT CENTER BUBBLING
            ================================= */

            vec2 center = vec2(0.5, 0.5);

            vec2 centerDelta = baseUV - center;

            float centerDistance = length(centerDelta);

            vec2 centerDirection =
                normalize(centerDelta + vec2(0.0001));


            float bubbleOne =
                sin(centerDistance * 48.0 - u_time * 2.8);

            float bubbleTwo =
                sin(centerDistance * 27.0 - u_time * 1.7);

            float bubbleThree =
                sin(centerDistance * 72.0 - u_time * 3.7);


            float centerBubble =
                bubbleOne * 0.50 +
                bubbleTwo * 0.32 +
                bubbleThree * 0.18;


            float centerInfluence =
                1.0 - smoothstep(0.02, 0.78, centerDistance);


            uv +=
                centerDirection *
                centerBubble *
                centerInfluence *
                0.0038;


            /* =================================
               2. DREAMY WAVING
            ================================= */

            float broadWave =
                sin(baseUV.y * 7.0 - u_time * 0.95) * 0.0035;

            float verticalWave =
                cos(baseUV.x * 5.8 - u_time * 0.72) * 0.0019;

            float fineWave =
                sin(baseUV.y * 14.0 + u_time * 1.25) * 0.0009;


            uv.x += broadWave + fineWave;

            uv.y += verticalWave;


            /* =================================
               3. POINTER FIELD
            ================================= */

            vec2 pointerDelta = baseUV - u_pointer;

            float pointerDistance = length(pointerDelta);

            float pointerInfluence =
                1.0 - smoothstep(0.0, 0.58, pointerDistance);

            vec2 pointerDirection =
                normalize(pointerDelta + vec2(0.0001));


            /* Tangent around the cursor: gives the movement
               a true circular flow around the dragged point. */

            vec2 tangent =
                vec2(-pointerDirection.y, pointerDirection.x);


            /* =================================
               4. CURSOR-CENTERED WHIRL
            ================================= */

            float whirlFalloff =
                exp(-pointerDistance * 3.4);


            float speed =
                clamp(length(u_velocity) * 24.0, 0.0, 1.0);


            float totalWhirl =
                clamp(
                    u_dragging * 1.05 +
                    u_whirlEnergy * 0.70,
                    0.0,
                    1.8
                );


            /* Rotate the image locally around the cursor. */

            float rotationAngle =
                u_whirlSpin *
                totalWhirl *
                whirlFalloff *
                (
                    0.40 +
                    speed * 1.05 +
                    u_motion * 0.65
                );

            vec2 rotatedDelta =
                rotate2D(rotationAngle) * pointerDelta;


            uv +=
                (rotatedDelta - pointerDelta) *
                pointerInfluence *
                0.92;


            /* Smooth circulation, without repeated small ripple bands. */
            float whirlHalo =
                (1.0 - smoothstep(0.025, 0.40, pointerDistance)) *
                clamp(u_dragging + u_whirlEnergy * 0.55, 0.0, 1.0);
            uv += tangent * u_whirlSpin * whirlHalo * (0.006 + speed * 0.012);
            uv -= pointerDelta * whirlHalo * (0.012 + speed * 0.020);

            /* Keep the held vortex's field fixed while unwinding. Both the
               rotation and inward pull reach zero to restore the source image. */
            vec2 holdDelta = baseUV - u_holdCenter;
            float holdDistance = length(holdDelta);
            float holdRadius = max(0.0001, u_holdStrength * 0.80 +
                0.22 * smoothstep(0.0, 0.12, u_holdStrength));
            float holdFalloff = 1.0 - smoothstep(0.0, holdRadius, holdDistance);
            float holdInfluence = max(
                1.0 - smoothstep(0.0, 0.58, holdDistance),
                holdFalloff * u_holdStrength
            );
            float heldRotation = u_holdSpin * u_holdAngle * holdFalloff * holdFalloff;
            uv += (rotate2D(heldRotation) * holdDelta - holdDelta) * holdInfluence * 0.92;
            uv -= holdDelta * holdFalloff * u_holdPull * 0.10;


            /* Continue circular movement
               immediately after release. */

            uv +=
                tangent *
                u_whirlSpin *
                u_whirlEnergy *
                whirlFalloff *
                0.0070;


            /* =================================
               7. VISCOUS MOVEMENT
            ================================= */

            uv -=
                u_velocity *
                pointerInfluence *
                (0.045 + u_motion * 0.10);


            /* =================================
               8. MULTIPLE DRIPS

               A new click does NOT reset the previous
               click. Every active drop keeps expanding
               independently.
            ================================= */

            vec2 surfaceScale = vec2(u_aspect, 1.0);
            vec2 rippleOffset = vec2(0.0);
            for (int i = 0; i < 8; i++) {
                vec4 drip = u_drips[i];
                float age = drip.z;
                if (age >= 0.0 && age < 3.8) {
                    vec2 delta = (baseUV - drip.xy) * surfaceScale;
                    float distance = length(delta);
                    vec2 direction = delta / max(distance, 0.0001);
                    float radius = age * 0.29;
                    float wavefront = distance - radius;
                    float packet = exp(-pow(wavefront / 0.055, 2.0));
                    float life = exp(-age * 0.65)
                        * (1.0 - smoothstep(2.4, 3.8, age));
                    // Alternating crests and troughs refract the image both ways.
                    float wave = sin(wavefront * 115.0) * packet * life;
                    float impact = exp(-distance * distance * 1500.0)
                        * exp(-age * 9.0);
                    rippleOffset += (direction * wave * 0.020
                        - delta * impact * 0.12) * drip.w / surfaceScale;
                }
            }
            // Soft limits keep overlapping drops from tearing the image.
            uv += clamp(rippleOffset, vec2(-0.045), vec2(0.045));

            // SRC_GLITCH: subtle tears, with extra folding only while stirring.
            float band = floor(baseUV.y * 24.0);
            float clock = u_time * 1.8;
            float beat = floor(clock);
            float bandNoise = mix(fragmentNoise(vec2(band, beat)),
                fragmentNoise(vec2(band, beat + 1.0)), smoothstep(0.0, 1.0, fract(clock)));
            float tear = smoothstep(0.70, 0.98, bandNoise);
            if (u_glitch > 0.001) {
                vec2 offset = uv - u_pointer;
                float fold = exp(-length(offset) * 2.8)
                    * (u_dragging * 0.30 + u_whirlEnergy * 0.25);
                vec2 broken = u_pointer + rotate2D(
                    sin(u_time * 0.65 + length(offset) * 18.0) * fold
                ) * offset;
                broken.x += (fragmentNoise(vec2(band + 71.0, beat)) - 0.5)
                    * tear * (0.065 + u_sound * 0.035 + u_motion * 0.025);
                broken.y += sin(broken.x * 28.0 + u_time * 1.8)
                    * (0.006 + u_dragging * 0.008);
                vec2 tile = floor(baseUV * vec2(16.0, 12.0));
                broken += (vec2(fragmentNoise(tile + beat),
                    fragmentNoise(tile.yx - beat)) - 0.5) * tear * 0.012;
                uv = mix(uv, mirrorUV(broken), u_glitch);
            }


            /* =================================
               9. SAFE TEXTURE AREA
            ================================= */

            uv = clamp(uv, vec2(0.002), vec2(0.998));


            /* =================================
               10. IMAGE
            ================================= */

            vec4 mainSample =
                texture2D(u_texture, coverUV(uv));


            vec4 softTrail =
                texture2D(
                    u_texture,
                    coverUV(
                        clamp(
                            uv - u_velocity * pointerInfluence * 0.18,
                            vec2(0.002),
                            vec2(0.998)
                        )
                    )
                );


            float trailBlend =
                clamp(
                    u_motion * pointerInfluence * 0.065,
                    0.0,
                    0.065
                );


            vec4 color = mix(mainSample, softTrail, trailBlend);
            if (u_glitch > 0.001) {
                vec2 split = vec2(0.002 + tear * 0.004,
                    sin(u_time * 0.8 + band) * 0.001) * u_glitch;
                vec3 separated = vec3(
                    texture2D(u_texture, coverUV(mirrorUV(uv + split))).r,
                    color.g,
                    texture2D(u_texture, coverUV(mirrorUV(uv - split))).b
                );
                // A light digital fringe preserves the artwork's blue palette.
                vec3 crushed = floor(clamp(separated, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
                vec3 damaged = mix(separated, crushed.brg * vec3(1.1, 0.95, 1.05), 0.10);
                float lines = 0.98 + 0.02 * sin(baseUV.y * 460.0);
                color.rgb = mix(color.rgb, damaged * lines, u_glitch * 0.60);
            }
            gl_FragColor = vec4(color.rgb, 1.0);
        }

    `;


    /* =========================================
       SHADER CREATION
    ========================================== */

    function createShader(type, source) {

        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

            console.error(gl.getShaderInfoLog(shader));

            return null;
        }

        return shader;
    }


    /* =========================================
       GL RESOURCES

       Everything the GPU owns lives in setupGL(), so it
       can be rebuilt if the browser takes the WebGL
       context away (common on phones) and gives it back.
    ========================================== */

    let glActive = false;
    let imageReady = false;

    let uniforms = {};
    let texture = null;


    /* How the texture is cropped to fill the canvas
       (same idea as CSS object-fit: cover). */

    let imageAspect = 1;

    let coverX = 1;
    let coverY = 1;


    function updateCoverScale() {

        const canvasAspect =
            canvas.height > 0
                ? canvas.width / canvas.height
                : 1;

        if (imageAspect > canvasAspect) {

            coverX = canvasAspect / imageAspect;
            coverY = 1;

        } else {

            coverX = 1;
            coverY = imageAspect / canvasAspect;
        }
    }


    function uploadArtworkTexture() {

        const maximum = Math.min(
            1800,
            gl.getParameter(gl.MAX_TEXTURE_SIZE)
        );

        let width = fallbackImage.naturalWidth;
        let height = fallbackImage.naturalHeight;

        const longest = Math.max(width, height);

        if (longest > maximum) {

            const resizeScale = maximum / longest;

            width = Math.round(width * resizeScale);
            height = Math.round(height * resizeScale);
        }


        const textureCanvas = document.createElement("canvas");

        textureCanvas.width = width;
        textureCanvas.height = height;

        const context = textureCanvas.getContext("2d");

        context.drawImage(fallbackImage, 0, 0, width, height);


        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            textureCanvas
        );


        imageAspect = width / height;

        updateCoverScale();

        imageReady = true;

        canvas.classList.add("is-ready");
    }


    function setupGL() {

        const vertexShader =
            createShader(gl.VERTEX_SHADER, vertexShaderSource);

        const fragmentShader =
            createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            return false;
        }


        const program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {

            console.error(gl.getProgramInfoLog(program));

            return false;
        }

        gl.useProgram(program);


        /* PLANE */

        const buffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,

                -1,  1,
                 1, -1,
                 1,  1
            ]),
            gl.STATIC_DRAW
        );

        const position = gl.getAttribLocation(program, "a_position");

        gl.enableVertexAttribArray(position);

        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);


        /* UNIFORMS */

        uniforms = {
            pointer:     gl.getUniformLocation(program, "u_pointer"),
            velocity:    gl.getUniformLocation(program, "u_velocity"),
            time:        gl.getUniformLocation(program, "u_time"),
            motion:      gl.getUniformLocation(program, "u_motion"),
            sound:       gl.getUniformLocation(program, "u_sound"),
            glitch:      gl.getUniformLocation(program, "u_glitch"),
            dragging:    gl.getUniformLocation(program, "u_dragging"),
            whirlEnergy: gl.getUniformLocation(program, "u_whirlEnergy"),
            whirlSpin:   gl.getUniformLocation(program, "u_whirlSpin"),
            holdStrength: gl.getUniformLocation(program, "u_holdStrength"),
            holdAngle:   gl.getUniformLocation(program, "u_holdAngle"),
            holdPull:    gl.getUniformLocation(program, "u_holdPull"),
            holdCenter:  gl.getUniformLocation(program, "u_holdCenter"),
            holdSpin:    gl.getUniformLocation(program, "u_holdSpin"),
            coverScale:  gl.getUniformLocation(program, "u_coverScale"),
            aspect:      gl.getUniformLocation(program, "u_aspect"),
            drips:       gl.getUniformLocation(program, "u_drips[0]"),
            texture:     gl.getUniformLocation(program, "u_texture")
        };


        /* TEXTURE */

        texture = gl.createTexture();

        gl.activeTexture(gl.TEXTURE0);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_S,
            gl.CLAMP_TO_EDGE
        );

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_T,
            gl.CLAMP_TO_EDGE
        );

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            gl.LINEAR
        );

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MAG_FILTER,
            gl.LINEAR
        );

        gl.uniform1i(uniforms.texture, 0);


        gl.viewport(0, 0, canvas.width, canvas.height);


        glActive = true;

        if (
            fallbackImage.complete &&
            fallbackImage.naturalWidth > 0
        ) {
            uploadArtworkTexture();
        }

        return true;
    }


    /* If the image finishes loading after setup. */

    fallbackImage.addEventListener("load", function () {

        if (glActive) {
            uploadArtworkTexture();
        }
    });


    /* =========================================
       CONTEXT LOSS / RESTORE
    ========================================== */

    canvas.addEventListener("webglcontextlost", function (event) {

        /* Tells the browser we want the context back. */
        event.preventDefault();

        glActive = false;
        imageReady = false;
    });


    canvas.addEventListener("webglcontextrestored", function () {

        setupGL();
    });


    /* =========================================
       POINTER STATE
    ========================================== */

    let pointerX = 0.5;
    let pointerY = 0.5;

    let targetPointerX = 0.5;
    let targetPointerY = 0.5;

    let velocityX = 0;
    let velocityY = 0;

    let targetVelocityX = 0;
    let targetVelocityY = 0;

    let motion = 0;
    let soundEnergy = 0;
    let glitchAmount = 0;
    let targetMotion = 0;

    let draggingAmount = 0;
    let targetDraggingAmount = 0;

    let whirlEnergy = 0;
    let targetWhirlEnergy = 0;

    let holdElapsed = 0;
    let holdStrength = 0;
    let holdAngle = 0;
    let holdPhase = 0;
    let holdForwardSpeed = 0;
    let holdReverseSpeed = 0;
    let holdPull = 0;
    let holdCenterX = 0.5;
    let holdCenterY = 0.5;
    let holdSpin = 1;
    let holdReleaseTime = -1;
    let holdReleaseAngle = 0;
    let holdStarted = false;
    const holdCoastDuration = 1.1;
    const holdReverseRamp = 0.65;

    function clearHold() {
        holdElapsed = holdStrength = holdAngle = 0;
        holdPhase = holdForwardSpeed = holdReverseSpeed = 0;
        holdPull = 0;
        holdReleaseTime = -1;
        holdReleaseAngle = 0;
        holdStarted = false;
    }


    /* Current rotational direction:
       +1 = clockwise, -1 = counter-clockwise */

    let whirlSpin = 1;
    let targetWhirlSpin = 1;


    /* Previous position, used to infer a stable drag direction. */

    let previousDragX = 0.5;
    let previousDragY = 0.5;
    let dragCenterX = 0.5;
    let dragCenterY = 0.5;
    let lastPointerTime = 0;
    let simulationTime = 0;
    let previousFrameTime = null;


    /* =========================================
       MULTIPLE DRIPS
    ========================================== */

    const maximumDrips = 8;

    const drips = [];

    for (let index = 0; index < maximumDrips; index++) {
        drips.push({ x: 0.5, y: 0.5, started: -100000, strength: 0 });
    }

    let nextDripSlot = 0;
    let lastDripSlot = -1;


    /* Reused every frame instead of allocating new arrays
       60 times a second. */

    const dripData = new Float32Array(maximumDrips * 4);


    /* =========================================
       UPDATE POINTER
    ========================================== */

    function surfacePoint(clientX, clientY) {
        // Use the transformed artwork bounds, including pinch zoom and pan.
        const rect = visualMedia.getBoundingClientRect();
        return {
            x: clamp((clientX - rect.left) / rect.width, 0, 1),
            y: clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
        };
    }

    function updateShaderPointer(clientX, clientY, reset = false) {

        const point = surfacePoint(clientX, clientY);
        const nextX = point.x;
        const nextY = point.y;
        const now = performance.now();
        const seconds = clamp((now - lastPointerTime) / 1000, 1 / 240, 0.08);
        lastPointerTime = now;

        const deltaX = reset ? 0 : nextX - targetPointerX;
        const deltaY = reset ? 0 : nextY - targetPointerY;

        targetPointerX = nextX;
        targetPointerY = nextY;


        targetVelocityX = clamp(deltaX / seconds / 60 * 1.30, -0.033, 0.033);
        targetVelocityY = clamp(deltaY / seconds / 60 * 1.30, -0.033, 0.033);

        targetMotion = Math.min(
            1,
            Math.hypot(deltaX, deltaY) / seconds * 0.45
        );


        /* WHIRL DIRECTION */

        if (dragHasStarted) {

            const dragX = nextX - previousDragX;
            const dragY = nextY - previousDragY;


            /* Follow the direction of stirring around the initial touch. */

            const localX = nextX - dragCenterX;
            const localY = nextY - dragCenterY;

            const cross = localX * dragY - localY * dragX;

            if (Math.abs(cross) > 0.00002) {
                targetWhirlSpin = cross > 0 ? 1 : -1;
            }

            targetWhirlEnergy = Math.min(
                1,
                0.70 + targetMotion * 0.30
            );
        }


        previousDragX = nextX;
        previousDragY = nextY;
    }


    /* =========================================
       CREATE / CANCEL DROP

       Does not delete any other active drop.
       It simply uses the next slot.
    ========================================== */

    function createDrip(clientX, clientY) {
        const { x, y } = surfacePoint(clientX, clientY);

        drips[nextDripSlot] = {
            x: x,
            y: y,
            started: simulationTime,
            strength: 1
        };

        lastDripSlot = nextDripSlot;

        nextDripSlot = (nextDripSlot + 1) % maximumDrips;
    }


    /* Used when a tap turns out to be the start of a pinch. */

    function cancelLastDrip() {

        if (lastDripSlot >= 0) {
            drips[lastDripSlot].started = -100000;
            lastDripSlot = -1;
        }
    }


    /* =========================================
       POINTER DOWN
    ========================================== */

    container.addEventListener("pointerdown", function (event) {

        if (!window.SecondSourceExperience.motionEnabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (viewPointers.size >= 2) return;
        if (viewPointers.size === 0) lastDripSlot = -1;

        viewPointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
            type: event.pointerType
        });


        try {
            container.setPointerCapture(event.pointerId);
        } catch (error) {
        }


        if (viewPointers.size === 1 && viewScale === 1) {

            dragPointerId = event.pointerId;

            dragOriginX = event.clientX;
            dragOriginY = event.clientY;

            dragHasStarted = false;

            targetDraggingAmount = 0;

            // Short taps stay radial; a sustained press builds a separate vortex.
            draggingAmount = 0;
            whirlEnergy = targetWhirlEnergy = 0;
            clearHold();

            updateShaderPointer(event.clientX, event.clientY, true);

            previousDragX = targetPointerX;
            previousDragY = targetPointerY;
            dragCenterX = targetPointerX;
            dragCenterY = targetPointerY;


            /* Every click/tap adds another independent drop. */

            createDrip(event.clientX, event.clientY);
        }


        /* SECOND FINGER = PINCH */

        if (viewPointers.size === 2) {

            /* Cancel the drop the first finger started. */
            cancelLastDrip();
            clearHold();

            dragPointerId = null;

            dragHasStarted = false;

            targetDraggingAmount = 0;

            pinchStartDistance = viewPointerDistance();

            pinchStartScale = viewScale;

            const midpoint = viewPointerMidpoint();

            pinchStartX = midpoint.x;
            pinchStartY = midpoint.y;

            pinchStartViewX = viewX;
            pinchStartViewY = viewY;

            panning = false;

        } else if (viewScale > 1) {

            targetDraggingAmount = 0;
            clearHold();

            panning = true;

            panStartX = event.clientX;
            panStartY = event.clientY;

            panOriginalX = viewX;
            panOriginalY = viewY;
        }
    });


    /* =========================================
       POINTER MOVE
    ========================================== */

    window.addEventListener("pointermove", function (event) {

        if (!window.SecondSourceExperience.motionEnabled) return;
        const tracked = viewPointers.get(event.pointerId);
        const overArtwork = event.target instanceof Node && container.contains(event.target);
        if (!tracked && !overArtwork) return;

        // Recover a mouse release missed while the pointer was outside the artwork.
        if (tracked && tracked.type === "mouse" && !(event.buttons & 1)) {
            releasePointer({ type: "pointerup", pointerId: event.pointerId });
        }

        if (viewPointers.has(event.pointerId)) {

            viewPointers.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
                type: event.pointerType
            });
        }


        /* PINCH */

        if (viewPointers.size === 2) {

            targetDraggingAmount = 0;

            const distance = viewPointerDistance();

            const midpoint = viewPointerMidpoint();

            viewScale = clamp(
                pinchStartScale * (distance / Math.max(pinchStartDistance, 1)),
                1,
                3.5
            );

            viewX = pinchStartViewX + (midpoint.x - pinchStartX);
            viewY = pinchStartViewY + (midpoint.y - pinchStartY);

            updateViewTransform();

            return;
        }


        /* PAN WHEN ZOOMED */

        if (panning && viewScale > 1) {

            targetDraggingAmount = 0;

            viewX = panOriginalX + (event.clientX - panStartX);
            viewY = panOriginalY + (event.clientY - panStartY);

            updateViewTransform();

            return;
        }


        if (viewScale !== 1) {
            return;
        }

        // Move the existing vortex without starting a drag, reversing its spin,
        // or resetting the accumulated rotation and strength.
        if (holdStarted && event.pointerId === dragPointerId) {
            const point = surfacePoint(event.clientX, event.clientY);
            targetPointerX = point.x;
            targetPointerY = point.y;
            return;
        }


        /* NORMAL CURSOR MOVEMENT */

        if (
            event.pointerType === "mouse" &&
            !viewPointers.has(event.pointerId)
        ) {

            targetDraggingAmount = 0;

            updateShaderPointer(event.clientX, event.clientY);

            return;
        }


        /* HELD DRAG */

        if (viewPointers.has(event.pointerId)) {

            if (event.pointerId === dragPointerId) {

                const distanceFromStart = Math.hypot(
                    event.clientX - dragOriginX,
                    event.clientY - dragOriginY
                );

                if (
                    !dragHasStarted &&
                    distanceFromStart > dragThreshold
                ) {

                    dragHasStarted = true;

                    previousDragX = targetPointerX;
                    previousDragY = targetPointerY;
                }

                if (dragHasStarted) {
                    targetDraggingAmount = 1;
                }
            }

            updateShaderPointer(event.clientX, event.clientY);
        }
    });


    /* =========================================
       RELEASE
    ========================================== */

    function releasePointer(event) {

        const pointer = viewPointers.get(event.pointerId);
        if (!pointer) return;

        if (pointer.type === "mouse" &&
            (event.type === "lostpointercapture" || event.type === "pointercancel")) {
            // A browser capture interruption is not a physical mouse release.
            // Keep the vortex and follow events at window level until actual up.
            try { container.setPointerCapture(event.pointerId); } catch (error) {}
            return;
        }

        viewPointers.delete(event.pointerId);


        if (event.pointerId === dragPointerId) {
            const wasDragging = dragHasStarted;
            holdElapsed = 0;
            if (event.type === "pointerup") {
                holdReverseSpeed = Math.max(0.08, holdForwardSpeed * 0.25);
                holdReleaseTime = 0;
                holdReleaseAngle = holdAngle;
            } else {
                clearHold();
            }

            dragPointerId = null;

            dragHasStarted = false;

            targetDraggingAmount = 0;


            /* Keep some of the whirl alive after release. */

            if (wasDragging && event.type === "pointerup") {
                targetWhirlEnergy = Math.max(whirlEnergy, 0.70);
            }
        }


        if (viewPointers.size < 2) {
            pinchStartDistance = 0;
        }


        if (viewPointers.size === 0) {

            panning = false;

            targetDraggingAmount = 0;
        }
    }


    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    container.addEventListener("lostpointercapture", releasePointer);
    function releaseMousePointers(event) {
        if (event.type === "mousemove" && (event.buttons & 1)) return;
        if (event.type === "mouseup" && event.button !== 0) return;
        for (const [pointerId, pointer] of viewPointers) {
            if (pointer.type === "mouse") releasePointer({ type: "pointerup", pointerId });
        }
    }
    window.addEventListener("mouseup", releaseMousePointers);
    window.addEventListener("mousemove", releaseMousePointers);
    container.addEventListener("dragstart", event => event.preventDefault());
    container.addEventListener("pointerenter", event => {
        if (!viewPointers.size) updateShaderPointer(event.clientX, event.clientY, true);
    });
    container.addEventListener("keydown", event => {
        if (event.target !== container || event.repeat ||
            !window.SecondSourceExperience.motionEnabled ||
            (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        createDrip(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    function clearGesture() {
        for (const id of viewPointers.keys()) {
            if (container.hasPointerCapture(id)) container.releasePointerCapture(id);
        }
        viewPointers.clear();
        dragPointerId = null;
        dragHasStarted = false;
        panning = false;
        pinchStartDistance = 0;
        targetDraggingAmount = 0;
        targetWhirlEnergy = 0;
        targetMotion = 0;
        targetVelocityX = targetVelocityY = 0;
        clearHold();
    }
    window.addEventListener("blur", clearGesture);
    window.addEventListener("pagehide", clearGesture);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) clearGesture();
    });
    container.addEventListener("contextmenu", event => event.preventDefault());
    window.addEventListener("experience:motionchange", () => {
        if (!window.SecondSourceExperience.motionEnabled) clearGesture();
    });


    /* =========================================
       CANVAS SIZE
    ========================================== */

    function resizeCanvas() {

        const ratio = Math.min(window.devicePixelRatio || 1, 2);

        const width = Math.floor(container.clientWidth * ratio);
        const height = Math.floor(container.clientHeight * ratio);

        if (canvas.width !== width || canvas.height !== height) {

            canvas.width = width;
            canvas.height = height;

            gl.viewport(0, 0, width, height);

            updateCoverScale();
        }
    }


    /* =========================================
       RENDER

       Runs once and keeps going. While the context
       is lost it just waits.
    ========================================== */




    function render(elapsed) {




        if (!glActive) {
            return;
        }


        resizeCanvas();
        const seconds = previousFrameTime === null ? 1 / 60
            : clamp((elapsed - previousFrameTime) / 1000, 0, 0.064);
        previousFrameTime = elapsed;
        simulationTime = elapsed / 1000;
        const frames = seconds * 60;
        const smoothing = amount => 1 - Math.pow(1 - amount, frames);

        // Simulation time excludes hidden, offscreen and motion-off periods.
        const holding = dragPointerId !== null && viewPointers.size === 1 &&
            viewScale === 1 && !dragHasStarted;
        if (holding) {
            holdElapsed += seconds;
            if (holdElapsed >= 0.65) holdStarted = true;
            const charge = clamp((holdElapsed - 0.65) / 7, 0, 1);
            holdStrength += (charge - holdStrength) * smoothing(0.10);
            if (holdStrength > 0.001) holdPhase += seconds * (0.5 + holdStrength * 2.0);
            const nextAngle = holdStrength * (1.2 + holdPhase * 2.0);
            if (seconds > 0) holdForwardSpeed = (nextAngle - holdAngle) / seconds;
            holdAngle = nextAngle;
            holdPull = holdStrength;
        } else if (holdReleaseTime >= 0 && holdStrength > 0) {
            holdReleaseTime += seconds;
            // Integrate the slowing forward spin, then ease into a slow reverse.
            // The same spatial field stays in place until its deformation is zero.
            const coastTime = Math.min(holdReleaseTime, holdCoastDuration);
            const coastAngle = holdReleaseAngle + holdForwardSpeed *
                (coastTime - coastTime * coastTime / (2 * holdCoastDuration));
            if (holdReleaseTime <= holdCoastDuration) {
                holdAngle = coastAngle;
            } else {
                const reverseTime = holdReleaseTime - holdCoastDuration;
                const ramp = clamp(reverseTime / holdReverseRamp, 0, 1);
                const reverseDistance = holdReverseSpeed * (
                    holdReverseRamp * (Math.pow(ramp, 3) - 0.5 * Math.pow(ramp, 4)) +
                    Math.max(0, reverseTime - holdReverseRamp)
                );
                holdAngle = Math.max(0, coastAngle - reverseDistance);
                holdPull = holdStrength * holdAngle / Math.max(coastAngle, 0.0001);
                if (holdAngle === 0) clearHold();
            }
        } else {
            clearHold();
        }


        /* SMOOTH POINTER */

        pointerX += (targetPointerX - pointerX) * smoothing(0.22);
        pointerY += (targetPointerY - pointerY) * smoothing(0.22);

        velocityX += (targetVelocityX - velocityX) * smoothing(0.10);
        velocityY += (targetVelocityY - velocityY) * smoothing(0.10);

        motion += (targetMotion - motion) * smoothing(0.09);

        draggingAmount +=
            (targetDraggingAmount - draggingAmount) * smoothing(0.14);

        whirlEnergy +=
            (targetWhirlEnergy - whirlEnergy) * smoothing(0.12);

        whirlSpin +=
            (targetWhirlSpin - whirlSpin) * smoothing(0.08);

        if (holding) {
            if (holdStarted) {
                holdCenterX += (targetPointerX - holdCenterX) * smoothing(0.16);
                holdCenterY += (targetPointerY - holdCenterY) * smoothing(0.16);
            } else {
                holdCenterX = pointerX;
                holdCenterY = pointerY;
                holdSpin = whirlSpin;
            }
        }


        /* NATURAL DECAY */

        targetVelocityX *= Math.pow(0.82, frames);
        targetVelocityY *= Math.pow(0.82, frames);

        targetMotion *= Math.pow(0.88, frames);

        if (targetDraggingAmount === 0) {
            targetWhirlEnergy *= Math.pow(0.985, frames);
        }


        const time = elapsed / 1000;
        soundEnergy += (window.SecondSourceExperience.sampleBass() - soundEnergy) * smoothing(0.08);
        glitchAmount += ((window.SecondSourceExperience.glitchEnabled ? 1 : 0) - glitchAmount) * smoothing(0.08);


        /* MULTIPLE DROP UNIFORMS */

        for (let index = 0; index < maximumDrips; index++) {

            const drip = drips[index];

            const offset = index * 4;
            dripData[offset] = drip.x;
            dripData[offset + 1] = drip.y;
            dripData[offset + 2] = drip.started < 0 ? -1 : simulationTime - drip.started;
            dripData[offset + 3] = drip.strength;
        }


        if (imageReady) {

            gl.uniform2f(uniforms.pointer, pointerX, pointerY);

            gl.uniform2f(uniforms.velocity, velocityX, velocityY);

            gl.uniform1f(uniforms.time, time);

            gl.uniform1f(uniforms.motion, motion);
            gl.uniform1f(uniforms.sound, soundEnergy);
            gl.uniform1f(uniforms.glitch, glitchAmount);

            gl.uniform1f(uniforms.dragging, draggingAmount);

            gl.uniform1f(uniforms.whirlEnergy, whirlEnergy);

            gl.uniform1f(uniforms.whirlSpin, whirlSpin);
            gl.uniform1f(uniforms.holdStrength, holdStrength);
            gl.uniform1f(uniforms.holdAngle, holdAngle);
            gl.uniform1f(uniforms.holdPull, holdPull);
            gl.uniform2f(uniforms.holdCenter, holdCenterX, holdCenterY);
            gl.uniform1f(uniforms.holdSpin, holdSpin);

            gl.uniform2f(uniforms.coverScale, coverX, coverY);
            gl.uniform1f(uniforms.aspect, canvas.width / canvas.height);
            gl.uniform4fv(uniforms.drips, dripData);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }


    if (setupGL()) {
        window.SecondSourceExperience.createRenderLoop(render, container);
    }
}
