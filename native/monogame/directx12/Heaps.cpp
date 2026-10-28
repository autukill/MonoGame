// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to the terms and conditions defined in
// file 'LICENSE.txt', which is part of this source code package.

#include "directx12.h"

#include "Heaps.h"
#include "DeviceResources.h"
#include "GraphicsEnums.h"

using namespace DirectX;
using namespace DX;
using namespace Graphics;

#ifdef MGE_TIER1_BINDING_PROBE
bool Graphics::ForceTier1BindingsForProbe = false;
#endif

D3D12_CPU_DESCRIPTOR_HANDLE PagedCpuDescHeap::AllocCpuHandle() {
    const uint64_t index = m_free.empty() ? m_next : m_free.front();
    if (index >= m_limit)
        throw std::out_of_range("No more room in the CPU SRV descriptor heap");
    const size_t page = static_cast<size_t>(index / PageSize);
    if (page == m_pages.size()) {
        const auto size = static_cast<UINT>(std::min(PageSize, m_limit - page * PageSize));
        D3D12_DESCRIPTOR_HEAP_DESC desc = { D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV, size, D3D12_DESCRIPTOR_HEAP_FLAG_NONE, 0 };
        Microsoft::WRL::ComPtr<ID3D12DescriptorHeap> heap;
        ThrowIfFailed(m_device->CreateDescriptorHeap(&desc, IID_GRAPHICS_PPV_ARGS(heap.GetAddressOf())));
        m_pages.push_back(std::move(heap));
    }
    auto handle = m_pages[page]->GetCPUDescriptorHandleForHeapStart();
    handle.ptr += static_cast<SIZE_T>(index % PageSize) * m_increment;
    // Commit bookkeeping only after allocation succeeds. An exhausted/failed call
    // leaves both the next index and freed descriptors available for a retry.
    if (m_free.empty()) ++m_next;
    else m_free.pop();
    return handle;
}

void PagedCpuDescHeap::FreeCpuHandle(D3D12_CPU_DESCRIPTOR_HANDLE handle) {
    for (size_t page = 0; page < m_pages.size(); ++page) {
        const SIZE_T start = m_pages[page]->GetCPUDescriptorHandleForHeapStart().ptr;
        const SIZE_T count = std::min(PageSize, m_limit - page * PageSize);
        if (handle.ptr >= start && handle.ptr - start < count * m_increment && (handle.ptr - start) % m_increment == 0) {
            const uint64_t index = page * PageSize + (handle.ptr - start) / m_increment;
            if (index >= m_next) break;
            m_free.push(index);
            return;
        }
    }
    throw std::invalid_argument("Descriptor does not belong to this CPU SRV heap");
}


NonShaderVisibleDescHeap::NonShaderVisibleDescHeap(ID3D12Device* device, D3D12_DESCRIPTOR_HEAP_TYPE type, D3D12_DESCRIPTOR_HEAP_FLAGS flags, uint32_t size)
    : m_device(device), m_type(type), m_size(size) {
    m_increment = device->GetDescriptorHandleIncrementSize(type);

    D3D12_DESCRIPTOR_HEAP_DESC desc = { type, static_cast<UINT>(size), flags, 0 };
    MGE_DX12_CHECK(device->CreateDescriptorHeap(&desc, IID_GRAPHICS_PPV_ARGS(m_heap.ReleaseAndGetAddressOf())));
    MGE_DX12_AFTER("CreateDescriptorHeap");

    m_heapStartCPU = m_heap->GetCPUDescriptorHandleForHeapStart();
}

D3D12_CPU_DESCRIPTOR_HANDLE NonShaderVisibleDescHeap::GetCpuHandle(size_t index) const {
    if (index >= m_size)
        throw std::out_of_range("No more room in the NonShaderVisibleDescHeap");

    D3D12_CPU_DESCRIPTOR_HANDLE handle;
    handle.ptr = static_cast<SIZE_T>(m_heapStartCPU.ptr + UINT64(index) * UINT64(m_increment));
    return handle;
}

D3D12_CPU_DESCRIPTOR_HANDLE NonShaderVisibleDescHeap::AllocCpuHandle() {
    if(m_freeHandle.empty())
        return GetCpuHandle(m_firstFreeAlloc++);
    else {
        auto handle = GetCpuHandle(m_freeHandle.front());
        m_freeHandle.pop();
        return handle;
    }
}

void NonShaderVisibleDescHeap::FreeCpuHandle(D3D12_CPU_DESCRIPTOR_HANDLE handle) {
    SIZE_T index = (handle.ptr - m_heapStartCPU.ptr) / SIZE_T(m_increment);
    m_freeHandle.push(index);
}

Graphics::ShaderVisibleDescHeap::ShaderVisibleDescHeap(ID3D12Device* device, D3D12_DESCRIPTOR_HEAP_TYPE type, size_t size)
    : NonShaderVisibleDescHeap(device, type, D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE, size) {
    m_heapStartGPU = m_heap->GetGPUDescriptorHandleForHeapStart();
}

