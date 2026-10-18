from pathlib import Path
import unittest
NATIVE=Path(__file__).resolve().parents[2]/'native'/'monogame'
def code(name): return (NATIVE/name).read_text(encoding='utf-8-sig')
class LazyMip(unittest.TestCase):
 def test_call_location(self):
  s=code('directx12/CommandContext.cpp')
  ctor=s.split('CommandContext::CommandContext(',1)[1].split('CommandContext::~CommandContext',1)[0]
  self.assertNotIn('CreateGenerateMipPipelineResources();',ctor)
  g=s.split('void CommandContext::GenerateMipmap(Texture* source)',1)[1]
  self.assertIn('if (!m_generatePipelinePSO)',g)
  self.assertLess(g.index('if (!m_generatePipelinePSO)'),g.index('CreateGenerateMipPipelineResources();'))
