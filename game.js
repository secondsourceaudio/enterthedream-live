const player =
    document.getElementById("player");

const gameArea =
    document.getElementById("game-area");

const food =
    document.getElementById("food");

const scoreDisplay =
    document.getElementById("score");

const gameTitle =
    document.getElementById("game-title");

const gameOverMenu =
    document.getElementById("game-over-menu");

const finalScoreDisplay =
    document.getElementById("final-score");

const retryButton =
    document.getElementById("retry-button");


// -------------------------
// GAME SETTINGS
// -------------------------

const spriteSize = 44;

const stepSize = 18;


// Work out how many positions
// fit inside the game area

const columns =
    Math.floor(
        (gameArea.clientWidth - spriteSize)
        / stepSize
    );

const rows =
    Math.floor(
        (gameArea.clientHeight - spriteSize)
        / stepSize
    );


// -------------------------
// SCORE AND GAME STATE
// -------------------------

let score = 0;

let gameOver = false;


// -------------------------
// DOG POSITIONS
// -------------------------

let dog = [

    { x: 6, y: 6 },

    { x: 5, y: 6 },

    { x: 4, y: 6 }

];


// Start moving right

let directionX = 1;

let directionY = 0;


// Stores body elements

let bodyElements = [];


// -------------------------
// FOOD POSITION
// -------------------------

let foodX = 0;

let foodY = 0;


// -------------------------
// KEYBOARD CONTROLS
// -------------------------

document.addEventListener(
    "keydown",

    function(event) {


        // -------------------------
        // SPACEBAR RESTART
        // -------------------------

        if (
            gameOver &&
            event.code === "Space"
        ) {

            event.preventDefault();

            restartGame();

            return;
        }


        // Ignore movement keys
        // after game over

        if (gameOver) {

            return;
        }


        // -------------------------
        // UP
        // -------------------------

        if (
            event.key === "ArrowUp" &&
            directionY !== 1
        ) {

            directionX = 0;

            directionY = -1;
        }


        // -------------------------
        // DOWN
        // -------------------------

        if (
            event.key === "ArrowDown" &&
            directionY !== -1
        ) {

            directionX = 0;

            directionY = 1;
        }


        // -------------------------
        // LEFT
        // -------------------------

        if (
            event.key === "ArrowLeft" &&
            directionX !== 1
        ) {

            directionX = -1;

            directionY = 0;
        }


        // -------------------------
        // RIGHT
        // -------------------------

        if (
            event.key === "ArrowRight" &&
            directionX !== -1
        ) {

            directionX = 1;

            directionY = 0;
        }


        event.preventDefault();
    }
);


// -------------------------
// RETRY BUTTON
// -------------------------

retryButton.addEventListener(
    "click",

    function() {

        restartGame();
    }
);


// -------------------------
// RESTART GAME
// -------------------------

function restartGame() {

    window.location.reload();
}


// -------------------------
// MOVE DOG
// -------------------------

function moveDog() {

    const head =
        dog[0];


    const newHead = {

        x:
            head.x +
            directionX,

        y:
            head.y +
            directionY
    };


    // -------------------------
    // BORDER COLLISION
    // -------------------------

    if (
        newHead.x < 0 ||

        newHead.x > columns ||

        newHead.y < 0 ||

        newHead.y > rows
    ) {

        endGame();

        return;
    }


    // Check whether food
    // will be eaten

    const willEat =

        newHead.x === foodX &&

        newHead.y === foodY;


    // -------------------------
    // SELF COLLISION
    // -------------------------

    /*
    If the dog is not eating,
    the final tail position will
    move away during this step.

    Therefore we don't check the
    final tail position unless
    food is being eaten.
    */

    const bodyLengthToCheck =

        willEat
            ? dog.length
            : dog.length - 1;


    for (
        let i = 0;

        i < bodyLengthToCheck;

        i++
    ) {

        if (
            newHead.x === dog[i].x &&

            newHead.y === dog[i].y
        ) {

            endGame();

            return;
        }
    }


    // -------------------------
    // ADD NEW HEAD
    // -------------------------

    dog.unshift(
        newHead
    );


    // -------------------------
    // EAT SAUSAGE
    // -------------------------

    if (willEat) {

        score =
            score + 1;


        scoreDisplay.textContent =
            score;


        // Keep the tail in place.
        // This makes the dog grow.

        moveFood();

    } else {

        // Normal movement:
        // remove final position.

        dog.pop();
    }


    drawDog();
}


// -------------------------
// DRAW DOG
// -------------------------

