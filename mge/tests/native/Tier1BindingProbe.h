// GPU checks for holes, tails, table isolation, compute coexistence and empty-table reuse.
// Included only by the standalone native lifecycle executable.
static void VerifyTier1Bindings(DeviceResources& device, Texture& source)
{
    auto heaps = device.GetGraphicsHeaps();
    auto context = device.GetCommandContext();
    Texture destination(SurfaceType::Texture, TextureDimension::Texture2D, 8, 8, 1, 1, MGSurfaceFormat::Color);
    destination.AllowUAV(); destination.Create(&device);
    heaps->Prepare(0);

    // Compute descriptors retain their original variable-length allocation.
    heaps->CopySRVUAVToShader(destination.GetUAV(0), 0);
    const auto output = heaps->GetGpuHandleAtSlot(0);
    const auto compute = heaps->ApplySRVsToShader();
    const auto srvIncrement = device.GetD3DDevice()->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
    if (compute.ptr != output.ptr || heaps->GetGpuHandleAtSlot(0).ptr != compute.ptr + srvIncrement)
        throw std::runtime_error("Tier 1 padding changed the compute allocation");

    // Slot 15 is live; the preceding 15 entries must be valid null descriptors.
    heaps->CopySRVUAVToShader(source.GetSRV(), 15);
    const auto sparse = heaps->ApplySRVsToShader(true);
    if (heaps->GetGpuHandleAtSlot(0).ptr != sparse.ptr + GraphicsTextureSlots * srvIncrement)
        throw std::runtime_error("Sparse graphics table did not reserve all 16 slots");
    const auto empty = heaps->ApplySRVsToShader(true);
    if (empty.ptr != sparse.ptr + GraphicsTextureSlots * srvIncrement)
        throw std::runtime_error("Adjacent graphics tables overlapped");
    for (int i = 0; i < 150; ++i)
        if (heaps->ApplySRVsToShader(true).ptr != empty.ptr)
            throw std::runtime_error("Empty SRV tables were not reused in the frame");

    const auto samplers = heaps->ApplySamplersToShader();
    for (int i = 0; i < 150; ++i)
        if (heaps->ApplySamplersToShader().ptr != samplers.ptr)
            throw std::runtime_error("Empty sampler tables exhausted the 2048-entry heap");
    auto sampler = heaps->CreateSamplerHandle();
    D3D12_SAMPLER_DESC samplerDesc = {};
    samplerDesc.Filter = D3D12_FILTER_MIN_MAG_MIP_POINT;
    samplerDesc.AddressU = samplerDesc.AddressV = samplerDesc.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    samplerDesc.ComparisonFunc = D3D12_COMPARISON_FUNC_ALWAYS;
    samplerDesc.MaxAnisotropy = 1; samplerDesc.MaxLOD = D3D12_FLOAT32_MAX;
    device.GetD3DDevice()->CreateSampler(&samplerDesc, sampler);
    heaps->CopySamplerToShader(sampler, 15);
    const auto sparseSamplers = heaps->ApplySamplersToShader();
    const auto samplerIncrement = device.GetD3DDevice()->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER);
    if (sparseSamplers.ptr != samplers.ptr + GraphicsTextureSlots * samplerIncrement)
        throw std::runtime_error("Sampler graphics tables did not reserve 16 descriptors");

    // Reuse the preserved builtin mip kernel to read every sparse-table entry
    // and then an empty table entry. This detects uninitialized holes and stale
    // descriptors from the previous table, including its last live slot.
    for (UINT index = 0; index < GraphicsTextureSlots + 1; ++index) {
        context->Reset(0); auto cmd = context->GetCommandList();
        std::vector<D3D12_RESOURCE_BARRIER> barriers;
        source.Transition(barriers, cmd, D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE);
        destination.Transition(barriers, cmd, D3D12_RESOURCE_STATE_UNORDERED_ACCESS);
        cmd->SetComputeRootSignature(context->m_generateMipRootSig.Get());
        cmd->SetPipelineState(context->m_generatePipelinePSO.Get());
        ID3D12DescriptorHeap* heap = heaps->GetSRVShaderHeap(); cmd->SetDescriptorHeaps(1, &heap);
        struct { float x, y; uint32_t level; } constants{1.f / 8, 1.f / 8, 0};
        cmd->SetComputeRoot32BitConstants(0, 3, &constants, 0);
        D3D12_GPU_DESCRIPTOR_HANDLE input = index < GraphicsTextureSlots ? sparse : empty;
        input.ptr += (index < GraphicsTextureSlots ? index : 15) * srvIncrement;
        cmd->SetComputeRootDescriptorTable(1, input);
        cmd->SetComputeRootDescriptorTable(2, output);
        cmd->Dispatch(1, 1, 1);
        context->Close(); device.WaitForGpu();
        std::vector<uint32_t> pixels(64);
        destination.GetData(&device, 0, 0, 0, 0, 8, 8, 1, reinterpret_cast<uint8_t*>(pixels.data()), pixels.size() * 4);
        const uint32_t expected = index == 15 ? 0xff804020u : 0u;
        for (auto pixel : pixels)
            if (pixel != expected) throw std::runtime_error("Tier 1 graphics descriptor hole/tail sampled stale data");
    }
    destination.FreeDescriptors(&device); device.WaitForGpu();
    puts("Tier 1 bindings: bounded root creation, all 16 sparse/null GPU entries, isolated tables, sampler capacity reuse and compute allocation passed.");
}
