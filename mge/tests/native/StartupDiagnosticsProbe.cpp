// Standalone, diagnostic-only executable. No player flags or forced removal in the DLL.
#include "directx12.h"

using Microsoft::WRL::ComPtr;

int main()
{
    try {
        using namespace DX::StartupDiagnostics;
        Step("probe.no-device");
        if (ReportFailure(E_INVALIDARG, "probe.before-device", __FILE__, __LINE__).deviceAvailable)
            throw std::runtime_error("Unavailable device incorrectly reported a reason");
        ComPtr<IDXGIFactory4> factory;
        DX::ThrowIfFailed(CreateDXGIFactory2(0, IID_PPV_ARGS(&factory)));
        ComPtr<IDXGIAdapter> warp;
        DX::ThrowIfFailed(factory->EnumWarpAdapter(IID_PPV_ARGS(&warp)));
        ComPtr<ID3D12Device> device;
        DX::ThrowIfFailed(D3D12CreateDevice(warp.Get(), D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&device)));
        RegisterDevice(device.Get());
        Step("probe.live-device");
        auto live = ReportFailure(E_INVALIDARG, "probe.live-device", __FILE__, __LINE__);
        if (!live.deviceAvailable || live.removedReason != S_OK)
            throw std::runtime_error("Live WARP device did not report S_OK");
        // Exercise the same call-site wrapper used by the diagnostic DLL.
        bool caught = false;
        try { DX::ThrowIfFailed(E_INVALIDARG); }
        catch (const DX::com_exception&) { caught = true; }
        if (!caught) throw std::runtime_error("Failure did not retain existing exception behavior");
        DX::ThrowIfFailed(S_OK);
        // Exercise the failure-only PSO logger and its independent SM5 shader
        // experiments on a private WARP device, without submitting any work.
        D3D12_ROOT_SIGNATURE_DESC rootDesc = {};
        rootDesc.Flags = D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;
        ComPtr<ID3DBlob> blob, errors;
        DX::ThrowIfFailed(D3D12SerializeRootSignature(&rootDesc, D3D_ROOT_SIGNATURE_VERSION_1, &blob, &errors));
        ComPtr<ID3D12RootSignature> root;
        DX::ThrowIfFailed(device->CreateRootSignature(0, blob->GetBufferPointer(), blob->GetBufferSize(), IID_PPV_ARGS(&root)));
        D3D12_GRAPHICS_PIPELINE_STATE_DESC invalidPso = {};
        invalidPso.pRootSignature = root.Get();
        invalidPso.RasterizerState = CD3DX12_RASTERIZER_DESC(D3D12_DEFAULT);
        invalidPso.BlendState = CD3DX12_BLEND_DESC(D3D12_DEFAULT);
        invalidPso.DepthStencilState = CD3DX12_DEPTH_STENCIL_DESC(D3D12_DEFAULT);
        invalidPso.DepthStencilState.DepthEnable = FALSE;
        invalidPso.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
        invalidPso.SampleDesc.Count = 1; invalidPso.SampleMask = UINT_MAX;
        invalidPso.NumRenderTargets = 1; invalidPso.RTVFormats[0] = DXGI_FORMAT_R8G8B8A8_UNORM;
        GraphicsPipelineFailure(device.Get(), invalidPso);
        DX::ThrowIfFailed(device->GetDeviceRemovedReason());
        ComPtr<ID3D12Device5> removable;
        DX::ThrowIfFailed(device.As(&removable));
        // Only this private software device is removed; no physical GPU reset.
        removable->RemoveDevice();
        const HRESULT expected = device->GetDeviceRemovedReason();
        Step("probe.removed-device");
        const auto removed = ReportFailure(DXGI_ERROR_DEVICE_REMOVED, "probe.after-RemoveDevice", __FILE__, __LINE__);
        if (!removed.deviceAvailable || SUCCEEDED(expected) || removed.removedReason != expected)
            throw std::runtime_error("Removed reason was lost or replaced by the outer HRESULT");
        ClearDevice(device.Get());
        if (ReportFailure(E_FAIL, "probe.after-clear", __FILE__, __LINE__).deviceAvailable)
            throw std::runtime_error("Cleared device was still retained");
        puts("DX12 diagnostic probe passed: unavailable, live S_OK, call-site exception, removed WARP device, clear.");
        return 0;
    } catch (const std::exception& error) {
        fprintf(stderr, "Diagnostic regression: %s\n", error.what());
        return 1;
    }
}
