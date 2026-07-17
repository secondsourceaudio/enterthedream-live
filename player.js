const audio =
    document.getElementById("audio-element");

const audioPlayer =
    document.getElementById("audio-player");

const playerToggleButton =
    document.getElementById("player-toggle-button");

const playButton =
    document.getElementById("play-button");

const previousButton =
    document.getElementById("previous-button");

const nextButton =
    document.getElementById("next-button");

const trackNumber =
    document.getElementById("track-number");

const trackArtist =
    document.getElementById("track-artist");

const trackTitle =
    document.getElementById("track-title");

const currentTimeDisplay =
    document.getElementById("current-time");

const durationDisplay =
    document.getElementById("duration");

const progressContainer =
    document.getElementById("progress-container");

const progressBar =
    document.getElementById("progress-bar");


const playSymbol =
    "\u25B6\uFE0E";

const pauseSymbol =
    "II";


/* -------------------------
   TRACK LIST
------------------------- */

const tracks = [

    {
        file: "./audio/3. Sage Counsel (24B_48KHz_MST)_timeitemstudio DIGI.wav",
        artist: "Martin Solli",
        title: "Sage Counsel"
    },

    {
        file: "./audio/4. I'm Busy (24B_48KHz_MST)_timeitemstudio DIGI.wav",
        artist: "Martin Solli",
        title: "I'm Busy"
    },

    {
        file: "./audio/10. Dream Scenario (24B_48KHz_MST)_timeitemstudio DIGI.wav",
        artist: "Martin Solli",
        title: "Dream Scenario"
    }

];


let currentTrackIndex = 0;


/* -------------------------
   MINIMIZE / EXPAND PLAYER
------------------------- */

function setPlayerCollapsed(collapsed) {

    audioPlayer.classList.toggle(
        "is-collapsed",
        collapsed
    );

    if (collapsed) {

        playerToggleButton.textContent =
            "+";

        playerToggleButton.setAttribute(
            "aria-label",
            "Expand audio player"
        );

        playerToggleButton.setAttribute(
            "aria-expanded",
            "false"
        );

    } else {

        playerToggleButton.textContent =
            "−";

        playerToggleButton.setAttribute(
            "aria-label",
            "Minimize audio player"
        );

        playerToggleButton.setAttribute(
            "aria-expanded",
            "true"
        );

    }

}


playerToggleButton.addEventListener(
    "click",
    function () {

        const isCollapsed =
            audioPlayer.classList.contains(
                "is-collapsed"
            );

        setPlayerCollapsed(
            !isCollapsed
        );

    }
);


/* -------------------------
   UPDATE PLAY BUTTON
------------------------- */

function updatePlayButton(isPlaying) {

    if (isPlaying) {

        playButton.textContent =
            pauseSymbol;

        playButton.setAttribute(
            "aria-label",
            "Pause"
        );

    } else {

        playButton.textContent =
            playSymbol;

        playButton.setAttribute(
            "aria-label",
            "Play"
        );

    }

}


/* -------------------------
   LOAD TRACK
------------------------- */

function loadTrack(index) {

    const track =
        tracks[index];

    audio.src =
        track.file;

    trackNumber.textContent =
        String(index + 1).padStart(
            2,
            "0"
        );

    trackArtist.textContent =
        track.artist;

    trackTitle.textContent =
        track.title;

    progressBar.style.width =
        "0%";

    currentTimeDisplay.textContent =
        "00:00";

    durationDisplay.textContent =
        "00:00";

    updatePlayButton(false);

}


/* -------------------------
   PLAY / PAUSE
------------------------- */

function togglePlay() {

    if (audio.paused) {

        audio.play()
            .then(function () {

                updatePlayButton(true);

            })
            .catch(function (error) {

                console.log(
                    "Audio could not play:",
                    error
                );

                updatePlayButton(false);

            });

    } else {

        audio.pause();

        updatePlayButton(false);

    }

}


/* -------------------------
   PLAY CURRENT TRACK
------------------------- */

function playCurrentTrack() {

    audio.play()
        .then(function () {

            updatePlayButton(true);

        })
        .catch(function (error) {

            console.log(
                "Audio could not play:",
                error
            );

            updatePlayButton(false);

        });

}


/* -------------------------
   NEXT TRACK
------------------------- */

function nextTrack() {

    currentTrackIndex++;

    if (
        currentTrackIndex >= tracks.length
    ) {

        currentTrackIndex = 0;

    }

    loadTrack(currentTrackIndex);

    playCurrentTrack();

}


/* -------------------------
   PREVIOUS TRACK
------------------------- */

function previousTrack() {

    currentTrackIndex--;

    if (
        currentTrackIndex < 0
    ) {

        currentTrackIndex =
            tracks.length - 1;

    }

    loadTrack(currentTrackIndex);

    playCurrentTrack();

}


/* -------------------------
   FORMAT TIME
------------------------- */

function formatTime(seconds) {

    if (
        !Number.isFinite(seconds)
    ) {

        return "00:00";

    }

    const minutes =
        Math.floor(seconds / 60);

    const remainingSeconds =
        Math.floor(seconds % 60);

    return (
        String(minutes).padStart(2, "0")
        +
        ":"
        +
        String(remainingSeconds).padStart(2, "0")
    );

}


/* -------------------------
   UPDATE PROGRESS
------------------------- */

audio.addEventListener(
    "timeupdate",
    function () {

        if (
            !Number.isFinite(audio.duration)
        ) {

            return;

        }

        const progress =
            (
                audio.currentTime
                /
                audio.duration
            )
            *
            100;

        progressBar.style.width =
            progress + "%";

        currentTimeDisplay.textContent =
            formatTime(audio.currentTime);

    }
);


/* -------------------------
   TRACK DURATION
------------------------- */

audio.addEventListener(
    "loadedmetadata",
    function () {

        durationDisplay.textContent =
            formatTime(audio.duration);

    }
);


/* -------------------------
   KEEP BUTTON IN SYNC
------------------------- */

audio.addEventListener(
    "play",
    function () {

        updatePlayButton(true);

    }
);


audio.addEventListener(
    "pause",
    function () {

        updatePlayButton(false);

    }
);


/* -------------------------
   CLICK PROGRESS BAR
------------------------- */

progressContainer.addEventListener(
    "click",
    function (event) {

        if (
            !Number.isFinite(audio.duration)
        ) {

            return;

        }

        const box =
            progressContainer.getBoundingClientRect();

        const clickPosition =
            event.clientX - box.left;

        const percentage =
            clickPosition / box.width;

        audio.currentTime =
            percentage * audio.duration;

    }
);


/* -------------------------
   BUTTONS
------------------------- */

playButton.addEventListener(
    "click",
    togglePlay
);

nextButton.addEventListener(
    "click",
    nextTrack
);

previousButton.addEventListener(
    "click",
    previousTrack
);


/* -------------------------
   AUTOMATIC NEXT TRACK
------------------------- */

audio.addEventListener(
    "ended",
    nextTrack
);


/* -------------------------
   INITIAL STATE
------------------------- */

loadTrack(currentTrackIndex);

/* Always begin minimized on desktop */

setPlayerCollapsed(true);