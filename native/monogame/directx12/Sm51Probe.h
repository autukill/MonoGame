// Private diagnostic build only. Reject a probe that accidentally uses SM6.
#pragma once
#if defined(MGE_DX12_SM51_PROBE)
static void RequireSm51ProbeShader(const uint8_t* data, size_t bytes, bool vertex)
{
    auto word = [&](size_t offset) { UINT value; memcpy(&value, data + offset, 4); return value; };
    bool valid = false;
    if (bytes >= 32 && !memcmp(data, "DXBC", 4)) {
        const UINT count = word(28);
        if (count <= (bytes - 32) / 4) for (UINT i = 0; i < count; ++i) {
            const size_t offset = word(32 + 4 * i);
            if (offset > bytes - 8) continue;
            const UINT size = word(offset + 4);
            if (size > bytes - offset - 8) continue;
            if (!memcmp(data + offset, "DXIL", 4)) DX::ThrowIfFailed(E_INVALIDARG);
            if (size >= 4 && !memcmp(data + offset, "SHEX", 4))
                valid = word(offset + 8) == ((vertex ? 1u : 0u) << 16 | 0x51u);
        }
    }
    if (!valid) DX::ThrowIfFailed(E_INVALIDARG);
    fprintf(stderr, "[DX12-SM51-PROBE] shader=%s verified=DXBC_5_1 bytes=%zu\n", vertex ? "VS" : "PS", bytes);
    fflush(stderr);
}
#endif
