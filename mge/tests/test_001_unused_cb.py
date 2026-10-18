from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / 'native' / 'monogame'
def code(name):
    return (NATIVE / name).read_text(encoding='utf-8-sig')

class UnusedConstants(unittest.TestCase):
    def test_removed_fields_have_no_remaining_native_references(self):
        for path in NATIVE.rglob('*'):
            if path.suffix not in ('.cpp', '.h') or 'external' in path.parts: continue
            source = path.read_text(encoding='utf-8-sig')
            for field in ('m_cbOffset', 'm_cbAlloc', 'm_cbRes', 'm_cbContent'):
                self.assertNotIn(field, source, str(path))
    def test_temporary_texture_lifecycle_and_active_ring_are_preserved(self):
        context = code('directx12/CommandContext.cpp')
        self.assertIn('m_tempTextures[i] = {};', context)
        self.assertIn('m_tempTextures[i].clear();', context)
        self.assertIn('m_tempTextures[m_backBufferIndex].clear();', context)
        self.assertIn('MGG_RingBuffer', code('directx12/MGG_DX12.cpp'))
