"""Preserve the six exact builtin effects from the pinned official DX12 runtime."""
import argparse
import ctypes
import hashlib
from pathlib import Path

OFFICIAL_SHA256 = '1179b04b0aa1f983dd50e37f03d797040e35e9a3a13a50b34d7a776cf0de8ab0'
parser = argparse.ArgumentParser()
parser.add_argument('runtime', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert hashlib.sha256(args.runtime.read_bytes()).hexdigest() == OFFICIAL_SHA256, 'Wrong official native runtime'
library = ctypes.WinDLL(str(args.runtime.resolve()))
get = library.MGG_EffectResource_GetBytecode
get.restype = None
get.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_int)]
for name in ('AlphaTestEffect', 'BasicEffect', 'DualTextureEffect', 'EnvironmentMapEffect', 'SkinnedEffect', 'SpriteEffect'):
    address, size = ctypes.c_void_p(), ctypes.c_int()
    get(name.encode(), ctypes.byref(address), ctypes.byref(size))
    assert address.value and 0 < size.value < 16 * 1024 * 1024
    data = ctypes.string_at(address, size.value)
    assert data[:4] == b'MGFX'
    text = '// Exact builtin bytecode from the SHA256-pinned official MonoGame runtime.\n'
    text += f'const unsigned char {name}_dx12_mgfxo[] = {{\n'
    text += '\n'.join(','.join(str(b) for b in data[i:i+32]) + ',' for i in range(0, len(data), 32))
    text += '\n};\n'
    (args.output / f'{name}.dx12.mgfxo.h').write_text(text, encoding='utf-8', newline='\n')
