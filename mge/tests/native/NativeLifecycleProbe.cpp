#include "directx12.h"
#include "DeviceResources.h"
#include "CommandContext.h"
#include "Texture.h"
#include <chrono>
#include <Psapi.h>
#include <cstdio>
using namespace Graphics;
using Microsoft::WRL::ComPtr;
static void Check(HRESULT hr) { if(FAILED(hr))throw std::runtime_error("D3D12 regression operation failed"); }
static void Sample(const char* stage,double milliseconds=0) {
    PROCESS_MEMORY_COUNTERS_EX memory{}; memory.cb=sizeof(memory);
    K32GetProcessMemoryInfo(GetCurrentProcess(),reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&memory),sizeof(memory));
    printf("{\"stage\":\"%s\",\"ws\":%llu,\"private\":%llu,\"milliseconds\":%.3f}\n",stage,
        static_cast<unsigned long long>(memory.WorkingSetSize),static_cast<unsigned long long>(memory.PrivateUsage),milliseconds);
}
static void VerifyMips(DeviceResources& device,Texture& texture,uint32_t expected) {
    for(UINT level=1;level<texture.GetMipLevels();++level) {
        UINT width=texture.GetWidth(level),height=texture.GetHeight(level);
        std::vector<uint32_t> pixels(width*height);
        texture.GetData(&device,level,0,0,0,width,height,1,reinterpret_cast<uint8_t*>(pixels.data()),pixels.size()*4);
        for(auto pixel:pixels)if(pixel!=expected)throw std::runtime_error("Mip pixel differs from uniform input");
    }
}
#include "PagedDescriptorProbe.h"
int main() {
    try {
        for(int cycle=0;cycle<3;++cycle) {
            ComPtr<IDXGIFactory6> factory; Check(CreateDXGIFactory2(0,IID_PPV_ARGS(&factory)));
            ComPtr<IDXGIAdapter1> adapter;
            for(UINT index=0;factory->EnumAdapters1(index,&adapter)!=DXGI_ERROR_NOT_FOUND;++index) {
                DXGI_ADAPTER_DESC1 desc{}; adapter->GetDesc1(&desc);
                if(!(desc.Flags&DXGI_ADAPTER_FLAG_SOFTWARE))break;
                adapter.Reset();
            }
            if(!adapter)throw std::runtime_error("No hardware adapter");
            DeviceResources device(MGSurfaceFormat::Color,2); device.CreateDeviceResources(factory.Get(),adapter.Get());
            auto context=device.GetCommandContext(); auto heaps=device.GetGraphicsHeaps();
            Sample("device.ready");
            Texture texture(SurfaceType::Texture,TextureDimension::Texture2D,16,16,1,5,MGSurfaceFormat::Color);
            texture.Create(&device);
            std::vector<uint32_t> pixels(16*16,0xff804020);
            texture.SetData(&device,0,reinterpret_cast<uint8_t*>(pixels.data()),pixels.size()*4,16*4);
            Sample("mip.before");
            auto begin=std::chrono::steady_clock::now(); context->GenerateMipmap(&texture);
            Sample("mip.first.outsideDraw",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count());
            VerifyMips(device,texture,0xff804020);
            for(unsigned frame=0;frame<6;++frame) {
                heaps->Prepare(frame%2); context->Reset(frame%2);
                begin=std::chrono::steady_clock::now(); context->GenerateMipmap(&texture);
                context->Close(); device.WaitForGpu();
                Sample("mip.repeated.insideDraw",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count());
                VerifyMips(device,texture,0xff804020);
            }
#ifdef ENGINE_DX12_PAGED_CPU
            VerifyPagedDescriptors(device,texture);
#endif
            std::vector<int32_t> indices;
            Sample("query.before");
            begin=std::chrono::steady_clock::now();
            for(int i=0;i<1024;++i) { int index=heaps->GetQueryIndex(); if(index<0)throw std::runtime_error("Query capacity decreased"); indices.push_back(index); }
            if(heaps->GetQueryIndex()!=-1)throw std::runtime_error("Query capacity unexpectedly changed");
            Sample("query.capacity.ready",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count());
            auto properties=CD3DX12_HEAP_PROPERTIES(D3D12_HEAP_TYPE_READBACK);
            auto desc=CD3DX12_RESOURCE_DESC::Buffer(8); ComPtr<ID3D12Resource> readback;
            Check(device.GetD3DDevice()->CreateCommittedResource(&properties,D3D12_HEAP_FLAG_NONE,&desc,
                D3D12_RESOURCE_STATE_COPY_DEST,nullptr,IID_PPV_ARGS(&readback)));
            context->Reset(0); auto cmd=context->GetCommandList();
            cmd->BeginQuery(heaps->GetQueryHeap(),D3D12_QUERY_TYPE_OCCLUSION,indices[0]);
            cmd->EndQuery(heaps->GetQueryHeap(),D3D12_QUERY_TYPE_OCCLUSION,indices[0]);
            cmd->ResolveQueryData(heaps->GetQueryHeap(),D3D12_QUERY_TYPE_OCCLUSION,indices[0],1,readback.Get(),0);
            context->Close(); device.WaitForGpu();
            uint64_t* count=nullptr; Check(readback->Map(0,nullptr,reinterpret_cast<void**>(&count)));
            if(*count!=0)throw std::runtime_error("Empty occlusion query did not return zero"); readback->Unmap(0,nullptr);
            for(auto index:indices)heaps->FreeQueryIndex(index);
            if(heaps->GetQueryIndex()!=indices[0])throw std::runtime_error("Query reuse failed");
            heaps->FreeQueryIndex(indices[0]);
            texture.FreeDescriptors(&device); device.WaitForGpu();
            Sample("cycle.complete");
        }
        Sample("devices.released"); puts("Native lifecycle: mip inside/outside Draw, exact pixels, query capacity/result/reuse, 3 device lifetimes passed.");
        return 0;
    } catch(const std::exception& error) { fprintf(stderr,"%s\n",error.what()); return 1; }
}
