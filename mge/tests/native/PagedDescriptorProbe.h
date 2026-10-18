#ifdef ENGINE_DX12_PAGED_CPU
static void VerifyPagedDescriptors(DeviceResources& device,Texture& source) {
    auto context=device.GetCommandContext(); auto heaps=device.GetGraphicsHeaps();
    Texture second(SurfaceType::Texture,TextureDimension::Texture2D,16,16,1,1,MGSurfaceFormat::Color);
    Texture destination(SurfaceType::Texture,TextureDimension::Texture2D,8,8,1,1,MGSurfaceFormat::Color);
    second.Create(&device); destination.AllowUAV(); destination.Create(&device);
    std::vector<uint32_t> input(256,0xff204080);
    second.SetData(&device,0,reinterpret_cast<uint8_t*>(input.data()),input.size()*4,16*4);
    PagedCpuDescHeap paged(device.GetD3DDevice(),65536);
    std::vector<D3D12_CPU_DESCRIPTOR_HANDLE> handles;
    handles.reserve(65536);
    D3D12_SHADER_RESOURCE_VIEW_DESC view{};
    view.Format=DXGI_FORMAT_R8G8B8A8_UNORM; view.ViewDimension=D3D12_SRV_DIMENSION_TEXTURE2D;
    view.Shader4ComponentMapping=D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING; view.Texture2D.MipLevels=1;
    for(size_t index=0;index<65536;++index) {
        auto handle=paged.AllocCpuHandle(); handles.push_back(handle);
        device.GetD3DDevice()->CreateShaderResourceView(index%2 ? second.Get() : source.Get(),&view,handle);
    }
    bool exhausted=false;
    try { paged.AllocCpuHandle(); } catch(const std::out_of_range&) { exhausted=true; }
    if(!exhausted)throw std::runtime_error("CPU SRV capacity changed");
    for(auto index:{0u,4095u,4096u,65534u,65535u}) {
        heaps->Prepare(0); context->Reset(0); auto cmd=context->GetCommandList();
        std::vector<D3D12_RESOURCE_BARRIER> barriers;
        auto& texture=index%2 ? second : source;
        texture.Transition(barriers,cmd,D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE);
        destination.Transition(barriers,cmd,D3D12_RESOURCE_STATE_UNORDERED_ACCESS);
        heaps->CopySRVUAVToShader(handles[index],0);
        heaps->CopySRVUAVToShader(destination.GetUAV(0),1);
        cmd->SetComputeRootSignature(context->m_generateMipRootSig.Get());
        cmd->SetPipelineState(context->m_generatePipelinePSO.Get());
        ID3D12DescriptorHeap* srvHeap=heaps->GetSRVShaderHeap(); cmd->SetDescriptorHeaps(1,&srvHeap);
        struct { float x,y; uint32_t level; } constants{1.f/8,1.f/8,0};
        cmd->SetComputeRoot32BitConstants(0,3,&constants,0);
        cmd->SetComputeRootDescriptorTable(1,heaps->GetGpuHandleAtSlot(0));
        cmd->SetComputeRootDescriptorTable(2,heaps->GetGpuHandleAtSlot(1));
        cmd->Dispatch(1,1,1); heaps->ApplySRVsToShader();
        destination.Transition(barriers,cmd,D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
        context->Close(); device.WaitForGpu();
        std::vector<uint32_t> pixels(64);
        destination.GetData(&device,0,0,0,0,8,8,1,reinterpret_cast<uint8_t*>(pixels.data()),pixels.size()*4);
        for(auto pixel:pixels)if(pixel!=(index%2?0xff204080u:0xff804020u))
            throw std::runtime_error("CPU descriptor page boundary sampled the wrong texture");
    }
    for(auto index:{0u,4095u,4096u,65535u})paged.FreeCpuHandle(handles[index]);
    for(auto index:{0u,4095u,4096u,65535u})if(paged.AllocCpuHandle().ptr!=handles[index].ptr)
        throw std::runtime_error("CPU descriptor freed-slot reuse changed");
    exhausted=false;
    try { paged.AllocCpuHandle(); } catch(const std::out_of_range&) { exhausted=true; }
    if(!exhausted)throw std::runtime_error("CPU descriptor exhaustion corrupted bookkeeping");
    for(auto handle:handles)paged.FreeCpuHandle(handle);
    second.FreeDescriptors(&device); destination.FreeDescriptors(&device); device.WaitForGpu();
    puts("CPU SRV paging: 65,536 descriptors, page boundaries, exhaustion/retry, stable handles, GPU pixels and reuse passed.");
}
#endif
