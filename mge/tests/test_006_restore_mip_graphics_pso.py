from pathlib import Path
import unittest
NATIVE=Path(__file__).resolve().parents[2]/'native'/'monogame'
def code(name): return (NATIVE/name).read_text(encoding='utf-8-sig')
class State(unittest.TestCase):
 def test_reset_record_restore(self):
  s=code('directx12/CommandContext.cpp')
  reset=s.split('void CommandContext::Reset()',1)[1].split('void CommandContext::Reset(unsigned',1)[0]
  self.assertIn('m_currentPSO = nullptr;',reset)
  setter=s.split('void CommandContext::SetPipelineState(',1)[1].split('void CommandContext::',1)[0]
  self.assertIn('m_currentPSO = ps;',setter)
  g=s.split('void CommandContext::GenerateMipmap(Texture* source)',1)[1].split('void CommandContext::',1)[0]
  self.assertIn('if (m_currentPSO) cmdList->SetPipelineState(m_currentPSO);',g)
  self.assertLess(g.index('Dispatch('),g.index('if (m_currentPSO)'))
