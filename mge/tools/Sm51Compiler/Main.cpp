// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to LICENSE.txt. Offline compiler helper; never loaded by a game.
#include <windows.h>
#include <d3d12.h>
#include <d3d12shader.h>
#include <d3dcompiler.h>
#include <wrl/client.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
using Microsoft::WRL::ComPtr;
static void Check(HRESULT hr) { if (FAILED(hr)) { std::ostringstream s; s<<"SM5.1 helper HRESULT=0x"<<std::hex<<static_cast<unsigned>(hr); throw std::runtime_error(s.str()); } }
static std::string Utf8(const wchar_t* value) {
    int size=WideCharToMultiByte(CP_UTF8,0,value,-1,nullptr,0,nullptr,nullptr);
    std::string result(size,'\0'); WideCharToMultiByte(CP_UTF8,0,value,-1,result.data(),size,nullptr,nullptr); result.pop_back(); return result;
}
static const char* Dimension(D3D_SRV_DIMENSION d) {
    switch(d) {case D3D_SRV_DIMENSION_TEXTURE2D:return "2d";case D3D_SRV_DIMENSION_TEXTURE2DARRAY:return "2darray";
    case D3D_SRV_DIMENSION_TEXTURE3D:return "3d";case D3D_SRV_DIMENSION_TEXTURECUBE:return "cube";
    default:throw std::runtime_error("Unsupported SM5.1 MGFX texture dimension");}
}
int wmain(int argc,wchar_t** argv) {
    try {
        if(argc!=6)throw std::runtime_error("usage: mgfxc-sm51 SOURCE ENTRY PROFILE OUTPUT DEBUG(0/1)");
        std::string entry=Utf8(argv[2]),profile=Utf8(argv[3]);
        if(profile!="vs_5_1"&&profile!="ps_5_1")throw std::runtime_error("Expected vs_5_1 or ps_5_1");
        std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary); if(!in)throw std::runtime_error("Cannot open preprocessed shader");
        std::string source((std::istreambuf_iterator<char>(in)),{});
        UINT flags=D3DCOMPILE_PACK_MATRIX_COLUMN_MAJOR;
        flags|=wcscmp(argv[5],L"1")==0?D3DCOMPILE_DEBUG|D3DCOMPILE_SKIP_OPTIMIZATION:D3DCOMPILE_OPTIMIZATION_LEVEL3;
        ComPtr<ID3DBlob> code,errors;
        HRESULT hr=D3DCompile(source.data(),source.size(),Utf8(argv[1]).c_str(),nullptr,nullptr,entry.c_str(),profile.c_str(),flags,0,&code,&errors);
        if(errors)std::cerr.write(static_cast<const char*>(errors->GetBufferPointer()),errors->GetBufferSize());
        Check(hr);
        ComPtr<ID3D12ShaderReflection> reflection;
        Check(D3DReflect(code->GetBufferPointer(),code->GetBufferSize(),IID_PPV_ARGS(&reflection)));
        D3D12_SHADER_DESC desc{};Check(reflection->GetDesc(&desc));
        std::ostringstream text;
        // Emit the compiler's existing reflection interchange, using API-derived
        // offsets/types/bindings rather than parsing FXC disassembly formatting.
        text<<"; Input signature:\n";
        for(UINT i=0;i<desc.InputParameters;++i) {
            D3D12_SIGNATURE_PARAMETER_DESC input{};Check(reflection->GetInputParameterDesc(i,&input));
            if(input.SystemValueType!=D3D_NAME_UNDEFINED)continue;
            text<<"; "<<input.SemanticName<<" "<<input.SemanticIndex<<" xyzw "<<input.Register<<" NONE float xyzw\n";
        }
        text<<"; Output signature:\n";
        if(desc.ConstantBuffers>1)throw std::runtime_error("DX12 MGFX supports one b0 constant buffer per shader stage");
        for(UINT i=0;i<desc.ConstantBuffers;++i) {
            auto buffer=reflection->GetConstantBufferByIndex(i);D3D12_SHADER_BUFFER_DESC b{};Check(buffer->GetDesc(&b));
            text<<"; cbuffer "<<b.Name<<"\n; {\n";
            for(UINT j=0;j<b.Variables;++j) {
                auto variable=buffer->GetVariableByIndex(j);D3D12_SHADER_VARIABLE_DESC v{};Check(variable->GetDesc(&v));
                D3D12_SHADER_TYPE_DESC t{};Check(variable->GetType()->GetDesc(&t));
                if(t.Members || t.Class==D3D_SVC_MATRIX_ROWS || t.Class>D3D_SVC_MATRIX_COLUMNS)
                    throw std::runtime_error(std::string("Unsupported SM5.1 native constant layout: ")+v.Name);
                const char* type=t.Type==D3D_SVT_FLOAT?"float":t.Type==D3D_SVT_BOOL?"bool":t.Type==D3D_SVT_INT?"int":t.Type==D3D_SVT_UINT?"uint":nullptr;
                if(!type || (t.Type!=D3D_SVT_FLOAT&&(t.Rows!=1||t.Columns!=1)))throw std::runtime_error("Unsupported native constant type");
                text<<"; "<<type;
                if(t.Rows>1)text<<t.Rows<<"x"<<t.Columns;else if(t.Columns>1)text<<t.Columns;
                text<<" "<<v.Name;if(t.Elements)text<<"["<<t.Elements<<"]";
                text<<"; ; Offset: "<<v.StartOffset<<"\n";
            }
            text<<"; } "<<b.Name<<"; ; Offset: 0 Size: "<<b.Size<<"\n";
        }
        for(UINT i=0;i<desc.BoundResources;++i) {
            D3D12_SHADER_INPUT_BIND_DESC r{};Check(reflection->GetResourceBindingDesc(i,&r));
            if(r.Space || r.BindCount!=1)throw std::runtime_error("Native MGFX requires space0 and individual resource bindings");
            if(r.Type==D3D_SIT_CBUFFER) {if(r.BindPoint!=0)throw std::runtime_error("Native MGFX constant buffer must bind at b0");continue;}
            if(r.BindPoint>=16)throw std::runtime_error("Native MGFX texture/sampler slots are 0 through 15");
            if(r.Type==D3D_SIT_TEXTURE)text<<"; "<<r.Name<<" texture f32 "<<Dimension(r.Dimension)<<" T"<<r.BindPoint<<" t"<<r.BindPoint<<" 1\n";
            else if(r.Type==D3D_SIT_SAMPLER)text<<"; "<<r.Name<<" sampler NA NA S"<<r.BindPoint<<" s"<<r.BindPoint<<" 1\n";
            else throw std::runtime_error("Unsupported native graphics shader resource type");
        }
        ComPtr<ID3DBlob> stripped;
        UINT strip=D3DCOMPILER_STRIP_REFLECTION_DATA|D3DCOMPILER_STRIP_TEST_BLOBS;
        if(wcscmp(argv[5],L"1")!=0)strip|=D3DCOMPILER_STRIP_DEBUG_INFO;
        Check(D3DStripShader(code->GetBufferPointer(),code->GetBufferSize(),strip,&stripped));
        std::ofstream out(std::filesystem::path(argv[4]),std::ios::binary);if(!out)throw std::runtime_error("Cannot write shader");
        out.write(static_cast<const char*>(stripped->GetBufferPointer()),stripped->GetBufferSize());if(!out)throw std::runtime_error("Shader write failed");
        std::cout<<text.str();return 0;
    } catch(const std::exception& e) {std::cerr<<e.what()<<"\n";return 1;}
}
