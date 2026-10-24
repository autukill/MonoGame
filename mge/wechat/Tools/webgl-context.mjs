import {replaceOnce} from './replace.mjs';

// Emscripten 3.1.56's Safari workaround assumes DOM constructors exist.
// wx Canvas returns native contexts without exposing those constructors.
// Retain its version check using WebGL 2 core methods (not extensions).
export const browserContextCheck="return ((ver == 'webgl') == (gl instanceof WebGLRenderingContext)) ? gl : null;";
export const wechatContextCheck=`if (!gl) return null;
            var isWebGL2 = typeof gl.texStorage2D == 'function' && typeof gl.createVertexArray == 'function';
            return ((ver == 'webgl2') == isWebGL2) ? gl : null;`;

export function adaptWebGlContext(source) {
    if ((source.match(/\bWebGLRenderingContext\b/g)||[]).length !== 1 ||
        !source.includes('canvas.getContextSafariWebGL2Fixed(ver, attrs)') ||
        !source.includes('var ctx = canvas.getContext("webgl2", webGLContextAttributes);')) {
        throw Error('LLVM WebGL context layout changed');
    }
    return replaceOnce(source,browserContextCheck,wechatContextCheck,'LLVM wx native WebGL context identity');
}

export function adaptWebGlObjects(source) {
    const attachment=/result instanceof WebGLRenderbuffer \|\|\s*result instanceof WebGLTexture/g;
    const matches=source.match(attachment)||[];
    if(matches.length!==1 || (source.match(/result instanceof WebGLBuffer/g)||[]).length!==1 ||
        (source.match(/\bWebGL(?:Renderbuffer|Texture|Buffer)\b/g)||[]).length!==3) {
        throw Error('LLVM WebGL object identity layout changed');
    }
    // These are the exact objects already assigned handles by GL.getNewId.
    // A name alone is insufficient: require identity in the correct object table.
    let result=source.replace(attachment,'result && (GL.renderbuffers[result.name] === result || GL.textures[result.name] === result)');
    return replaceOnce(result,'result instanceof WebGLBuffer','GL.buffers[result.name] === result','LLVM wx native WebGL buffer identity');
}

// wx iOS returns undefined rather than WebGL's null for these unbound objects.
// Keep unknown enums and every non-null binding on the original error/identity path.
export function adaptWebGlNullBindings(source) {
    const newline=source.includes('var result = GLctx.getParameter(name_);\r\n')?'\r\n':'\n';
    const original='var result = GLctx.getParameter(name_);'+newline+'        switch (typeof result) {';
    return replaceOnce(source,original,'var result = GLctx.getParameter(name_);'+newline+'        if (result === undefined && (name_ === 0x8069 || name_ === 0x8CA6 || name_ === 0x8CA7)) result = null;'+newline+'        switch (typeof result) {','LLVM wx unbound texture/framebuffer/renderbuffer queries');
}

// Native wx query values can originate in another JavaScript realm. instanceof
// then misses both boolean arrays and typed vectors, corrupting native saved GL
// state (notably Clear's COLOR_WRITEMASK and SCISSOR_BOX). Keep the SDK's exact
// supported vector kinds; reject DataView and arbitrary array-like objects.
export function adaptWebGlQueryArrays(source) {
    const original=/result instanceof Float32Array \|\|\s*result instanceof Uint32Array \|\|\s*result instanceof Int32Array \|\|\s*result instanceof Array/g;
    if ((source.match(original)||[]).length!==1 ||
        !source.includes('var emscriptenWebGLGet = (name_, p, type) => {') ||
        !source.includes('case 4: HEAP8[(p)+(i)] = result[i] ? 1 : 0; break;')) {
        throw Error('LLVM WebGL query array layout changed');
    }
    return source.replace(original,`Array.isArray(result) ||
                       (ArrayBuffer.isView(result) &&
                        ['[object Float32Array]', '[object Uint32Array]', '[object Int32Array]'].includes(Object.prototype.toString.call(result)))`);
}
