// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to the terms and conditions defined in
// file 'LICENSE.txt', which is part of this source code package.
#pragma once

// Included after the DX12 declarations. These hooks exist only in a separately
// built diagnostic runtime, never in the maintained release payload.
#if defined(MGE_DX12_STARTUP_DIAGNOSTICS) && !defined(_GAMING_XBOX)
namespace DX::StartupDiagnostics {
    struct Failure { bool deviceAvailable; HRESULT removedReason; };
    void RegisterDevice(ID3D12Device* device) noexcept;
    void ClearDevice(ID3D12Device* device) noexcept;
    void Step(const char* name) noexcept;
    void InitializeApiValidation() noexcept;
    void AfterCall(const char* operation, const char* file, int line);
    void ViewInfo(const char* operation, ID3D12Resource* resource, UINT format, UINT dimension) noexcept;
    Failure ReportFailure(HRESULT hr, const char* expression, const char* file, int line) noexcept;
}
namespace DX {
    inline void ThrowIfFailedAt(HRESULT hr, const char* expression, const char* file, int line)
    {
        if (FAILED(hr)) {
            StartupDiagnostics::ReportFailure(hr, expression, file, line);
            ThrowIfFailed(hr);
        }
    }
}
#define ThrowIfFailed(expression) ThrowIfFailedAt((expression), #expression, __FILE__, __LINE__)
#define MGE_DX12_STEP(name) DX::StartupDiagnostics::Step(name)
#define MGE_DX12_VALIDATE_API() DX::StartupDiagnostics::InitializeApiValidation()
#define MGE_DX12_AFTER(operation) DX::StartupDiagnostics::AfterCall(operation, __FILE__, __LINE__)
#define MGE_DX12_VIEW(operation, resource, format, dimension) DX::StartupDiagnostics::ViewInfo(operation, resource, format, dimension)
#define MGE_DX12_REGISTER(device) DX::StartupDiagnostics::RegisterDevice(device)
#define MGE_DX12_CLEAR(device) DX::StartupDiagnostics::ClearDevice(device)
#define MGE_DX12_CHECK(expression) DX::ThrowIfFailed(expression)
#define MGE_DX12_REPORT(hr, expression) DX::StartupDiagnostics::ReportFailure((hr), (expression), __FILE__, __LINE__)
#else
#define MGE_DX12_STEP(name) ((void)0)
#define MGE_DX12_VALIDATE_API() ((void)0)
#define MGE_DX12_AFTER(operation) ((void)0)
#define MGE_DX12_VIEW(operation, resource, format, dimension) ((void)0)
#define MGE_DX12_REGISTER(device) ((void)0)
#define MGE_DX12_CLEAR(device) ((void)0)
#define MGE_DX12_CHECK(expression) ((void)(expression))
#define MGE_DX12_REPORT(hr, expression) ((void)0)
#endif
