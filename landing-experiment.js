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
   WEBGL PROGRAM
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

        uniform float u_time;

        uniform float u_motion;

        uniform float u_dragging;

        uniform float u_whirlEnergy;

        uniform float u_whirlSpin;


        /*
           Eight independent click/tap drops.
        */

        uniform vec2 u_dripCenters[8];

        uniform float u_dripAges[8];


        mat2 rotate2D(
            float angle
        ) {

            float s =
                sin(angle);

            float c =
                cos(angle);


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
               1. CONSTANT CENTER BUBBLING
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
               2. DREAMY WAVING
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
                    0.46,
                    0.0,
                    pointerDistance
                );


            vec2 pointerDirection =
                normalize(
                    pointerDelta +
                    vec2(0.0001)
                );


            /*
               Tangent around the cursor.

               This is what gives the movement
               a true circular flow around the
               point being dragged.
            */


            vec2 tangent =
                vec2(
                    -pointerDirection.y,
                    pointerDirection.x
                );


            /* =================================
               4. CURSOR-CENTERED WHIRL
            ================================= */


            float whirlFalloff =
                exp(
                    -pointerDistance *
                    4.0
                );


            float speed =
                clamp(
                    length(
                        u_velocity
                    )
                    *
                    22.0,
                    0.0,
                    1.0
                );


            float totalWhirl =
                clamp(

                    u_dragging * 0.72 +
                    u_whirlEnergy * 0.48,

                    0.0,
                    1.25

                );


            /*
               Rotate texture coordinates around
               the exact cursor location.
            */


            float rotationAngle =
                u_whirlSpin *
                totalWhirl *
                whirlFalloff *
                (
                    0.12 +
                    speed * 0.55 +
                    u_motion * 0.30
                );


            vec2 rotatedDelta =
                rotate2D(
                    rotationAngle
                )
                *
                pointerDelta;


            uv +=
                (
                    rotatedDelta -
                    pointerDelta
                )
                *
                pointerInfluence *
                0.55;


            /*
               Tangential flow strengthens the
               impression of water circulating
               around the cursor.
            */


            uv +=
                tangent *
                u_whirlSpin *
                totalWhirl *
                whirlFalloff *
                (
                    0.006 +
                    speed * 0.013
                );


            /* =================================
               5. SPIRAL DETAIL
            ================================= */


            float pointerAngle =
                atan(
                    pointerDelta.y,
                    pointerDelta.x
                );


            float spiral =
                sin(
                    pointerDistance *
                    38.0 -
                    u_time *
                    2.2 +
                    pointerAngle *
                    3.0
                );


            uv +=
                pointerDirection *
                spiral *
                totalWhirl *
                pointerInfluence *
                0.0028;


            /* =================================
               6. POINTER WATER
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
               7. VISCOUS MOVEMENT
            ================================= */


            uv -=
                u_velocity *
                pointerInfluence *
                (
                    0.045 +
                    u_motion * 0.10
                );


            /* =================================
               8. MULTIPLE DRIPS

               A new click does NOT reset the
               previous click.

               Every active drop continues
               expanding independently.
            ================================= */


            for (
                int i = 0;
                i < 8;
                i++
            ) {

                float dripAge =
                    u_dripAges[i];


                /*
                   Negative age means the slot
                   has never been used.
                */


                if (
                    dripAge >= 0.0
                    &&
                    dripAge < 4.0
                ) {

                    vec2 dripDelta =
                        baseUV -
                        u_dripCenters[i];


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
                        dripAge *
                        0.28;


                    /*
                       Longer fade than before so
                       older ripples remain visible
                       while new ones are added.
                    */


                    float dripLife =
                        clamp(
                            1.0 -
                            dripAge /
                            3.8,
                            0.0,
                            1.0
                        );


                    /*
                       Main ring.
                    */


                    float ringOne =
                        exp(
                            -abs(
                                dripDistance -
                                dripRadius
                            )
                            *
                            55.0
                        )
                        *
                        dripLife;


                    /*
                       First trailing ring.
                    */


                    float radiusTwo =
                        max(
                            0.0,
                            dripRadius -
                            0.050
                        );


                    float ringTwo =
                        exp(
                            -abs(
                                dripDistance -
                                radiusTwo
                            )
                            *
                            70.0
                        )
                        *
                        dripLife *
                        0.46;


                    /*
                       Second softer trailing ring.
                    */


                    float radiusThree =
                        max(
                            0.0,
                            dripRadius -
                            0.095
                        );


                    float ringThree =
                        exp(
                            -abs(
                                dripDistance -
                                radiusThree
                            )
                            *
                            62.0
                        )
                        *
                        dripLife *
                        0.20;


                    /*
                       Initial depression where
                       the finger/cursor touched.
                    */


                    float impact =
                        exp(
                            -dripDistance *
                            25.0
                        )
                        *
                        exp(
                            -dripAge *
                            4.5
                        );


                    uv +=
                        dripDirection *
                        ringOne *
                        0.044;


                    uv +=
                        dripDirection *
                        ringTwo *
                        0.019;


                    uv +=
                        dripDirection *
                        ringThree *
                        0.009;


                    uv -=
                        dripDelta *
                        impact *
                        0.090;

                }

            }


            /* =================================
               9. SAFE TEXTURE AREA
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


            vec4 softTrail =
                texture2D(

                    u_texture,

                    clamp(

                        uv -
                        u_velocity *
                        pointerInfluence *
                        0.18,

                        vec2(0.002),

                        vec2(0.998)

                    )

                );


            float trailBlend =
                clamp(
                    u_motion *
                    pointerInfluence *
                    0.065,
                    0.0,
                    0.065
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


            const whirlSpinUniform =
                gl.getUniformLocation(
                    program,
                    "u_whirlSpin"
                );


            const dripCentersUniform =
                gl.getUniformLocation(
                    program,
                    "u_dripCenters[0]"
                );


            const dripAgesUniform =
                gl.getUniformLocation(
                    program,
                    "u_dripAges[0]"
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


            let whirlEnergy = 0;
            let targetWhirlEnergy = 0;


            /*
               Current rotational direction.

               +1 = clockwise
               -1 = counter-clockwise
            */


            let whirlSpin = 1;


            let targetWhirlSpin = 1;


            /*
               Previous position is used to infer
               a stable drag direction.
            */


            let previousDragX = 0.5;
            let previousDragY = 0.5;


            /* =================================
               MULTIPLE DRIPS
            ================================= */


            const maximumDrips = 8;


            const drips =
                [];


            for (
                let index = 0;
                index < maximumDrips;
                index++
            ) {

                drips.push(
                    {
                        x: 0.5,
                        y: 0.5,
                        started: -100000
                    }
                );

            }


            let nextDripSlot = 0;


            /* =================================
               UPDATE POINTER
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


                targetVelocityX =
                    clamp(
                        deltaX * 1.30,
                        -0.033,
                        0.033
                    );


                targetVelocityY =
                    clamp(
                        deltaY * 1.30,
                        -0.033,
                        0.033
                    );


                targetMotion =
                    Math.min(
                        1,
                        Math.hypot(
                            deltaX,
                            deltaY
                        )
                        *
                        27
                    );


                /* =================================
                   WHIRL DIRECTION
                ================================= */


                if (
                    dragHasStarted
                ) {

                    const dragX =
                        nextX -
                        previousDragX;


                    const dragY =
                        nextY -
                        previousDragY;


                    /*
                       Use the cursor's movement
                       relative to the centre of
                       the local vortex to infer
                       a smooth rotational direction.
                    */


                    const localX =
                        nextX - 0.5;


                    const localY =
                        nextY - 0.5;


                    const cross =
                        localX * dragY -
                        localY * dragX;


                    if (
                        Math.abs(cross) >
                        0.00002
                    ) {

                        targetWhirlSpin =
                            cross > 0
                                ? 1
                                : -1;

                    }


                    targetWhirlEnergy =
                        Math.min(
                            1,
                            0.30 +
                            targetMotion *
                            0.70
                        );

                }


                previousDragX =
                    nextX;


                previousDragY =
                    nextY;

            }


            /* =================================
               CREATE NEW DROP

               Does not delete any other active
               drop. It simply uses the next slot.
            ================================= */


            function createDrip(
                clientX,
                clientY
            ) {

                const rect =
                    container
                        .getBoundingClientRect();


                const x =
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


                const y =
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


                drips[
                    nextDripSlot
                ] =
                    {
                        x: x,
                        y: y,
                        started:
                            performance.now()
                    };


                nextDripSlot =
                    (
                        nextDripSlot + 1
                    )
                    %
                    maximumDrips;

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


                        previousDragX =
                            targetPointerX;


                        previousDragY =
                            targetPointerY;


                        /*
                           Every click/tap adds
                           another independent drop.
                        */


                        createDrip(
                            event.clientX,
                            event.clientY
                        );

                    }


                    /* =================================
                       SECOND FINGER = PINCH
                    ================================= */


                    if (
                        viewPointers.size === 2
                    ) {

                        dragPointerId = null;

                        dragHasStarted = false;

                        targetDraggingAmount = 0;


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

                        targetDraggingAmount =
                            0;


                        panning =
                            true;


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

                        targetDraggingAmount =
                            0;


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
                       PAN WHEN ZOOMED
                    ================================= */


                    if (
                        panning &&
                        viewScale > 1
                    ) {

                        targetDraggingAmount =
                            0;


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
                       NORMAL CURSOR MOVEMENT
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
                       HELD DRAG
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


                                previousDragX =
                                    targetPointerX;


                                previousDragY =
                                    targetPointerY;

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

                    dragPointerId =
                        null;


                    dragHasStarted =
                        false;


                    targetDraggingAmount =
                        0;


                    /*
                       Keep some of the whirl alive
                       after release.
                    */


                    targetWhirlEnergy =
                        Math.max(
                            whirlEnergy,
                            0.30
                        );

                }


                if (
                    viewPointers.size < 2
                ) {

                    pinchStartDistance =
                        0;

                }


                if (
                    viewPointers.size === 0
                ) {

                    panning =
                        false;


                    targetDraggingAmount =
                        0;

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
                   SMOOTH POINTER
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


                whirlSpin +=
                    (
                        targetWhirlSpin -
                        whirlSpin
                    )
                    *
                    0.08;


                /* =================================
                   NATURAL DECAY
                ================================= */


                targetVelocityX *=
                    0.82;


                targetVelocityY *=
                    0.82;


                targetMotion *=
                    0.88;


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


                /* =================================
                   MULTIPLE DROP UNIFORMS
                ================================= */


                const dripCenters =
                    new Float32Array(
                        maximumDrips * 2
                    );


                const dripAges =
                    new Float32Array(
                        maximumDrips
                    );


                for (
                    let index = 0;
                    index < maximumDrips;
                    index++
                ) {

                    const drip =
                        drips[index];


                    dripCenters[
                        index * 2
                    ] =
                        drip.x;


                    dripCenters[
                        index * 2 + 1
                    ] =
                        drip.y;


                    if (
                        drip.started < 0
                    ) {

                        dripAges[index] =
                            -1;

                    }

                    else {

                        dripAges[index] =
                            (
                                now -
                                drip.started
                            )
                            /
                            1000;

                    }

                }


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


                    gl.uniform1f(
                        timeUniform,
                        time
                    );


                    gl.uniform1f(
                        motionUniform,
                        motion
                    );


                    gl.uniform1f(
                        draggingUniform,
                        draggingAmount
                    );


                    gl.uniform1f(
                        whirlEnergyUniform,
                        whirlEnergy
                    );


                    gl.uniform1f(
                        whirlSpinUniform,
                        whirlSpin
                    );


                    gl.uniform2fv(
                        dripCentersUniform,
                        dripCenters
                    );


                    gl.uniform1fv(
                        dripAgesUniform,
                        dripAges
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