void ShaderVisibleDescHeap::WriteDescriptor(ID3D12Device* device, uint32_t offset, const D3D12_CPU_DESCRIPTOR_HANDLE desc) {
    if (offset >= m_size)
        throw std::out_of_range("Offset outside of the ShaderVisibleDescHeap");

    device->CopyDescriptorsSimple(1, GetCpuHandle(offset), desc, m_type);
}

D3D12_GPU_DESCRIPTOR_HANDLE ShaderVisibleDescHeap::GetGpuHandle(size_t index) const {
    if (index >= m_size)
        throw std::out_of_range("No more room in the ShaderVisibleDescHeap");

    D3D12_GPU_DESCRIPTOR_HANDLE handle;
    handle.ptr = static_cast<SIZE_T>(m_heapStartGPU.ptr + UINT64(index) * UINT64(m_increment));
    return handle;
}

Heaps::Heaps(ID3D12Device* device, int backBufferCount) {
    m_device = device;
    D3D12_FEATURE_DATA_D3D12_OPTIONS options = {};
    ThrowIfFailed(device->CheckFeatureSupport(D3D12_FEATURE_D3D12_OPTIONS, &options, sizeof(options)));
    m_tier1Bindings = options.ResourceBindingTier == D3D12_RESOURCE_BINDING_TIER_1;
#ifdef MGE_TIER1_BINDING_PROBE
    m_tier1Bindings = m_tier1Bindings || ForceTier1BindingsForProbe;
#endif

    m_srvHeap = std::make_unique<PagedCpuDescHeap>(device, 1 << 16);
    m_samplerHeap = std::make_unique<NonShaderVisibleDescHeap>(device, D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER, 1024);
    m_rtvHeap = std::make_unique<NonShaderVisibleDescHeap>(device, D3D12_DESCRIPTOR_HEAP_TYPE_RTV, 1024);
    m_dsvHeap = std::make_unique<NonShaderVisibleDescHeap>(device, D3D12_DESCRIPTOR_HEAP_TYPE_DSV, 1024);

    if (m_tier1Bindings) {
        D3D12_SHADER_RESOURCE_VIEW_DESC nullView = {};
        nullView.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
        nullView.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
        nullView.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
        nullView.Texture2D.MipLevels = 1;
        m_nullSrv = CreateSRVHandle(nullptr, nullView);
        m_defaultSampler = CreateSamplerHandle();
        D3D12_SAMPLER_DESC sampler = {};
        sampler.Filter = D3D12_FILTER_MIN_MAG_MIP_POINT;
        sampler.AddressU = sampler.AddressV = sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
        sampler.ComparisonFunc = D3D12_COMPARISON_FUNC_ALWAYS;
        sampler.MaxAnisotropy = 1;
        sampler.MaxLOD = D3D12_FLOAT32_MAX;
        device->CreateSampler(&sampler, m_defaultSampler);
        MGE_DX12_AFTER("CreateSampler for Tier1 default table");
    }

    for (UINT n = 0; n < backBufferCount; n++)
        m_srvShaderHeap[n] = std::make_unique<ShaderVisibleDescHeap>(device, D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV, 1 << 16);
    for (UINT n = 0; n < backBufferCount; n++)
        m_samplerShaderHeap[n] = std::make_unique<ShaderVisibleDescHeap>(device, D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER, 2048);

    D3D12_QUERY_HEAP_DESC queryHeapDesc = { D3D12_QUERY_HEAP_TYPE_OCCLUSION, 1024 };
    ThrowIfFailed(m_device->CreateQueryHeap(&queryHeapDesc, IID_GRAPHICS_PPV_ARGS(m_queryHeap.ReleaseAndGetAddressOf())));
    for (uint32_t h=0; h < 1024; h++)
        m_freeQuery.push(h);
}

Heaps::~Heaps() {}

D3D12_CPU_DESCRIPTOR_HANDLE Heaps::CreateSRVHandle(ID3D12Resource* res, D3D12_SHADER_RESOURCE_VIEW_DESC srvDesc) {
    D3D12_CPU_DESCRIPTOR_HANDLE cpuHandle = m_srvHeap->AllocCpuHandle();
    MGE_DX12_VIEW("SRV", res, srvDesc.Format, srvDesc.ViewDimension);
    m_device->CreateShaderResourceView(res, &srvDesc, cpuHandle);
    MGE_DX12_AFTER("CreateShaderResourceView");
    return cpuHandle;
}

D3D12_CPU_DESCRIPTOR_HANDLE Heaps::CreateUAVHandle(ID3D12Resource* res, D3D12_UNORDERED_ACCESS_VIEW_DESC uavDesc) {
    D3D12_CPU_DESCRIPTOR_HANDLE cpuHandle = m_srvHeap->AllocCpuHandle();
    m_device->CreateUnorderedAccessView(res, nullptr, &uavDesc, cpuHandle);
    MGE_DX12_AFTER("CreateUnorderedAccessView");
    return cpuHandle;
}

void Heaps::CopySRVUAVToShader(const D3D12_CPU_DESCRIPTOR_HANDLE srv, uint32_t slot) {
    m_srvShaderHeap[m_idx]->WriteDescriptor(m_device, m_srvShaderHeapPos + slot, srv);
    m_srvSlotUsed = std::max(m_srvSlotUsed, slot + 1);
    if (slot < GraphicsTextureSlots) m_srvWrittenMask |= 1u << slot;
}

