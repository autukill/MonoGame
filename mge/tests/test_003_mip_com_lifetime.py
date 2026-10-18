from pathlib import Path
import unittest
NATIVE=Path(__file__).resolve().parents[2]/'native'/'monogame'
def code(name): return (NATIVE/name).read_text(encoding='utf-8-sig')
class Ownership(unittest.TestCase):
 def test_scoped_ownership(self):
  s=code('directx12/CommandContext.cpp').split('void CommandContext::CreateGenerateMipPipelineResources()',1)[1]
  self.assertNotIn('ID3DBlob* pSerializedRootSig',s)
  self.assertNotIn('ID3DBlob* pErrorBlob',s)
  self.assertIn('ComPtr<ID3DBlob> serializedRootSig, errorBlob;',s)
  self.assertIn('ThrowIfFailed(D3D12SerializeVersionedRootSignature(',s)
  self.assertIn('ThrowIfFailed(m_deviceRes->GetD3DDevice()->CreateRootSignature(',s)
