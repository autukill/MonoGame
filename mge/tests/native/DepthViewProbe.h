// Actual DSV clears followed by SRV GPU reads through the retained mip kernel.
// Included only in the standalone lifecycle executable, never the player DLL.
static void VerifyDepthViews(DeviceResources& device)
{
    auto context = device.GetCommandContext();
    auto heaps = device.GetGraphicsHeaps();
    Texture output(SurfaceType::Texture, TextureDimension::Texture2D, 8, 8, 1, 1, MGSurfaceFormat::Color);
    output.AllowUAV(); output.Create(&device);
    for (auto format : {MGDepthFormat::Depth16, MGDepthFormat::Depth24, MGDepthFormat::Depth24Stencil8}) {
        Texture depth(16, 16, format); depth.Create(&device);
        if (depth.Get()->GetDesc().Format != DepthFormatToResource[(int)format] ||
            depth.GetFormat() != DepthFormatToDXGI_FORMAT[(int)format] || !depth.GetSRV().ptr || !depth.GetDSV().ptr)
            throw std::runtime_error("Depth storage/view formats were not separated");
        for (int pass = 0; pass < 2; ++pass) {
            heaps->Prepare(0); context->Reset(0); auto cmd = context->GetCommandList();
            std::vector<D3D12_RESOURCE_BARRIER> barriers;
            depth.Transition(barriers, cmd, D3D12_RESOURCE_STATE_DEPTH_WRITE);
            cmd->ClearDepthStencilView(depth.GetDSV(), D3D12_CLEAR_FLAG_DEPTH, pass ? .75f : .25f, 0, 0, nullptr);
            depth.Transition(barriers, cmd, D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE);
            output.Transition(barriers, cmd, D3D12_RESOURCE_STATE_UNORDERED_ACCESS);
            heaps->CopySRVUAVToShader(depth.GetSRV(), 0);
            const auto input = heaps->ApplySRVsToShader();
            heaps->CopySRVUAVToShader(output.GetUAV(0), 0);
            const auto destination = heaps->ApplySRVsToShader();
            cmd->SetComputeRootSignature(context->m_generateMipRootSig.Get());
            cmd->SetPipelineState(context->m_generatePipelinePSO.Get());
            ID3D12DescriptorHeap* heap = heaps->GetSRVShaderHeap(); cmd->SetDescriptorHeaps(1, &heap);
            struct { float x, y; uint32_t level; } constants{1.f / 8, 1.f / 8, 0};
            cmd->SetComputeRoot32BitConstants(0, 3, &constants, 0);
            cmd->SetComputeRootDescriptorTable(1, input); cmd->SetComputeRootDescriptorTable(2, destination);
            cmd->Dispatch(1, 1, 1); context->Close(); device.WaitForGpu();
            std::vector<uint32_t> pixels(64);
            output.GetData(&device, 0, 0, 0, 0, 8, 8, 1, reinterpret_cast<uint8_t*>(pixels.data()), pixels.size() * 4);
            for (auto pixel : pixels) {
                const int expected = pass ? 191 : 64;
                if (abs(static_cast<int>(pixel & 255) - expected) > 1 || (pixel & 0xffffff00u) != 0xff000000u)
                    throw std::runtime_error("Depth DSV clear was not visible through its SRV");
            }
        }
        depth.FreeDescriptors(&device); device.WaitForGpu();
    }
    output.FreeDescriptors(&device); device.WaitForGpu();
    puts("Depth views: D16/D24/D24S8 typeless storage, typed views, two DSV clears and 384 GPU sampled pixels passed.");
}
