// Procedural probe only: native MGFX reflection metadata is fixed for this ABI.
#if VERTEX_STAGE
cbuffer VSGlobals : register(b0) { float4 ScaleOffset; };
struct Input { float3 Position : POSITION0; float4 Color : COLOR0; float2 UV : TEXCOORD0; };
struct Output { float4 Position : SV_Position; float4 Color : COLOR0; float2 UV : TEXCOORD0; };
Output VS(Input input) {
    Output o;
    o.Position = float4(input.Position.xy * ScaleOffset.xy + ScaleOffset.zw, input.Position.z, 1);
    o.Color = input.Color; o.UV = input.UV; return o;
}
#else
cbuffer PSGlobals : register(b0) { float4 Tint; };
Texture2D DataTexture : register(t0);
SamplerState DataSampler : register(s0);
float4 PS(float4 position : SV_Position, float4 color : COLOR0, float2 uv : TEXCOORD0) : SV_Target {
    return DataTexture.Sample(DataSampler, uv) * color * Tint;
}
#endif
