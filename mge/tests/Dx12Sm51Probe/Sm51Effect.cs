using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

// This is a fixed-schema test fixture, not a replacement general Effect compiler.
internal static class Sm51Effect
{
    public static Effect Create(GraphicsDevice device)
    {
        using var stream = new MemoryStream();
        using var w = new BinaryWriter(stream);
        w.Write(0x5846474d); w.Write((byte)11); w.Write((byte)2); w.Write(0x51a07);
        w.Write(2); // two independently bound stage constant buffers
        Buffer("VSGlobals", 0); Buffer("PSGlobals", 1);
        w.Write(2); Shader(true); Shader(false);
        w.Write(3); Parameter("ScaleOffset", false); Parameter("Tint", false); Parameter("DataTexture", true);
        w.Write(1); w.Write("SM51"); w.Write(0); // technique, annotations
        w.Write(1); w.Write("Draw"); w.Write(0); w.Write(0); w.Write(1); // pass, VS, PS
        w.Write(false); w.Write(false); w.Write(false); // explicit draw states set by test
        w.Write(0x5846474d);
        var effect = new Effect(device, stream.ToArray());
        effect.Parameters["ScaleOffset"].SetValue(new Vector4(1, 1, 0, 0));
        effect.Parameters["Tint"].SetValue(Vector4.One);
        return effect;

        void Buffer(string name, int parameter)
        { w.Write(name); w.Write((short)16); w.Write(1); w.Write(parameter); w.Write((ushort)0); }
        void Shader(bool vertex)
        {
            byte[] bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "shaders", vertex ? "vs.cso" : "ps.cso"));
            w.Write(vertex); w.Write("Probe.hlsl"); w.Write(vertex ? "VS" : "PS");
            w.Write(bytes.Length + 12); w.Write(0xB00B00); w.Write(vertex ? -1 : 0); w.Write(vertex ? -1 : 0); w.Write(bytes);
            w.Write((byte)(vertex ? 0 : 1));
            if (!vertex) { w.Write((byte)0); w.Write((byte)0); w.Write((byte)0); w.Write(false); w.Write("DataSampler"); w.Write((byte)2); }
            w.Write((byte)1); w.Write((byte)(vertex ? 0 : 1));
            w.Write((byte)(vertex ? 3 : 0));
            if (vertex) for (byte usage = 0; usage < 3; ++usage) { w.Write(""); w.Write(usage); w.Write((byte)0); w.Write((short)0); }
        }
        void Parameter(string name, bool texture)
        {
            w.Write((byte)(texture ? EffectParameterClass.Object : EffectParameterClass.Vector));
            w.Write((byte)(texture ? EffectParameterType.Texture2D : EffectParameterType.Single));
            w.Write(name); w.Write(""); w.Write(0); w.Write((byte)1); w.Write((byte)(texture ? 1 : 4));
            w.Write(0); w.Write(0);
            if (!texture) for (int i = 0; i < 4; ++i) w.Write(0f);
        }
    }
}