function drawDog() {


    // -------------------------
    // HEAD
    // -------------------------

    player.style.left =

        dog[0].x *
        stepSize +
        "px";


    player.style.top =

        dog[0].y *
        stepSize +
        "px";


    rotateHead();


    // -------------------------
    // CREATE BODY ELEMENTS
    // WHEN DOG GROWS
    // -------------------------

    while (
        bodyElements.length <
        dog.length - 1
    ) {

        const newElement =

            document.createElement(
                "div"
            );


        const rear =

            dog[
                dog.length - 1
            ];


        newElement.style.left =

            rear.x *
            stepSize +
            "px";


        newElement.style.top =

            rear.y *
            stepSize +
            "px";


        gameArea.appendChild(
            newElement
        );


        bodyElements.push(
            newElement
        );
    }


    // -------------------------
    // POSITION BODY + REAR
    // -------------------------

    for (
        let i = 1;

        i < dog.length;

        i++
    ) {

        const element =

            bodyElements[
                i - 1
            ];


        const isRear =

            i ===
            dog.length - 1;


        if (isRear) {

            element.className =

                "rear-segment";


            rotateRear(
                element,
                i
            );

        } else {

            element.className =

                "middle-segment";


            rotateMiddle(
                element,
                i
            );
        }


        element.style.left =

            dog[i].x *
            stepSize +
            "px";


        element.style.top =

            dog[i].y *
            stepSize +
            "px";
    }


    // -------------------------
    // SAUSAGE
    // -------------------------

    food.style.left =

        foodX *
        stepSize +
        "px";


    food.style.top =

        foodY *
        stepSize +
        "px";
}


// -------------------------
// ROTATE HEAD
// -------------------------

function rotateHead() {


    if (
        directionX === 1
    ) {

        player.style.transform =

            "rotate(0deg)";
    }


    else if (
        directionX === -1
    ) {

        player.style.transform =

            "rotate(180deg)";
    }


    else if (
        directionY === 1
    ) {

        player.style.transform =

            "rotate(90deg)";
    }


    else if (
        directionY === -1
    ) {

        player.style.transform =

            "rotate(-90deg)";
    }
}


// -------------------------
// ROTATE MIDDLE BODY
// -------------------------

function rotateMiddle(
    element,
    index
) {

    const previous =

        dog[index - 1];


    const current =

        dog[index];


    const next =

        dog[index + 1];


    if (!next) {

        return;
    }


    // -------------------------
    // STRAIGHT HORIZONTAL
    // -------------------------

    if (
        previous.y ===
        current.y &&

        current.y ===
        next.y
    ) {

        element.style.transform =

            "rotate(0deg)";


        return;
    }


    // -------------------------
    // STRAIGHT VERTICAL
    // -------------------------

    if (
        previous.x ===
        current.x &&

        current.x ===
        next.x
    ) {

        element.style.transform =

            "rotate(90deg)";


        return;
    }


    // -------------------------
    // CORNER
    // -------------------------

    if (
        next.x >
        current.x
    ) {

        element.style.transform =

            "rotate(0deg)";
    }


    else if (
        next.x <
        current.x
    ) {

        element.style.transform =

            "rotate(180deg)";
    }


    else if (
        next.y >
        current.y
    ) {

        element.style.transform =

            "rotate(90deg)";
    }


    else if (
        next.y <
        current.y
    ) {

        element.style.transform =

            "rotate(-90deg)";
    }
}


// -------------------------
// ROTATE REAR / TAIL
// -------------------------

function rotateRear(
    element,
    index
) {

    const rear =

        dog[index];


    const previous =

        dog[index - 1];


    if (
        rear.x <
        previous.x
    ) {

        element.style.transform =

            "rotate(0deg)";
    }


    else if (
        rear.x >
        previous.x
    ) {

        element.style.transform =

            "rotate(180deg)";
    }


    else if (
        rear.y <
        previous.y
    ) {

        element.style.transform =

            "rotate(90deg)";
    }


    else if (
        rear.y >
        previous.y
    ) {

        element.style.transform =

            "rotate(-90deg)";
    }
}


// -------------------------
// MOVE SAUSAGE
// -------------------------

function moveFood() {

    let validPosition =
        false;


    while (!validPosition) {


        foodX =

            Math.floor(

                Math.random() *

                (columns + 1)

            );


        foodY =

            Math.floor(

                Math.random() *

                (rows + 1)

            );


        validPosition =
            true;


        // Do not put sausage
        // on top of dog

        for (
            let i = 0;

            i < dog.length;

            i++
        ) {

            if (
                dog[i].x ===
                foodX &&

                dog[i].y ===
                foodY
            ) {

                validPosition =
                    false;


                break;
            }
        }
    }
}


// -------------------------
// GAME OVER
// -------------------------

function endGame() {

    gameOver =
        true;


    clearInterval(
        gameLoop
    );


    gameTitle.textContent =

        "GAME OVER.";


    gameTitle.classList.add(

        "game-over"

    );


    // Show final score

    finalScoreDisplay.textContent =

        score;


    // Show popup menu

    gameOverMenu.classList.remove(

        "hidden"

    );
}


// -------------------------
// START GAME
// -------------------------

moveFood();

drawDog();


const gameLoop =

    setInterval(

        moveDog,

        180

    );