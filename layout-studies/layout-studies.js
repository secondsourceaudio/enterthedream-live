(() => {
    'use strict';
    const buttons=[...document.querySelectorAll('[data-study-button]')];
    const panels=[...document.querySelectorAll('[data-study-panel]')];
    function select(name,updateHash=true) {
        if (!panels.some(panel=>panel.dataset.studyPanel===name)) name='channel';
        for (const button of buttons) button.setAttribute('aria-pressed',String(button.dataset.studyButton===name));
        for (const panel of panels) {
            const active=panel.dataset.studyPanel===name;
            panel.hidden=!active; panel.classList.toggle('is-active',active);
        }
        if (updateHash) history.replaceState(null,'','#'+name);
    }
    for (const button of buttons) button.addEventListener('click',()=>select(button.dataset.studyButton));
    select(location.hash.slice(1)||'channel',false);

    if (matchMedia('(pointer:fine)').matches) for (const windowElement of document.querySelectorAll('[data-drag-window]')) {
        const handle=windowElement.querySelector('header');
        let drag=null;
        handle.addEventListener('pointerdown',event=>{
            const parent=windowElement.parentElement.getBoundingClientRect();
            const rect=windowElement.getBoundingClientRect();
            drag={x:event.clientX,y:event.clientY,left:rect.left-parent.left,top:rect.top-parent.top,parent};
            handle.setPointerCapture(event.pointerId);
            windowElement.style.right='auto'; windowElement.style.bottom='auto';
            windowElement.style.zIndex=String(10+Date.now()%1000);
        });
        handle.addEventListener('pointermove',event=>{
            if (!drag) return;
            const left=Math.max(0,Math.min(drag.parent.width-windowElement.offsetWidth,drag.left+event.clientX-drag.x));
            const top=Math.max(34,Math.min(drag.parent.height-windowElement.offsetHeight,drag.top+event.clientY-drag.y));
            windowElement.style.left=left+'px'; windowElement.style.top=top+'px';
        });
        handle.addEventListener('pointerup',()=>{drag=null;});
        handle.addEventListener('pointercancel',()=>{drag=null;});
    }
})();
