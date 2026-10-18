"""Verify native ABI export identity and exact bytes for all six official builtin effects."""
import argparse
import ctypes
import hashlib
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('control', type=Path)
parser.add_argument('candidate', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()

def exports(path):
    data = path.read_bytes()
    pe, = struct.unpack_from('<I', data, 0x3c)
    assert data[pe:pe+4] == b'PE\0\0'
    machine, count = struct.unpack_from('<HH', data, pe+4)
    optional_size, = struct.unpack_from('<H', data, pe+20)
    optional = pe+24
    assert machine == 0x8664 and struct.unpack_from('<H', data, optional)[0] == 0x20b
    sections = [struct.unpack_from('<IIII', data, optional+optional_size+i*40+8) for i in range(count)]
    def offset(rva):
        for virtual_size, virtual_address, raw_size, raw_offset in sections:
            if virtual_address <= rva < virtual_address + max(virtual_size, raw_size):
                return raw_offset + rva-virtual_address
        raise ValueError(f'Invalid RVA {rva:x}')
    def string(rva):
        start = offset(rva)
        return data[start:data.index(b'\0', start)].decode('ascii')
    export_rva, export_size = struct.unpack_from('<II', data, optional+112)
    base, functions, names, function_rva, names_rva, ordinals_rva = struct.unpack_from('<IIIIII', data, offset(export_rva)+16)
    table = {}
    for i in range(names):
        name_rva, = struct.unpack_from('<I', data, offset(names_rva)+4*i)
        ordinal, = struct.unpack_from('<H', data, offset(ordinals_rva)+2*i)
        table[ordinal] = string(name_rva)
    result = []
    for i in range(functions):
        target, = struct.unpack_from('<I', data, offset(function_rva)+4*i)
        if target:
            result.append({'name': table.get(i), 'ordinal': base+i,
                'forwarder': string(target) if export_rva <= target < export_rva+export_size else None})
    return result

def effects(path):
    library = ctypes.WinDLL(str(path.resolve()))
    get = library.MGG_EffectResource_GetBytecode
    get.restype = None
    get.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_int)]
    result = {}
    for name in ('AlphaTestEffect', 'BasicEffect', 'DualTextureEffect', 'EnvironmentMapEffect', 'SkinnedEffect', 'SpriteEffect'):
        address, size = ctypes.c_void_p(), ctypes.c_int()
        get(name.encode(), ctypes.byref(address), ctypes.byref(size))
        assert address.value and 0 < size.value < 16*1024*1024
        result[name] = {'bytes': size.value, 'sha256': hashlib.sha256(ctypes.string_at(address, size.value)).hexdigest()}
    return result

control_exports, candidate_exports = exports(args.control), exports(args.candidate)
assert control_exports == candidate_exports, 'Native export ABI changed'
control_effects, candidate_effects = effects(args.control), effects(args.candidate)
assert control_effects == candidate_effects, 'Builtin shader bytecode changed'
report = {'control': str(args.control), 'candidate': str(args.candidate),
    'controlSha256': hashlib.sha256(args.control.read_bytes()).hexdigest(),
    'candidateSha256': hashlib.sha256(args.candidate.read_bytes()).hexdigest(),
    'exportCount': len(control_exports), 'exports': candidate_exports, 'effects': candidate_effects}
args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f'PASS: {len(control_exports)} native exports and six exact builtin shader bytecode arrays')
