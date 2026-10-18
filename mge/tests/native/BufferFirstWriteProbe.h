// Compiled only into the native regression executable, never the shipping DLL.
#include <array>
#include <cstring>
void VerifyBufferFirstWrite(Graphics::DeviceResources* resources)
{
    for (auto type : { MGBufferType::Vertex, MGBufferType::Index })
    for (bool firstDiscard : { true, false })
    for (int stride : { 4, 8 })
    {
        MGG_GraphicsDevice device{}; device.resources=resources;
        MGG_Buffer* buffer=MGG_Buffer_Create(&device,type,true,128*1024+4);
        struct Cleanup {
            MGG_GraphicsDevice& device; MGG_Buffer*& current;
            ~Cleanup() { delete current; for(auto b:device.discarded)delete b; }
        } cleanup{device,buffer};
        if(buffer->dataSize!=128*1024+4 || buffer->actualSize!=192*1024 || buffer->m_alloc->GetSize()!=192*1024)
            throw std::runtime_error("Upload physical capacity must use existing placement alignment without changing logical length");
        ComPtr<ID3D12Resource> original=buffer->m_res;
        std::array<uint32_t,4> first{0x01020304,0xabcdef12,0x76543210,0x55aa33cc};
        std::array<uint32_t,4> second{0x11223344,0xfedcba98,0x10203040,0xaa55cc33};
        auto verify=[&](ID3D12Resource* resource,int offset,const std::array<uint32_t,4>& words) {
            void* mapped=nullptr; D3D12_RANGE range{(SIZE_T)offset,(SIZE_T)(offset+3*stride+4)};
            DX::ThrowIfFailed(resource->Map(0,&range,&mapped));
            bool matches=true;
            for(int i=0;i<4;++i)if(std::memcmp(static_cast<uint8_t*>(mapped)+offset+i*stride,&words[i],4)!=0)matches=false;
            D3D12_RANGE unchanged{0,0}; resource->Unmap(0,&unchanged);
            if(!matches)throw std::runtime_error("Upload write offset/stride or prior resource contents changed");
        };
        MGG_Buffer_SetData(&device,buffer,12,reinterpret_cast<mgbyte*>(first.data()),4,stride,4,firstDiscard);
        if(buffer->m_res.Get()!=original.Get() || !device.discarded.empty())
            throw std::runtime_error("First upload write unnecessarily renamed a virgin resource");
        verify(original.Get(),12,first);
        MGG_Buffer_SetData(&device,buffer,64,reinterpret_cast<mgbyte*>(second.data()),4,stride,4,true);
        if(buffer->m_res.Get()==original.Get() || device.discarded.size()!=1)
            throw std::runtime_error("Later Discard did not preserve resource versioning");
        verify(original.Get(),12,first); verify(buffer->m_res.Get(),64,second);
    }
    {
        MGG_GraphicsDevice device{}; device.resources=resources;
        auto original=MGG_Buffer_Create(&device,MGBufferType::Vertex,true,65537);
        device.free.push_back(original);
        auto samePage=MGDX_FindFreeBuffer(&device,131072,D3D12_HEAP_TYPE_UPLOAD);
        if(samePage!=original || samePage->dataSize!=131072 || !device.free.empty())
            throw std::runtime_error("Same aligned upload capacity was not reused");
        device.free.push_back(samePage);
        auto nextPage=MGDX_FindFreeBuffer(&device,131073,D3D12_HEAP_TYPE_UPLOAD);
        if(nextPage==original || nextPage->actualSize!=196608 || nextPage->dataSize!=131073)
            throw std::runtime_error("Upload page boundary was not respected");
        delete nextPage; delete original;
    }
    puts("First upload write: vertex/index, Discard/NoOverwrite, offset/stride, prior contents and later rename passed.");
    puts("Upload capacity: aligned allocation bytes, logical bounds, same-page reuse and next-page growth passed.");
}
