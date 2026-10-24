// wx.getWindowInfo.safeArea uses portrait-upright screen coordinates on devices.
// DevTools returns an already oriented rectangle. Input remains in window space.
export function surfacePresentation(info,orientation='landscape',platform='') {
    const w=info.windowWidth,h=info.windowHeight,ratio=info.pixelRatio||1;
    if(![w,h,ratio].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid WeChat window dimensions');
    const landscape=w>h,reverse=orientation==='landscapeReverse';
    const sw=info.screenWidth>0?info.screenWidth:w,sh=info.screenHeight>0?info.screenHeight:h;
    const pw=Math.min(sw,sh),ph=Math.max(sw,sh),safe=info.safeArea;
    let l=0,t=0,right=w,bottom=h,space='full-window';
    if(safe){
        l=safe.left;t=safe.top;right=safe.right;bottom=safe.bottom;
        if(![l,t,right,bottom].every(Number.isFinite)||right<l||bottom<t)throw Error('Invalid WeChat safeArea');
        const oriented=platform==='devtools'||landscape&&(right>pw+.5||right-l>pw+.5);
        if(landscape&&!oriented){
            [l,t,right,bottom]=reverse?[ph-bottom,l,ph-t,right]:[t,pw-right,bottom,pw-l];
            space='portrait-safe-area-rotated';
        }else space=oriented?'oriented-safe-area':'portrait-safe-area';
        const screenTop=Number.isFinite(info.screenTop)?info.screenTop:0;
        t-=screenTop;bottom-=screenTop;
        l=Math.max(0,Math.min(w,l));right=Math.max(l,Math.min(w,right));
        t=Math.max(0,Math.min(h,t));bottom=Math.max(t,Math.min(h,bottom));
    }
    const width=Math.round(w*ratio),height=Math.round(h*ratio);
    // Convert shared edges once, keeping the physical rectangle inside the canvas.
    const left=Math.min(width,Math.ceil(l*ratio)),top=Math.min(height,Math.ceil(t*ratio));
    const endX=Math.max(left,Math.min(width,Math.floor(right*ratio))),endY=Math.max(top,Math.min(height,Math.floor(bottom*ratio)));
    return {width,height,density:ratio,left,top,right:width-endX,bottom:height-endY,
        orientation:landscape?(reverse?'landscapeReverse':'landscape'):'portrait',coordinateSpace:space};
}
