from pathlib import Path
import unittest
NATIVE = Path(__file__).resolve().parents[2] / 'native' / 'monogame'
def code(name):
    return (NATIVE / name).read_text(encoding='utf-8-sig')
class WindowFlags(unittest.TestCase):
    def test_vulkan_flag_is_not_shared_with_dx12(self):
        source=code('sdl/MGP_sdl.cpp')
        branch=source.split('#if defined(MG_VULKAN)',1)[1].split('#elif defined(MG_OPENGL)',1)[0]
        vulkan,dx12=branch.split('#elif defined(MG_DIRECTX12)')
        self.assertIn('flags |= SDL_WINDOW_VULKAN;',vulkan)
        self.assertNotIn('flags |= SDL_WINDOW_VULKAN;',dx12)
