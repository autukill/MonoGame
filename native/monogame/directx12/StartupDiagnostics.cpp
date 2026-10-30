// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to the terms and conditions defined in
// file 'LICENSE.txt', which is part of this source code package.
#include "directx12.h"

#if defined(MGE_DX12_STARTUP_DIAGNOSTICS) && !defined(_GAMING_XBOX)
#include <mutex>
#include <d3d12sdklayers.h>

namespace DX::StartupDiagnostics {
    namespace {
        std::mutex deviceMutex;
        Microsoft::WRL::ComPtr<ID3D12Device> currentDevice;
        thread_local const char* currentStep = "not-recorded-on-this-thread";
        std::once_flag validationAttempt;

        void DrainMessages(ID3D12Device* device) noexcept
        {
            Microsoft::WRL::ComPtr<ID3D12InfoQueue> info;
            if (FAILED(device->QueryInterface(IID_PPV_ARGS(&info)))) return;
            const UINT64 count = info->GetNumStoredMessages();
            for (UINT64 i = 0; i < count && i < 256; ++i) {
                SIZE_T bytes = 0;
                if (FAILED(info->GetMessage(i, nullptr, &bytes)) || bytes > 65536) continue;
                std::vector<char> storage(bytes);
                auto message = reinterpret_cast<D3D12_MESSAGE*>(storage.data());
                if (SUCCEEDED(info->GetMessage(i, message, &bytes)) && message->Severity <= D3D12_MESSAGE_SEVERITY_WARNING)
                    fprintf(stderr, "[DX12-VALIDATION] severity=%u id=%u: %s\n", message->Severity, message->ID, message->pDescription);
            }
            info->ClearStoredMessages();
        }

        const char* HResultName(HRESULT hr) noexcept
        {
            switch (hr) {
            case S_OK: return "S_OK";
            case DXGI_ERROR_DEVICE_REMOVED: return "DXGI_ERROR_DEVICE_REMOVED";
            case DXGI_ERROR_DEVICE_HUNG: return "DXGI_ERROR_DEVICE_HUNG";
            case DXGI_ERROR_DEVICE_RESET: return "DXGI_ERROR_DEVICE_RESET";
            case DXGI_ERROR_DRIVER_INTERNAL_ERROR: return "DXGI_ERROR_DRIVER_INTERNAL_ERROR";
            case DXGI_ERROR_INVALID_CALL: return "DXGI_ERROR_INVALID_CALL";
            case DXGI_ERROR_UNSUPPORTED: return "DXGI_ERROR_UNSUPPORTED";
            case E_OUTOFMEMORY: return "E_OUTOFMEMORY";
            case E_INVALIDARG: return "E_INVALIDARG";
            case E_NOINTERFACE: return "E_NOINTERFACE";
            case E_FAIL: return "E_FAIL";
            default: return "UNMAPPED_HRESULT";
            }
        }
    }

    void InitializeApiValidation() noexcept
    {
        std::call_once(validationAttempt, [] {
            Microsoft::WRL::ComPtr<ID3D12Debug> debug;
            const HRESULT hr = D3D12GetDebugInterface(IID_PPV_ARGS(&debug));
            if (SUCCEEDED(hr)) debug->EnableDebugLayer();
            fprintf(stderr, "[DX12-DIAG] optional-debug-layer=%s HRESULT=0x%08X (no installation attempted)\n",
                SUCCEEDED(hr) ? "enabled" : "unavailable", static_cast<unsigned int>(hr));
            fflush(stderr);
        });
    }

