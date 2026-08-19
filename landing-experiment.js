/* =========================================
   SECOND SOURCE
   TEMPORARY LANDING EXPERIMENT
========================================= */


const canvas =
    document.getElementById("visual");


const container =
    document.getElementById(
        "visual-container"
    );


const visualMedia =
    document.getElementById(
        "visual-media"
    );


const fallbackImage =
    document.getElementById(
        "fallback-image"
    );


/* =========================================
   HELPERS
========================================= */

function clamp(
    value,
    minimum,
    maximum
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );

}


/* =========================================
   ARTWORK ZOOM
========================================= */

let viewScale = 1;

let viewX = 0;
let viewY = 0;


const viewPointers =
    new Map();


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


/*
   Small threshold prevents trackpad clicks
   from instantly activating the vortex.
*/

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


    const maxX =
        container.clientWidth *
        (viewScale - 1) /
        2;


    const maxY =
        container.clientHeight *
        (viewScale - 1) /
        2;


    viewX =
        clamp(
            viewX,
            -maxX,
            maxX
        );


    viewY =
        clamp(
            viewY,
            -maxY,
            maxY
        );

}


/* =========================================
   APPLY ZOOM
========================================= */

function updateViewTransform() {

    limitViewPan();


    visualMedia.style.transform =
        `
            translate3d(
                ${viewX}px,
                ${viewY}px,
                0
            )
            scale(${viewScale})
        `;

}


/* =========================================
   PINCH HELPERS
========================================= */

function viewPointerDistance() {

    const points =
        Array.from(
            viewPointers.values()
        );


    return Math.hypot(

        points[1].x -
        points[0].x,

        points[1].y -
        points[0].y

    );

}


function viewPointerMidpoint() {

    const points =
        Array.from(
            viewPointers.values()
        );


    return {

        x:
            (
                points[0].x +
                points[1].x
            )
            /
            2,

        y:
            (
                points[0].y +
                points[1].y
            )
            /
            2

    };

}


/* =========================================
   PREVENT BROWSER DOUBLE CLICK ZOOM
========================================= */

container.addEventListener(
    "dblclick",
    function (event) {

        event.preventDefault();

    }
);


/* =========================================
   WEBGL
========================================= */

const gl =
    canvas.getContext(
        "webgl",
        {
            antialias: true,
            alpha: true
        }
    );


if (!gl) {

    canvas.style.display =
        "none";

}


/* =========================================
   WEBGL
========================================= */

