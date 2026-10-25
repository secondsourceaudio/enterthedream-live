/* A small playlist with independent scene choices. Playback always starts with a visitor action. */
(() => {
    'use strict';
    const room=document.querySelector('[data-room]');
    if (!room) return;
    const frame=room.querySelector('.room-frame');
    const canvas=room.querySelector('canvas');
    const dock=room.querySelector('.room-dock');
    const audio=room.querySelector('audio');
    const play=room.querySelector('[data-room-play]');
    const motion=room.querySelector('[data-room-motion]');
    const fullscreen=room.querySelector('[data-room-fullscreen]');
    const seek=room.querySelector('[data-room-seek]');
    const status=document.querySelector('[data-room-status]');
    const tracks=[...room.querySelectorAll('[data-room-song]')];
    const scenes=[...room.querySelectorAll('[data-room-scene]')];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const hover=matchMedia('(hover: hover) and (pointer: fine)');
    const inertElements=new Map(), worlds=new Map(), sceneTimes=new Map();
    let moving=!reduced.matches, visible=true, elapsed=0, last=null, animation=0;
    let world=null, scene='shore', selected=null, playRequest=0;
    let immersive=false, controlsTimer=0, returnFocus=null;

    function isRunning() { return moving && !audio.paused && !audio.ended; }
    function updateControls() {
        const playing=!audio.paused && !audio.ended;
        play.setAttribute('aria-pressed',String(playing));
        play.setAttribute('aria-label',playing ? 'Pause music' : 'Play music');
        play.querySelector('[data-room-play-label]').textContent=playing ? 'PAUSE' : 'PLAY';
        play.querySelector('[data-room-pause]').hidden=!playing;
        play.querySelector('[data-room-start]').hidden=playing;
        motion.disabled=!world;
        motion.textContent=moving && world ? 'MOTION ON' : 'MOTION OFF';
        motion.setAttribute('aria-pressed',String(moving && !!world));
        reconcile();
    }
    function tick(now) {
        animation=0;
        if (!world || !visible || document.hidden || !isRunning()) { last=null; return; }
        if (last !== null && now-last < 1000/30) { animation=requestAnimationFrame(tick); return; }
        if (last !== null) elapsed+=Math.min((now-last)/1000,.1);
        last=now;
        drawStill();
        animation=requestAnimationFrame(tick);
    }
    function drawStill() {
        if (!world) return;
        world.draw(elapsed);
    }
    function reconcile() {
        if (!world || !visible || document.hidden || !isRunning()) {
            cancelAnimationFrame(animation); animation=0; last=null;
        } else if (!animation) { last=null; animation=requestAnimationFrame(tick); }
    }
    function selectScene(value) {
        if (!scenes.some(button=>button.dataset.roomScene === value)) return;
        sceneTimes.set(scene,elapsed);
        scene=value; elapsed=sceneTimes.get(scene) || 0; last=null;
        room.dataset.scene=scene;
        room.querySelector('.room-scene-label').textContent=scene === 'city' ? 'CITY / 02' : 'SHORE / 01';
        const description=scene === 'city' ? 'A quiet low-poly evening street with warm windows and reflections on wet asphalt.' : 'A misty low-poly shore with gentle waves, trees and a stone arch.';
        frame.setAttribute('aria-label',description+' Slowly looping scenery. Press Space to play or pause music, F for fullscreen.');
        for (const button of scenes) button.setAttribute('aria-pressed',String(button.dataset.roomScene === scene));
        try {
            if (!worlds.has(scene)) worlds.set(scene,window.SecondSourceRoomScenes.create(scene,canvas,frame));
            world=worlds.get(scene); drawStill();
            room.classList.add('has-scene'); canvas.dataset.renderState='ready';
        } catch {
            world=null; room.classList.remove('has-scene'); canvas.dataset.renderState='fallback';
            status.textContent='Your browser is showing a still scene. Music is still available.';
        }
        updateControls();
    }
    async function startPlayback() {
        const request=++playRequest;
        try {
            if (audio.getAttribute('src') !== selected.dataset.src || audio.error) {
                audio.src=selected.dataset.src;
                audio.load();
            }
            await audio.play();
            if (request === playRequest) status.textContent='';
        } catch (error) {
            if (request === playRequest && error.name !== 'AbortError') {
                status.textContent='The audio could not start. Select Play to try again.';
            }
        }
    }
    function selectTrack(button,autoplay=true) {
        if (button.disabled) return;
        if (button === selected) { if (autoplay && audio.paused) startPlayback(); return; }
        ++playRequest; audio.pause(); selected=button;
        // Assign the source only on Play: preload=none alone is merely a browser hint.
        audio.removeAttribute('src');
        audio.load();
        for (const track of tracks) track.setAttribute('aria-pressed',String(track === selected));
        room.querySelector('[data-room-track]').textContent=button.dataset.artist+' — '+button.dataset.title;
        status.textContent=''; timeline(); selectScene(button.dataset.scene);
        if (autoplay) startPlayback();
    }
    async function togglePlay() {
        if (!audio.paused) { ++playRequest; audio.pause(); return; }
        if (audio.ended) audio.currentTime=0;
        await startPlayback();
    }
    play.addEventListener('click',togglePlay);
    for (const track of tracks) track.addEventListener('click',()=>selectTrack(track));
    for (const button of scenes) button.addEventListener('click',()=>selectScene(button.dataset.roomScene));
    motion.addEventListener('click',()=>{ moving=!moving; updateControls(); });
    reduced.addEventListener('change',()=>{ moving=!reduced.matches; updateControls(); });
    const format=seconds=>{
        const value=Math.max(0,Math.floor(Number.isFinite(seconds) ? seconds : 0));
        return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
    };
    function timeline() {
        const ready=Number.isFinite(audio.duration) && audio.duration > 0;
        seek.disabled=!ready;
        seek.max=ready ? audio.duration : 1; seek.value=ready ? audio.currentTime : 0;
        seek.setAttribute('aria-valuetext',format(audio.currentTime)+(ready ? ' of '+format(audio.duration) : ''));
        room.querySelector('[data-room-time]').textContent=format(audio.currentTime)+(ready ? ' / '+format(audio.duration) : ' / —:—');
    }
    for (const event of ['play','pause','ended']) audio.addEventListener(event,updateControls);
    for (const event of ['loadedmetadata','durationchange','timeupdate','emptied']) audio.addEventListener(event,timeline);
    audio.addEventListener('ended',()=>{
        const available=tracks.filter(track=>!track.disabled);
        if (available.length < 2) return;
        selectTrack(available[(available.indexOf(selected)+1)%available.length]);
    });
    audio.addEventListener('error',()=>{ status.textContent='This track could not load. Select it again to retry.'; });
    seek.addEventListener('input',()=>{ if (!seek.disabled) audio.currentTime=Number(seek.value); });

    function revealControls() {
        clearTimeout(controlsTimer); room.classList.remove('controls-hidden');
        if (!immersive) return;
        controlsTimer=setTimeout(()=>{
            if ((hover.matches && dock.matches(':hover')) || (dock.contains(document.activeElement) && document.activeElement.matches(':focus-visible'))) {
                revealControls(); return;
            }
            room.classList.add('controls-hidden');
        },3000);
    }
    function setFullscreen(enabled) {
        if (enabled === immersive) return;
        immersive=enabled; room.classList.toggle('is-fullscreen',enabled);
        document.body.classList.toggle('room-fullscreen',enabled);
        fullscreen.setAttribute('aria-pressed',String(enabled));
        fullscreen.setAttribute('aria-label',enabled ? 'Exit fullscreen' : 'Enter fullscreen');
        fullscreen.textContent=enabled ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
        if (enabled) {
            for (const element of document.body.children) {
                if (element.contains(room) || element.tagName === 'SCRIPT') continue;
                inertElements.set(element,element.inert); element.inert=true;
            }
            frame.focus({preventScroll:true});
            clearTimeout(controlsTimer); room.classList.add('controls-hidden');
        } else {
            for (const [element,inert] of inertElements) element.inert=inert;
            inertElements.clear(); clearTimeout(controlsTimer); room.classList.remove('controls-hidden');
            if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
        }
        drawStill();
    }
    async function leaveFullscreen() {
        if (document.fullscreenElement === room) {
            try { await document.exitFullscreen(); } catch { setFullscreen(false); }
        } else setFullscreen(false);
    }
    fullscreen.addEventListener('click',async()=>{
        if (immersive) { await leaveFullscreen(); return; }
        returnFocus=document.activeElement;
        if (room.requestFullscreen) {
            try { await room.requestFullscreen(); return; } catch { /* Use the in-page view. */ }
        }
        setFullscreen(true);
    });
    document.addEventListener('fullscreenchange',()=>setFullscreen(document.fullscreenElement === room));
    for (const event of ['pointerdown','pointermove','keydown','focusin']) room.addEventListener(event,revealControls);
    room.addEventListener('keydown',event=>{
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
            event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
        const key=event.key.toLowerCase();
        if (key === 'escape' && immersive) { event.preventDefault(); leaveFullscreen(); }
        else if (key === 'f') { event.preventDefault(); fullscreen.click(); }
        else if (key === 'p' || (key === ' ' && event.target === frame)) { event.preventDefault(); togglePlay(); }
        else if (key === 'tab' && immersive) {
            const controls=[frame,...dock.querySelectorAll('button')].filter(node=>node.getClientRects().length);
            const first=controls[0], lastControl=controls[controls.length-1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastControl.focus(); }
            else if (!event.shiftKey && document.activeElement === lastControl) { event.preventDefault(); first.focus(); }
        }
    });
    new IntersectionObserver(entries=>{ visible=entries[0].isIntersecting; reconcile(); }).observe(frame);
    new ResizeObserver(drawStill).observe(frame);
    document.addEventListener('visibilitychange',reconcile);
    canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault(); worlds.clear(); world=null; room.classList.remove('has-scene');
        canvas.dataset.renderState='fallback'; updateControls();
    });
    canvas.addEventListener('webglcontextrestored',()=>selectScene(scene));
    window.addEventListener('pagehide',()=>{ audio.pause(); cancelAnimationFrame(animation); animation=0; last=null; });
    window.addEventListener('pageshow',reconcile);
    selectTrack(tracks[0],false);
    document.querySelector('[data-room-still]').hidden=true;
    room.classList.add('is-ready');
})();
