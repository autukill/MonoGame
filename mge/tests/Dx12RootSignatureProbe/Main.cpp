// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to the terms and conditions defined in LICENSE.txt.
// Standalone Windows SDK probe: no MonoGame runtime, engine or game dependency.
#include <windows.h>
#include <d3d12.h>
#include <dxgi1_6.h>
#include <d3dcompiler.h>
#include <wrl/client.h>
#include <array>
#include <climits>
#include <cstring>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;
namespace fs = std::filesystem;
static std::ofstream logFile;
static std::string Hex(HRESULT hr) {
    char value[16]; sprintf_s(value, "0x%08X", static_cast<unsigned>(hr)); return value;
}
static const char* Name(HRESULT hr) {
    switch (hr) {
    case S_OK: return "S_OK";
    case E_INVALIDARG: return "E_INVALIDARG";
    case E_OUTOFMEMORY: return "E_OUTOFMEMORY";
    case E_NOINTERFACE: return "E_NOINTERFACE";
    case E_PENDING: return "NOT_ATTEMPTED";
    case DXGI_ERROR_DEVICE_REMOVED: return "DXGI_ERROR_DEVICE_REMOVED";
    case DXGI_ERROR_DEVICE_HUNG: return "DXGI_ERROR_DEVICE_HUNG";
    case DXGI_ERROR_DEVICE_RESET: return "DXGI_ERROR_DEVICE_RESET";
    case DXGI_ERROR_DRIVER_INTERNAL_ERROR: return "DXGI_ERROR_DRIVER_INTERNAL_ERROR";
    case DXGI_ERROR_UNSUPPORTED: return "DXGI_ERROR_UNSUPPORTED";
    default: return "OTHER_HRESULT";
    }
}
static void Log(const std::string& text) {
    printf("%s\n", text.c_str()); fflush(stdout);
    logFile << text << '\n'; logFile.flush();
}
static void Check(HRESULT hr, const char* operation) {
    Log(std::string(operation) + " = " + Hex(hr) + " (" + Name(hr) + ")");
    if (FAILED(hr)) throw std::runtime_error(std::string(operation) + " failed: " + Hex(hr));
}
static std::string Utf8(const wchar_t* text) {
    int bytes = WideCharToMultiByte(CP_UTF8, 0, text, -1, nullptr, 0, nullptr, nullptr);
    std::string result(bytes, '\0');
    WideCharToMultiByte(CP_UTF8, 0, text, -1, result.data(), bytes, nullptr, nullptr);
    result.pop_back(); return result;
}
static std::string Json(const std::string& value) {
    std::ostringstream s; s << '"';
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') s << '\\' << c;
        else if (c < 32) s << "\\u" << std::hex << std::setw(4) << std::setfill('0') << unsigned(c) << std::dec;
        else s << c;
    }
    return s.str() + '"';
}
static D3D12_HEAP_PROPERTIES Heap(D3D12_HEAP_TYPE type) {
    D3D12_HEAP_PROPERTIES p = {}; p.Type = type; p.CreationNodeMask = p.VisibleNodeMask = 1; return p;
}
static D3D12_RESOURCE_DESC Buffer(UINT64 bytes) {
    D3D12_RESOURCE_DESC d = {}; d.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    d.Width = bytes; d.Height = 1; d.DepthOrArraySize = d.MipLevels = 1;
    d.SampleDesc.Count = 1; d.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR; return d;
}
static void Barrier(ID3D12GraphicsCommandList* list, ID3D12Resource* resource, D3D12_RESOURCE_STATES before, D3D12_RESOURCE_STATES after) {
    D3D12_RESOURCE_BARRIER b = {}; b.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    b.Transition = { resource, D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES, before, after };
    list->ResourceBarrier(1, &b);
}

