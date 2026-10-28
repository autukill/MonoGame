// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to the terms and conditions defined in
// file 'LICENSE.txt', which is part of this source code package.
#include "directx12.h"

#if defined(MGE_DX12_STARTUP_DIAGNOSTICS) && !defined(_GAMING_XBOX)
#include <mutex>

namespace DX::StartupDiagnostics {
    namespace {
        std::mutex deviceMutex;
        Microsoft::WRL::ComPtr<ID3D12Device> currentDevice;
        thread_local const char* currentStep = "not-recorded-on-this-thread";

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
            default: return "UNMAPPED_HRESULT";
            }
        }
    }

    void RegisterDevice(ID3D12Device* device) noexcept
    {
        std::lock_guard<std::mutex> lock(deviceMutex);
        currentDevice = device;
        fprintf(stderr, "[DX12-DIAG] device.registered=%s\n", device ? "yes" : "no");
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
        return {true, reason};
    }
}
#endif
