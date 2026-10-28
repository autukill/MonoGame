"""BC7 enum parity and upload/readback boundaries; GPU checks are separate."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

class Bc7SourceTests(unittest.TestCase):
    def test_additive_enum_and_block_helpers(self):
        managed = (ROOT / 'MonoGame.Framework/Graphics/SurfaceFormat.cs').read_text()
        native = (ROOT / 'native/monogame/include/api_enums.h').read_text()
        for name, value in [('Bc7', 104), ('Bc7SRgb', 105)]:
            self.assertIn(f'{name} = {value},', managed)
            self.assertIn(f'{name} = {value},', native)
        helpers = (ROOT / 'MonoGame.Framework/Graphics/GraphicsExtensions.cs').read_text()
        self.assertEqual(helpers.count('case SurfaceFormat.Bc7:'), 3)
        self.assertEqual(helpers.count('case SurfaceFormat.Bc7SRgb:'), 3)

    def test_dx12_mapping_and_readback(self):
        mapping = (ROOT / 'native/monogame/directx12/GraphicsEnums.cpp').read_text()
        self.assertIn('return DXGI_FORMAT_BC7_UNORM;', mapping)
        self.assertIn('return DXGI_FORMAT_BC7_UNORM_SRGB;', mapping)
        upload = (ROOT / 'native/monogame/directx12/MGG_DX12.cpp').read_text()
        self.assertEqual(upload.count('case MGSurfaceFormat::Bc7:'), 2)
        readback = (ROOT / 'native/monogame/directx12/Texture.cpp').read_text()
        self.assertIn('case DXGI_FORMAT_BC7_UNORM_SRGB:', readback)

if __name__ == '__main__':
    unittest.main()