// Draw with both stages' complete 16-entry tables bound, then read every pixel.
// Uses a constant color texture, a real sampler and both root CBVs.
static void DrawAndReadBack(ID3D12Device* device, ID3D12RootSignature* root) {
    const char* shader = R"(
cbuffer ColorScale : register(b0) { float4 scale; };
Texture2D<float4> inputTexture : register(t0);
SamplerState inputSampler : register(s0);
float4 VS(uint id : SV_VertexID) : SV_Position {
    float2 p[3] = {float2(-1,-1), float2(-1,3), float2(3,-1)};
    return float4(p[id],0,1);
}
float4 PS(float4 p : SV_Position) : SV_Target {
    return inputTexture.SampleLevel(inputSampler,float2(.5,.5),0)*scale;
})";
    ComPtr<ID3DBlob> vs, ps, errors;
    Check(D3DCompile(shader, strlen(shader), "probe.hlsl", nullptr, nullptr, "VS", "vs_5_0", 0, 0, &vs, &errors), "D3DCompile VS");
    errors.Reset();
    Check(D3DCompile(shader, strlen(shader), "probe.hlsl", nullptr, nullptr, "PS", "ps_5_0", 0, 0, &ps, &errors), "D3DCompile PS");
    D3D12_GRAPHICS_PIPELINE_STATE_DESC pipeline = {};
    pipeline.pRootSignature = root;
    pipeline.VS = {vs->GetBufferPointer(), vs->GetBufferSize()};
    pipeline.PS = {ps->GetBufferPointer(), ps->GetBufferSize()};
    auto& blend = pipeline.BlendState.RenderTarget[0];
    blend.SrcBlend = blend.SrcBlendAlpha = D3D12_BLEND_ONE;
    blend.DestBlend = blend.DestBlendAlpha = D3D12_BLEND_ZERO;
    blend.BlendOp = blend.BlendOpAlpha = D3D12_BLEND_OP_ADD;
    blend.LogicOp = D3D12_LOGIC_OP_NOOP; blend.RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    pipeline.SampleMask = UINT_MAX;
    pipeline.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
    pipeline.RasterizerState.CullMode = D3D12_CULL_MODE_NONE;
    pipeline.RasterizerState.DepthClipEnable = TRUE;
    pipeline.DepthStencilState.DepthFunc = D3D12_COMPARISON_FUNC_ALWAYS;
    pipeline.DepthStencilState.StencilReadMask = D3D12_DEFAULT_STENCIL_READ_MASK;
    pipeline.DepthStencilState.StencilWriteMask = D3D12_DEFAULT_STENCIL_WRITE_MASK;
    pipeline.DepthStencilState.FrontFace.StencilFailOp = D3D12_STENCIL_OP_KEEP;
    pipeline.DepthStencilState.FrontFace.StencilDepthFailOp = D3D12_STENCIL_OP_KEEP;
    pipeline.DepthStencilState.FrontFace.StencilPassOp = D3D12_STENCIL_OP_KEEP;
    pipeline.DepthStencilState.FrontFace.StencilFunc = D3D12_COMPARISON_FUNC_ALWAYS;
    pipeline.DepthStencilState.BackFace = pipeline.DepthStencilState.FrontFace;
    pipeline.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    pipeline.NumRenderTargets = 1; pipeline.RTVFormats[0] = DXGI_FORMAT_R8G8B8A8_UNORM;
    pipeline.SampleDesc.Count = 1;
    ComPtr<ID3D12PipelineState> pso;
    Check(device->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&pso)), "CreateGraphicsPipelineState");

    D3D12_DESCRIPTOR_HEAP_DESC hd = {}; hd.NumDescriptors = 2; hd.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
    ComPtr<ID3D12DescriptorHeap> rtvs, srvs, samplers;
    Check(device->CreateDescriptorHeap(&hd, IID_PPV_ARGS(&rtvs)), "Create RTV heap");
    hd.NumDescriptors = 32; hd.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV; hd.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    Check(device->CreateDescriptorHeap(&hd, IID_PPV_ARGS(&srvs)), "Create SRV heap");
    hd.Type = D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER;
    Check(device->CreateDescriptorHeap(&hd, IID_PPV_ARGS(&samplers)), "Create sampler heap");
    auto rtv = rtvs->GetCPUDescriptorHandleForHeapStart(); auto targetRtv = rtv;
    targetRtv.ptr += device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV);

    const float color[4] = {64.f/255, 128.f/255, 192.f/255, 1};
    auto gpuHeap = Heap(D3D12_HEAP_TYPE_DEFAULT);
    D3D12_RESOURCE_DESC td = {}; td.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
    td.Width = td.Height = 1; td.DepthOrArraySize = td.MipLevels = 1;
    td.Format = DXGI_FORMAT_R8G8B8A8_UNORM; td.SampleDesc.Count = 1;
    td.Flags = D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET;
    D3D12_CLEAR_VALUE clear = {}; clear.Format = td.Format; memcpy(clear.Color, color, sizeof(color));
    ComPtr<ID3D12Resource> texture, target, constants, readback;
    Check(device->CreateCommittedResource(&gpuHeap, D3D12_HEAP_FLAG_NONE, &td, D3D12_RESOURCE_STATE_RENDER_TARGET, &clear, IID_PPV_ARGS(&texture)), "Create source texture");
    device->CreateRenderTargetView(texture.Get(), nullptr, rtv);
    td.Width = td.Height = 16;
    Check(device->CreateCommittedResource(&gpuHeap, D3D12_HEAP_FLAG_NONE, &td, D3D12_RESOURCE_STATE_RENDER_TARGET, nullptr, IID_PPV_ARGS(&target)), "Create target texture");
    device->CreateRenderTargetView(target.Get(), nullptr, targetRtv);
    auto uploadHeap = Heap(D3D12_HEAP_TYPE_UPLOAD); auto cb = Buffer(256);
    Check(device->CreateCommittedResource(&uploadHeap, D3D12_HEAP_FLAG_NONE, &cb, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(&constants)), "Create constant buffer");
    void* mapped = nullptr; D3D12_RANGE noRead = {};
    Check(constants->Map(0, &noRead, &mapped), "Map constants");
    const float scale[4] = {1,1,1,1}; memcpy(mapped, scale, sizeof(scale)); constants->Unmap(0, nullptr);
    auto readbackHeap = Heap(D3D12_HEAP_TYPE_READBACK); auto rb = Buffer(16*256);
    Check(device->CreateCommittedResource(&readbackHeap, D3D12_HEAP_FLAG_NONE, &rb, D3D12_RESOURCE_STATE_COPY_DEST, nullptr, IID_PPV_ARGS(&readback)), "Create readback");

    D3D12_SHADER_RESOURCE_VIEW_DESC view = {}; view.Format = td.Format;
    view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING; view.Texture2D.MipLevels = 1;
    D3D12_SAMPLER_DESC sampler = {}; sampler.Filter = D3D12_FILTER_MIN_MAG_MIP_POINT;
    sampler.AddressU = sampler.AddressV = sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    sampler.ComparisonFunc = D3D12_COMPARISON_FUNC_ALWAYS; sampler.MaxAnisotropy = 1; sampler.MaxLOD = D3D12_FLOAT32_MAX;
    const auto srvStep = device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
    const auto samplerStep = device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER);
    auto srvCpu = srvs->GetCPUDescriptorHandleForHeapStart(); auto samplerCpu = samplers->GetCPUDescriptorHandleForHeapStart();
    for (UINT i = 0; i < 32; ++i) {
        device->CreateShaderResourceView(i == 16 ? texture.Get() : nullptr, &view, srvCpu);
        device->CreateSampler(&sampler, samplerCpu);
        srvCpu.ptr += srvStep; samplerCpu.ptr += samplerStep;
    }
    D3D12_COMMAND_QUEUE_DESC qd = {}; qd.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
    ComPtr<ID3D12CommandQueue> queue; ComPtr<ID3D12CommandAllocator> allocator;
    ComPtr<ID3D12GraphicsCommandList> list;
    Check(device->CreateCommandQueue(&qd, IID_PPV_ARGS(&queue)), "CreateCommandQueue");
    Check(device->CreateCommandAllocator(qd.Type, IID_PPV_ARGS(&allocator)), "CreateCommandAllocator");
    Check(device->CreateCommandList(0, qd.Type, allocator.Get(), pso.Get(), IID_PPV_ARGS(&list)), "CreateCommandList");
    list->ClearRenderTargetView(rtv, color, 0, nullptr);
    Barrier(list.Get(), texture.Get(), D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    list->SetGraphicsRootSignature(root);
    ID3D12DescriptorHeap* heaps[] = {srvs.Get(), samplers.Get()}; list->SetDescriptorHeaps(2, heaps);
    list->SetGraphicsRootConstantBufferView(0, constants->GetGPUVirtualAddress());
    list->SetGraphicsRootConstantBufferView(1, constants->GetGPUVirtualAddress());
    auto sg = srvs->GetGPUDescriptorHandleForHeapStart(); auto pg = sg; pg.ptr += 16*srvStep;
    auto ss = samplers->GetGPUDescriptorHandleForHeapStart(); auto psamp = ss; psamp.ptr += 16*samplerStep;
    list->SetGraphicsRootDescriptorTable(2, sg); list->SetGraphicsRootDescriptorTable(3, pg);
    list->SetGraphicsRootDescriptorTable(4, ss); list->SetGraphicsRootDescriptorTable(5, psamp);
    D3D12_VIEWPORT viewport = {0,0,16,16,0,1}; D3D12_RECT scissor = {0,0,16,16};
    list->RSSetViewports(1, &viewport); list->RSSetScissorRects(1, &scissor);
    list->OMSetRenderTargets(1, &targetRtv, FALSE, nullptr);
    list->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST); list->DrawInstanced(3,1,0,0);
    Barrier(list.Get(), target.Get(), D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_COPY_SOURCE);
    D3D12_TEXTURE_COPY_LOCATION src = {}; src.pResource = target.Get(); src.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    D3D12_TEXTURE_COPY_LOCATION dst = {}; dst.pResource = readback.Get(); dst.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    dst.PlacedFootprint.Footprint = {DXGI_FORMAT_R8G8B8A8_UNORM,16,16,1,256};
    list->CopyTextureRegion(&dst, 0,0,0, &src, nullptr); Check(list->Close(), "Close command list");
    ID3D12CommandList* commands[] = {list.Get()}; queue->ExecuteCommandLists(1, commands);
    ComPtr<ID3D12Fence> fence; Check(device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence)), "CreateFence");
    Check(queue->Signal(fence.Get(), 1), "Signal fence");
    HANDLE event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!event) throw std::runtime_error("CreateEvent failed");
    HRESULT waitHr = fence->SetEventOnCompletion(1, event);
    DWORD wait = SUCCEEDED(waitHr) ? WaitForSingleObject(event,10000) : WAIT_FAILED;
    CloseHandle(event);
    Check(waitHr, "SetEventOnCompletion");
    if (wait != WAIT_OBJECT_0) throw std::runtime_error("GPU fence did not complete within 10 seconds");
    Check(device->GetDeviceRemovedReason(), "GetDeviceRemovedReason after draw");
    D3D12_RANGE range = {0,16*256}; Check(readback->Map(0, &range, &mapped), "Map readback");
    bool matches = true; const unsigned char expected[4] = {64,128,192,255};
    for (UINT y=0;y<16;++y) for(UINT x=0;x<16;++x)
        if (memcmp(static_cast<unsigned char*>(mapped)+y*256+x*4, expected,4)) matches=false;
    readback->Unmap(0, &noRead);
    if (!matches) throw std::runtime_error("256-pixel readback differs from RGBA(64,128,192,255)");
    Log("DRAW_READBACK_PASS: all 256 pixels matched RGBA(64,128,192,255)");
}

