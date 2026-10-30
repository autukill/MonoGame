// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to the terms and conditions defined in
// file 'LICENSE.txt', which is part of this source code package.
#include "directx12.h"

#if defined(MGE_DX12_STARTUP_DIAGNOSTICS) && !defined(_GAMING_XBOX)
#include <d3dcompiler.h>

namespace DX::StartupDiagnostics {
    static void LogContainer(const char* name, const D3D12_SHADER_BYTECODE& shader) noexcept
    {
        const auto* data = static_cast<const unsigned char*>(shader.pShaderBytecode);
        auto word = [&](SIZE_T offset) { UINT value; memcpy(&value, data + offset, 4); return value; };
        if (!data || shader.BytecodeLength < 32 || memcmp(data, "DXBC", 4)) return;
        const UINT count = word(28);
        if (count > (shader.BytecodeLength - 32) / 4) return;
        for (UINT i = 0; i < count; ++i) {
            const SIZE_T offset = word(32 + 4 * i);
            if (offset > shader.BytecodeLength - 8) continue;
            const UINT size = word(offset + 4);
            if (size > shader.BytecodeLength - offset - 8) continue;
            fprintf(stderr, "[DX12-PSO] shader=%s container-part=%.4s bytes=%u\n", name, data + offset, size);
            if (size >= 4 && (!memcmp(data + offset, "DXIL", 4) || !memcmp(data + offset, "SHEX", 4) || !memcmp(data + offset, "SHDR", 4))) {
                const UINT version = word(offset + 8);
                fprintf(stderr, "[DX12-PSO] shader=%s encoded-stage=%u shader-model=%u.%u\n", name, version >> 16, (version >> 4) & 15, version & 15);
            }
        }
    }
    // Failure-only experiments in the private diagnostic DLL. They create and
    // release PSOs, never submit commands or substitute a result for rendering.
    void GraphicsPipelineFailure(ID3D12Device* device, const D3D12_GRAPHICS_PIPELINE_STATE_DESC& original) noexcept
    {
        using Microsoft::WRL::ComPtr;
        const auto& r = original.RasterizerState;
        const auto& d = original.DepthStencilState;
        fprintf(stderr, "[DX12-PSO] original rtCount=%u dsv=%u samples=%u quality=%u sampleMask=0x%X topology=%u flags=%u nodeMask=%u inputCount=%u\n",
            original.NumRenderTargets, original.DSVFormat, original.SampleDesc.Count, original.SampleDesc.Quality,
            original.SampleMask, original.PrimitiveTopologyType, original.Flags, original.NodeMask, original.InputLayout.NumElements);
        fprintf(stderr, "[DX12-PSO] raster fill=%u cull=%u ccw=%u depthClip=%u multisample=%u aaLine=%u forcedSamples=%u conservative=%u depthBias=%d clamp=%g slope=%g\n",
            r.FillMode, r.CullMode, r.FrontCounterClockwise, r.DepthClipEnable, r.MultisampleEnable, r.AntialiasedLineEnable,
            r.ForcedSampleCount, r.ConservativeRaster, r.DepthBias, r.DepthBiasClamp, r.SlopeScaledDepthBias);
        fprintf(stderr, "[DX12-PSO] depth enabled=%u write=%u func=%u stencil=%u readMask=%u writeMask=%u front=%u/%u/%u/%u back=%u/%u/%u/%u\n",
            d.DepthEnable, d.DepthWriteMask, d.DepthFunc, d.StencilEnable, d.StencilReadMask, d.StencilWriteMask,
            d.FrontFace.StencilFailOp, d.FrontFace.StencilDepthFailOp, d.FrontFace.StencilPassOp, d.FrontFace.StencilFunc,
            d.BackFace.StencilFailOp, d.BackFace.StencilDepthFailOp, d.BackFace.StencilPassOp, d.BackFace.StencilFunc);
        fprintf(stderr, "[DX12-PSO] blend alphaToCoverage=%u independent=%u\n", original.BlendState.AlphaToCoverageEnable, original.BlendState.IndependentBlendEnable);
        for (UINT i = 0; i < D3D12_SIMULTANEOUS_RENDER_TARGET_COUNT; ++i) {
            const auto& b = original.BlendState.RenderTarget[i];
            fprintf(stderr, "[DX12-PSO] rt=%u format=%u blend=%u logic=%u src=%u dst=%u op=%u srcA=%u dstA=%u opA=%u logicOp=%u mask=%u\n",
                i, original.RTVFormats[i], b.BlendEnable, b.LogicOpEnable, b.SrcBlend, b.DestBlend, b.BlendOp,
                b.SrcBlendAlpha, b.DestBlendAlpha, b.BlendOpAlpha, b.LogicOp, b.RenderTargetWriteMask);
        }
        for (UINT i = 0; i < original.InputLayout.NumElements; ++i) {
            const auto& e = original.InputLayout.pInputElementDescs[i];
            fprintf(stderr, "[DX12-PSO] input=%u semantic=%s index=%u format=%u slot=%u offset=%u class=%u step=%u\n",
                i, e.SemanticName ? e.SemanticName : "(null)", e.SemanticIndex, e.Format, e.InputSlot,
                e.AlignedByteOffset, e.InputSlotClass, e.InstanceDataStepRate);
        }
        fflush(stderr);
        // The system compiler is optional; never search the working directory.
        HMODULE compiler = LoadLibraryExW(L"d3dcompiler_47.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
        auto disassemble = compiler ? reinterpret_cast<decltype(&D3DDisassemble)>(GetProcAddress(compiler, "D3DDisassemble")) : nullptr;
        auto compile = compiler ? reinterpret_cast<decltype(&D3DCompile)>(GetProcAddress(compiler, "D3DCompile")) : nullptr;
        const D3D12_SHADER_BYTECODE shaders[] = { original.VS, original.PS };
        for (UINT i = 0; i < 2; ++i) {
            LogContainer(i ? "PS" : "VS", shaders[i]);
            ComPtr<ID3DBlob> text;
            HRESULT hr = disassemble ? disassemble(shaders[i].pShaderBytecode, shaders[i].BytecodeLength, 0, nullptr, &text) : E_NOINTERFACE;
            fprintf(stderr, "[DX12-PSO] shader=%s bytes=%zu disassemble=0x%08X\n", i ? "PS" : "VS", shaders[i].BytecodeLength, static_cast<unsigned>(hr));
            if (SUCCEEDED(hr)) fprintf(stderr, "%.*s\n", static_cast<int>(std::min<SIZE_T>(text->GetBufferSize(), 32768)), static_cast<const char*>(text->GetBufferPointer()));
        }
        auto attempt = [&](const char* name, const D3D12_GRAPHICS_PIPELINE_STATE_DESC& desc) {
            // Stop experiments if any preceding API removed the device.
            if (FAILED(device->GetDeviceRemovedReason())) return;
            ComPtr<ID3D12PipelineState> pso;
            HRESULT hr = device->CreateGraphicsPipelineState(&desc, IID_PPV_ARGS(&pso));
            fprintf(stderr, "[DX12-PSO] diagnostic-only variant=%s HRESULT=0x%08X GetDeviceRemovedReason=0x%08X (never used for rendering)\n",
                name, static_cast<unsigned>(hr), static_cast<unsigned>(device->GetDeviceRemovedReason()));
            if (FAILED(hr)) ReportFailure(hr, name, __FILE__, __LINE__); // drains optional API messages
        };
        auto clean = original;
        clean.RasterizerState = CD3DX12_RASTERIZER_DESC(D3D12_DEFAULT);
        clean.BlendState = CD3DX12_BLEND_DESC(D3D12_DEFAULT);
        clean.DepthStencilState = CD3DX12_DEPTH_STENCIL_DESC(D3D12_DEFAULT);
        clean.DepthStencilState.DepthEnable = original.DSVFormat != DXGI_FORMAT_UNKNOWN;
        clean.DepthStencilState.DepthWriteMask = clean.DepthStencilState.DepthEnable ? D3D12_DEPTH_WRITE_MASK_ALL : D3D12_DEPTH_WRITE_MASK_ZERO;
        auto variant = original; variant.RasterizerState = clean.RasterizerState; attempt("default-rasterizer", variant);
        variant = original; variant.BlendState = clean.BlendState; attempt("default-blend", variant);
        variant = original; variant.DepthStencilState = clean.DepthStencilState; attempt("default-depth-stencil", variant);
        attempt("original-shaders-default-fixed-function", clean);
        const char* source =
            "float4 VS(uint id:SV_VertexID):SV_Position { return float4(id==1?3:-1,id==2?3:-1,0,1); }"
            "float4 PS():SV_Target { return float4(1,0,0,1); }";
        ComPtr<ID3DBlob> vs, ps, errors;
        HRESULT vsHr = compile ? compile(source, strlen(source), nullptr, nullptr, nullptr, "VS", "vs_5_0", 0, 0, &vs, &errors) : E_NOINTERFACE;
        HRESULT psHr = compile ? compile(source, strlen(source), nullptr, nullptr, nullptr, "PS", "ps_5_0", 0, 0, &ps, &errors) : E_NOINTERFACE;
        fprintf(stderr, "[DX12-PSO] minimal-shader-compile VS=0x%08X PS=0x%08X\n", static_cast<unsigned>(vsHr), static_cast<unsigned>(psHr));
        if (SUCCEEDED(vsHr) && SUCCEEDED(psHr)) {
            variant = original; variant.VS = {vs->GetBufferPointer(), vs->GetBufferSize()}; variant.PS = {ps->GetBufferPointer(), ps->GetBufferSize()};
            variant.InputLayout = {};
            attempt("minimal-shaders-original-fixed-function", variant);
            clean.VS = variant.VS; clean.PS = variant.PS; clean.InputLayout = {};
            attempt("minimal-shaders-default-fixed-function", clean);
        }
        if (compiler) FreeLibrary(compiler);
        fflush(stderr);
    }
}
#endif