D3D12_GPU_DESCRIPTOR_HANDLE Heaps::GetGpuHandleAtSlot(uint32_t slot) {
    return m_srvShaderHeap[m_idx]->GetGpuHandle(m_srvShaderHeapPos + slot);
}

D3D12_GPU_DESCRIPTOR_HANDLE Heaps::ApplySRVsToShader(bool graphicsTable) {
    const bool empty = m_srvSlotUsed == 0;
    if (m_tier1Bindings && graphicsTable) {
        if (empty && m_emptyGraphicsSrvs.ptr) return m_emptyGraphicsSrvs;
        if (m_srvSlotUsed > GraphicsTextureSlots) throw std::out_of_range("Graphics SRV table exceeds 16 slots");
        // Tier 1 requires every descriptor covered by the root table, including
        // holes and the unused tail, to be initialized before shader execution.
        for (uint32_t slot = 0; slot < GraphicsTextureSlots; ++slot)
            if (!(m_srvWrittenMask & (1u << slot)))
                m_srvShaderHeap[m_idx]->WriteDescriptor(m_device, m_srvShaderHeapPos + slot, m_nullSrv);
        m_srvSlotUsed = GraphicsTextureSlots;
    }
    D3D12_GPU_DESCRIPTOR_HANDLE res = m_srvShaderHeap[m_idx]->GetGpuHandle(m_srvShaderHeapPos);
    m_srvShaderHeapPos += m_srvSlotUsed;
    m_srvSlotUsed = 0;
    m_srvWrittenMask = 0;
    if (m_tier1Bindings && graphicsTable && empty) m_emptyGraphicsSrvs = res;
    return res;
}

void Heaps::CopySamplerToShader(const D3D12_CPU_DESCRIPTOR_HANDLE srv, uint32_t slot) {
    m_samplerShaderHeap[m_idx]->WriteDescriptor(m_device, m_samplerShaderHeapPos + slot, srv);
    m_samplerSlotUsed = std::max(m_samplerSlotUsed, slot + 1);
    if (slot < GraphicsTextureSlots) m_samplerWrittenMask |= 1u << slot;
}

D3D12_GPU_DESCRIPTOR_HANDLE Heaps::ApplySamplersToShader() {
    const bool empty = m_samplerSlotUsed == 0;
    if (m_tier1Bindings) {
        if (empty && m_emptyGraphicsSamplers.ptr) return m_emptyGraphicsSamplers;
        if (m_samplerSlotUsed > GraphicsTextureSlots) throw std::out_of_range("Graphics sampler table exceeds 16 slots");
        for (uint32_t slot = 0; slot < GraphicsTextureSlots; ++slot)
            if (!(m_samplerWrittenMask & (1u << slot)))
                m_samplerShaderHeap[m_idx]->WriteDescriptor(m_device, m_samplerShaderHeapPos + slot, m_defaultSampler);
        m_samplerSlotUsed = GraphicsTextureSlots;
    }
    D3D12_GPU_DESCRIPTOR_HANDLE res = m_samplerShaderHeap[m_idx]->GetGpuHandle(m_samplerShaderHeapPos);
    m_samplerShaderHeapPos += m_samplerSlotUsed;
    m_samplerSlotUsed = 0;
    m_samplerWrittenMask = 0;
    if (m_tier1Bindings && empty) m_emptyGraphicsSamplers = res;
    return res;
}

D3D12_CPU_DESCRIPTOR_HANDLE Heaps::CreateRTVHandle(ID3D12Resource* res, D3D12_RENDER_TARGET_VIEW_DESC rtvDesc) {
    D3D12_CPU_DESCRIPTOR_HANDLE cpuHandle = m_rtvHeap->AllocCpuHandle();
    m_device->CreateRenderTargetView(res, &rtvDesc, cpuHandle);
    MGE_DX12_AFTER("CreateRenderTargetView");
    return cpuHandle;
}

D3D12_CPU_DESCRIPTOR_HANDLE Heaps::CreateDSVHandle(ID3D12Resource* res, D3D12_DEPTH_STENCIL_VIEW_DESC dsvDesc) {
    D3D12_CPU_DESCRIPTOR_HANDLE cpuHandle = m_dsvHeap->AllocCpuHandle();
    MGE_DX12_VIEW("DSV", res, dsvDesc.Format, dsvDesc.ViewDimension);
    m_device->CreateDepthStencilView(res, &dsvDesc, cpuHandle);
    MGE_DX12_AFTER("CreateDepthStencilView");
    return cpuHandle;
}

int32_t Heaps::GetQueryIndex()
{
    if (m_freeQuery.empty())
    {
        // TODO: How do we alert this happened?
        return -1;
    }

    uint32_t index = m_freeQuery.front();
    m_freeQuery.pop();
    return index;
}

void Heaps::FreeQueryIndex(int32_t index)
{
    // No one better free a query twice!
    m_freeQuery.push(index);
}