struct Result {
    std::string name, error;
    HRESULT deviceHr=E_PENDING, serializeHr=E_PENDING, rootHr=E_PENDING, removedHr=E_PENDING, finalRemovedHr=E_PENDING;
    unsigned bindingTier=0, rootVersion=0; bool drew=false;
};
static Result RunCase(IDXGIAdapter1* adapter, bool bounded) {
    Result r; r.name = bounded ? "bounded_16" : "original_unbounded";
    Log("\nCASE " + r.name);
    ComPtr<ID3D12Device> device;
    try {
        r.deviceHr = D3D12CreateDevice(adapter, D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&device));
        Check(r.deviceHr, "D3D12CreateDevice FL11_0");
        D3D12_FEATURE_DATA_D3D12_OPTIONS options = {};
        Check(device->CheckFeatureSupport(D3D12_FEATURE_D3D12_OPTIONS, &options, sizeof(options)), "CheckFeatureSupport D3D12_OPTIONS");
        r.bindingTier = options.ResourceBindingTier;
        D3D12_FEATURE_DATA_ROOT_SIGNATURE version = {D3D_ROOT_SIGNATURE_VERSION_1_1};
        if (FAILED(device->CheckFeatureSupport(D3D12_FEATURE_ROOT_SIGNATURE,&version,sizeof(version)))) version.HighestVersion=D3D_ROOT_SIGNATURE_VERSION_1_0;
        r.rootVersion=version.HighestVersion;
        Log("ResourceBindingTier="+std::to_string(r.bindingTier)+"; HighestRootSignatureVersion="+std::to_string(r.rootVersion));
        D3D12_DESCRIPTOR_RANGE ranges[4] = {};
        D3D12_ROOT_PARAMETER parameters[6] = {};
        for(UINT i=0;i<2;++i) {
            parameters[i].ParameterType=D3D12_ROOT_PARAMETER_TYPE_CBV;
            parameters[i].ShaderVisibility=i==0?D3D12_SHADER_VISIBILITY_VERTEX:D3D12_SHADER_VISIBILITY_PIXEL;
        }
        for(UINT i=0;i<4;++i) {
            ranges[i].RangeType=i<2?D3D12_DESCRIPTOR_RANGE_TYPE_SRV:D3D12_DESCRIPTOR_RANGE_TYPE_SAMPLER;
            ranges[i].NumDescriptors=bounded?16:UINT_MAX;
            ranges[i].OffsetInDescriptorsFromTableStart=D3D12_DESCRIPTOR_RANGE_OFFSET_APPEND;
            parameters[i+2].ParameterType=D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
            parameters[i+2].DescriptorTable={1,&ranges[i]};
            parameters[i+2].ShaderVisibility=(i%2)==0?D3D12_SHADER_VISIBILITY_VERTEX:D3D12_SHADER_VISIBILITY_PIXEL;
        }
        D3D12_ROOT_SIGNATURE_DESC desc = {}; desc.NumParameters=6; desc.pParameters=parameters;
        desc.Flags=D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT | D3D12_ROOT_SIGNATURE_FLAG_DENY_DOMAIN_SHADER_ROOT_ACCESS |
            D3D12_ROOT_SIGNATURE_FLAG_DENY_GEOMETRY_SHADER_ROOT_ACCESS | D3D12_ROOT_SIGNATURE_FLAG_DENY_HULL_SHADER_ROOT_ACCESS;
        ComPtr<ID3DBlob> serialized, errors;
        r.serializeHr=D3D12SerializeRootSignature(&desc,D3D_ROOT_SIGNATURE_VERSION_1_0,&serialized,&errors);
        if(errors)Log("Serializer: "+std::string(static_cast<const char*>(errors->GetBufferPointer()),errors->GetBufferSize()));
        Check(r.serializeHr,"D3D12SerializeRootSignature 1.0");
        ComPtr<ID3D12RootSignature> root;
        r.rootHr=device->CreateRootSignature(0,serialized->GetBufferPointer(),serialized->GetBufferSize(),IID_PPV_ARGS(&root));
        r.removedHr=device->GetDeviceRemovedReason();
        Log("CreateRootSignature = "+Hex(r.rootHr)+" ("+Name(r.rootHr)+")");
        Log("GetDeviceRemovedReason after root = "+Hex(r.removedHr)+" ("+Name(r.removedHr)+")");
        if(FAILED(r.rootHr)) throw std::runtime_error("Root signature was rejected");
        if(bounded) {DrawAndReadBack(device.Get(),root.Get());r.drew=true;}
    } catch(const std::exception& error) {r.error=error.what();Log("CASE_ERROR: "+r.error);}
    if(device) {r.finalRemovedHr=device->GetDeviceRemovedReason();Log("Final GetDeviceRemovedReason = "+Hex(r.finalRemovedHr)+" ("+Name(r.finalRemovedHr)+")");}
    return r;
}
static void WriteResult(std::ostream& out,const Result& r) {
    out << "{\"name\":"<<Json(r.name)<<",\"deviceHresult\":"<<Json(Hex(r.deviceHr))
        <<",\"serializeHresult\":"<<Json(Hex(r.serializeHr))<<",\"rootHresult\":"<<Json(Hex(r.rootHr))
        <<",\"rootHresultName\":"<<Json(Name(r.rootHr))<<",\"getDeviceRemovedReasonAfterRoot\":"<<Json(Hex(r.removedHr))
        <<",\"deviceRemovedReasonWasQueriedAfterRoot\":"<<(r.removedHr!=E_PENDING?"true":"false")
        <<",\"getDeviceRemovedReasonFinal\":"<<Json(Hex(r.finalRemovedHr))<<",\"resourceBindingTier\":"<<r.bindingTier
        <<",\"highestRootSignatureVersion\":"<<r.rootVersion<<",\"drawReadbackPassed\":"<<(r.drew?"true":"false")
        <<",\"error\":"<<Json(r.error)<<"}";
}
int wmain(int argc,wchar_t** argv) {
    try {
        fs::path output = argc==2?fs::path(argv[1]):fs::current_path()/L"probe-results";
        fs::create_directories(output); logFile.open(output/L"probe.log",std::ios::trunc);
        if(!logFile)throw std::runtime_error("Cannot create probe.log");
        Log("Standalone DX12 root signature A/B probe. No game/runtime assets required.");
        Log("PID="+std::to_string(GetCurrentProcessId())+"; output="+Utf8(output.c_str()));
        ComPtr<IDXGIFactory6> factory; Check(CreateDXGIFactory2(0,IID_PPV_ARGS(&factory)),"CreateDXGIFactory2 / IDXGIFactory6");
        ComPtr<IDXGIAdapter1> adapter;
        DXGI_ADAPTER_DESC1 adapterDesc = {};
        for(UINT index=0;;++index) {
            HRESULT hr=factory->EnumAdapterByGpuPreference(index,DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE,IID_PPV_ARGS(adapter.ReleaseAndGetAddressOf()));
            if(hr==DXGI_ERROR_NOT_FOUND)break; Check(hr,"EnumAdapterByGpuPreference");
            Check(adapter->GetDesc1(&adapterDesc),"GetDesc1");
            if(!(adapterDesc.Flags&DXGI_ADAPTER_FLAG_SOFTWARE))break;
            adapter.Reset();
        }
        if(!adapter)throw std::runtime_error("No hardware adapter found");
        std::string adapterName=Utf8(adapterDesc.Description);
        Log("Adapter="+adapterName+"; vendor="+std::to_string(adapterDesc.VendorId)+"; device="+std::to_string(adapterDesc.DeviceId));
        LARGE_INTEGER driver = {}; HRESULT driverHr=adapter->CheckInterfaceSupport(__uuidof(IDXGIDevice),&driver);
        Log("CheckInterfaceSupport driver version query="+Hex(driverHr)+"; raw="+std::to_string(driver.QuadPart));
        const Result original=RunCase(adapter.Get(),false);
        const Result bounded=RunCase(adapter.Get(),true);
        const std::string conclusion = FAILED(original.rootHr)&&original.rootHr!=E_PENDING&&bounded.drew
            ?"UNBOUNDED_REJECTED_BOUNDED_DRAW_PASSED":SUCCEEDED(original.rootHr)&&bounded.drew
            ?"BOTH_LAYOUTS_CREATED_BOUNDED_DRAW_PASSED":"BOUNDED_CASE_FAILED_OR_INCOMPLETE";
        std::ofstream report(output/L"report.json");
        report<<"{\n\"probe\":\"Dx12RootSignatureProbe\",\"adapter\":"<<Json(adapterName)
            <<",\"vendorId\":"<<adapterDesc.VendorId<<",\"deviceId\":"<<adapterDesc.DeviceId
            <<",\"driverVersionQueryHresult\":"<<Json(Hex(driverHr))<<",\"driverVersionRaw\":"<<driver.QuadPart
            <<",\"caseIsolation\":\"separate D3D12 device per layout\",\"debugLayerEnabled\":false,\n\"cases\":[";
        WriteResult(report,original);report<<",\n";WriteResult(report,bounded);
        report<<"],\n\"conclusion\":"<<Json(conclusion)<<"\n}\n";report.close();
        Log("CONCLUSION="+conclusion);
        std::ofstream summary(output/L"result.txt");
        summary<<"Adapter: "<<adapterName<<"\nResourceBindingTier: "<<bounded.bindingTier
            <<"\nOriginal unbounded root: "<<Hex(original.rootHr)<<" ("<<Name(original.rootHr)<<")"
            <<"\nOriginal GetDeviceRemovedReason: "<<Hex(original.removedHr)
            <<"\nBounded 16 root: "<<Hex(bounded.rootHr)<<" ("<<Name(bounded.rootHr)<<")"
            <<"\nBounded draw + 256-pixel readback: "<<(bounded.drew?"PASS":"FAIL")
            <<"\nBounded final GetDeviceRemovedReason: "<<Hex(bounded.finalRemovedHr)
            <<"\nConclusion: "<<conclusion<<"\n";
        return bounded.drew?0:1;
    } catch(const std::exception& error) {Log(std::string("PROBE_FATAL: ")+error.what());return 2;}
}
