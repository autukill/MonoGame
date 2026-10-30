"""Verify the fixed Effect ABI against FXC output, not just requested profiles."""
from pathlib import Path
import re
import struct
import sys

root = Path(sys.argv[1])
for name, stage in (("vs", 1), ("ps", 0), ("mips", 5)):
    data = (root / f"{name}.cso").read_bytes()
    assert data[:4] == b"DXBC"
    count = struct.unpack_from("<I", data, 28)[0]
    parts = {}
    for i in range(count):
        offset = struct.unpack_from("<I", data, 32 + 4 * i)[0]
        tag, size = struct.unpack_from("<4sI", data, offset)
        parts[tag] = data[offset + 8:offset + 8 + size]
    assert b"DXIL" not in parts and b"SHEX" in parts
    assert struct.unpack_from("<I", parts[b"SHEX"])[0] == (stage << 16 | 0x51)
    print(f"PASS {name}: encoded SM5.1 DXBC, stage={stage}, {len(data)} bytes")

for shader, buffer, parameter in (("vs", "VSGlobals", "ScaleOffset"), ("ps", "PSGlobals", "Tint")):
    text = (root / f"{shader}.asm").read_text()
    assert re.search(rf"cbuffer\s+{buffer}\b", text)
    assert re.search(rf"float4\s+{parameter}\s*;[^\n]*Offset:\s*0\s+Size:\s*16", text)
    assert re.search(rf"{buffer}\s+cbuffer\s+NA\s+NA\s+CB0\s+cb0\s+1", text)
ps = (root / "ps.asm").read_text()
assert re.search(r"DataTexture\s+texture\s+float4\s+2d\s+T0\s+t0\s+1", ps)
assert re.search(r"DataSampler\s+sampler\s+NA\s+NA\s+S0\s+s0\s+1", ps)
header = (root / "GenerateMips_SM51.h").read_text()
body = re.search(r"GenerateMips_main\[\]\s*=\s*\{(.*?)\};", header, re.S)[1]
values = re.findall(r"0x[0-9a-fA-F]+|\d+", body)
assert bytes(int(v, 0) if v.startswith("0x") else int(v) for v in values) == (root / "mips.cso").read_bytes()
print("PASS fixed Effect cbuffer/resource ABI and native compute header identity")