if (gl) {

    const vertexShaderSource = `

        attribute vec2 a_position;

        varying vec2 v_uv;


        void main() {

            v_uv =
                a_position * 0.5 + 0.5;


            gl_Position =
                vec4(
                    a_position,
                    0.0,
                    1.0
                );

        }

    `;


    const fragmentShaderSource = `

        precision mediump float;


        varying vec2 v_uv;


        uniform sampler2D u_texture;

        uniform vec2 u_pointer;

        uniform vec2 u_velocity;

        uniform vec2 u_dripCenter;

        uniform float u_time;

        uniform float u_motion;

        uniform float u_dripAge;

        uniform float u_dragging;

        uniform float u_whirlEnergy;


        mat2 rotate2D(
            float angle
        ) {

            float s = sin(angle);
            float c = cos(angle);

            return mat2(
                c, -s,
                s,  c
            );

        }


        void main() {

            vec2 baseUV =
                v_uv;


            vec2 uv =
                baseUV;


            /* =================================
               1. CONSTANT CENTER WATER
            ================================= */


            vec2 center =
                vec2(
                    0.5,
                    0.5
                );


            vec2 centerDelta =
                baseUV -
                center;


            float centerDistance =
                length(
                    centerDelta
                );


            vec2 centerDirection =
                normalize(
                    centerDelta +
                    vec2(0.0001)
                );


            float bubbleOne =
                sin(
                    centerDistance *
                    48.0 -
                    u_time *
                    2.8
                );


            float bubbleTwo =
                sin(
                    centerDistance *
                    27.0 -
                    u_time *
                    1.7
                );


            float bubbleThree =
                sin(
                    centerDistance *
                    72.0 -
                    u_time *
                    3.7
                );


            float centerBubble =
                bubbleOne * 0.50 +
                bubbleTwo * 0.32 +
                bubbleThree * 0.18;


            float centerInfluence =
                smoothstep(
                    0.78,
                    0.02,
                    centerDistance
                );


            uv +=
                centerDirection *
                centerBubble *
                centerInfluence *
                0.0038;


            /* =================================
               2. SUBTLE DREAMY WAVE
            ================================= */


            float broadWave =
                sin(
                    baseUV.y *
                    7.0 -
                    u_time *
                    0.95
                )
                *
                0.0035;


            float verticalWave =
                cos(
                    baseUV.x *
                    5.8 -
                    u_time *
                    0.72
                )
                *
                0.0019;


            float fineWave =
                sin(
                    baseUV.y *
                    14.0 +
                    u_time *
                    1.25
                )
                *
                0.0009;


            uv.x +=
                broadWave +
                fineWave;


            uv.y +=
                verticalWave;


            /* =================================
               3. POINTER FIELD
            ================================= */


            vec2 pointerDelta =
                baseUV -
                u_pointer;


            float pointerDistance =
                length(
                    pointerDelta
                );


            float pointerInfluence =
                smoothstep(
                    0.42,
                    0.0,
                    pointerDistance
                );


            vec2 pointerDirection =
                normalize(
                    pointerDelta +
                    vec2(0.0001)
                );


            /* =================================
               4. REALISTIC DREAMY WHIRL
            ================================= */


            /*
               The vortex is strongest near the
               pointer and dissolves gradually.
            */


            float whirlFalloff =
                exp(
                    -pointerDistance *
                    4.2
                );


            /*
               Movement direction determines
               clockwise / counter-clockwise
               rotation.
            */


            float crossDirection =
                u_velocity.x *
                pointerDelta.y
                -
                u_velocity.y *
                pointerDelta.x;


            float direction =
                sign(
                    crossDirection +
                    0.00001
                );


            float speed =
                clamp(
                    length(
                        u_velocity
                    )
                    *
                    18.0,
                    0.0,
                    1.0
                );


            /*
               Residual whirlEnergy allows the
               surface to continue spinning gently
               after releasing the pointer.
            */


            float whirlStrength =
                (
                    u_dragging *
                    0.55

                    +

                    u_whirlEnergy *
                    0.45
                );


            float whirlAngle =
                direction *
                whirlFalloff *
                whirlStrength *
                (
                    0.10 +
                    speed * 0.65 +
                    u_motion * 0.35
                );


            vec2 rotatedPointer =
                rotate2D(
                    whirlAngle
                )
                *
                pointerDelta;


            /*
               Blend rotational coordinates softly.
               No hard digital warping.
            */


            uv +=
                (
                    rotatedPointer -
                    pointerDelta
                )
                *
                pointerInfluence *
                0.42;


            /* =================================
               5. SMALL SPIRAL WATER RINGS
            ================================= */


            float spiralPhase =
                pointerDistance *
                42.0

                -

                u_time *
                3.0

                +

                atan(
                    pointerDelta.y,
                    pointerDelta.x
                )
                *
                2.4;


            float spiralWave =
                sin(
                    spiralPhase
                );


            uv +=
                pointerDirection *
                spiralWave *
                pointerInfluence *
                whirlStrength *
                0.0035;


            /* =================================
               6. POINTER WATER RIPPLE
            ================================= */


            float pointerWaveOne =
                sin(
                    pointerDistance *
                    56.0 -
                    u_time *
                    6.0
                );


            float pointerWaveTwo =
                sin(
                    pointerDistance *
                    26.0 -
                    u_time *
                    3.2
                );


            float pointerWave =
                pointerWaveOne * 0.68 +
                pointerWaveTwo * 0.32;


            uv +=
                pointerDirection *
                pointerWave *
                pointerInfluence *
                (
                    0.0035 +
                    u_motion * 0.013
                );


            /* =================================
               7. VISCOUS DRAG
            ================================= */


            uv -=
                u_velocity *
                pointerInfluence *
                (
                    0.055 +
                    u_motion * 0.13
                );


            /* =================================
               8. DRIP ON CLICK / TAP
            ================================= */


            vec2 dripDelta =
                baseUV -
                u_dripCenter;


            float dripDistance =
                length(
                    dripDelta
                );


            vec2 dripDirection =
                normalize(
                    dripDelta +
                    vec2(0.0001)
                );


            float dripRadius =
                u_dripAge *
                0.33;


            float dripLife =
                clamp(
                    1.0 -
                    u_dripAge /
                    2.6,
                    0.0,
                    1.0
                );


            float dripRing =
                exp(
                    -abs(
                        dripDistance -
                        dripRadius
                    )
                    *
                    58.0
                )
                *
                dripLife;


            float secondRadius =
                max(
                    0.0,
                    dripRadius -
                    0.055
                );


            float secondRing =
                exp(
                    -abs(
                        dripDistance -
                        secondRadius
                    )
                    *
                    72.0
                )
                *
                dripLife *
                0.45;


            float impact =
                exp(
                    -dripDistance *
                    24.0
                )
                *
                exp(
                    -u_dripAge *
                    4.0
                );


            uv +=
                dripDirection *
                dripRing *
                0.050;


            uv +=
                dripDirection *
                secondRing *
                0.022;


            uv -=
                dripDelta *
                impact *
                0.10;


            /* =================================
               9. SAFE TEXTURE
            ================================= */


            uv =
                clamp(
                    uv,
                    vec2(0.002),
                    vec2(0.998)
                );


            /* =================================
               10. IMAGE
            ================================= */


            vec4 mainSample =
                texture2D(
                    u_texture,
                    uv
                );


            /*
               A very subtle secondary sample gives
               the moving area a liquid thickness.
            */


            vec4 softTrail =
                texture2D(

                    u_texture,

                    clamp(

                        uv -
                        u_velocity *
                        pointerInfluence *
                        0.22,

                        vec2(0.002),

                        vec2(0.998)

                    )

                );


            float trailBlend =
                clamp(
                    u_motion *
                    pointerInfluence *
                    0.08,
                    0.0,
                    0.08
                );


            gl_FragColor =
                mix(
                    mainSample,
                    softTrail,
                    trailBlend
                );

        }

    `;


    /* =========================================
       SHADER CREATION
    ========================================== */

    function createShader(
        type,
        source
    ) {

        const shader =
            gl.createShader(
                type
            );


        gl.shaderSource(
            shader,
            source
        );


        gl.compileShader(
            shader
        );


        if (
            !gl.getShaderParameter(
                shader,
                gl.COMPILE_STATUS
            )
        ) {

            console.error(
                gl.getShaderInfoLog(
                    shader
                )
            );


            return null;

        }


        return shader;

    }


    const vertexShader =
        createShader(
            gl.VERTEX_SHADER,
            vertexShaderSource
        );


    const fragmentShader =
        createShader(
            gl.FRAGMENT_SHADER,
            fragmentShaderSource
        );


    if (
        vertexShader &&
        fragmentShader
    ) {

        const program =
            gl.createProgram();


        gl.attachShader(
            program,
            vertexShader
        );


        gl.attachShader(
            program,
            fragmentShader
        );


        gl.linkProgram(
            program
        );


        if (
            gl.getProgramParameter(
                program,
                gl.LINK_STATUS
            )
        ) {

            gl.useProgram(
                program
            );


            /* =================================
               PLANE
            ================================= */


            const buffer =
                gl.createBuffer();


            gl.bindBuffer(
                gl.ARRAY_BUFFER,
                buffer
            );


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


            const position =
                gl.getAttribLocation(
                    program,
                    "a_position"
                );


            gl.enableVertexAttribArray(
                position
            );


            gl.vertexAttribPointer(
                position,
                2,
                gl.FLOAT,
                false,
                0,
                0
            );


            /* =================================
               UNIFORMS
            ================================= */


            const pointerUniform =
                gl.getUniformLocation(
                    program,
                    "u_pointer"
                );


            const velocityUniform =
                gl.getUniformLocation(
                    program,
                    "u_velocity"
                );


            const dripCenterUniform =
                gl.getUniformLocation(
                    program,
                    "u_dripCenter"
                );


            const timeUniform =
                gl.getUniformLocation(
                    program,
                    "u_time"
                );


            const motionUniform =
                gl.getUniformLocation(
                    program,
                    "u_motion"
                );


            const dripAgeUniform =
                gl.getUniformLocation(
                    program,
                    "u_dripAge"
                );


            const draggingUniform =
                gl.getUniformLocation(
                    program,
                    "u_dragging"
                );


            const whirlEnergyUniform =
                gl.getUniformLocation(
                    program,
                    "u_whirlEnergy"
                );


            const textureUniform =
                gl.getUniformLocation(
                    program,
                    "u_texture"
                );


            /* =================================
               TEXTURE
            ================================= */


            const texture =
                gl.createTexture();


            gl.activeTexture(
                gl.TEXTURE0
            );


            gl.bindTexture(
                gl.TEXTURE_2D,
                texture
            );


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


            gl.uniform1i(
                textureUniform,
                0
            );


            /* =================================
               ARTWORK
            ================================= */


            let imageReady = false;


            function uploadArtworkTexture() {

                const maximum =
                    Math.min(
                        1800,
                        gl.getParameter(
                            gl.MAX_TEXTURE_SIZE
                        )
                    );


                let width =
                    fallbackImage.naturalWidth;


                let height =
                    fallbackImage.naturalHeight;


                const longest =
                    Math.max(
                        width,
                        height
                    );


                if (
                    longest >
                    maximum
                ) {

                    const resizeScale =
                        maximum /
                        longest;


                    width =
                        Math.round(
                            width *
                            resizeScale
                        );


                    height =
                        Math.round(
                            height *
                            resizeScale
                        );

                }


                const textureCanvas =
                    document.createElement(
                        "canvas"
                    );


                textureCanvas.width =
                    width;


                textureCanvas.height =
                    height;


                const context =
                    textureCanvas.getContext(
                        "2d"
                    );


                context.drawImage(
                    fallbackImage,
                    0,
                    0,
                    width,
                    height
                );


                gl.pixelStorei(
                    gl.UNPACK_FLIP_Y_WEBGL,
                    true
                );


                gl.bindTexture(
                    gl.TEXTURE_2D,
                    texture
                );


                gl.texImage2D(

                    gl.TEXTURE_2D,

                    0,

                    gl.RGBA,

                    gl.RGBA,

                    gl.UNSIGNED_BYTE,

                    textureCanvas

                );


                imageReady = true;


                canvas.classList.add(
                    "is-ready"
                );

            }


            if (
                fallbackImage.complete &&
                fallbackImage.naturalWidth > 0
            ) {

                uploadArtworkTexture();

            }

            else {

                fallbackImage.addEventListener(
                    "load",
                    uploadArtworkTexture,
                    {
                        once: true
                    }
                );

            }


            /* =================================
               POINTER STATE
            ================================= */


            let pointerX = 0.5;
            let pointerY = 0.5;


            let targetPointerX = 0.5;
            let targetPointerY = 0.5;


            let velocityX = 0;
            let velocityY = 0;


            let targetVelocityX = 0;
            let targetVelocityY = 0;


            let motion = 0;
            let targetMotion = 0;


            let draggingAmount = 0;
            let targetDraggingAmount = 0;


            /*
               Whirl energy remains briefly after
               releasing the drag.
            */


            let whirlEnergy = 0;
            let targetWhirlEnergy = 0;


            /* =================================
               DRIP STATE
            ================================= */


            let dripX = 0.5;
            let dripY = 0.5;


            let dripStarted =
                -10000;


            /* =================================
               POINTER TARGET
            ================================= */


            function updateShaderPointer(
                clientX,
                clientY
            ) {

                const rect =
                    container
                        .getBoundingClientRect();


                const nextX =
                    clamp(

                        (
                            clientX -
                            rect.left
                        )
                        /
                        rect.width,

                        0,
                        1

                    );


                const nextY =
                    clamp(

                        1 -
                        (
                            clientY -
                            rect.top
                        )
                        /
                        rect.height,

                        0,
                        1

                    );


                const deltaX =
                    nextX -
                    targetPointerX;


                const deltaY =
                    nextY -
                    targetPointerY;


                targetPointerX =
                    nextX;


                targetPointerY =
                    nextY;


                /*
                   Conservative velocity keeps
                   trackpads smooth.
                */


                targetVelocityX =
                    clamp(
                        deltaX * 1.35,
                        -0.035,
                        0.035
                    );


                targetVelocityY =
                    clamp(
                        deltaY * 1.35,
                        -0.035,
                        0.035
                    );


                targetMotion =
                    Math.min(
                        1,
                        Math.hypot(
                            deltaX,
                            deltaY
                        )
                        *
                        28
                    );


                if (
                    dragHasStarted
                ) {

                    targetWhirlEnergy =
                        Math.min(
                            1,
                            0.35 +
                            targetMotion *
                            0.65
                        );

                }

            }


            /* =================================
               CREATE DRIP
            ================================= */


            function createDrip(
                clientX,
                clientY
            ) {

                const rect =
                    container
                        .getBoundingClientRect();


                dripX =
                    clamp(

                        (
                            clientX -
                            rect.left
                        )
                        /
                        rect.width,

                        0,
                        1

                    );


                dripY =
                    clamp(

                        1 -
                        (
                            clientY -
                            rect.top
                        )
                        /
                        rect.height,

                        0,
                        1

                    );


                dripStarted =
                    performance.now();

            }


            /* =================================
               POINTER DOWN
            ================================= */


            container.addEventListener(
                "pointerdown",
                function (event) {

                    viewPointers.set(

                        event.pointerId,

                        {
                            x: event.clientX,
                            y: event.clientY,
                            type: event.pointerType
                        }

                    );


                    try {

                        container.setPointerCapture(
                            event.pointerId
                        );

                    }

                    catch (error) {
                    }


                    /*
                       One pointer begins with a drip.
                       Whirl waits until movement.
                    */


                    if (
                        viewPointers.size === 1 &&
                        viewScale === 1
                    ) {

                        dragPointerId =
                            event.pointerId;


                        dragOriginX =
                            event.clientX;


                        dragOriginY =
                            event.clientY;


                        dragHasStarted =
                            false;


                        targetDraggingAmount =
                            0;


                        updateShaderPointer(
                            event.clientX,
                            event.clientY
                        );


                        createDrip(
                            event.clientX,
                            event.clientY
                        );

                    }


                    /* =================================
                       PINCH
                    ================================= */


                    if (
                        viewPointers.size === 2
                    ) {

                        dragPointerId = null;

                        dragHasStarted = false;

                        targetDraggingAmount = 0;

                        targetWhirlEnergy = 0;


                        pinchStartDistance =
                            viewPointerDistance();


                        pinchStartScale =
                            viewScale;


                        const midpoint =
                            viewPointerMidpoint();


                        pinchStartX =
                            midpoint.x;


                        pinchStartY =
                            midpoint.y;


                        pinchStartViewX =
                            viewX;


                        pinchStartViewY =
                            viewY;


                        panning =
                            false;

                    }


                    else if (
                        viewScale > 1
                    ) {

                        targetDraggingAmount = 0;

                        panning = true;


                        panStartX =
                            event.clientX;


                        panStartY =
                            event.clientY;


                        panOriginalX =
                            viewX;


                        panOriginalY =
                            viewY;

                    }

                }
            );


            /* =================================
               POINTER MOVE
            ================================= */


            container.addEventListener(
                "pointermove",
                function (event) {

                    if (
                        viewPointers.has(
                            event.pointerId
                        )
                    ) {

                        viewPointers.set(

                            event.pointerId,

                            {
                                x: event.clientX,
                                y: event.clientY,
                                type: event.pointerType
                            }

                        );

                    }


                    /* =================================
                       PINCH
                    ================================= */


                    if (
                        viewPointers.size === 2
                    ) {

                        targetDraggingAmount = 0;


                        const distance =
                            viewPointerDistance();


                        const midpoint =
                            viewPointerMidpoint();


                        viewScale =
                            clamp(

                                pinchStartScale *
                                (
                                    distance /
                                    pinchStartDistance
                                ),

                                1,
                                3.5

                            );


                        viewX =
                            pinchStartViewX +
                            (
                                midpoint.x -
                                pinchStartX
                            );


                        viewY =
                            pinchStartViewY +
                            (
                                midpoint.y -
                                pinchStartY
                            );


                        updateViewTransform();


                        return;

                    }


                    /* =================================
                       PAN WHILE ZOOMED
                    ================================= */


                    if (
                        panning &&
                        viewScale > 1
                    ) {

                        targetDraggingAmount = 0;


                        viewX =
                            panOriginalX +
                            (
                                event.clientX -
                                panStartX
                            );


                        viewY =
                            panOriginalY +
                            (
                                event.clientY -
                                panStartY
                            );


                        updateViewTransform();


                        return;

                    }


                    if (
                        viewScale !== 1
                    ) {

                        return;

                    }


                    /* =================================
                       NORMAL MOUSE MOVEMENT
                    ================================= */


                    if (
                        event.pointerType === "mouse" &&
                        !viewPointers.has(
                            event.pointerId
                        )
                    ) {

                        targetDraggingAmount =
                            0;


                        updateShaderPointer(
                            event.clientX,
                            event.clientY
                        );


                        return;

                    }


                    /* =================================
                       HELD DRAG = WHIRL
                    ================================= */


                    if (
                        viewPointers.has(
                            event.pointerId
                        )
                    ) {

                        if (
                            event.pointerId ===
                            dragPointerId
                        ) {

                            const distanceFromStart =
                                Math.hypot(

                                    event.clientX -
                                    dragOriginX,

                                    event.clientY -
                                    dragOriginY

                                );


                            if (
                                !dragHasStarted &&
                                distanceFromStart >
                                dragThreshold
                            ) {

                                dragHasStarted =
                                    true;

                            }


                            if (
                                dragHasStarted
                            ) {

                                targetDraggingAmount =
                                    1;

                            }

                        }


                        updateShaderPointer(
                            event.clientX,
                            event.clientY
                        );

                    }

                }
            );


            /* =================================
               RELEASE
            ================================= */


            function releasePointer(
                event
            ) {

                viewPointers.delete(
                    event.pointerId
                );


                if (
                    event.pointerId ===
                    dragPointerId
                ) {

                    dragPointerId = null;

                    dragHasStarted = false;

                    targetDraggingAmount = 0;


                    /*
                       Keep some residual swirl.
                    */


                    targetWhirlEnergy =
                        Math.max(
                            whirlEnergy,
                            0.32
                        );

                }


                if (
                    viewPointers.size < 2
                ) {

                    pinchStartDistance = 0;

                }


                if (
                    viewPointers.size === 0
                ) {

                    panning = false;

                    targetDraggingAmount = 0;

                }

            }


            container.addEventListener(
                "pointerup",
                releasePointer
            );


            container.addEventListener(
                "pointercancel",
                releasePointer
            );


            /* =================================
               CANVAS SIZE
            ================================= */


            function resizeCanvas() {

                const ratio =
                    Math.min(
                        window.devicePixelRatio || 1,
                        2
                    );


                const width =
                    Math.floor(
                        container.clientWidth *
                        ratio
                    );


                const height =
                    Math.floor(
                        container.clientHeight *
                        ratio
                    );


                if (
                    canvas.width !== width ||
                    canvas.height !== height
                ) {

                    canvas.width =
                        width;


                    canvas.height =
                        height;


                    gl.viewport(
                        0,
                        0,
                        width,
                        height
                    );

                }

            }


            /* =================================
               RENDER
            ================================= */


            const start =
                performance.now();


            function render() {

                resizeCanvas();


                /* =================================
                   POINTER SMOOTHING
                ================================= */


                pointerX +=
                    (
                        targetPointerX -
                        pointerX
                    )
                    *
                    0.14;


                pointerY +=
                    (
                        targetPointerY -
                        pointerY
                    )
                    *
                    0.14;


                velocityX +=
                    (
                        targetVelocityX -
                        velocityX
                    )
                    *
                    0.10;


                velocityY +=
                    (
                        targetVelocityY -
                        velocityY
                    )
                    *
                    0.10;


                motion +=
                    (
                        targetMotion -
                        motion
                    )
                    *
                    0.09;


                draggingAmount +=
                    (
                        targetDraggingAmount -
                        draggingAmount
                    )
                    *
                    0.075;


                whirlEnergy +=
                    (
                        targetWhirlEnergy -
                        whirlEnergy
                    )
                    *
                    0.055;


                /*
                   Natural decay.
                */


                targetVelocityX *=
                    0.82;


                targetVelocityY *=
                    0.82;


                targetMotion *=
                    0.88;


                /*
                   If not actively dragging,
                   whirl slowly dissolves.
                */


                if (
                    targetDraggingAmount === 0
                ) {

                    targetWhirlEnergy *=
                        0.965;

                }


                const now =
                    performance.now();


                const time =
                    (
                        now -
                        start
                    )
                    /
                    1000;


                const dripAge =
                    (
                        now -
                        dripStarted
                    )
                    /
                    1000;


                if (
                    imageReady
                ) {

                    gl.uniform2f(
                        pointerUniform,
                        pointerX,
                        pointerY
                    );


                    gl.uniform2f(
                        velocityUniform,
                        velocityX,
                        velocityY
                    );


                    gl.uniform2f(
                        dripCenterUniform,
                        dripX,
                        dripY
                    );


                    gl.uniform1f(
                        timeUniform,
                        time
                    );


                    gl.uniform1f(
                        motionUniform,
                        motion
                    );


                    gl.uniform1f(
                        dripAgeUniform,
                        dripAge
                    );


                    gl.uniform1f(
                        draggingUniform,
                        draggingAmount
                    );


                    gl.uniform1f(
                        whirlEnergyUniform,
                        whirlEnergy
                    );


                    gl.drawArrays(
                        gl.TRIANGLES,
                        0,
                        6
                    );

                }


                requestAnimationFrame(
                    render
                );

            }


            render();

        }

    }

}