    void RegisterDevice(ID3D12Device* device) noexcept
    {
        std::lock_guard<std::mutex> lock(deviceMutex);
        currentDevice = device;
        fprintf(stderr, "[DX12-DIAG] device.registered=%s\n", device ? "yes" : "no");
        if (device) {
            D3D12_FEATURE_DATA_D3D12_OPTIONS options = {};
            const HRESULT hr = device->CheckFeatureSupport(D3D12_FEATURE_D3D12_OPTIONS, &options, sizeof(options));
            fprintf(stderr, "[DX12-DIAG] CheckFeatureSupport(D3D12_OPTIONS)=0x%08X ResourceBindingTier=%u ResourceHeapTier=%u\n",
                static_cast<unsigned int>(hr), static_cast<unsigned int>(options.ResourceBindingTier), static_cast<unsigned int>(options.ResourceHeapTier));
            D3D12_FEATURE_DATA_D3D12_OPTIONS3 casting = {};
            const HRESULT castingHr = device->CheckFeatureSupport(D3D12_FEATURE_D3D12_OPTIONS3, &casting, sizeof(casting));
            fprintf(stderr, "[DX12-DIAG] CheckFeatureSupport(D3D12_OPTIONS3)=0x%08X CastingFullyTypedFormatSupported=%u\n",
                static_cast<unsigned int>(castingHr), static_cast<unsigned int>(casting.CastingFullyTypedFormatSupported));
            for (auto requested : {D3D_SHADER_MODEL_6_0, D3D_SHADER_MODEL_5_1}) {
                D3D12_FEATURE_DATA_SHADER_MODEL model = {requested};
                const HRESULT modelHr = device->CheckFeatureSupport(D3D12_FEATURE_SHADER_MODEL, &model, sizeof(model));
                fprintf(stderr, "[DX12-DIAG] CheckFeatureSupport(SHADER_MODEL requested=0x%X)=0x%08X returned=0x%X (returned valid only on success)\n",
                    static_cast<unsigned>(requested), static_cast<unsigned>(modelHr), static_cast<unsigned>(model.HighestShaderModel));
            }
        }
        fflush(stderr);
    }

    void ClearDevice(ID3D12Device* device) noexcept
    {
        std::lock_guard<std::mutex> lock(deviceMutex);
        if (currentDevice.Get() == device) currentDevice.Reset();
    }

    void Step(const char* name) noexcept
    {
        currentStep = name;
        fprintf(stderr, "[DX12-DIAG] stage=%s\n", name);
        fflush(stderr);
    }

    void AfterCall(const char* operation, const char* file, int line)
    {
        Microsoft::WRL::ComPtr<ID3D12Device> device;
        { std::lock_guard<std::mutex> lock(deviceMutex); device = currentDevice; }
        if (!device) return;
        DrainMessages(device.Get());
        const HRESULT reason = device->GetDeviceRemovedReason();
        fprintf(stderr, "[DX12-DIAG] checkpoint=%s GetDeviceRemovedReason=0x%08X\n", operation, static_cast<unsigned int>(reason));
        fflush(stderr);
        if (FAILED(reason)) {
            const std::string query = std::string("GetDeviceRemovedReason immediately after ") + operation;
            ReportFailure(reason, query.c_str(), file, line);
            (DX::ThrowIfFailed)(reason);
        }
    }

    void ViewInfo(const char* operation, ID3D12Resource* resource, UINT format, UINT dimension) noexcept
    {
        D3D12_RESOURCE_DESC desc = {}; if (resource) desc = resource->GetDesc();
        fprintf(stderr, "[DX12-DIAG] view=%s resourceFormat=%u viewFormat=%u viewDimension=%u resourceFlags=0x%X\n",
            operation, static_cast<unsigned>(desc.Format), format, dimension, static_cast<unsigned>(desc.Flags));
        fflush(stderr);
    }

    Failure ReportFailure(HRESULT hr, const char* expression, const char* file, int line) noexcept
    {
        // Keep a strong reference while querying, including errors reported by
        // a worker thread while the renderer is tearing down its device.
        Microsoft::WRL::ComPtr<ID3D12Device> device;
        {
            std::lock_guard<std::mutex> lock(deviceMutex);
            device = currentDevice;
        }
        fprintf(stderr, "[DX12-DIAG] failure=0x%08X (%s) stage=%s thread=%lu\n"
            "[DX12-DIAG] call=%s\n[DX12-DIAG] source=%s:%d\n",
            static_cast<unsigned int>(hr), HResultName(hr), currentStep, GetCurrentThreadId(), expression, file, line);
        if (!device) {
            fprintf(stderr, "[DX12-DIAG] GetDeviceRemovedReason=UNAVAILABLE (no live registered ID3D12Device)\n");
            fflush(stderr);
            return {false, S_OK};
        }
        const HRESULT reason = device->GetDeviceRemovedReason();
        fprintf(stderr, "[DX12-DIAG] GetDeviceRemovedReason=0x%08X (%s)\n",
            static_cast<unsigned int>(reason), HResultName(reason));
        fflush(stderr);
        DrainMessages(device.Get());
        fflush(stderr);
        return {true, reason};
    }
}
#endif
